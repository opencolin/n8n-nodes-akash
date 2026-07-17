import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { consoleApiRequest } from '../../transport/consoleApiRequest';

/**
 * Network → Get Capacity — `GET /v1/network-capacity`.
 *
 * KEYLESS, zero-spend, agent-safe: a public Console read that moves no funds and
 * needs no `x-api-key`. Reports live network-wide compute capacity.
 *
 * Verified response shape (live-probed 2026-07-17):
 * `{ resources: { cpu, gpu, memory, storage{active,pending,available,total} },
 *   activeProviderCount }`, where each resource block carries
 * `{active,pending,available,total}`. CPU is in **millicores**; memory and storage
 * are in **bytes**; GPU counts are whole units. (Live `storage` is further split into
 * `ephemeral`/`persistent`/`total` sub-blocks, each with the same four fields.)
 * `activeProviderCount` is the number of currently-active providers.
 *
 * `itemIndex` is accepted for signature uniformity across resource executors even
 * though this operation takes no per-item parameters — mirrors the Tenki `whoAmI` idiom.
 */
export async function executeNetworkCapacity(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	return consoleApiRequest.call(this, 'GET', '/v1/network-capacity');
}
