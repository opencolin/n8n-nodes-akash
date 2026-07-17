import type { IDataObject, IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-workflow';

import { normalizeAkashError } from './errors';

/**
 * VERIFIED Akash 2.x Cosmos-SDK module versions (live-probed 2026-07-17, mainnet `akashnet-2`,
 * app `2.1.0` — see `docs/research/chain-rest.md` §3). The old `v1beta3` paths that most stale
 * docs/AI memory cite are **dead (HTTP 501 "Not Implemented")**; a `501` from the gRPC-gateway is
 * the load-bearing signal that a version guess is wrong. These constants pin the surface in ONE
 * place so a future module bump rides a single edit (regression-gated by
 * `test/transport/moduleVersions.test.ts`).
 *
 * Note the skew that live probes confirm: `market` is already at `v1beta5` (the `v1beta4` market
 * routes 501), while `deployment`/`provider` sit at `v1beta4` and `cert` at `v1`.
 */
export const CHAIN_MODULE_VERSIONS = {
	deployment: 'v1beta4',
	market: 'v1beta5',
	provider: 'v1beta4',
	cert: 'v1',
} as const;

/**
 * Keyless public LCD (Cosmos REST / gRPC-gateway) hosts. Both serve the **identical**
 * `deployment/v1beta4`, `market/v1beta5`, `provider/v1beta4`, `cert/v1` paths (VERIFIED live on
 * both networks). `mainnet` is the default; `sandbox-2` is the faucet-funded parity network used
 * for read-side sandbox checks. No auth header — never attach `x-api-key` to the chain plane.
 */
export const CHAIN_HOSTS = {
	mainnet: 'https://api.akashnet.net',
	'sandbox-2': 'https://api.sandbox-2.aksh.pw',
} as const;

/** A network key accepted by the Network dropdown / {@link CHAIN_HOSTS}. */
export type ChainNetwork = keyof typeof CHAIN_HOSTS;

/**
 * Chain path builders — the pinned module versions from {@link CHAIN_MODULE_VERSIONS} live here
 * and NOWHERE else, so every chain resource imports these instead of hand-writing a version into
 * a path string. This is what makes `test/transport/moduleVersions.test.ts` load-bearing: it
 * iterates every builder and asserts no `v1beta3` (dead) segment leaks back in and that each path
 * carries its pinned version. `deployments/info`, `leases/info`, etc. take their filters as query
 * params (`id.owner=&id.dseq=…`), so the builders return the bare path and the caller supplies
 * `options.qs`.
 *
 * (Cosmos `bank` balances use a fixed `/cosmos/bank/v1beta1/...` path with no Akash module
 * version, so they need no builder here.)
 */
export const chainPaths = {
	deploymentsList: (): string =>
		`/akash/deployment/${CHAIN_MODULE_VERSIONS.deployment}/deployments/list`,
	deploymentInfo: (): string =>
		`/akash/deployment/${CHAIN_MODULE_VERSIONS.deployment}/deployments/info`,
	leasesList: (): string => `/akash/market/${CHAIN_MODULE_VERSIONS.market}/leases/list`,
	leaseInfo: (): string => `/akash/market/${CHAIN_MODULE_VERSIONS.market}/leases/info`,
	ordersList: (): string => `/akash/market/${CHAIN_MODULE_VERSIONS.market}/orders/list`,
	orderInfo: (): string => `/akash/market/${CHAIN_MODULE_VERSIONS.market}/orders/info`,
	bidsList: (): string => `/akash/market/${CHAIN_MODULE_VERSIONS.market}/bids/list`,
	bidInfo: (): string => `/akash/market/${CHAIN_MODULE_VERSIONS.market}/bids/info`,
	certificatesList: (): string => `/akash/cert/${CHAIN_MODULE_VERSIONS.cert}/certificates/list`,
} as const;

/**
 * Resolve the LCD base URL for a chain request, in strict priority order:
 *
 *   1. `explicitBaseUrl` — an override passed by the caller (e.g. a resourceLocator that already
 *      knows the host).
 *   2. node param `chainBaseUrl` — the additive, non-breaking "Base URL override" field (trimmed;
 *      used only when non-empty), so an operator can point at their own node.
 *   3. node param `network` — the Network dropdown (`mainnet` / `sandbox-2`) mapped through
 *      {@link CHAIN_HOSTS}.
 *   4. default — {@link CHAIN_HOSTS}.mainnet.
 *
 * Both `getNodeParameter` reads are wrapped in `try/catch`: a `loadOptions` caller (which has no
 * `chainBaseUrl`/`network` params on its context) falls straight through to mainnet instead of
 * throwing. The context is typed as `IExecuteFunctions` for the overload that takes an `itemIndex`;
 * at runtime a `loadOptions` context simply has no such param and the fallback wins.
 */
function resolveChainBaseUrl(
	ctx: IExecuteFunctions | ILoadOptionsFunctions,
	explicitBaseUrl: string | undefined,
	itemIndex: number,
): string {
	if (typeof explicitBaseUrl === 'string' && explicitBaseUrl.trim() !== '') {
		return explicitBaseUrl.trim();
	}

	const execCtx = ctx as IExecuteFunctions;

	try {
		const override = execCtx.getNodeParameter('chainBaseUrl', itemIndex, '');
		if (typeof override === 'string' && override.trim() !== '') {
			return override.trim();
		}
	} catch {
		// No `chainBaseUrl` param on this node/context (e.g. loadOptions) — fall through.
	}

	try {
		const network = execCtx.getNodeParameter('network', itemIndex, 'mainnet');
		if (typeof network === 'string') {
			const host = CHAIN_HOSTS[network as ChainNetwork];
			if (typeof host === 'string') {
				return host;
			}
		}
	} catch {
		// No `network` param on this node/context — fall through.
	}

	return CHAIN_HOSTS.mainnet;
}

/**
 * Shared transport for the **keyless Cosmos chain REST (LCD) plane** — the secondary of the three
 * planes the node speaks (see `consoleApiRequest` for the primary Console plane). This plane is
 * public, unauthenticated, read-only GET data: Akash `deployment`/`market`/`provider`/`cert`
 * modules + Cosmos `bank` balances.
 *
 * ## No auth, ever
 *
 * The LCD is keyless — this issues a **plain `this.helpers.httpRequest` GET and NEVER attaches an
 * `x-api-key`** (unlike the Console transport). The base URL is resolved from the node's Network
 * dropdown / Base URL override (see {@link resolveChainBaseUrl}); no credential is involved.
 *
 * ## No `{data}` envelope
 *
 * Unlike the authed Console reads, the LCD returns **raw JSON with no outer `{data:…}` wrapper**
 * (e.g. `{ "deployments": [...], "pagination": {...} }`). We therefore return the parsed body
 * **verbatim** — do NOT strip a `data` key here.
 *
 * ## Multi-denom
 *
 * `denom` (`uakt` / `uact` / an IBC-USDC denom like `ibc/170C67…`) is treated as **opaque data**
 * everywhere downstream — never assume `uakt`. This helper does no denom interpretation.
 *
 * @param endpoint The path beginning with `/` — build module paths via {@link chainPaths} so the
 *                 pinned version lives in one place (e.g. `chainPaths.deploymentsList()`).
 * @param options  Optional `qs` (filters + pagination), `itemIndex` (for node-param reads,
 *                 default 0), and `baseUrl` (explicit host override).
 * @returns The parsed LCD response body, unmodified.
 * @throws A normalised {@link NodeApiError} (never a raw HTTP error) — chain LCD failures
 *         (400 bad bech32, 404 not-found, 501 wrong module version, 429, 5xx) are mapped in
 *         {@link normalizeAkashError}.
 */
export async function chainRestRequest(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	endpoint: string,
	options: { qs?: IDataObject; itemIndex?: number; baseUrl?: string } = {},
): Promise<IDataObject> {
	const itemIndex = options.itemIndex ?? 0;

	try {
		const baseUrl = resolveChainBaseUrl(this, options.baseUrl, itemIndex).replace(/\/+$/, '');

		const response = await this.helpers.httpRequest({
			method: 'GET',
			url: baseUrl + endpoint,
			json: true,
			headers: {
				Accept: 'application/json',
			},
			...(options.qs !== undefined ? { qs: options.qs } : {}),
		});

		return (response ?? {}) as IDataObject;
	} catch (error) {
		throw normalizeAkashError.call(this as unknown as IExecuteFunctions, error);
	}
}
