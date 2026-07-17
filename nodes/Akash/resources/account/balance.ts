import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { consoleApiRequest } from '../../transport/consoleApiRequest';

/**
 * Account → Get Balance — `GET /v1/balances`.
 *
 * AUTHED, NON-SPENDING `x-api-key` read of the Console managed wallet's USD-denominated credit:
 * `{ balance, deployments, total }` after the outer `{data}` envelope is stripped. A GET only — no
 * lease is taken, no funds move. (The credential is `required: false` at the node level so keyless
 * public reads still work; this op needs a key and returns a normalized 401 without one.)
 *
 * `itemIndex` is accepted for signature uniformity across resource executors even though this
 * operation takes no per-item parameters — mirrors the sibling `executeGpuPrices` idiom.
 */
export async function executeAccountBalance(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	return consoleApiRequest.call(this, 'GET', '/v1/balances');
}
