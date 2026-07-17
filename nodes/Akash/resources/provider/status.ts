import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { consoleApiRequest } from '../../transport/consoleApiRequest';
import { providerGatewayRequest } from '../../transport/providerGatewayRequest';

/**
 * Provider → Get Status — provider gateway `:8443/status` + `/version`.
 *
 * KEYLESS, zero-spend, agent-safe. Two hops:
 *   1. Resolve the provider's on-chain `hostUri` via the Console record
 *      (`GET /v1/providers/{address}`). The `hostUri` already carries the `:8443` port.
 *   2. Read the provider gateway directly: `/status` (live cluster inventory — cpu in
 *      millicpu, memory/storage in bytes, active `leases`) and `/version` (daemon version).
 *
 * The gateway serves a self-signed cert (providers prove identity via their on-chain server
 * cert, not WebPKI), so {@link providerGatewayRequest} dials with `skipSslCertificateValidation`.
 * A gateway that is offline or otherwise unreachable surfaces through the transport's
 * `normalizeAkashError` as a `NodeApiError` — the router honours `continueOnFail()`. Only the
 * public, unauthenticated gateway routes are touched; lease-scoped routes are mTLS/JWT-gated
 * and deliberately out of scope.
 *
 * `/version` embeds a ~10 KB `build_deps` list; it is dropped so the surfaced object stays the
 * useful `{ name, version, commit, go }`.
 */
export async function executeProviderStatus(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const address = this.getNodeParameter('providerAddress', itemIndex, '', {
		extractValue: true,
	}) as string;

	const provider = await consoleApiRequest.call(
		this,
		'GET',
		`/v1/providers/${encodeURIComponent(address)}`,
	);
	const hostUri = typeof provider.hostUri === 'string' ? provider.hostUri.trim() : '';
	if (!hostUri) {
		throw new NodeOperationError(
			this.getNode(),
			`Provider ${address || '(unknown)'} has no hostUri on record, so its :8443 gateway cannot be reached.`,
			{ itemIndex },
		);
	}

	const status = await providerGatewayRequest.call(this, hostUri, '/status');
	const version = trimProviderVersion(await providerGatewayRequest.call(this, hostUri, '/version'));

	return {
		providerAddress: address,
		hostUri,
		status,
		version,
	};
}

/**
 * Drop the bulky `akash.build_deps` array from a provider `/version` payload, keeping the
 * remaining `akash` fields (`name`, `version`, `commit`, `go`, …). Returns the payload
 * unchanged when it does not carry a nested `akash` object.
 */
function trimProviderVersion(raw: IDataObject): IDataObject {
	const akash = raw.akash;
	if (akash && typeof akash === 'object' && !Array.isArray(akash)) {
		const trimmedAkash = { ...(akash as IDataObject) };
		delete trimmedAkash.build_deps;
		return { ...raw, akash: trimmedAkash };
	}
	return raw;
}
