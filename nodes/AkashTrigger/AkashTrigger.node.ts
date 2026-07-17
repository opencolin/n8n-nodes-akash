import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import { coingeckoRequest, type AktMarketData } from '../Akash/transport/coingeckoRequest';

/** Console API base URL for the keyless public reads this trigger polls. */
const CONSOLE_BASE_URL = 'https://console-api.akash.network';

/**
 * Self-contained keyless Console read for the Trigger node.
 *
 * `nodes/Akash/transport/consoleApiRequest` is typed `this: IExecuteFunctions`, but the poll
 * framework runs under {@link IPollFunctions} (and the dropdown loader under
 * {@link ILoadOptionsFunctions}), so this node owns a small, private copy of the request shape
 * rather than widening or importing that helper — the same pattern `TenkiTrigger` uses. Every
 * event this trigger watches is a **keyless public read** (GPU prices, GPU inventory, network
 * capacity), so we always send a plain `httpRequest` with **no** `x-api-key` header: pure read,
 * no key, no spend, agent-safe.
 *
 * The outer `{ data: … }` envelope is stripped defensively (the same rule as
 * `consoleApiRequest.unwrapData`): public GPU/network reads return their object directly, but an
 * authed-style `{ data: … }` wrapper — should one ever appear — is unwrapped so callers see the
 * payload uniformly.
 *
 * @param ctx  The active poll or load-options context (supplies the HTTP helper + node ref).
 * @param path The Console path beginning with `/` (e.g. `/v1/gpu-prices`).
 * @param qs   Optional query-string object.
 * @returns The parsed response body, with the outer `{ data: … }` envelope stripped when present.
 * @throws A {@link NodeApiError} (never a raw HTTP error).
 */
async function akashPublicGet(
	ctx: IPollFunctions | ILoadOptionsFunctions,
	path: string,
	qs?: IDataObject,
): Promise<IDataObject> {
	try {
		const response = await ctx.helpers.httpRequest({
			method: 'GET',
			url: CONSOLE_BASE_URL + path,
			qs,
			json: true,
		});
		return unwrapData(response);
	} catch (error) {
		throw new NodeApiError(ctx.getNode(), error as JsonObject);
	}
}

/**
 * Conditionally strip the outer `{ data: … }` envelope. Only a non-null, non-array object that
 * owns a `data` property is unwrapped; arrays and plain objects without `data` are returned
 * verbatim (mirrors `consoleApiRequest.unwrapData`).
 */
function unwrapData(response: unknown): IDataObject {
	if (
		typeof response === 'object' &&
		response !== null &&
		!Array.isArray(response) &&
		Object.prototype.hasOwnProperty.call(response, 'data')
	) {
		return (response as IDataObject).data as IDataObject;
	}
	return (response ?? {}) as IDataObject;
}

/** Read a string field off an object, tolerating a missing/non-string value. */
function readString(source: IDataObject, key: string): string {
	const value = source[key];
	return typeof value === 'string' ? value : '';
}

