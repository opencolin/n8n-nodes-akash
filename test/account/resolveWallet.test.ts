import type { IExecuteFunctions } from 'n8n-workflow';

// Mock the transport so the resolvers receive fixed /v1/user/me and /v1/wallets payloads and we
// can assert the two-step resolution chain (me → id → wallets?userId → first address).
jest.mock('../../nodes/Akash/transport/consoleApiRequest', () => ({
	consoleApiRequest: jest.fn(),
}));

import {
	resolveManagedWalletAddress,
	resolveUserId,
} from '../../nodes/Akash/resources/account/resolveWallet';
import { consoleApiRequest } from '../../nodes/Akash/transport/consoleApiRequest';

const consoleMock = consoleApiRequest as unknown as jest.Mock;

/** The resolvers only touch getNode() on the error path. */
function makeFakeThis(): IExecuteFunctions {
	return { getNode: () => ({ name: 'Akash' }) } as unknown as IExecuteFunctions;
}

beforeEach(() => {
	consoleMock.mockReset();
});

describe('resolveUserId', () => {
	it('reads id from /v1/user/me', async () => {
		consoleMock.mockResolvedValueOnce({ id: 'user-123', email: 'x@example.com' });
		await expect(resolveUserId.call(makeFakeThis())).resolves.toBe('user-123');
		expect(consoleMock).toHaveBeenCalledWith('GET', '/v1/user/me');
	});

	it('throws a node error when id is missing', async () => {
		consoleMock.mockResolvedValueOnce({ email: 'x@example.com' });
		await expect(resolveUserId.call(makeFakeThis())).rejects.toThrow(/User ID field/);
	});
});

describe('resolveManagedWalletAddress', () => {
	it('chains me → wallets?userId → first wallet address', async () => {
		consoleMock.mockResolvedValueOnce({ id: 'user-123' });
		consoleMock.mockResolvedValueOnce([
			{ address: 'akash1firstwallet', creditAmount: 100, isTrialing: true },
			{ address: 'akash1second' },
		]);
		await expect(resolveManagedWalletAddress.call(makeFakeThis())).resolves.toBe(
			'akash1firstwallet',
		);
		expect(consoleMock).toHaveBeenNthCalledWith(2, 'GET', '/v1/wallets', {
			qs: { userId: 'user-123' },
		});
	});

	it('throws a node error when the wallet list is empty', async () => {
		consoleMock.mockResolvedValueOnce({ id: 'user-123' });
		consoleMock.mockResolvedValueOnce([]);
		await expect(resolveManagedWalletAddress.call(makeFakeThis())).rejects.toThrow(
			/Address field/,
		);
	});
});
