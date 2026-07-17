import type { IExecuteFunctions, IPollFunctions, JsonObject } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

/** CoinGecko free-tier spot endpoint — the canonical AKT/USD source (full mcap/volume/change). */
const COINGECKO_URL =
	'https://api.coingecko.com/api/v3/simple/price?ids=akash-network&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true';

/** CoinGecko id for the Akash Network token (VERIFIED live: `akash-network`). */
const COINGECKO_ID = 'akash-network';

/** Console API base used for the price-only fallback when the caller does not override it. */
const DEFAULT_CONSOLE_BASE_URL = 'https://console-api.akash.network';

/** Console spot-price fallback endpoint (`price` only; volume/mcap/change return 0). */
const CONSOLE_MARKET_DATA_ENDPOINT = '/v1/market-data';

/**
 * Normalised AKT/USD market data, in lowerCamelCase JSON fields.
 *
 * When served by the primary CoinGecko plane every field is populated; when served by the
 * Console `/v1/market-data` fallback only `usd` is meaningful and the three market-cap/volume/
 * change fields are left `undefined` (Console returns `0` for those — see the class doc-comment on
 * {@link coingeckoRequest}). Inspect `source` to decide whether the extended fields are trustworthy.
 */
export interface AktMarketData {
	usd: number;
	usdMarketCap?: number; // undefined when served by the Console fallback
	usd24hVol?: number; // undefined when served by the Console fallback
	usd24hChange?: number; // undefined when served by the Console fallback
	source: 'coingecko' | 'console';
}

/**
 * Fetch AKT/USD market data across **two keyless planes**, CoinGecko-primary with a Console fallback.
 *
 * Unlike the sibling {@link consoleApiRequest} (typed `this: IExecuteFunctions`), this helper takes
 * its context as an **explicit parameter** typed `IExecuteFunctions | IPollFunctions`. The
 * `AkashTrigger` poll node runs under {@link IPollFunctions} and so cannot borrow a `this`-bound
 * `IExecuteFunctions` helper; both context kinds expose `helpers.httpRequest` and `getNode()`, and
 * both planes here are keyless (no credential), so a single context-agnostic function serves the
 * poll trigger today and a future execute-context market resource without duplication.
 *
 * ## Two planes
 *
 *   1. **Primary — CoinGecko** `GET simple/price?ids=akash-network&vs_currencies=usd&…`
 *      (VERIFIED live). Response shape `{ 'akash-network': { usd, usd_market_cap, usd_24h_vol,
 *      usd_24h_change } }`. This is the **canonical** source: it is the only one of the two that
 *      returns market cap, 24h volume, and 24h change. The free tier is rate-limited to roughly
 *      5–15 req/min, so a busy poll can hit `429`.
 *   2. **Fallback — Console** `GET /v1/market-data` (keyless public read). Console returns
 *      `{ price, volume, marketCap, priceChange24h, … }` but **`price` is the only non-zero field**
 *      (research console-api.md / ecosystem.md: volume/mcap/change are permanently `0`). It is used
 *      **only** to recover a spot price when CoinGecko is unavailable.
 *
 * ## Fallback rationale & the `console` source flag
 *
 * On **any** thrown CoinGecko error (429 rate-limit, network failure, non-2xx) OR a malformed body
 * missing `akash-network.usd`, the call falls through to the Console endpoint and returns
 * `{ usd, source: 'console' }` with `usdMarketCap` / `usd24hVol` / `usd24hChange` deliberately
 * **left `undefined`** — surfacing Console's zeroes would be misleading. The caller inspects
 * `source === 'console'` to warn that mcap/volume/24h-change are unavailable; emitting that warning
 * is the trigger's responsibility, not this helper's. If **both** planes fail, a single normalised
 * {@link NodeApiError} is thrown (never a raw HTTP error), mirroring the `TenkiTrigger` pattern.
 *
 * @param ctx     The active execute or poll context (supplies `helpers.httpRequest` + `getNode()`).
 * @param options Optional `consoleBaseUrl` overriding the Console fallback base URL.
 * @returns Normalised {@link AktMarketData}; `source` records which plane served it.
 * @throws A normalised {@link NodeApiError} when CoinGecko **and** the Console fallback both fail.
 */