/** Read a finite number field off an object, returning `undefined` when absent/non-numeric. */
function readNumber(source: IDataObject, key: string): number | undefined {
	const value = source[key];
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Stringify a scalar for use in a stable static-data key; non-scalars collapse to `''`. */
function scalarKey(value: unknown): string {
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	return '';
}

/** One flattened GPU inventory SKU from `/v1/gpu` (`allocatable - allocated` free units). */
interface GpuSku {
	key: string;
	vendor: string;
	model: string;
	interface: string;
	ram: string;
	allocatable: number;
	allocated: number;
	available: number;
}

/**
 * Flatten the `/v1/gpu` inventory tree into one SKU per (vendor, model, interface, ram).
 *
 * Live shape: `{ gpus: { total{allocatable,allocated}, details: { <vendor>: [ { model, ram,
 * interface, allocatable, allocated } ] } } }`. Free units for a SKU are `allocatable - allocated`;
 * a stable composite `key` distinguishes SKUs that share a model name but differ by interface/ram
 * (e.g. `h100` pcie vs sxm).
 */
function flattenGpuInventory(response: IDataObject): GpuSku[] {
	const gpus = (response.gpus as IDataObject) ?? {};
	const details = (gpus.details as IDataObject) ?? {};
	const out: GpuSku[] = [];

	for (const vendor of Object.keys(details)) {
		const entries = details[vendor];
		if (!Array.isArray(entries)) {
			continue;
		}
		for (const raw of entries as IDataObject[]) {
			const model = readString(raw, 'model');
			const iface = readString(raw, 'interface');
			const ram = scalarKey(raw.ram);
			const allocatable = readNumber(raw, 'allocatable') ?? 0;
			const allocated = readNumber(raw, 'allocated') ?? 0;
			out.push({
				key: `${vendor}/${model}/${iface}/${ram}`,
				vendor,
				model,
				interface: iface,
				ram,
				allocatable,
				allocated,
				available: allocatable - allocated,
			});
		}
	}

	return out;
}

/**
 * Read the free-unit count off a `/v1/network-capacity` resource block.
 *
 * A resource block is normally `{ active, pending, available, total }`. Live `storage` is instead
 * split into `ephemeral`/`persistent`/`total` sub-blocks; when there is no direct `available` we
 * fall back to the `total` sub-block's `available`.
 */
function readAvailable(block: IDataObject): number | undefined {
	const direct = readNumber(block, 'available');
	if (direct !== undefined) {
		return direct;
	}
	const total = block.total;
	if (typeof total === 'object' && total !== null && !Array.isArray(total)) {
		return readNumber(total as IDataObject, 'available');
	}
	return undefined;
}

/** True when `value` satisfies the threshold bound for the given direction. */
function crosses(value: number, threshold: number, direction: string): boolean {
	return direction === 'above' ? value >= threshold : value <= threshold;
}

/**
 * Mainnet + sandbox-2 LCD base URLs for the keyless chain reads the state events poll.
 *
 * The keyless Cosmos REST hosts from `docs/research/chain-rest.md` (both `[LIVE]`). The default is
 * mainnet; the `network` param exposes the sandbox-2 override.
 */
const CHAIN_MAINNET_BASE = 'https://api.akashnet.net';
const CHAIN_SANDBOX_BASE = 'https://api.sandbox-2.aksh.pw';

/**
 * Pinned Akash module API versions, duplicated locally on purpose.
 *
 * `nodes/Akash/transport` pins these too, but importing that constant would drag in the
 * `IExecuteFunctions`-typed transport surface this poll node deliberately avoids (the same reasoning
 * as the node owning its own {@link akashPublicGet}/{@link unwrapData}). These are the VERIFIED
 * Akash 2.x versions — deployment `v1beta4`, market `v1beta5`. The stale `v1beta3` paths return HTTP
 * 501 and must never appear here.
 */
const DEPLOYMENT_MODULE_VERSION = 'v1beta4';
const MARKET_MODULE_VERSION = 'v1beta5';

/** Resolve the `network` param (`mainnet` | `sandbox-2`) to its LCD base URL (defaults mainnet). */
function resolveChainBase(network: string): string {
	return network === 'sandbox-2' ? CHAIN_SANDBOX_BASE : CHAIN_MAINNET_BASE;
}

/**
 * Self-contained keyless chain (Cosmos LCD/REST) GET for the Trigger node.
 *
 * The sibling of {@link akashPublicGet} for the on-chain state events: same rationale (the poll
 * framework runs under {@link IPollFunctions}, so this node cannot import the
 * `IExecuteFunctions`-typed `chainRestRequest` helper), but it takes a full `base` URL — mainnet or
 * the sandbox-2 override — instead of the fixed Console host. Every chain read here is **public,
 * unauthenticated, read-only** (deployment/lease `info`/`list`): no signing, no fees, no `denom`
 * assumptions, agent-safe. Chain LCD responses are not `{ data: … }`-wrapped, but the same
 * defensive {@link unwrapData} is applied for uniformity.
 *
 * @param ctx  The active poll context (supplies the HTTP helper + node ref).
 * @param base The LCD base URL (e.g. `https://api.akashnet.net`).
 * @param path The chain path beginning with `/` (built from the pinned module-version constants).
 * @param qs   Optional query-string object (`id.*` for `info`, `filters.*` for `list`).
 * @returns The parsed response body.
 * @throws A {@link NodeApiError} (never a raw HTTP error).
 */
async function akashChainGet(
	ctx: IPollFunctions,
	base: string,
	path: string,
	qs?: IDataObject,
): Promise<IDataObject> {
	try {
		const response = await ctx.helpers.httpRequest({
			method: 'GET',
			url: base + path,
			qs,
			json: true,
		});
		return unwrapData(response);
	} catch (error) {
		throw new NodeApiError(ctx.getNode(), error as JsonObject);
	}
}

/** Read a boolean field off an object, returning `undefined` when absent/non-boolean. */
function readBoolean(source: IDataObject, key: string): boolean | undefined {
	const value = source[key];
	return typeof value === 'boolean' ? value : undefined;
}

/**
 * Coerce a keyless list response to an array of objects.
 *
 * Handles the shapes these list reads take: a bare top-level array, a `{ <key>: [] }` envelope
 * (chain `deployments`/`leases`, Console `providers`), or anything else (→ `[]`).
 */
function extractArray(response: IDataObject, key: string): IDataObject[] {
	if (Array.isArray(response)) {
		return response as IDataObject[];
	}
	const nested = response[key];
	return Array.isArray(nested) ? (nested as IDataObject[]) : [];
}

/**
 * Akash Trigger — keyless, zero-spend, agent-safe polling trigger for the Akash marketplace.
 *
 * Starts a workflow when a GPU rental price crosses a bound, GPU units free up (or fill), network
 * capacity for a resource crosses a bound, the AKT/USD spot price moves, a provider's status changes
 * (goes offline, gains/loses its audit, or its uptime drops materially), or an on-chain deployment
 * or lease transitions state. Every event is a **public read** — the node declares **no
 * credential**: GPU price/inventory, network capacity and provider status come from the Akash
 * Console public API, deployment/lease state from the keyless Cosmos chain LCD (mainnet or the
 * sandbox-2 override), and AKT price from CoinGecko (with a Console spot-price fallback). Nothing
 * here signs a transaction or spends funds.
 *
 * ## Threshold-cross / dedupe / baseline-seed semantics
 *
 * The node uses the n8n `poll` framework with per-event state persisted in
 * `getWorkflowStaticData('node')`:
 *
 * - **Threshold events** (`gpuPriceThreshold`, `capacityAvailable`, `aktPriceThreshold`) store a
 *   last-seen `satisfied` boolean per key and emit **only** on the not-satisfied → satisfied
 *   transition. While the value stays satisfied nothing re-fires (dedupe); when it returns to
 *   not-satisfied the key re-arms so a later re-cross emits again.
 * - **`gpuAvailabilityChange`** stores the last free-unit count per GPU SKU and emits when the
 *   count differs from the stored value.
 * - **State-transition events** (`providerStatusChange`, `deploymentStateChange`,
 *   `leaseStateChange`) store the last-seen status/state per key (provider address, or the
 *   deployment/lease id tuple) and emit only when a genuine transition is observed — a provider
 *   going offline / audit-flip / material uptime drop, or a deployment/lease state string changing.
 *   The chain events accept an `includeClosed` toggle (default off) that suppresses transitions
 *   **into** the `closed` state, and a Network toggle selecting mainnet or the sandbox-2 LCD.
 * - **Baseline-seed on activation:** the FIRST poll after activation records current state WITHOUT
 *   emitting — even if a surface is already "hot" (price already above the bound) — so activating
 *   the trigger over a populated marketplace does not flood the workflow. Only genuine
 *   post-activation transitions fire.
 * - **Manual (test) runs** return the current computed sample without mutating any static data.
 *
 * Self-contained by design: it does not import the `IExecuteFunctions` Console transport helper
 * (it owns {@link akashPublicGet}), mirroring `TenkiTrigger`. The one shared dependency is
 * {@link coingeckoRequest}, the canonical AKT market-data helper.
 */
export class AkashTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Akash Trigger',
		name: 'akashTrigger',
		icon: 'file:akash.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{"On: " + $parameter["event"]}}',
		description:
			'Starts a workflow when an Akash marketplace, provider-status, or on-chain deployment/lease event occurs (via keyless polling)',
		defaults: {
			name: 'Akash Trigger',
		},
		polling: true,
		inputs: [],
		outputs: ['main'],
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				noDataExpression: true,
				default: 'gpuPriceThreshold',
				description: 'The Akash marketplace event to watch for on each polling interval',
				options: [
					{
						name: 'AKT Price Threshold',
						value: 'aktPriceThreshold',
						description: 'Fires when the AKT/USD spot price crosses your threshold',
					},
					{
						name: 'Capacity Available',
						value: 'capacityAvailable',
						description:
							'Fires when network-wide available capacity for a resource crosses your threshold',
					},
					{
						name: 'Deployment State Change',
						value: 'deploymentStateChange',
						description:
							'Fires when an on-chain deployment transitions state (e.g. active to closed)',
					},
					{
						name: 'GPU Availability Change',
						value: 'gpuAvailabilityChange',
						description: 'Fires when the free-unit count for a GPU model changes',
					},
					{
						name: 'GPU Price Threshold',
						value: 'gpuPriceThreshold',
						description: 'Fires when a GPU model rental price crosses your threshold',
					},
					{
						name: 'Lease State Change',
						value: 'leaseStateChange',
						description:
							'Fires when an on-chain lease transitions state (e.g. active to insufficient_funds or closed)',
					},
					{
						name: 'Provider Status Change',
						value: 'providerStatusChange',
						description:
							'Fires when a provider goes offline, gains or loses its audit, or its uptime drops materially',
					},
				],
			},
			{
				displayName: 'GPU Model Name or ID',
				name: 'gpuModel',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getGpuModels',
				},
				default: '',
				description:
					'The GPU model to watch, or "Any Model" to watch every model on the marketplace. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: {
					show: {
						event: ['gpuPriceThreshold', 'gpuAvailabilityChange'],
					},
				},
			},
			{
				displayName: 'Price Statistic',
				name: 'priceStat',
				type: 'options',
				default: 'avg',
				description:
					'Which per-model price figure from the GPU price feed to compare against the threshold',
				options: [
					{
						name: 'Average',
						value: 'avg',
					},
					{
						name: 'Maximum',
						value: 'max',
					},
					{
						name: 'Minimum',
						value: 'min',
					},
					{
						name: 'Weighted Average',
						value: 'weightedAverage',
					},
				],
				displayOptions: {
					show: {
						event: ['gpuPriceThreshold'],
					},
				},
			},
			{
				displayName: 'Resource',
				name: 'capacityResource',
				type: 'options',
				default: 'gpu',
				description: 'Which network-capacity resource to watch for available units crossing a bound',
				options: [
					{
						name: 'CPU',
						value: 'cpu',
					},
					{
						name: 'GPU',
						value: 'gpu',
					},
					{
						name: 'Memory',
						value: 'memory',
					},
					{
						name: 'Storage',
						value: 'storage',
					},
				],
				displayOptions: {
					show: {
						event: ['capacityAvailable'],
					},
				},
			},
			{
				displayName: 'Threshold',
				name: 'threshold',
				type: 'number',
				default: 0,
				description:
					'The value the watched figure is compared against: USD per GPU-hour for GPU price, native resource units (CPU millicores, memory/storage bytes, GPU count) for capacity, or USD for AKT price',
				displayOptions: {
					show: {
						event: ['gpuPriceThreshold', 'capacityAvailable', 'aktPriceThreshold'],
					},
				},
			},
			{
				displayName: 'Direction',
				name: 'direction',
				type: 'options',
				default: 'above',
				description:
					'The crossing direction to fire on: "above" fires when the value is at or above the threshold, "below" when it is at or below',
				options: [
					{
						name: 'Above',
						value: 'above',
						description: 'Fire when the value is at or above the threshold',
					},
					{
						name: 'Below',
						value: 'below',
						description: 'Fire when the value is at or below the threshold',
					},
				],
				displayOptions: {
					show: {
						event: ['gpuPriceThreshold', 'capacityAvailable', 'aktPriceThreshold'],
					},
				},
			},
			{
				displayName: 'Network',
				name: 'network',
				type: 'options',
				default: 'mainnet',
				description:
					'Which keyless Cosmos chain LCD (REST) endpoint to poll for on-chain deployment/lease state',
				options: [
					{
						name: 'Mainnet',
						value: 'mainnet',
						description: 'Akash mainnet (akashnet-2) via https://api.akashnet.net',
					},
					{
						name: 'Sandbox-2',
						value: 'sandbox-2',
						description: 'Akash sandbox-2 testnet via https://api.sandbox-2.aksh.pw',
					},
				],
				displayOptions: {
					show: {
						event: ['deploymentStateChange', 'leaseStateChange'],
					},
				},
			},
			{
				displayName: 'Owner Address',
				name: 'owner',
				type: 'string',
				default: '',
				placeholder: 'akash1...',
				description:
					'The bech32 owner address (akash1…) that owns the deployment(s) or lease(s) to watch. Required.',
				displayOptions: {
					show: {
						event: ['deploymentStateChange', 'leaseStateChange'],
					},
				},
			},
			{
				displayName: 'Deployment Sequence',
				name: 'dseq',
				type: 'string',
				default: '',
				description: 'The deployment sequence number (DSEQ). For Deployment State Change, leave empty to watch every deployment the owner has, or set it to watch a single deployment; for Lease State Change it is part of the lease ID.',
				displayOptions: {
					show: {
						event: ['deploymentStateChange', 'leaseStateChange'],
					},
				},
			},
			{
				displayName: 'Group Sequence',
				name: 'gseq',
				type: 'string',
				default: '',
				description: 'The lease group sequence number (GSEQ). Part of the lease ID; leave empty to watch every matching lease via a filtered list.',
				displayOptions: {
					show: {
						event: ['leaseStateChange'],
					},
				},
			},
			{
				displayName: 'Order Sequence',
				name: 'oseq',
				type: 'string',
				default: '',
				description: 'The lease order sequence number (OSEQ). Part of the lease ID; leave empty to watch every matching lease via a filtered list.',
				displayOptions: {
					show: {
						event: ['leaseStateChange'],
					},
				},
			},
			{
				displayName: 'Provider Address',
				name: 'provider',
				type: 'string',
				default: '',
				placeholder: 'akash1...',
				description: 'The provider bech32 address (akash1…). Part of the lease ID; leave empty to watch every matching lease via a filtered list.',
				displayOptions: {
					show: {
						event: ['leaseStateChange'],
					},
				},
			},
			{
				displayName: 'Include Closed',
				name: 'includeClosed',
				type: 'boolean',
				default: false,
				description:
					'Whether to also emit when a deployment or lease transitions into the closed state (off by default so a normal teardown is not treated as an alert)',
				displayOptions: {
					show: {
						event: ['deploymentStateChange', 'leaseStateChange'],
					},
				},
			},
			{
				displayName: 'Uptime Drop Threshold',
				name: 'uptimeDropThreshold',
				type: 'number',
				default: 5,
				description:
					"How far a provider's uptime must fall between polls to count as a material drop, in the feed's native uptime units (a fraction 0–1 or a percentage, depending on the feed). Set to 0 to disable uptime-drop detection; offline and audit-change signals still fire.",
				displayOptions: {
					show: {
						event: ['providerStatusChange'],
					},
				},
			},
		],
	};

	methods = {
		loadOptions: {
			/**
			 * Populate the GPU Model dropdown from the live keyless price feed.
			 *
			 * Reads `/v1/gpu-prices`, maps each `models[].model` to an option (deduped), and prepends an
			 * "Any Model" entry (value `''`) so a user can watch every model at once. Self-contained: it
			 * does not import `nodes/Akash/methods`.
			 */
			async getGpuModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const response = await akashPublicGet(this, '/v1/gpu-prices');
				const models = (response.models as IDataObject[]) ?? [];
				const seen = new Set<string>();
				const options: INodePropertyOptions[] = [{ name: 'Any Model', value: '' }];

				for (const entry of models) {
					const model = readString(entry, 'model');
					if (!model || seen.has(model)) {
						continue;
					}
					seen.add(model);
					options.push({ name: model, value: model });
				}

				return options;
			},
		},
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const event = this.getNodeParameter('event', 'gpuPriceThreshold') as string;
		const staticData = this.getWorkflowStaticData('node');
		const isManual = this.getMode() === 'manual';

		let emitted: IDataObject[];

		if (event === 'gpuPriceThreshold') {
			emitted = await pollGpuPriceThreshold.call(this, staticData, isManual);
		} else if (event === 'gpuAvailabilityChange') {
			emitted = await pollGpuAvailabilityChange.call(this, staticData, isManual);
		} else if (event === 'capacityAvailable') {
			emitted = await pollCapacityAvailable.call(this, staticData, isManual);
		} else if (event === 'aktPriceThreshold') {
			emitted = await pollAktPriceThreshold.call(this, staticData, isManual);
		} else if (event === 'providerStatusChange') {
			emitted = await pollProviderStatusChange.call(this, staticData, isManual);
		} else if (event === 'deploymentStateChange') {
			emitted = await pollDeploymentStateChange.call(this, staticData, isManual);
		} else if (event === 'leaseStateChange') {
			emitted = await pollLeaseStateChange.call(this, staticData, isManual);
		} else {
			throw new NodeOperationError(this.getNode(), `Unsupported event: ${event}`);
		}

		// Record the cursor timestamp for observability (skip in manual so a test run mutates
		// nothing); dedupe itself is driven by the per-event state maps the pollers persist.
		if (!isManual) {
			staticData.lastPoll = new Date().toISOString();
		}

		if (emitted.length === 0) {
			return null;
		}

		return [emitted.map((json) => ({ json }))];
	}
}

