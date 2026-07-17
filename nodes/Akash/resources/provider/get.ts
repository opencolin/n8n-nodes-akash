import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { consoleApiRequest } from '../../transport/consoleApiRequest';

/**
 * Provider → Get — `GET /v1/providers/{address}`.
 *
 * KEYLESS, zero-spend, agent-safe: a single public Console provider record, richer than a
 * list entry — it adds a `stats` block (`{ cpu, gpu, memory, storage }` capacity) on top of
 * `uptime1d/7d/30d`, `isOnline`, `isAudited`, `attributes[]` (each `{ key, value, auditedBy[] }`
 * — audited attributes come for free here, no separate audit-module call), `gpuModels[]`,
 * `hostUri`, and the geo/hardware fields.
 *
 * `address` is the provider owner address (`akash1…`), read from the `providerAddress`
 * resourceLocator with `extractValue` so both the from-list (`searchProviders`) and
 * manual by-address modes resolve to the same string.
 */
export async function executeProviderGet(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const address = this.getNodeParameter('providerAddress', itemIndex, '', {
		extractValue: true,
	}) as string;

	return consoleApiRequest.call(this, 'GET', `/v1/providers/${encodeURIComponent(address)}`);
}
