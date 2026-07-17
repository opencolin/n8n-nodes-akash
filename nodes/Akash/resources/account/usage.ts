import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { consoleApiRequest } from '../../transport/consoleApiRequest';

/**
 * Account → Get Usage History — `GET /v1/usage/history` (or `/v1/usage/history/stats`).
 *
 * AUTHED, NON-SPENDING `x-api-key` read of billing/usage history for an address over an optional
 * date window. A GET only — no lease, no spend. When the `statistics` toggle is on the aggregate
 * `/v1/usage/history/stats` endpoint is queried instead of the raw history. `address`, `startDate`
 * and `endDate` are optional query params, forwarded only when non-empty (empty `address` lets the
 * managed wallet's own owner be inferred server-side / surfaces a normalized validation error).
 */
export async function executeAccountUsage(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const address = (this.getNodeParameter('address', itemIndex, '') as string).trim();
	const startDate = (this.getNodeParameter('startDate', itemIndex, '') as string).trim();
	const endDate = (this.getNodeParameter('endDate', itemIndex, '') as string).trim();
	const statistics = this.getNodeParameter('statistics', itemIndex, false) as boolean;

	const qs: IDataObject = {};
	if (address) {
		qs.address = address;
	}
	if (startDate) {
		qs.startDate = startDate;
	}
	if (endDate) {
		qs.endDate = endDate;
	}

	const endpoint = statistics ? '/v1/usage/history/stats' : '/v1/usage/history';

	return consoleApiRequest.call(this, 'GET', endpoint, { qs });
}
