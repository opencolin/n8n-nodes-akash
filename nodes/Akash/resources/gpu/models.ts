import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { consoleApiRequest } from '../../transport/consoleApiRequest';

/**
 * GPU → Get Models — `GET /v1/gpu-models`.
 *
 * KEYLESS, zero-spend, agent-safe: a public Console read that moves no funds and
 * needs no `x-api-key`. Lists the catalog of GPU models offered on Akash — the
 * canonical model/memory/interface reference (e.g. to populate a model selector).
 *
 * Verified response shape (live-probed 2026-07-17) — an array of vendors, each with
 * its offered models:
 * `[ { name, displayName,
 *     models: [ { name, displayName, memory: string[], interface: string[] } ] } ]`.
 *
 * The Console returns a top-level JSON array here; the transport helper preserves it
 * verbatim (the `{data:…}` envelope is only stripped when present), so the executor's
 * return is the array as-is.
 *
 * `itemIndex` is accepted for signature uniformity across resource executors even
 * though this operation takes no per-item parameters — mirrors the Tenki `whoAmI` idiom.
 */
export async function executeGpuModels(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	return consoleApiRequest.call(this, 'GET', '/v1/gpu-models');
}
