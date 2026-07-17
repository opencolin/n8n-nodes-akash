import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeListSearchItems,
	INodeListSearchResult,
} from 'n8n-workflow';

import { chainPaths, chainRestRequest } from '../transport/chainRestRequest';
import { consoleApiRequest } from '../transport/consoleApiRequest';

/**
 * `listSearch` methods powering the **from-list** mode of the resourceLocator fields introduced in
 * v0.3.0. Each is registered under `methods.listSearch` in `Akash.node.ts` and referenced by name
 * from a field's `modes[].typeOptions.searchListMethod`:
 *
 *   - `searchProviders`        ↔ provider `providerAddress` (Provider → Get / Get Status)
 *   - `searchChainDeployments` ↔ chain `dseq` (Chain → Get Deployment)
 *
 * n8n calls these with an `ILoadOptionsFunctions` `this` — not the `IExecuteFunctions` that
 * `execute()` sees. That context still exposes the `getCredentials` / `helpers.httpRequest*` the
 * transports rely on, so `consoleApiRequest` (whose declared `this` is `IExecuteFunctions`) is
 * called through a cast, exactly as the sibling Tenki node does; no execute-only member is touched.
 * `chainRestRequest` already accepts `ILoadOptionsFunctions` directly.
 *
 * Both methods are KEYLESS public reads (Console `/v1/providers`, chain LCD `deployments/list`) —
 * no `x-api-key`, no spend. The loadOptions context carries no `network`/`chainBaseUrl` node params,
 * so `searchChainDeployments` passes an explicit mainnet `baseUrl` to force the host.
 *
 * Contract for every method: fetch a single page, map each row to `{ name, value }` where `value`
 * is the id the paired executor reads back, then apply a case-insensitive client-side `filter` over
 * name AND value (n8n passes the search-box text here).
 */

/** Mainnet LCD host — loadOptions has no `network` node param, so mainnet is forced explicitly. */
const MAINNET_CHAIN_BASE_URL = 'https://api.akashnet.net';

/** Case-insensitive match of a filter against an item's display name and id/value. */
function matchesFilter(item: INodeListSearchItems, filter?: string): boolean {
	if (!filter) {
		return true;
	}
	const needle = filter.toLowerCase();
	const name = (item.name ?? '').toLowerCase();
	const value = String(item.value ?? '').toLowerCase();
	return name.includes(needle) || value.includes(needle);
}

/**
 * Providers dropdown — keyless `GET /v1/providers` (bare array, no envelope). Maps each provider to
 * `{ name: hostUri || owner, value: owner }`; the owner address is what `executeProviderGet` /
 * `executeProviderStatus` read back via `extractValue` to index `/v1/providers/{address}`.
 */
export async function searchProviders(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const response = await consoleApiRequest.call(
		this as unknown as IExecuteFunctions,
		'GET',
		'/v1/providers',
	);

	const rows: IDataObject[] = Array.isArray(response) ? (response as unknown as IDataObject[]) : [];

	const results: INodeListSearchItems[] = rows
		.map((row): INodeListSearchItems => {
			const owner =
				typeof row.owner === 'string' && row.owner
					? row.owner
					: typeof row.address === 'string'
						? row.address
						: '';
			const hostUri = typeof row.hostUri === 'string' ? row.hostUri : '';
			return { name: hostUri || owner || '(unknown provider)', value: owner };
		})
		.filter((item) => item.value !== '')
		.filter((item) => matchesFilter(item, filter));

	return { results };
}

/**
 * Deployments dropdown — keyless chain LCD `deployments/list` (mainnet forced). Maps each row to
 * `{ name: 'dseq <n>', value: <dseq> }` from `row.deployment.id.dseq` (defensive optional
 * chaining); the `dseq` string is what `executeChainGetDeployment` reads back via `extractValue`.
 */
export async function searchChainDeployments(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const response = await chainRestRequest.call(this, chainPaths.deploymentsList(), {
		baseUrl: MAINNET_CHAIN_BASE_URL,
	});

	const rows = (response.deployments as IDataObject[] | undefined) ?? [];

	const results: INodeListSearchItems[] = rows
		.map((row): INodeListSearchItems => {
			const deployment = (row.deployment as IDataObject | undefined) ?? {};
			const deploymentId = (deployment.id as IDataObject | undefined) ?? {};
			const dseq = deploymentId.dseq != null ? String(deploymentId.dseq) : '';
			return { name: dseq ? `dseq ${dseq}` : '(unknown dseq)', value: dseq };
		})
		.filter((item) => item.value !== '')
		.filter((item) => matchesFilter(item, filter));

	return { results };
}
