import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
} from 'n8n-workflow';

import { normalizeAkashError } from './errors';

/** Console API base URL used when the credential does not specify one. */
const DEFAULT_BASE_URL = 'https://console-api.akash.network';

/**
 * Shared transport for the **Akash Console plane** — the primary of three planes the node speaks:
 *
 *   1. Console plane (THIS file) — `https://console-api.akash.network`, HTTP/1.1 JSON, authed with
 *      a single `x-api-key` header. The managed wallet signs Cosmos txs server-side; the node never
 *      touches a mnemonic or a signing library. Many endpoints also serve keyless public reads.
 *   2. Chain LCD plane — keyless Cosmos REST (added in a later release).
 *   3. Provider gateway plane — keyless `:8443` gateway (added in a later release).
 *
 * ## Keyless-vs-authed branch
 *
 * The node declares the `akashApi` credential as `required: false`, so a workflow may run public
 * read operations (GPU prices, network capacity, …) with NO credential attached. Because the
 * credential is optional, `this.getCredentials('akashApi')` THROWS when none is configured — that
 * throw is the KEYLESS signal, not an error. When a credential IS present we send through
 * `httpRequestWithAuthentication`, letting the credential's `authenticate` block inject the
 * `x-api-key` header; when it is absent we send a plain `httpRequest` with no auth header.
 *
 * ## Conditional envelope strip
 *
 * Authed/managed-wallet reads wrap their payload in a top-level `{ "data": … }` object (VERIFIED —
 * research console-api.md design-note 5: strip the outer `{data:…}`). Public GPU/network reads
 * return the object directly. So we unwrap ONLY when the parsed body is a non-null object (never an
 * array) that has its own `data` property; otherwise we return the body verbatim.
 *
 * POST is supported for forward compatibility (the write path lands in a later release); v0.1.0 only
 * issues GETs.
 *
 * @param method   The HTTP method (`GET`, `POST`, …).
 * @param endpoint The path beginning with `/` (e.g. `/v1/network-capacity`).
 * @param options  Optional `body` and/or `qs` (query string) objects.
 * @returns The parsed response body, with the outer `{data:…}` envelope stripped when present.
 * @throws A normalised {@link NodeApiError} (never a raw HTTP error).
 */
export async function consoleApiRequest(
	this: IExecuteFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	options: { body?: IDataObject; qs?: IDataObject } = {},
): Promise<IDataObject> {
	// Optional credential: `getCredentials` THROWS in keyless mode (credential not configured).
	let credentials: IDataObject | undefined;
	try {
		credentials = await this.getCredentials<IDataObject>('akashApi');
	} catch {
		credentials = undefined;
	}

	const configuredBaseUrl =
		typeof credentials?.baseUrl === 'string' ? credentials.baseUrl.trim() : '';
	const baseUrl = (configuredBaseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
	const url = baseUrl + endpoint;

	const requestOptions: IHttpRequestOptions = {
		method,
		url,
		json: true,
		headers: {
			'Content-Type': 'application/json',
		},
	};
	if (options.body !== undefined) {
		requestOptions.body = options.body;
	}
	if (options.qs !== undefined) {
		requestOptions.qs = options.qs;
	}

	let response: unknown;
	try {
		if (credentials !== undefined) {
			// Authed: the credential's `authenticate` block injects `x-api-key`.
			response = await this.helpers.httpRequestWithAuthentication.call(
				this,
				'akashApi',
				requestOptions,
			);
		} else {
			// Keyless public read: no auth header.
			response = await this.helpers.httpRequest(requestOptions);
		}
	} catch (error) {
		throw normalizeAkashError.call(this, error);
	}

	return unwrapData(response);
}

/**
 * Conditionally strip the outer `{data:…}` envelope. Only a non-null, non-array object that owns a
 * `data` property is unwrapped; arrays and plain objects without `data` are returned verbatim.
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
