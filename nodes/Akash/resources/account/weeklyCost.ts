import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { consoleApiRequest } from '../../transport/consoleApiRequest';

/**
 * Account → Get Weekly Cost — `GET /v1/weekly-cost`.
 *
 * AUTHED, NON-SPENDING `x-api-key` read of the managed wallet's rolling weekly spend figure (the
 * cost-visibility signal the `costThreshold` trigger also polls). A GET only — no lease, no spend.
 * After the outer `{data}` envelope is stripped the body is returned verbatim; downstream readers
 * probe the spend field defensively since the exact key is confirmed only at the live key gate.
 *
 * `itemIndex` is accepted for signature uniformity across resource executors even though this
 * operation takes no per-item parameters.
 */
export async function executeAccountWeeklyCost(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	return consoleApiRequest.call(this, 'GET', '/v1/weekly-cost');
}
