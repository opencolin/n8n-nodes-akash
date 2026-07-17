import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { consoleApiRequest } from '../../transport/consoleApiRequest';

/**
 * Provider → Get Regions — `GET /v1/provider-regions`.
 *
 * KEYLESS, zero-spend, agent-safe: the public catalogue of provider regions. Each entry is
 * `{ key, value, description, providers }` — the region key/label plus how many providers
 * advertise it — useful for driving a placement-region picker or a capacity-by-region report.
 *
 * The endpoint returns a bare JSON array. `consoleApiRequest` is typed to a single object, so
 * we widen through `unknown` and hand the array back as items for the router to spread; a
 * non-array body is wrapped so the operation always yields at least one item.
 *
 * `itemIndex` is accepted for signature uniformity across resource executors even though this
 * operation takes no per-item parameters — mirrors the GPU/network read idiom.
 */
export async function executeProviderRegions(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject[]> {
	const response = (await consoleApiRequest.call(this, 'GET', '/v1/provider-regions')) as unknown;

	return Array.isArray(response) ? (response as IDataObject[]) : [response as IDataObject];
}
