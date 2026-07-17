import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { consoleApiRequest } from '../../transport/consoleApiRequest';

/**
 * GPU → Get Inventory — `GET /v1/gpu`.
 *
 * KEYLESS, zero-spend, agent-safe: a public Console read that moves no funds and
 * needs no `x-api-key`. Reports live GPU cluster inventory across the Akash network.
 *
 * Verified response shape (live-probed 2026-07-17) — network-wide allocatable vs
 * allocated totals plus a per-vendor breakdown by model:
 * `{ gpus: { total{allocatable,allocated},
 *   details: { <vendor>: [ { model, ram, interface, allocatable, allocated } ] } } }`.
 * (`allocatable - allocated` is the free GPU count for each model.)
 *
 * `itemIndex` is accepted for signature uniformity across resource executors even
 * though this operation takes no per-item parameters — mirrors the Tenki `whoAmI` idiom.
 */
export async function executeGpuInventory(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	return consoleApiRequest.call(this, 'GET', '/v1/gpu');
}
