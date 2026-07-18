import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { consoleApiRequest } from '../../transport/consoleApiRequest';

/**
 * Resolves the API key's own Console user id via `GET /v1/user/me`.
 *
 * LIVE-VERIFIED (2026-07-18): the endpoint returns the user object with `id`
 * for the key owner; `/v1/wallets` refuses to infer it (400 `userId` Required),
 * so ops that need a user id must resolve it explicitly.
 */
export async function resolveUserId(this: IExecuteFunctions): Promise<string> {
	const me = await consoleApiRequest.call(this, 'GET', '/v1/user/me');
	const id = typeof me.id === 'string' ? me.id : '';
	if (id === '') {
		throw new NodeOperationError(
			this.getNode(),
			'Could not resolve the Console user id from /v1/user/me — set the User ID field explicitly.',
		);
	}
	return id;
}

/**
 * Resolves the API key's managed-wallet chain address (`akash1…`).
 *
 * LIVE-VERIFIED (2026-07-18): `/v1/usage/history` REQUIRES `address` (400
 * `Required` when omitted — the server does NOT infer the caller's wallet), so
 * empty-address ops resolve it here: `/v1/user/me` → id, `/v1/wallets?userId`
 * → first wallet's `address`.
 */
export async function resolveManagedWalletAddress(this: IExecuteFunctions): Promise<string> {
	const userId = await resolveUserId.call(this);
	const wallets = await consoleApiRequest.call(this, 'GET', '/v1/wallets', {
		qs: { userId },
	});
	const rows = Array.isArray(wallets) ? (wallets as unknown as IDataObject[]) : [];
	const address = typeof rows[0]?.address === 'string' ? (rows[0].address as string) : '';
	if (address === '') {
		throw new NodeOperationError(
			this.getNode(),
			'Could not resolve a managed-wallet address for this API key — set the Address field explicitly (Account → Get Wallets shows your addresses).',
		);
	}
	return address;
}
