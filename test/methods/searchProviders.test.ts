import type { ILoadOptionsFunctions } from 'n8n-workflow';

// Mock the transport so searchProviders receives a fixed /v1/providers payload and we can assert
// on both the request it makes and the mapping/filtering it applies.
jest.mock('../../nodes/Akash/transport/consoleApiRequest', () => ({
	consoleApiRequest: jest.fn(),
}));

import { searchProviders } from '../../nodes/Akash/methods/listSearch';
import { consoleApiRequest } from '../../nodes/Akash/transport/consoleApiRequest';

const consoleMock = consoleApiRequest as unknown as jest.Mock;

/** searchProviders touches no context member directly — the transport is mocked — so an empty `this`. */
function makeFakeThis(): ILoadOptionsFunctions {
	return {} as unknown as ILoadOptionsFunctions;
}

beforeEach(() => {
	consoleMock.mockReset();
});

describe('searchProviders (provider resourceLocator from-list)', () => {
	// `/v1/providers` returns a bare array (no envelope). owner is the akash1 address the paired
	// executor reads back to index `/v1/providers/{address}`.
	const providers = [
		{ owner: 'akash1aaa', hostUri: 'https://provider-one.example:8443' },
		{ owner: 'akash1bbb', hostUri: 'https://gpu-farm.example:8443' },
		{ owner: 'akash1ccc' }, // no hostUri → name falls back to the owner address
	];

	it('issues GET /v1/providers and maps each row to { name, value:address }', async () => {
		consoleMock.mockResolvedValueOnce(providers);

		const result = await searchProviders.call(makeFakeThis());

		expect(consoleMock).toHaveBeenCalledTimes(1);
		// consoleApiRequest.call(ctx, 'GET', '/v1/providers') → args recorded as [method, endpoint].
		expect(consoleMock.mock.calls[0][0]).toBe('GET');
		expect(consoleMock.mock.calls[0][1]).toBe('/v1/providers');

		expect(result.results).toEqual([
			{ name: 'https://provider-one.example:8443', value: 'akash1aaa' },
			{ name: 'https://gpu-farm.example:8443', value: 'akash1bbb' },
			{ name: 'akash1ccc', value: 'akash1ccc' },
		]);
	});

	it('narrows results case-insensitively on name AND value', async () => {
		consoleMock.mockResolvedValue(providers);

		// Matches a hostUri (name), upper-cased.
		const byName = await searchProviders.call(makeFakeThis(), 'GPU-FARM');
		expect(byName.results).toEqual([
			{ name: 'https://gpu-farm.example:8443', value: 'akash1bbb' },
		]);

		// Matches an owner address (value), upper-cased.
		const byValue = await searchProviders.call(makeFakeThis(), 'AKASH1CCC');
		expect(byValue.results).toEqual([{ name: 'akash1ccc', value: 'akash1ccc' }]);

		// No hit → empty result set.
		const none = await searchProviders.call(makeFakeThis(), 'zzz-nothing');
		expect(none.results).toEqual([]);
	});

	it('drops rows with no resolvable owner address', async () => {
		consoleMock.mockResolvedValueOnce([
			{ owner: 'akash1keep', hostUri: 'https://keep.example:8443' },
			{ hostUri: 'https://no-owner.example:8443' }, // no owner/address → skipped
		]);

		const result = await searchProviders.call(makeFakeThis());

		expect(result.results).toEqual([
			{ name: 'https://keep.example:8443', value: 'akash1keep' },
		]);
	});
});
