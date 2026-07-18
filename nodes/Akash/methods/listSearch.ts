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
 *   - `searchDeployments`      ↔ managed-deployment `dseq` (Deployment → Get) — authed `/v1/deployments`
 *   - `searchTemplates`        ↔ template `templateId` (Template → Get) — KEYLESS `/v1/templates-list`,
 *     id-valued (the flattened `templates[].id` across every category)
 *
 * n8n calls these with an `ILoadOptionsFunctions` `this` — not the `IExecuteFunctions` that
 * `execute()` sees. That context still exposes the `getCredentials` / `helpers.httpRequest*` the
 * transports rely on, so `consoleApiRequest` (whose declared `this` is `IExecuteFunctions`) is
 * called through a cast, exactly as the sibling Tenki node does; no execute-only member is touched.
 * `chainRestRequest` already accepts `ILoadOptionsFunctions` directly.
 *
 * `searchProviders` and `searchChainDeployments` are KEYLESS public reads (Console `/v1/providers`,
 * chain LCD `deployments/list`) — no `x-api-key`, no spend. `searchDeployments` is an AUTHED,
 * NON-SPENDING `x-api-key` GET of the managed `/v1/deployments` list (a GET only — no lease, no
 * spend), so it returns useful results only when a credential is attached. The loadOptions context
 * carries no `network`/`chainBaseUrl` node params, so `searchChainDeployments` passes an explicit
 * mainnet `baseUrl` to force the host.
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

/**
 * Read a `dseq` off a managed-deployment list row, defensively. The Console `/v1/deployments`
 * envelope shape is live-UNVERIFIED without a key, so a row may expose `dseq` at the top level
 * (`{ dseq }`) OR nested chain-style (`{ deployment: { id: { dseq } } }`). Both are handled; a
 * non-scalar or absent `dseq` yields `''` (dropped by the caller).
 */
function readDeploymentDseq(row: IDataObject): string {
	const top = row.dseq;
	if (typeof top === 'string' || typeof top === 'number') {
		return String(top);
	}
	const deployment = (row.deployment as IDataObject | undefined) ?? {};
	const deploymentId = (deployment.id as IDataObject | undefined) ?? {};
	const nested = deploymentId.dseq;
	if (typeof nested === 'string' || typeof nested === 'number') {
		return String(nested);
	}
	return '';
}

/**
 * Managed-deployment dropdown — AUTHED `GET /v1/deployments` (`x-api-key`, NON-SPENDING, GET-only).
 * Maps each row to `{ name: 'dseq <n>', value: <dseq> }`, reading `dseq` defensively (top-level or
 * chain-style nested) via {@link readDeploymentDseq}; the `dseq` string is what `executeDeploymentGet`
 * reads back via `extractValue`. Empty values are dropped and the shared case-insensitive `filter`
 * is applied. Envelope shape is spec-VERIFIED (`docs/research/console-api.md`): the endpoint returns
 * `{ "data": { "deployments":[ … ] } }`, so after the `{data}` strip the page array lives under
 * `response.deployments`; anything else yields an empty result set rather than throwing.
 */
export async function searchDeployments(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const response = await consoleApiRequest.call(
		this as unknown as IExecuteFunctions,
		'GET',
		'/v1/deployments',
	);

	const rows: IDataObject[] = Array.isArray(response.deployments)
		? (response.deployments as IDataObject[])
		: [];

	const results: INodeListSearchItems[] = rows
		.map((row): INodeListSearchItems => {
			const dseq = readDeploymentDseq(row);
			return { name: dseq ? `dseq ${dseq}` : '(unknown dseq)', value: dseq };
		})
		.filter((item) => item.value !== '')
		.filter((item) => matchesFilter(item, filter));

	return { results };
}

/**
 * Template dropdown — KEYLESS `GET /v1/templates-list` (no `x-api-key`, no spend). After
 * `consoleApiRequest`'s `{data}` strip the endpoint resolves to an ARRAY of category objects
 * `[{ title, templates: [{ id, name, logoUrl, summary, tags }] }]` (live-probed 2026-07-17: 30
 * categories). Every category's `templates[]` is flattened and each template maps to
 * `{ name: name || id, value: id }`; the template `id` is what `executeTemplateGet` reads back via
 * `extractValue` and drops straight into `GET /v1/templates/{id}`, so `value` MUST be the id.
 * Empty ids are dropped and the shared case-insensitive `filter` is applied.
 */
export async function searchTemplates(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const response = await consoleApiRequest.call(
		this as unknown as IExecuteFunctions,
		'GET',
		'/v1/templates-list',
	);
	const categories: IDataObject[] = Array.isArray(response)
		? (response as unknown as IDataObject[])
		: [];
	const results: INodeListSearchItems[] = categories
		.flatMap((cat) => (Array.isArray(cat.templates) ? (cat.templates as IDataObject[]) : []))
		.map((tpl): INodeListSearchItems => {
			const id = typeof tpl.id === 'string' ? tpl.id : '';
			const name = typeof tpl.name === 'string' && tpl.name ? tpl.name : id;
			return { name: name || '(unknown template)', value: id };
		})
		.filter((item) => item.value !== '')
		.filter((item) => matchesFilter(item, filter))
		// The live catalog lists one template under two categories — dedupe by id.
		.filter((item, index, all) => all.findIndex((other) => other.value === item.value) === index);
	return { results };
}
