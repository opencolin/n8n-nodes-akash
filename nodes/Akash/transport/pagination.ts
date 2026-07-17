import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { chainRestRequest } from './chainRestRequest';
import { consoleApiRequest } from './consoleApiRequest';

/** Page size used when walking every page (`returnAll`); the LCD caps effective page size anyway. */
const CHAIN_PAGE_SIZE = 100;

/** Page size used when walking every Console `skip`/`limit` page (`returnAll`). */
const CONSOLE_PAGE_SIZE = 100;

/**
 * Hard iteration cap so a runaway cursor cannot loop forever. The active-deployment set is in the
 * tens of thousands, so at {@link CHAIN_PAGE_SIZE} per page this ceiling (1000 pages ≈ 100k items)
 * bounds the walk well above any realistic result while still terminating on a misbehaving host.
 */
const MAX_PAGES = 1000;

/**
 * URL-encode a Cosmos pagination cursor (`next_key`) for use as a `pagination.key` query value.
 *
 * **VERIFIED gotcha** (`docs/research/chain-rest.md` §6): `next_key` is base64 and routinely
 * contains `+`, `/`, and `=`. If those are sent raw the gRPC-gateway mis-parses the query and the
 * page breaks. `encodeURIComponent` covers all three (`+`→`%2B`, `/`→`%2F`, `=`→`%3D`) — this is
 * exported so `test/transport/pagination.test.ts` can round-trip it and regression-lock the gotcha.
 *
 * @param key The raw `pagination.next_key` returned by the previous page.
 * @returns The percent-encoded cursor.
 */
export function encodeNextKey(key: string): string {
	return encodeURIComponent(key);
}

/** Read the page array under `itemsKey`, defaulting to an empty array when absent/mis-typed. */
function readPageArray(response: IDataObject, itemsKey: string): IDataObject[] {
	const value = response[itemsKey];
	return Array.isArray(value) ? (value as IDataObject[]) : [];
}

/**
 * Read `pagination.next_key` off an LCD response. Returns `undefined` when the footer is missing or
 * the key is `null`/non-string (both mean "no more pages"). `count_total` is deliberately never
 * consulted — it is unreliable/expensive on large sets (`docs/research/chain-rest.md` §6).
 */
function readNextKey(response: IDataObject): string | undefined {
	const pagination = response.pagination;
	if (typeof pagination !== 'object' || pagination === null || Array.isArray(pagination)) {
		return undefined;
	}
	const nextKey = (pagination as IDataObject).next_key;
	return typeof nextKey === 'string' ? nextKey : undefined;
}

/**
 * Cosmos cursor pagination for every chain `List*` operation, over {@link chainRestRequest}.
 *
 * Reads its OWN node params — `returnAll` (boolean) and, when false, `limit` (number) — from
 * `itemIndex`, mirroring the sibling Tenki `paginate` idiom. Callers pass only the endpoint, the
 * response key holding the page array, the base query (filters such as `filters.owner`), and the
 * item index.
 *
 * - **`returnAll: true`** — walks every page at `pagination.limit` = {@link CHAIN_PAGE_SIZE},
 *   threading the previous page's `pagination.next_key` as the next `pagination.key`
 *   **URL-encoded via {@link encodeNextKey}** (the VERIFIED gotcha). The first request omits
 *   `pagination.key`. The loop continues while `pagination.next_key` is a non-empty string,
 *   **ignores `count_total`**, and is capped at {@link MAX_PAGES} iterations.
 * - **`returnAll: false`** — a single page sized to `limit`, sliced to `limit` items.
 *
 * @param endpoint  The chain path (build via `chainPaths.*`).
 * @param itemsKey  Response key holding the page array (e.g. `deployments`, `leases`, `balances`).
 * @param baseQs    Filter/scope query fields forwarded verbatim on every page.
 * @param itemIndex The current input item index (used to read `returnAll`/`limit`).
 * @returns All collected items (or the first `limit` items when not returning all).
 */
