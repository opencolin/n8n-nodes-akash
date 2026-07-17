import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { normalizeAkashError } from './errors';

/** Standard Akash provider gateway port — every online provider answers HTTPS here. */
const GATEWAY_PORT = '8443';

/** Public, keyless gateway paths this helper is allowed to hit. */
type GatewayPath = '/status' | '/version' | '/address';

/**
 * Normalise a provider `host_uri` (from the chain provider record or Console API) to a clean
 * `https://<host>:8443` origin, dropping any path/query the record may carry.
 *
 * Provider records usually already include the port (`https://provider.europlots.com:8443`), but we
 * defensively: force the `https` scheme, add a scheme when the value is bare, and append
 * `:8443` when no port is present. Returns origin only — the caller appends the fixed path.
 *
 * @throws A plain `Error` on an empty/unparseable host — the caller normalises it to a
 *         {@link NodeApiError}.
 */
function normalizeGatewayOrigin(hostUri: string): string {
	const raw = (hostUri ?? '').trim();
	if (raw === '') {
		throw new Error('Provider hostUri is empty — cannot reach the gateway.');
	}

	// Ensure a scheme so the URL parser accepts it; the scheme is forced to https below regardless.
	const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw) ? raw : `https://${raw}`;

	let url: URL;
	try {
		url = new URL(withScheme);
	} catch {
		throw new Error(`Provider hostUri is not a valid URL: ${hostUri}`);
	}

	const port = url.port === '' ? GATEWAY_PORT : url.port;
	return `https://${url.hostname}:${port}`;
}

/**
 * Shared transport for the **provider gateway plane** (`:8443`) — the tertiary of the three planes
 * the node speaks. Only the three **public, keyless** endpoints are exposed here: `/status`
 * (cluster inventory / free capacity / lease count), `/version` (provider version + commit), and
 * `/address` (the provider's on-chain owner address). Everything lease-scoped on the gateway
 * (`/lease/…/{status,manifest,logs,shell}`) is mTLS/JWT-gated or WebSocket and is deliberately
 * out of scope.
 *
 * ## Self-signed TLS trade-off (documented, intentional)
 *
 * Provider gateways serve a **self-signed cert that is NOT in the public WebPKI chain** — a
 * provider proves its identity via its **on-chain server certificate**, not a CA. n8n's
 * `httpRequest` has no cheap way to pin that on-chain cert per request, so this helper sets
 * **`skipSslCertificateValidation: true`** (equivalent to the CLI dialing providers with `-k`).
 * The trade-off is accepted for these read-only, unauthenticated observability calls; no
 * credential or secret is ever sent to a provider, so a spoofed host learns nothing.
 *
 * @param hostUri The provider `host_uri` (e.g. `https://provider.europlots.com:8443`).
 * @param path    One of `/status`, `/version`, `/address`.
 * @returns The parsed gateway JSON body, unmodified (no `{data}` envelope on this plane).
 * @throws A normalised {@link NodeApiError} (never a raw HTTP/TLS error).
 */
export async function providerGatewayRequest(
	this: IExecuteFunctions,
	hostUri: string,
	path: GatewayPath,
): Promise<IDataObject> {
	try {
		const origin = normalizeGatewayOrigin(hostUri);

		const response = await this.helpers.httpRequest({
			method: 'GET',
			url: origin + path,
			json: true,
			// Providers present a self-signed cert (identity proven on-chain, not via WebPKI).
			skipSslCertificateValidation: true,
			headers: {
				Accept: 'application/json',
			},
		});

		return (response ?? {}) as IDataObject;
	} catch (error) {
		throw normalizeAkashError.call(this, error);
	}
}