/**
 * Poll `/v1/gpu-prices` and emit when a model's chosen price statistic crosses the bound.
 *
 * Evaluates one model when a specific `gpuModel` is chosen, or every model when "Any Model" is
 * selected. Per model, the `priceStat` figure (min/avg/weightedAverage/max) is compared to the
 * threshold in the given direction; the last-seen `satisfied` boolean is stored under the model
 * name in `staticData.gpuPrice`. Emission is exactly the not-satisfied → satisfied transition,
 * after the baseline seed. Manual runs return the current per-model sample without mutating state.
 */
async function pollGpuPriceThreshold(
	this: IPollFunctions,
	staticData: IDataObject,
	isManual: boolean,
): Promise<IDataObject[]> {
	const gpuModel = (this.getNodeParameter('gpuModel', '') as string).trim();
	const priceStat = this.getNodeParameter('priceStat', 'avg') as string;
	const threshold = this.getNodeParameter('threshold', 0) as number;
	const direction = this.getNodeParameter('direction', 'above') as string;

	const response = await akashPublicGet(this, '/v1/gpu-prices');
	const models = (response.models as IDataObject[]) ?? [];
	const selected = gpuModel ? models.filter((m) => readString(m, 'model') === gpuModel) : models;

	const evaluations = selected.map((model) => {
		const modelKey = readString(model, 'model');
		const price = (model.price as IDataObject) ?? {};
		const value = readNumber(price, priceStat);
		const satisfied = value !== undefined && crosses(value, threshold, direction);
		return { modelKey, value, satisfied };
	});

	if (isManual) {
		return evaluations.map((evaluation) => ({
			event: 'gpuPriceThreshold',
			model: evaluation.modelKey,
			priceStat,
			price: evaluation.value ?? null,
			threshold,
			direction,
			satisfied: evaluation.satisfied,
		}));
	}

	const known = (staticData.gpuPrice as Record<string, { satisfied: boolean }>) ?? {};
	const seeded = staticData.gpuPriceSeeded === true;
	const next: Record<string, { satisfied: boolean }> = { ...known };
	const fresh: IDataObject[] = [];

	for (const evaluation of evaluations) {
		if (!evaluation.modelKey) {
			continue;
		}
		const previous = known[evaluation.modelKey];
		if (seeded && previous?.satisfied !== true && evaluation.satisfied === true) {
			fresh.push({
				event: 'gpuPriceThreshold',
				model: evaluation.modelKey,
				priceStat,
				price: evaluation.value ?? null,
				threshold,
				direction,
				crossedInto: direction,
			});
		}
		next[evaluation.modelKey] = { satisfied: evaluation.satisfied };
	}

	staticData.gpuPrice = next;
	staticData.gpuPriceSeeded = true;

	return fresh;
}

