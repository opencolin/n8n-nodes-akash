import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { consoleApiRequest } from '../../transport/consoleApiRequest';
import { resolveManagedWalletAddress } from './resolveWallet';

/**
 * Account → Get Usage History — `GET /v1/usage/history` (or `/v1/usage/history/stats`).
 *
 * AUTHED, NON-SPENDING `x-api-key` read of billing/usage history for an address over an optional
 * date window. A GET only — no lease, no spend. When the `statistics` toggle is on the aggregate
 * `/v1/usage/history/stats` endpoint is queried instead of the raw history. `startDate` and
 * `endDate` are optional query params, forwarded only when non-empty. `address` is REQUIRED by the
 * server (LIVE-VERIFIED 2026-07-18: 400 `Required` when omitted — no server-side inference); when
 * the field is left empty it is resolved via {@link resolveManagedWalletAddress}.
 */
export async function executeAccountUsage(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const address = (this.getNodeParameter('address', itemIndex, '') as string).trim();
	const startDate = (this.getNodeParameter('startDate', itemIndex, '') as string).trim();
	const endDate = (this.getNodeParameter('endDate', itemIndex, '') as string).trim();
	const statistics = this.getNodeParameter('statistics', itemIndex, false) as boolean;

	// LIVE-VERIFIED (2026-07-18): the server REQUIRES address (400 when omitted;
	// it does not infer the caller's wallet) — resolve it when left empty.
	const qs: IDataObject = {
		address: address || (await resolveManagedWalletAddress.call(this)),
	};
	if (startDate) {
		qs.startDate = startDate;
	}
	if (endDate) {
		qs.endDate = endDate;
	}

	const endpoint = statistics ? '/v1/usage/history/stats' : '/v1/usage/history';

	return consoleApiRequest.call(this, 'GET', endpoint, { qs });
}