export async function paginateChain(
	this: IExecuteFunctions,
	endpoint: string,
	itemsKey: string,
	baseQs: IDataObject,
	itemIndex: number,
): Promise<IDataObject[]> {
	const returnAll = this.getNodeParameter('returnAll', itemIndex, false) as boolean;

	if (!returnAll) {
		const limit = this.getNodeParameter('limit', itemIndex, 50) as number;
		const response = await chainRestRequest.call(this, endpoint, {
			qs: { ...baseQs, 'pagination.limit': limit },
			itemIndex,
		});
		return readPageArray(response, itemsKey).slice(0, limit);
	}

	const items: IDataObject[] = [];
	let cursor: string | undefined;

	for (let page = 0; page < MAX_PAGES; page++) {
		const qs: IDataObject = { ...baseQs, 'pagination.limit': CHAIN_PAGE_SIZE };
		// First request omits pagination.key; subsequent requests thread the URL-encoded cursor.
		if (cursor !== undefined && cursor !== '') {
			qs['pagination.key'] = encodeNextKey(cursor);
		}

		const response = await chainRestRequest.call(this, endpoint, { qs, itemIndex });
		items.push(...readPageArray(response, itemsKey));

		const nextKey = readNextKey(response);
		if (nextKey === undefined || nextKey === '') {
			break;
		}
		cursor = nextKey;
	}

	return items;
}

/** Read a Console page: `itemsKey: null` means the response body IS the array. */
function readConsolePage(response: IDataObject, itemsKey: string | null): IDataObject[] {
	if (itemsKey === null) {
		return Array.isArray(response) ? (response as unknown as IDataObject[]) : [];
	}
	const value = response[itemsKey];
	return Array.isArray(value) ? (value as IDataObject[]) : [];
}

/**
 * Console `skip`/`limit` pagination walker over the existing {@link consoleApiRequest}, for
 * `/v1/providers` and other Console list endpoints. Shares the same `returnAll`/`limit` node-param
 * convention as {@link paginateChain}.
 *
 * - **`returnAll: true`** — walks `skip += {@link CONSOLE_PAGE_SIZE}` until a short/empty page
 *   (fewer than a full page of items), capped at {@link MAX_PAGES} iterations.
 * - **`returnAll: false`** — a single page of `limit` (`skip: 0`), sliced to `limit`.
 *
 * @param endpoint  The Console path (e.g. `/v1/providers`).
 * @param itemsKey  Response key holding the page array, or `null` when the body itself is the array.
 * @param baseQs    Filter/scope query fields forwarded verbatim on every page.
 * @param itemIndex The current input item index (used to read `returnAll`/`limit`).
 * @returns All collected items (or the first `limit` items when not returning all).
 */
export async function paginateConsole(
	this: IExecuteFunctions,
	endpoint: string,
	itemsKey: string | null,
	baseQs: IDataObject,
	itemIndex: number,
): Promise<IDataObject[]> {
	const returnAll = this.getNodeParameter('returnAll', itemIndex, false) as boolean;

	if (!returnAll) {
		const limit = this.getNodeParameter('limit', itemIndex, 50) as number;
		const response = await consoleApiRequest.call(this, 'GET', endpoint, {
			qs: { ...baseQs, skip: 0, limit },
		});
		return readConsolePage(response, itemsKey).slice(0, limit);
	}

	const items: IDataObject[] = [];
	let skip = 0;

	for (let page = 0; page < MAX_PAGES; page++) {
		const response = await consoleApiRequest.call(this, 'GET', endpoint, {
			qs: { ...baseQs, skip, limit: CONSOLE_PAGE_SIZE },
		});
		const pageItems = readConsolePage(response, itemsKey);
		items.push(...pageItems);

		if (pageItems.length < CONSOLE_PAGE_SIZE) {
			break;
		}
		skip += CONSOLE_PAGE_SIZE;
	}

	return items;
}