/**
 * Poll `/v1/gpu` and emit when a GPU SKU's free-unit count changes.
 *
 * Evaluates one model (all its SKUs) when a specific `gpuModel` is chosen, or every SKU when "Any
 * Model" is selected. The last-seen free count (`allocatable - allocated`) is stored per SKU in
 * `staticData.gpuAvailability`; emission is any change from the stored count, after the baseline
 * seed. Manual runs return the current per-SKU sample without mutating state.
 */
async function pollGpuAvailabilityChange(
	this: IPollFunctions,
	staticData: IDataObject,
	isManual: boolean,
): Promise<IDataObject[]> {
	const gpuModel = (this.getNodeParameter('gpuModel', '') as string).trim();

	const response = await akashPublicGet(this, '/v1/gpu');
	const skus = flattenGpuInventory(response);
	const selected = gpuModel ? skus.filter((sku) => sku.model === gpuModel) : skus;

	if (isManual) {
		return selected.map((sku) => ({
			event: 'gpuAvailabilityChange',
			vendor: sku.vendor,
			model: sku.model,
			interface: sku.interface,
			ram: sku.ram,
			available: sku.available,
			allocatable: sku.allocatable,
			allocated: sku.allocated,
		}));
	}

	const known = (staticData.gpuAvailability as Record<string, { available: number }>) ?? {};
	const seeded = staticData.gpuAvailabilitySeeded === true;
	const next: Record<string, { available: number }> = { ...known };
	const fresh: IDataObject[] = [];

	for (const sku of selected) {
		const previous = known[sku.key];
		if (seeded && (previous === undefined || previous.available !== sku.available)) {
			fresh.push({
				event: 'gpuAvailabilityChange',
				vendor: sku.vendor,
				model: sku.model,
				interface: sku.interface,
				ram: sku.ram,
				available: sku.available,
				previousAvailable: previous?.available ?? null,
				allocatable: sku.allocatable,
				allocated: sku.allocated,
			});
		}
		next[sku.key] = { available: sku.available };
	}

	staticData.gpuAvailability = next;
	staticData.gpuAvailabilitySeeded = true;

	return fresh;
}

