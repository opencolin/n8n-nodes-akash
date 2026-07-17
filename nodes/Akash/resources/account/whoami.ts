import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { consoleApiRequest } from '../../transport/consoleApiRequest';

/**
 * Account → Who Am I — `GET /v1/user/me`.
 *
 * AUTHED, NON-SPENDING `x-api-key` read that resolves the identity behind the attached key — the
 * same endpoint the `akashApi` credential test targets (200 with a valid key, 401 without). A GET
 * only: no lease, no spend. Useful to confirm a key is live and to read the `userId` other account
 * ops (e.g. `getWallets`) accept as a query param.
 *
 * `itemIndex` is accepted for signature uniformity across resource executors even though this
 * operation takes no per-item parameters.
 */
export async function executeAccountWhoami(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	return consoleApiRequest.call(this, 'GET', '/v1/user/me');
}
