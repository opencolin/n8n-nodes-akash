import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { consoleApiRequest } from '../../transport/consoleApiRequest';

/**
 * GPU → Get Prices — `GET /v1/gpu-prices`.
 *
 * KEYLESS, zero-spend, agent-safe: a public Console read that moves no funds and
 * needs no `x-api-key`. The GPU marketplace price feed is the v0.1.0 differentiator.
 *
 * Verified response shape (live-probed 2026-07-17) — a top-level marketplace roll-up
 * plus a `models[]` array, one entry per GPU SKU:
 * `{ availability{total,available}, models: [ { vendor, model, ram, interface,
 *   availability{total,available}, providerAvailability{total,available},
 *   price{currency,min,max,avg,weightedAverage,med},
 *   priceUakt{currency,min,max,avg,weightedAverage,med} } ] }`.
 * USD prices are per-GPU-per-hour; `priceUakt` mirrors them in uakt.
 *
 * `itemIndex` is accepted for signature uniformity across resource executors even
 * though this operation takes no per-item parameters (kept for a future
 * coin/model selector) — mirrors the Tenki `whoAmI` idiom.
 */
export async function executeGpuPrices(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	return consoleApiRequest.call(this, 'GET', '/v1/gpu-prices');
}