export async function coingeckoRequest(
	ctx: IExecuteFunctions | IPollFunctions,
	options?: { consoleBaseUrl?: string },
): Promise<AktMarketData> {
	// 1. PRIMARY — CoinGecko simple/price (canonical: full mcap/volume/24h-change).
	try {
		const response = await ctx.helpers.httpRequest({
			method: 'GET',
			url: COINGECKO_URL,
			json: true,
		});
		const marketData = parseCoinGecko(response);
		if (marketData !== undefined) {
			return marketData;
		}
		// Body present but missing `akash-network.usd` → treat as failure, fall through.
	} catch {
		// Any thrown error (429 rate-limit, network, non-2xx) → fall through to the fallback.
	}

	// 2. FALLBACK — Console GET /v1/market-data (price-only; extended fields stay undefined).
	const baseUrl = (options?.consoleBaseUrl ?? DEFAULT_CONSOLE_BASE_URL).replace(/\/+$/, '');
	try {
		const response = await ctx.helpers.httpRequest({
			method: 'GET',
			url: baseUrl + CONSOLE_MARKET_DATA_ENDPOINT,
			json: true,
		});
		const price = parseConsolePrice(response);
		if (price === undefined) {
			// Malformed fallback body → both planes have effectively failed.
			throw new Error('Console /v1/market-data did not return a numeric `price` field.');
		}
		return { usd: price, source: 'console' };
	} catch (error) {
		// 3. BOTH PLANES FAILED — throw one normalised NodeApiError, never a raw HTTP throw.
		throw new NodeApiError(ctx.getNode(), error as JsonObject, {
			message: 'Could not fetch AKT/USD from CoinGecko or the Console /v1/market-data fallback.',
		});
	}
}

/**
 * Map a CoinGecko `simple/price` body onto {@link AktMarketData}. Returns `undefined` (a signal to
 * fall through to the Console fallback) when the body is not an object, lacks the `akash-network`
 * entry, or that entry has no finite `usd`. The extended fields are copied only when finite.
 */
function parseCoinGecko(response: unknown): AktMarketData | undefined {
	if (typeof response !== 'object' || response === null) {
		return undefined;
	}
	const entry = (response as Record<string, unknown>)[COINGECKO_ID];
	if (typeof entry !== 'object' || entry === null) {
		return undefined;
	}
	const record = entry as Record<string, unknown>;
	if (!isFiniteNumber(record.usd)) {
		return undefined;
	}
	const marketData: AktMarketData = { usd: record.usd, source: 'coingecko' };
	if (isFiniteNumber(record.usd_market_cap)) {
		marketData.usdMarketCap = record.usd_market_cap;
	}
	if (isFiniteNumber(record.usd_24h_vol)) {
		marketData.usd24hVol = record.usd_24h_vol;
	}
	if (isFiniteNumber(record.usd_24h_change)) {
		marketData.usd24hChange = record.usd_24h_change;
	}
	return marketData;
}

/**
 * Read the spot `price` off a Console `/v1/market-data` body, defensively stripping an optional
 * `{ data: … }` envelope first (mirrors `unwrapData` in {@link consoleApiRequest}). Returns
 * `undefined` when no finite `price` is present.
 */
function parseConsolePrice(response: unknown): number | undefined {
	const body = unwrapData(response);
	if (typeof body !== 'object' || body === null) {
		return undefined;
	}
	const price = (body as Record<string, unknown>).price;
	return isFiniteNumber(price) ? price : undefined;
}

/**
 * Conditionally strip the outer `{ data: … }` envelope. Only a non-null, non-array object that owns
 * a `data` property is unwrapped; arrays and plain objects without `data` are returned verbatim.
 * Mirrors the identically-named helper in {@link consoleApiRequest} so both readers agree.
 */
function unwrapData(response: unknown): unknown {
	if (
		typeof response === 'object' &&
		response !== null &&
		!Array.isArray(response) &&
		Object.prototype.hasOwnProperty.call(response, 'data')
	) {
		return (response as { data: unknown }).data;
	}
	return response;
}

/** Narrow an unknown value to a finite `number` (rejects `NaN`, `Infinity`, and non-numbers). */
function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}