/**
 * Poll `/v1/network-capacity` and emit when a resource's available units cross the bound.
 *
 * The chosen `capacityResource` (cpu/gpu/memory/storage) has its `available` figure compared to
 * the threshold in the given direction; the last-seen `satisfied` boolean is stored in
 * `staticData.capacity`. Emission is the not-satisfied → satisfied transition, after the baseline
 * seed. Manual runs return the current sample without mutating state.
 */
async function pollCapacityAvailable(
	this: IPollFunctions,
	staticData: IDataObject,
	isManual: boolean,
): Promise<IDataObject[]> {
	const capacityResource = this.getNodeParameter('capacityResource', 'gpu') as string;
	const threshold = this.getNodeParameter('threshold', 0) as number;
	const direction = this.getNodeParameter('direction', 'above') as string;

	const response = await akashPublicGet(this, '/v1/network-capacity');
	const resources = (response.resources as IDataObject) ?? {};
	const block = (resources[capacityResource] as IDataObject) ?? {};
	const available = readAvailable(block);
	const satisfied = available !== undefined && crosses(available, threshold, direction);

	const sample: IDataObject = {
		event: 'capacityAvailable',
		resource: capacityResource,
		available: available ?? null,
		threshold,
		direction,
		activeProviderCount: readNumber(response, 'activeProviderCount') ?? null,
		satisfied,
	};

	if (isManual) {
		return [sample];
	}

	const previous = staticData.capacity as { satisfied: boolean } | undefined;
	const seeded = staticData.capacitySeeded === true;
	const emit = seeded && previous?.satisfied !== true && satisfied === true;

	staticData.capacity = { satisfied };
	staticData.capacitySeeded = true;

	return emit ? [sample] : [];
}

