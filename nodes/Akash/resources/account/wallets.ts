import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { consoleApiRequest } from '../../transport/consoleApiRequest';

/**
 * Account → Get Wallets — `GET /v1/wallets?userId=`.
 *
 * AUTHED, NON-SPENDING `x-api-key` read of the managed wallet records for a user — each row exposes
 * the chain `address`, USD `creditAmount`, and `isTrialing` (plus Stripe top-up metadata). A GET
 * only: no lease, no spend. `userId` is a required query param on this endpoint (validation runs
 * independently of auth); resolve it from `Account → Who Am I` when unknown. The value is forwarded
 * only when non-empty so an omitted id surfaces a normalized validation error rather than a bad URL.
 */
export async function executeAccountWallets(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const userId = (this.getNodeParameter('userId', itemIndex, '') as string).trim();

	const qs: IDataObject = {};
	if (userId) {
		qs.userId = userId;
	}

	return consoleApiRequest.call(this, 'GET', '/v1/wallets', { qs });
}
