import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { consoleApiRequest } from '../../transport/consoleApiRequest';
import { resolveUserId } from './resolveWallet';

/**
 * Account → Get Wallets — `GET /v1/wallets?userId=`.
 *
 * AUTHED, NON-SPENDING `x-api-key` read of the managed wallet records for a user — each row exposes
 * the chain `address`, USD `creditAmount`, and `isTrialing` (plus Stripe top-up metadata). A GET
 * only: no lease, no spend. `userId` is a required query param on this endpoint (LIVE-VERIFIED
 * 2026-07-18: 400 `Required` when omitted, validation independent of auth); when the field is left
 * empty it is resolved from `GET /v1/user/me` via {@link resolveUserId}.
 */
export async function executeAccountWallets(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const userId = (this.getNodeParameter('userId', itemIndex, '') as string).trim();

	const qs: IDataObject = { userId: userId || (await resolveUserId.call(this)) };

	return consoleApiRequest.call(this, 'GET', '/v1/wallets', { qs });
}