/**
 * Poll AKT/USD via {@link coingeckoRequest} and emit when the spot price crosses the bound.
 *
 * The `.usd` spot price is compared to the threshold in the given direction; the last-seen
 * `satisfied` boolean is stored in `staticData.aktPrice`. Emission is the not-satisfied →
 * satisfied transition, after the baseline seed. When the CoinGecko free tier rate-limits, the
 * helper transparently falls back to the Console spot price (`source: 'console'`); in that case
 * market cap, volume and 24h change are unavailable, which we surface on the emitted item and via
 * a logged warning. Manual runs return the current sample without mutating state.
 */
async function pollAktPriceThreshold(
	this: IPollFunctions,
	staticData: IDataObject,
	isManual: boolean,
): Promise<IDataObject[]> {
	const threshold = this.getNodeParameter('threshold', 0) as number;
	const direction = this.getNodeParameter('direction', 'above') as string;

	const market: AktMarketData = await coingeckoRequest(this);
	const usd = market.usd;
	const satisfied = crosses(usd, threshold, direction);

	const sample: IDataObject = {
		event: 'aktPriceThreshold',
		usd,
		usdMarketCap: market.usdMarketCap ?? null,
		usd24hVol: market.usd24hVol ?? null,
		usd24hChange: market.usd24hChange ?? null,
		source: market.source,
		threshold,
		direction,
		satisfied,
	};

	// Console fallback returns the price only — flag that the richer fields are unavailable.
	if (market.source === 'console') {
		const warning =
			'AKT price served by the Console fallback (CoinGecko rate-limited): market cap, volume and 24h change are unavailable.';
		sample.warning = warning;
		this.logger.warn(`[AkashTrigger] ${warning}`);
	}

	if (isManual) {
		return [sample];
	}

	const previous = staticData.aktPrice as { satisfied: boolean } | undefined;
	const seeded = staticData.aktPriceSeeded === true;
	const emit = seeded && previous?.satisfied !== true && satisfied === true;

	staticData.aktPrice = { satisfied };
	staticData.aktPriceSeeded = true;

	return emit ? [sample] : [];
}

/**
 * Poll Console `/v1/providers` and emit when a provider's status changes.
 *
 * Per provider (keyed on its bech32 `owner`/`address`) the last-seen `{ isOnline, isAudited,
 * uptime1d }` is stored in `staticData.providerStatus`. After the baseline seed, an item is emitted
 * on a genuine transition: `isOnline` flipping true → false (`offline`), `isAudited` changing
 * (`audit-gained`/`audit-lost`), or `uptime1d` falling by at least the Uptime Drop Threshold
 * (`uptime-drop`, which is disabled when the threshold is 0). Every emitted item carries the current
 * figures, the prior figures, and the list of `changes`. Manual runs return the current per-provider
 * sample without mutating state.
 */
