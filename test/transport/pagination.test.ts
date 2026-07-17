import type { IExecuteFunctions } from 'n8n-workflow';

// Mock the two transports paginate.* delegates to, so we can assert on the query threading.
jest.mock('../../nodes/Akash/transport/chainRestRequest', () => ({
	chainRestRequest: jest.fn(),
}));
jest.mock('../../nodes/Akash/transport/consoleApiRequest', () => ({
	consoleApiRequest: jest.fn(),
}));

import {
	encodeNextKey,
	paginateChain,
	paginateConsole,
} from '../../nodes/Akash/transport/pagination';
import { chainRestRequest } from '../../nodes/Akash/transport/chainRestRequest';
import { consoleApiRequest } from '../../nodes/Akash/transport/consoleApiRequest';

const chainMock = chainRestRequest as unknown as jest.Mock;
const consoleMock = consoleApiRequest as unknown as jest.Mock;

/**
 * Minimal `this` whose only relevant method is `getNodeParameter(name, itemIndex, fallback)`.
 * Returns the value from `params` when present, else the caller-supplied fallback.
 */
function makeFakeThis(params: Record<string, unknown>): IExecuteFunctions {
	return {
		getNodeParameter: (name: string, _itemIndex: number, fallback?: unknown) =>
			name in params ? params[name] : fallback,
	} as unknown as IExecuteFunctions;
}

beforeEach(() => {
	chainMock.mockReset();
	consoleMock.mockReset();
});

describe('encodeNextKey (VERIFIED next_key URL-encode gotcha)', () => {
	it('percent-encodes +, /, and = and round-trips back to the original key', () => {
		const raw = 'aB3+cd/12ef==';
		const encoded = encodeNextKey(raw);

		expect(encoded).toContain('%2B'); // +
		expect(encoded).toContain('%2F'); // /
		expect(encoded).toContain('%3D'); // =
		// No raw +, /, or = survive in the encoded cursor.
		expect(encoded).not.toMatch(/[+/=]/);
		// Round-trip is lossless — decoding recovers the exact cursor.
		expect(decodeURIComponent(encoded)).toBe(raw);
	});
});

describe('paginateChain', () => {
	it('threads the URL-encoded pagination.key across pages, omits it on page 1, and stops on empty next_key', async () => {
		chainMock
			.mockResolvedValueOnce({
				deployments: [{ id: 1 }],
				// count_total is deliberately huge/unreliable — it must be ignored.
				pagination: { next_key: 'cur+sor/1=', count_total: '999999' },
			})
			.mockResolvedValueOnce({
				deployments: [{ id: 2 }],
				pagination: { next_key: '', count_total: '999999' },
			});

		const ctx = makeFakeThis({ returnAll: true, limit: 50 });
		const result = await paginateChain.call(
			ctx,
			'/akash/deployment/v1beta4/deployments/list',
			'deployments',
			{ 'filters.state': 'active' },
			0,
		);

		expect(result).toEqual([{ id: 1 }, { id: 2 }]);
		expect(chainMock).toHaveBeenCalledTimes(2);

		// Page 1: full page size, base filter forwarded, NO cursor.
		const firstQs = chainMock.mock.calls[0][1].qs;
		expect(firstQs['pagination.limit']).toBe(100);
		expect(firstQs['filters.state']).toBe('active');
		expect(firstQs['pagination.key']).toBeUndefined();

		// Page 2: threads page 1's next_key, URL-encoded.
		const secondQs = chainMock.mock.calls[1][1].qs;
		expect(secondQs['pagination.key']).toBe(encodeNextKey('cur+sor/1='));
		expect(secondQs['pagination.key']).toContain('%2B');
		expect(secondQs['filters.state']).toBe('active');
	});

	it('stops when next_key is null (Cosmos "no more pages")', async () => {
		chainMock
			.mockResolvedValueOnce({ leases: [{ id: 'a' }], pagination: { next_key: 'k2' } })
			.mockResolvedValueOnce({ leases: [{ id: 'b' }], pagination: { next_key: null } });

		const ctx = makeFakeThis({ returnAll: true });
		const result = await paginateChain.call(ctx, '/x', 'leases', {}, 0);

		expect(result).toEqual([{ id: 'a' }, { id: 'b' }]);
		expect(chainMock).toHaveBeenCalledTimes(2);
	});

	it('fetches a single page sliced to limit when returnAll is false', async () => {
		chainMock.mockResolvedValueOnce({
			deployments: [{ id: 1 }, { id: 2 }, { id: 3 }],
			pagination: { next_key: 'moreiscoming' },
		});

		const ctx = makeFakeThis({ returnAll: false, limit: 2 });
		const result = await paginateChain.call(ctx, '/x', 'deployments', {}, 0);

		expect(result).toEqual([{ id: 1 }, { id: 2 }]);
		expect(chainMock).toHaveBeenCalledTimes(1);
		expect(chainMock.mock.calls[0][1].qs['pagination.limit']).toBe(2);
		expect(chainMock.mock.calls[0][1].qs['pagination.key']).toBeUndefined();
	});
});

describe('paginateConsole', () => {
	it('walks skip/limit until a short page (itemsKey null → body is the array)', async () => {
		const fullPage = Array.from({ length: 100 }, (_v, i) => ({ n: i }));
		const shortPage = [{ n: 100 }];
		consoleMock.mockResolvedValueOnce(fullPage).mockResolvedValueOnce(shortPage);

		const ctx = makeFakeThis({ returnAll: true, limit: 50 });
		const result = await paginateConsole.call(ctx, '/v1/providers', null, {}, 0);

		expect(result).toHaveLength(101);
		expect(consoleMock).toHaveBeenCalledTimes(2);
		// consoleApiRequest is called via .call(this, 'GET', endpoint, { qs }) → options at index 2.
		expect(consoleMock.mock.calls[0][2].qs.skip).toBe(0);
		expect(consoleMock.mock.calls[1][2].qs.skip).toBe(100);
	});

	it('reads the page array under itemsKey when provided', async () => {
		consoleMock.mockResolvedValueOnce({ providers: [{ owner: 'akash1a' }] });

		const ctx = makeFakeThis({ returnAll: false, limit: 25 });
		const result = await paginateConsole.call(ctx, '/v1/providers', 'providers', {}, 0);

		expect(result).toEqual([{ owner: 'akash1a' }]);
		expect(consoleMock).toHaveBeenCalledTimes(1);
		expect(consoleMock.mock.calls[0][2].qs.limit).toBe(25);
	});
});
