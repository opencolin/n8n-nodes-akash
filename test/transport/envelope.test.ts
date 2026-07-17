import type { IExecuteFunctions } from 'n8n-workflow';

import { consoleApiRequest } from '../../nodes/Akash/transport/consoleApiRequest';

const DEFAULT_BASE_URL = 'https://console-api.akash.network';

/**
 * Build a mocked `this` for consoleApiRequest.
 *
 * `getCredentials` either resolves the credential object (authed mode) or rejects — the node
 * declares `akashApi` as optional, so a rejected `getCredentials` is the KEYLESS signal, not a
 * failure. `helpers.httpRequest` is the plain keyless sender (`helpers.httpRequest(options)`);
 * `helpers.httpRequestWithAuthentication` is the authed sender (`.call(this, 'akashApi', options)`).
 */
function makeFakeThis(opts: {
	credentials?: Record<string, unknown>;
	httpRequest: jest.Mock;
	httpRequestWithAuthentication: jest.Mock;
}): IExecuteFunctions {
	const getCredentials =
		opts.credentials === undefined
			? jest.fn().mockRejectedValue(new Error('no credential configured'))
			: jest.fn().mockResolvedValue(opts.credentials);

	return {
		getCredentials,
		helpers: {
			httpRequest: opts.httpRequest,
			httpRequestWithAuthentication: opts.httpRequestWithAuthentication,
		},
	} as unknown as IExecuteFunctions;
}

describe('consoleApiRequest', () => {
	it('KEYLESS: uses httpRequest (no auth) against the default base URL with no x-api-key', async () => {
		const httpRequest = jest.fn().mockResolvedValue({ models: [] });
		const httpRequestWithAuthentication = jest.fn();
		const fakeThis = makeFakeThis({ httpRequest, httpRequestWithAuthentication });

		await consoleApiRequest.call(fakeThis, 'GET', '/v1/gpu-models');

		expect(httpRequestWithAuthentication).not.toHaveBeenCalled();
		expect(httpRequest).toHaveBeenCalledTimes(1);

		const options = httpRequest.mock.calls[0][0];
		expect(options.method).toBe('GET');
		expect(options.url).toBe(`${DEFAULT_BASE_URL}/v1/gpu-models`);
		expect(options.headers['x-api-key']).toBeUndefined();
	});

	it('AUTHED: uses httpRequestWithAuthentication with the akashApi credential type', async () => {
		const httpRequest = jest.fn();
		const httpRequestWithAuthentication = jest.fn().mockResolvedValue({ data: { balance: 1 } });
		const fakeThis = makeFakeThis({
			credentials: { apiKey: 'k', baseUrl: 'https://console-api.akash.network' },
			httpRequest,
			httpRequestWithAuthentication,
		});

		await consoleApiRequest.call(fakeThis, 'GET', '/v1/balances');

		expect(httpRequest).not.toHaveBeenCalled();
		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(1);

		// Invoked via `.call(this, 'akashApi', options)` -> args are ['akashApi', options].
		const [credentialType, options] = httpRequestWithAuthentication.mock.calls[0];
		expect(credentialType).toBe('akashApi');
		expect(options.method).toBe('GET');
		expect(options.url).toBe(`${DEFAULT_BASE_URL}/v1/balances`);
	});

	it('ENVELOPE STRIP: unwraps a { data: … } object response', async () => {
		const httpRequestWithAuthentication = jest.fn().mockResolvedValue({ data: { balance: 1 } });
		const fakeThis = makeFakeThis({
			credentials: { apiKey: 'k' },
			httpRequest: jest.fn(),
			httpRequestWithAuthentication,
		});

		const result = await consoleApiRequest.call(fakeThis, 'GET', '/v1/balances');
		expect(result).toEqual({ balance: 1 });
	});

	it('ENVELOPE STRIP: returns an unwrapped object (no data key) verbatim', async () => {
		const httpRequest = jest.fn().mockResolvedValue({ models: [] });
		const fakeThis = makeFakeThis({
			httpRequest,
			httpRequestWithAuthentication: jest.fn(),
		});

		const result = await consoleApiRequest.call(fakeThis, 'GET', '/v1/gpu-models');
		expect(result).toEqual({ models: [] });
	});

	it('does NOT unwrap an array response', async () => {
		const httpRequest = jest.fn().mockResolvedValue([{ a: 1 }, { b: 2 }]);
		const fakeThis = makeFakeThis({
			httpRequest,
			httpRequestWithAuthentication: jest.fn(),
		});

		const result = await consoleApiRequest.call(fakeThis, 'GET', '/v1/providers');
		expect(result).toEqual([{ a: 1 }, { b: 2 }]);
	});

	it('honors a baseUrl override from the credential', async () => {
		const httpRequestWithAuthentication = jest.fn().mockResolvedValue({ data: {} });
		const fakeThis = makeFakeThis({
			credentials: { apiKey: 'k', baseUrl: 'https://staging.example.com/' },
			httpRequest: jest.fn(),
			httpRequestWithAuthentication,
		});

		await consoleApiRequest.call(fakeThis, 'GET', '/v1/balances');

		const options = httpRequestWithAuthentication.mock.calls[0][1];
		// Trailing slash stripped, endpoint appended.
		expect(options.url).toBe('https://staging.example.com/v1/balances');
	});
});