async function pollProviderStatusChange(
	this: IPollFunctions,
	staticData: IDataObject,
	isManual: boolean,
): Promise<IDataObject[]> {
	const uptimeDropThreshold = this.getNodeParameter('uptimeDropThreshold', 5) as number;

	const response = await akashPublicGet(this, '/v1/providers');
	const providers = extractArray(response, 'providers');

	const samples = providers.map((provider) => ({
		address: readString(provider, 'owner') || readString(provider, 'address'),
		hostUri: readString(provider, 'hostUri'),
		isOnline: readBoolean(provider, 'isOnline'),
		isAudited: readBoolean(provider, 'isAudited'),
		uptime1d: readNumber(provider, 'uptime1d'),
		uptime7d: readNumber(provider, 'uptime7d'),
		uptime30d: readNumber(provider, 'uptime30d'),
	}));

	if (isManual) {
		return samples.map((sample) => ({
			event: 'providerStatusChange',
			address: sample.address,
			hostUri: sample.hostUri,
			isOnline: sample.isOnline ?? null,
			isAudited: sample.isAudited ?? null,
			uptime1d: sample.uptime1d ?? null,
			uptime7d: sample.uptime7d ?? null,
			uptime30d: sample.uptime30d ?? null,
		}));
	}

	type ProviderState = { isOnline?: boolean; isAudited?: boolean; uptime1d?: number };
	const known = (staticData.providerStatus as Record<string, ProviderState>) ?? {};
	const seeded = staticData.providerStatusSeeded === true;
	const next: Record<string, ProviderState> = { ...known };
	const fresh: IDataObject[] = [];

	for (const sample of samples) {
		if (!sample.address) {
			continue;
		}
		const previous = known[sample.address];
		if (seeded && previous !== undefined) {
			const changes: string[] = [];
			if (previous.isOnline === true && sample.isOnline === false) {
				changes.push('offline');
			}
			if (
				sample.isAudited !== undefined &&
				previous.isAudited !== undefined &&
				previous.isAudited !== sample.isAudited
			) {
				changes.push(sample.isAudited ? 'audit-gained' : 'audit-lost');
			}
			if (
				uptimeDropThreshold > 0 &&
				sample.uptime1d !== undefined &&
				previous.uptime1d !== undefined &&
				previous.uptime1d - sample.uptime1d >= uptimeDropThreshold
			) {
				changes.push('uptime-drop');
			}
			if (changes.length > 0) {
				fresh.push({
					event: 'providerStatusChange',
					address: sample.address,
					hostUri: sample.hostUri,
					isOnline: sample.isOnline ?? null,
					isAudited: sample.isAudited ?? null,
					uptime1d: sample.uptime1d ?? null,
					uptime7d: sample.uptime7d ?? null,
					uptime30d: sample.uptime30d ?? null,
					previousIsOnline: previous.isOnline ?? null,
					previousIsAudited: previous.isAudited ?? null,
					previousUptime1d: previous.uptime1d ?? null,
					changes,
				});
			}
		}
		next[sample.address] = {
			isOnline: sample.isOnline,
			isAudited: sample.isAudited,
			uptime1d: sample.uptime1d,
		};
	}

	staticData.providerStatus = next;
	staticData.providerStatusSeeded = true;

	return fresh;
}

/**
 * Poll the keyless chain deployment surface and emit when a deployment transitions state.
 *
 * With a DSEQ set, reads the single deployment via
 * `/akash/deployment/v1beta4/deployments/info?id.owner=&id.dseq=`; with only an owner, reads the
 * owner's `/deployments/list?filters.owner=` and tracks each returned deployment. The last-seen
 * `state` string is stored per `owner/dseq` key in `staticData.deploymentState`; after the baseline
 * seed an item is emitted on any state change, except a transition **into** `closed` when Include
 * Closed is off. Manual runs return the current sample(s) without mutating state.
 */
async function pollDeploymentStateChange(
	this: IPollFunctions,
	staticData: IDataObject,
	isManual: boolean,
): Promise<IDataObject[]> {
	const network = this.getNodeParameter('network', 'mainnet') as string;
	const includeClosed = this.getNodeParameter('includeClosed', false) as boolean;
	const owner = (this.getNodeParameter('owner', '') as string).trim();
	const dseq = (this.getNodeParameter('dseq', '') as string).trim();

	if (!owner) {
		throw new NodeOperationError(
			this.getNode(),
			'Deployment State Change: an Owner Address (akash1…) is required.',
		);
	}

	const base = resolveChainBase(network);
	const observations: Array<{ key: string; owner: string; dseq: string; state: string }> = [];

	if (dseq) {
		const response = await akashChainGet(
			this,
			base,
			`/akash/deployment/${DEPLOYMENT_MODULE_VERSION}/deployments/info`,
			{ 'id.owner': owner, 'id.dseq': dseq },
		);
		const deployment = (response.deployment as IDataObject) ?? {};
		const id = (deployment.id as IDataObject) ?? {};
		const obsOwner = readString(id, 'owner') || owner;
		const obsDseq = scalarKey(id.dseq) || dseq;
		observations.push({
			key: `${obsOwner}/${obsDseq}`,
			owner: obsOwner,
			dseq: obsDseq,
			state: readString(deployment, 'state'),
		});
	} else {
		const response = await akashChainGet(
			this,
			base,
			`/akash/deployment/${DEPLOYMENT_MODULE_VERSION}/deployments/list`,
			{ 'filters.owner': owner },
		);
		for (const entry of extractArray(response, 'deployments')) {
			const deployment = (entry.deployment as IDataObject) ?? {};
			const id = (deployment.id as IDataObject) ?? {};
			const obsOwner = readString(id, 'owner') || owner;
			const obsDseq = scalarKey(id.dseq);
			if (!obsDseq) {
				continue;
			}
			observations.push({
				key: `${obsOwner}/${obsDseq}`,
				owner: obsOwner,
				dseq: obsDseq,
				state: readString(deployment, 'state'),
			});
		}
	}

	if (isManual) {
		return observations.map((obs) => ({
			event: 'deploymentStateChange',
			network,
			owner: obs.owner,
			dseq: obs.dseq,
			state: obs.state,
		}));
	}

	const known = (staticData.deploymentState as Record<string, { state: string }>) ?? {};
	const seeded = staticData.deploymentStateSeeded === true;
	const next: Record<string, { state: string }> = { ...known };
	const fresh: IDataObject[] = [];

	for (const obs of observations) {
		const previous = known[obs.key];
		if (
			seeded &&
			previous !== undefined &&
			previous.state !== obs.state &&
			(includeClosed || obs.state !== 'closed')
		) {
			fresh.push({
				event: 'deploymentStateChange',
				network,
				owner: obs.owner,
				dseq: obs.dseq,
				state: obs.state,
				previousState: previous.state,
			});
		}
		next[obs.key] = { state: obs.state };
	}

	staticData.deploymentState = next;
	staticData.deploymentStateSeeded = true;

	return fresh;
}

