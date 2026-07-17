import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { paginateConsole } from '../../transport/pagination';

/**
 * Provider → List — `GET /v1/providers`.
 *
 * KEYLESS, zero-spend, agent-safe: the public Console provider registry moves no funds
 * and needs no `x-api-key`. Returns one entry per provider with its live derived metadata:
 * `owner`, `name`, `hostUri`, `uptime1d/7d/30d` (0–1 floats), `isOnline`, `isAudited`,
 * `attributes[]` (each `{ key, value, auditedBy[] }`), `gpuModels[]`, `deploymentCount`,
 * `leaseCount`, region/geo fields, and hardware summaries. (Uptime + audit status are
 * Console-derived — the on-chain provider module does not expose them.)
 *
 * The endpoint returns a bare JSON array (no envelope, no `providers` wrapper), so the
 * pagination helper is told `itemsKey = null` — the response *is* the array. The Console
 * `skip`/`limit` walker inside {@link paginateConsole} reads the node's own `returnAll` /
 * `limit` params, so no query string is supplied here.
 *
 * `onlyOnline` / `onlyAudited` are optional CLIENT-SIDE filters applied after fetching:
 * they narrow an already-retrieved page (e.g. "the online providers among the first 50"),
 * they do not push a server-side filter.
 */
export async function executeProviderList(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject[]> {
	const providers = await paginateConsole.call(this, '/v1/providers', null, {}, itemIndex);

	const onlyOnline = this.getNodeParameter('onlyOnline', itemIndex, false) as boolean;
	const onlyAudited = this.getNodeParameter('onlyAudited', itemIndex, false) as boolean;

	let filtered = providers;
	if (onlyOnline) {
		filtered = filtered.filter((provider) => provider.isOnline === true);
	}
	if (onlyAudited) {
		filtered = filtered.filter((provider) => provider.isAudited === true);
	}
	return filtered;
}