/** The five-part lease id (all as strings for stable static-data keying). */
interface LeaseIds {
	owner: string;
	dseq: string;
	gseq: string;
	oseq: string;
	provider: string;
}

/** A single lease observation: its id tuple, a composite `key`, and its current `state`. */
interface LeaseObservation extends LeaseIds {
	key: string;
	state: string;
}

/** Build a {@link LeaseObservation} from a chain lease object, falling back to the query params. */
function toLeaseObservation(lease: IDataObject, fallback: LeaseIds): LeaseObservation {
	const id = (lease.id as IDataObject) ?? {};
	const owner = readString(id, 'owner') || fallback.owner;
	const dseq = scalarKey(id.dseq) || fallback.dseq;
	const gseq = scalarKey(id.gseq) || fallback.gseq;
	const oseq = scalarKey(id.oseq) || fallback.oseq;
	const provider = readString(id, 'provider') || fallback.provider;
	return {
		owner,
		dseq,
		gseq,
		oseq,
		provider,
		key: `${owner}/${dseq}/${gseq}/${oseq}/${provider}`,
		state: readString(lease, 'state'),
	};
}

/**
 * Poll the keyless chain lease surface and emit when a lease transitions state.
 *
 * With the full lease id (owner + DSEQ + GSEQ + OSEQ + provider) set, reads the single lease via
 * `/akash/market/v1beta5/leases/info`; otherwise reads a filtered `/leases/list` from whichever id
 * fields were supplied (owner required) and tracks each returned lease. The last-seen `state` string
 * is stored per lease-id tuple in `staticData.leaseState`; after the baseline seed an item is emitted
 * on any state change (e.g. active → insufficient_funds), except a transition **into** `closed` when
 * Include Closed is off. Manual runs return the current sample(s) without mutating state.
 */
async function pollLeaseStateChange(
	this: IPollFunctions,
	staticData: IDataObject,
	isManual: boolean,
): Promise<IDataObject[]> {
	const network = this.getNodeParameter('network', 'mainnet') as string;
	const includeClosed = this.getNodeParameter('includeClosed', false) as boolean;
	const ids: LeaseIds = {
		owner: (this.getNodeParameter('owner', '') as string).trim(),
		dseq: (this.getNodeParameter('dseq', '') as string).trim(),
		gseq: (this.getNodeParameter('gseq', '') as string).trim(),
		oseq: (this.getNodeParameter('oseq', '') as string).trim(),
		provider: (this.getNodeParameter('provider', '') as string).trim(),
	};

	if (!ids.owner) {
		throw new NodeOperationError(
			this.getNode(),
			'Lease State Change: an Owner Address (akash1…) is required.',
		);
	}

	const base = resolveChainBase(network);
	const observations: LeaseObservation[] = [];
	const fullId = Boolean(ids.dseq && ids.gseq && ids.oseq && ids.provider);

	if (fullId) {
		const response = await akashChainGet(
			this,
			base,
			`/akash/market/${MARKET_MODULE_VERSION}/leases/info`,
			{
				'id.owner': ids.owner,
				'id.dseq': ids.dseq,
				'id.gseq': ids.gseq,
				'id.oseq': ids.oseq,
				'id.provider': ids.provider,
			},
		);
		observations.push(toLeaseObservation((response.lease as IDataObject) ?? {}, ids));
	} else {
		const qs: IDataObject = { 'filters.owner': ids.owner };
		if (ids.dseq) {
			qs['filters.dseq'] = ids.dseq;
		}
		if (ids.gseq) {
			qs['filters.gseq'] = ids.gseq;
		}
		if (ids.oseq) {
			qs['filters.oseq'] = ids.oseq;
		}
		if (ids.provider) {
			qs['filters.provider'] = ids.provider;
		}
		const response = await akashChainGet(
			this,
			base,
			`/akash/market/${MARKET_MODULE_VERSION}/leases/list`,
			qs,
		);
		for (const entry of extractArray(response, 'leases')) {
			observations.push(toLeaseObservation((entry.lease as IDataObject) ?? {}, ids));
		}
	}

	if (isManual) {
		return observations.map((obs) => ({
			event: 'leaseStateChange',
			network,
			owner: obs.owner,
			dseq: obs.dseq,
			gseq: obs.gseq,
			oseq: obs.oseq,
			provider: obs.provider,
			state: obs.state,
		}));
	}

	const known = (staticData.leaseState as Record<string, { state: string }>) ?? {};
	const seeded = staticData.leaseStateSeeded === true;
	const next: Record<string, { state: string }> = { ...known };
	const fresh: IDataObject[] = [];

	for (const obs of observations) {
		const previous = known[obs.key];
		if (
			seeded &&
			previous !== undefined &&
			previous.state !== obs.state &&
			(includeClosed || obs.state !== 'closed')
		) {
			fresh.push({
				event: 'leaseStateChange',
				network,
				owner: obs.owner,
				dseq: obs.dseq,
				gseq: obs.gseq,
				oseq: obs.oseq,
				provider: obs.provider,
				state: obs.state,
				previousState: previous.state,
			});
		}
		next[obs.key] = { state: obs.state };
	}

	staticData.leaseState = next;
	staticData.leaseStateSeeded = true;

	return fresh;
}
