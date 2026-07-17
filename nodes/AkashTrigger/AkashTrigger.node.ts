import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import { coingeckoRequest, type AktMarketData } from '../Akash/transport/coingeckoRequest';

/** Console API base URL for the keyless public reads this trigger polls. */
const CONSOLE_BASE_URL = 'https://console-api.akash.network';

/**
 * Self-contained keyless Console read for the Trigger node.
 *
 * `nodes/Akash/transport/consoleApiRequest` is typed `this: IExecuteFunctions`, but the poll
 * framework runs under {@link IPollFunctions} (and the dropdown loader under
 * {@link ILoadOptionsFunctions}), so this node owns a small, private copy of the request shape
 * rather than widening or importing that helper — the same pattern `TenkiTrigger` uses. Every
 * event this trigger watches is a **keyless public read** (GPU prices, GPU inventory, network
 * capacity), so we always send a plain `httpRequest` with **no** `x-api-key` header: pure read,
 * no key, no spend, agent-safe.
 *
 * The outer `{ data: … }` envelope is stripped defensively (the same rule as
 * `consoleApiRequest.unwrapData`): public GPU/network reads return their object directly, but an
 * authed-style `{ data: … }` wrapper — should one ever appear — is unwrapped so callers see the
 * payload uniformly.
 *
 * @param ctx  The active poll or load-options context (supplies the HTTP helper + node ref).
 * @param path The Console path beginning with `/` (e.g. `/v1/gpu-prices`).
 * @param qs   Optional query-string object.
 * @returns The parsed response body, with the outer `{ data: … }` envelope stripped when present.
 * @throws A {@link NodeApiError} (never a raw HTTP error).
 */
async function akashPublicGet(
	ctx: IPollFunctions | ILoadOptionsFunctions,
	path: string,
	qs?: IDataObject,
): Promise<IDataObject> {
	try {
		const response = await ctx.helpers.httpRequest({
			method: 'GET',
			url: CONSOLE_BASE_URL + path,
			qs,
			json: true,
		});
		return unwrapData(response);
	} catch (error) {
		throw new NodeApiError(ctx.getNode(), error as JsonObject);
	}
}

/**
 * Conditionally strip the outer `{ data: … }` envelope. Only a non-null, non-array object that
 * owns a `data` property is unwrapped; arrays and plain objects without `data` are returned
 * verbatim (mirrors `consoleApiRequest.unwrapData`).
 */
function unwrapData(response: unknown): IDataObject {
	if (
		typeof response === 'object' &&
		response !== null &&
		!Array.isArray(response) &&
		Object.prototype.hasOwnProperty.call(response, 'data')
	) {
		return (response as IDataObject).data as IDataObject;
	}
	return (response ?? {}) as IDataObject;
}

/** Read a string field off an object, tolerating a missing/non-string value. */
function readString(source: IDataObject, key: string): string {
	const value = source[key];
	return typeof value === 'string' ? value : '';
}

/** Read a finite number field off an object, returning `undefined` when absent/non-numeric. */
function readNumber(source: IDataObject, key: string): number | undefined {
	const value = source[key];
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Stringify a scalar for use in a stable static-data key; non-scalars collapse to `''`. */
function scalarKey(value: unknown): string {
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	return '';
}

/** One flattened GPU inventory SKU from `/v1/gpu` (`allocatable - allocated` free units). */
interface GpuSku {
	key: string;
	vendor: string;
	model: string;
	interface: string;
	ram: string;
	allocatable: number;
	allocated: number;
	available: number;
}

/**
 * Flatten the `/v1/gpu` inventory tree into one SKU per (vendor, model, interface, ram).
 *
 * Live shape: `{ gpus: { total{allocatable,allocated}, details: { <vendor>: [ { model, ram,
 * interface, allocatable, allocated } ] } } }`. Free units for a SKU are `allocatable - allocated`;
 * a stable composite `key` distinguishes SKUs that share a model name but differ by interface/ram
 * (e.g. `h100` pcie vs sxm).
 */
function flattenGpuInventory(response: IDataObject): GpuSku[] {
	const gpus = (response.gpus as IDataObject) ?? {};
	const details = (gpus.details as IDataObject) ?? {};
	const out: GpuSku[] = [];

	for (const vendor of Object.keys(details)) {
		const entries = details[vendor];
		if (!Array.isArray(entries)) {
			continue;
		}
		for (const raw of entries as IDataObject[]) {
			const model = readString(raw, 'model');
			const iface = readString(raw, 'interface');
			const ram = scalarKey(raw.ram);
			const allocatable = readNumber(raw, 'allocatable') ?? 0;
			const allocated = readNumber(raw, 'allocated') ?? 0;
			out.push({
				key: `${vendor}/${model}/${iface}/${ram}`,
				vendor,
				model,
				interface: iface,
				ram,
				allocatable,
				allocated,
				available: allocatable - allocated,
			});
		}
	}

	return out;
}

/**
 * Read the free-unit count off a `/v1/network-capacity` resource block.
 *
 * A resource block is normally `{ active, pending, available, total }`. Live `storage` is instead
 * split into `ephemeral`/`persistent`/`total` sub-blocks; when there is no direct `available` we
 * fall back to the `total` sub-block's `available`.
 */
function readAvailable(block: IDataObject): number | undefined {
	const direct = readNumber(block, 'available');
	if (direct !== undefined) {
		return direct;
	}
	const total = block.total;
	if (typeof total === 'object' && total !== null && !Array.isArray(total)) {
		return readNumber(total as IDataObject, 'available');
	}
	return undefined;
}

/** True when `value` satisfies the threshold bound for the given direction. */
function crosses(value: number, threshold: number, direction: string): boolean {
	return direction === 'above' ? value >= threshold : value <= threshold;
}

/**
 * Akash Trigger — keyless, zero-spend, agent-safe polling trigger for the Akash marketplace.
 *
 * Starts a workflow when a GPU rental price crosses a bound, GPU units free up (or fill), network
 * capacity for a resource crosses a bound, or the AKT/USD spot price moves. Every event is a
 * **public read** — the node declares **no credential**: GPU price/inventory and network capacity
 * come from the Akash Console public API, and AKT price from CoinGecko (with a Console spot-price
 * fallback). Nothing here signs a transaction or spends funds.
 *
 * ## Threshold-cross / dedupe / baseline-seed semantics
 *
 * The node uses the n8n `poll` framework with per-event state persisted in
 * `getWorkflowStaticData('node')`:
 *
 * - **Threshold events** (`gpuPriceThreshold`, `capacityAvailable`, `aktPriceThreshold`) store a
 *   last-seen `satisfied` boolean per key and emit **only** on the not-satisfied → satisfied
 *   transition. While the value stays satisfied nothing re-fires (dedupe); when it returns to
 *   not-satisfied the key re-arms so a later re-cross emits again.
 * - **`gpuAvailabilityChange`** stores the last free-unit count per GPU SKU and emits when the
 *   count differs from the stored value.
 * - **Baseline-seed on activation:** the FIRST poll after activation records current state WITHOUT
 *   emitting — even if a surface is already "hot" (price already above the bound) — so activating
 *   the trigger over a populated marketplace does not flood the workflow. Only genuine
 *   post-activation transitions fire.
 * - **Manual (test) runs** return the current computed sample without mutating any static data.
 *
 * Self-contained by design: it does not import the `IExecuteFunctions` Console transport helper
 * (it owns {@link akashPublicGet}), mirroring `TenkiTrigger`. The one shared dependency is
 * {@link coingeckoRequest}, the canonical AKT market-data helper.
 */
export class AkashTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Akash Trigger',
		name: 'akashTrigger',
		icon: 'file:akash.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{"On: " + $parameter["event"]}}',
		description:
			'Starts a workflow when an Akash GPU price, GPU availability, network capacity, or AKT price event occurs (via keyless polling)',
		defaults: {
			name: 'Akash Trigger',
		},
		polling: true,
		inputs: [],
		outputs: ['main'],
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				noDataExpression: true,
				default: 'gpuPriceThreshold',
				description: 'The Akash marketplace event to watch for on each polling interval',
				options: [
					{
						name: 'AKT Price Threshold',
						value: 'aktPriceThreshold',
						description: 'Fires when the AKT/USD spot price crosses your threshold',
					},
					{
						name: 'Capacity Available',
						value: 'capacityAvailable',
						description:
							'Fires when network-wide available capacity for a resource crosses your threshold',
					},
					{
						name: 'GPU Availability Change',
						value: 'gpuAvailabilityChange',
						description: 'Fires when the free-unit count for a GPU model changes',
					},
					{
						name: 'GPU Price Threshold',
						value: 'gpuPriceThreshold',
						description: 'Fires when a GPU model rental price crosses your threshold',
					},
				],
			},
			{
				displayName: 'GPU Model Name or ID',
				name: 'gpuModel',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getGpuModels',
				},
				default: '',
				description:
					'The GPU model to watch, or "Any Model" to watch every model on the marketplace. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: {
					show: {
						event: ['gpuPriceThreshold', 'gpuAvailabilityChange'],
					},
				},
			},
			{
				displayName: 'Price Statistic',
				name: 'priceStat',
				type: 'options',
				default: 'avg',
				description:
					'Which per-model price figure from the GPU price feed to compare against the threshold',
				options: [
					{
						name: 'Average',
						value: 'avg',
					},
					{
						name: 'Maximum',
						value: 'max',
					},
					{
						name: 'Minimum',
						value: 'min',
					},
					{
						name: 'Weighted Average',
						value: 'weightedAverage',
					},
				],
				displayOptions: {
					show: {
						event: ['gpuPriceThreshold'],
					},
				},
			},
			{
				displayName: 'Resource',
				name: 'capacityResource',
				type: 'options',
				default: 'gpu',
				description: 'Which network-capacity resource to watch for available units crossing a bound',
				options: [
					{
						name: 'CPU',
						value: 'cpu',
					},
					{
						name: 'GPU',
						value: 'gpu',
					},
					{
						name: 'Memory',
						value: 'memory',
					},
					{
						name: 'Storage',
						value: 'storage',
					},
				],
				displayOptions: {
					show: {
						event: ['capacityAvailable'],
					},
				},
			},
			{
				displayName: 'Threshold',
				name: 'threshold',
				type: 'number',
				default: 0,
				description:
					'The value the watched figure is compared against: USD per GPU-hour for GPU price, native resource units (CPU millicores, memory/storage bytes, GPU count) for capacity, or USD for AKT price',
				displayOptions: {
					show: {
						event: ['gpuPriceThreshold', 'capacityAvailable', 'aktPriceThreshold'],
					},
				},
			},
			{
				displayName: 'Direction',
				name: 'direction',
				type: 'options',
				default: 'above',
				description:
					'The crossing direction to fire on: "above" fires when the value is at or above the threshold, "below" when it is at or below',
				options: [
					{
						name: 'Above',
						value: 'above',
						description: 'Fire when the value is at or above the threshold',
					},
					{
						name: 'Below',
						value: 'below',
						description: 'Fire when the value is at or below the threshold',
					},
				],
				displayOptions: {
					show: {
						event: ['gpuPriceThreshold', 'capacityAvailable', 'aktPriceThreshold'],
					},
				},
			},
		],
	};

	methods = {
		loadOptions: {
			/**
			 * Populate the GPU Model dropdown from the live keyless price feed.
			 *
			 * Reads `/v1/gpu-prices`, maps each `models[].model` to an option (deduped), and prepends an
			 * "Any Model" entry (value `''`) so a user can watch every model at once. Self-contained: it
			 * does not import `nodes/Akash/methods`.
			 */
			async getGpuModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const response = await akashPublicGet(this, '/v1/gpu-prices');
				const models = (response.models as IDataObject[]) ?? [];
				const seen = new Set<string>();
				const options: INodePropertyOptions[] = [{ name: 'Any Model', value: '' }];

				for (const entry of models) {
					const model = readString(entry, 'model');
					if (!model || seen.has(model)) {
						continue;
					}
					seen.add(model);
					options.push({ name: model, value: model });
				}

				return options;
			},
		},
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const event = this.getNodeParameter('event', 'gpuPriceThreshold') as string;
		const staticData = this.getWorkflowStaticData('node');
		const isManual = this.getMode() === 'manual';

		let emitted: IDataObject[];

		if (event === 'gpuPriceThreshold') {
			emitted = await pollGpuPriceThreshold.call(this, staticData, isManual);
		} else if (event === 'gpuAvailabilityChange') {
			emitted = await pollGpuAvailabilityChange.call(this, staticData, isManual);
		} else if (event === 'capacityAvailable') {
			emitted = await pollCapacityAvailable.call(this, staticData, isManual);
		} else if (event === 'aktPriceThreshold') {
			emitted = await pollAktPriceThreshold.call(this, staticData, isManual);
		} else {
			throw new NodeOperationError(this.getNode(), `Unsupported event: ${event}`);
		}

		// Record the cursor timestamp for observability (skip in manual so a test run mutates
		// nothing); dedupe itself is driven by the per-event state maps the pollers persist.
		if (!isManual) {
			staticData.lastPoll = new Date().toISOString();
		}

		if (emitted.length === 0) {
			return null;
		}

		return [emitted.map((json) => ({ json }))];
	}
}

/**
 * Poll `/v1/gpu-prices` and emit when a model's chosen price statistic crosses the bound.
 *
 * Evaluates one model when a specific `gpuModel` is chosen, or every model when "Any Model" is
 * selected. Per model, the `priceStat` figure (min/avg/weightedAverage/max) is compared to the
 * threshold in the given direction; the last-seen `satisfied` boolean is stored under the model
 * name in `staticData.gpuPrice`. Emission is exactly the not-satisfied → satisfied transition,
 * after the baseline seed. Manual runs return the current per-model sample without mutating state.
 */
async function pollGpuPriceThreshold(
	this: IPollFunctions,
	staticData: IDataObject,
	isManual: boolean,
): Promise<IDataObject[]> {
	const gpuModel = (this.getNodeParameter('gpuModel', '') as string).trim();
	const priceStat = this.getNodeParameter('priceStat', 'avg') as string;
	const threshold = this.getNodeParameter('threshold', 0) as number;
	const direction = this.getNodeParameter('direction', 'above') as string;

	const response = await akashPublicGet(this, '/v1/gpu-prices');
	const models = (response.models as IDataObject[]) ?? [];
	const selected = gpuModel ? models.filter((m) => readString(m, 'model') === gpuModel) : models;

	const evaluations = selected.map((model) => {
		const modelKey = readString(model, 'model');
		const price = (model.price as IDataObject) ?? {};
		const value = readNumber(price, priceStat);
		const satisfied = value !== undefined && crosses(value, threshold, direction);
		return { modelKey, value, satisfied };
	});

	if (isManual) {
		return evaluations.map((evaluation) => ({
			event: 'gpuPriceThreshold',
			model: evaluation.modelKey,
			priceStat,
			price: evaluation.value ?? null,
			threshold,
			direction,
			satisfied: evaluation.satisfied,
		}));
	}

	const known = (staticData.gpuPrice as Record<string, { satisfied: boolean }>) ?? {};
	const seeded = staticData.gpuPriceSeeded === true;
	const next: Record<string, { satisfied: boolean }> = { ...known };
	const fresh: IDataObject[] = [];

	for (const evaluation of evaluations) {
		if (!evaluation.modelKey) {
			continue;
		}
		const previous = known[evaluation.modelKey];
		if (seeded && previous?.satisfied !== true && evaluation.satisfied === true) {
			fresh.push({
				event: 'gpuPriceThreshold',
				model: evaluation.modelKey,
				priceStat,
				price: evaluation.value ?? null,
				threshold,
				direction,
				crossedInto: direction,
			});
		}
		next[evaluation.modelKey] = { satisfied: evaluation.satisfied };
	}

	staticData.gpuPrice = next;
	staticData.gpuPriceSeeded = true;

	return fresh;
}

/**
 * Poll `/v1/gpu` and emit when a GPU SKU's free-unit count changes.
 *
 * Evaluates one model (all its SKUs) when a specific `gpuModel` is chosen, or every SKU when "Any
 * Model" is selected. The last-seen free count (`allocatable - allocated`) is stored per SKU in
 * `staticData.gpuAvailability`; emission is any change from the stored count, after the baseline
 * seed. Manual runs return the current per-SKU sample without mutating state.
 */
async function pollGpuAvailabilityChange(
	this: IPollFunctions,
	staticData: IDataObject,
	isManual: boolean,
): Promise<IDataObject[]> {
	const gpuModel = (this.getNodeParameter('gpuModel', '') as string).trim();

	const response = await akashPublicGet(this, '/v1/gpu');
	const skus = flattenGpuInventory(response);
	const selected = gpuModel ? skus.filter((sku) => sku.model === gpuModel) : skus;

	if (isManual) {
		return selected.map((sku) => ({
			event: 'gpuAvailabilityChange',
			vendor: sku.vendor,
			model: sku.model,
			interface: sku.interface,
			ram: sku.ram,
			available: sku.available,
			allocatable: sku.allocatable,
			allocated: sku.allocated,
		}));
	}

	const known = (staticData.gpuAvailability as Record<string, { available: number }>) ?? {};
	const seeded = staticData.gpuAvailabilitySeeded === true;
	const next: Record<string, { available: number }> = { ...known };
	const fresh: IDataObject[] = [];

	for (const sku of selected) {
		const previous = known[sku.key];
		if (seeded && (previous === undefined || previous.available !== sku.available)) {
			fresh.push({
				event: 'gpuAvailabilityChange',
				vendor: sku.vendor,
				model: sku.model,
				interface: sku.interface,
				ram: sku.ram,
				available: sku.available,
				previousAvailable: previous?.available ?? null,
				allocatable: sku.allocatable,
				allocated: sku.allocated,
			});
		}
		next[sku.key] = { available: sku.available };
	}

	staticData.gpuAvailability = next;
	staticData.gpuAvailabilitySeeded = true;

	return fresh;
}

/**
 * Poll `/v1/network-capacity` and emit when a resource's available units cross the bound.
 *
 * The chosen `capacityResource` (cpu/gpu/memory/storage) has its `available` figure compared to
 * the threshold in the given direction; the last-seen `satisfied` boolean is stored in
 * `staticData.capacity`. Emission is the not-satisfied → satisfied transition, after the baseline
 * seed. Manual runs return the current sample without mutating state.
 */
async function pollCapacityAvailable(
	this: IPollFunctions,
	staticData: IDataObject,
	isManual: boolean,
): Promise<IDataObject[]> {
	const capacityResource = this.getNodeParameter('capacityResource', 'gpu') as string;
	const threshold = this.getNodeParameter('threshold', 0) as number;
	const direction = this.getNodeParameter('direction', 'above') as string;

	const response = await akashPublicGet(this, '/v1/network-capacity');
	const resources = (response.resources as IDataObject) ?? {};
	const block = (resources[capacityResource] as IDataObject) ?? {};
	const available = readAvailable(block);
	const satisfied = available !== undefined && crosses(available, threshold, direction);

	const sample: IDataObject = {
		event: 'capacityAvailable',
		resource: capacityResource,
		available: available ?? null,
		threshold,
		direction,
		activeProviderCount: readNumber(response, 'activeProviderCount') ?? null,
		satisfied,
	};

	if (isManual) {
		return [sample];
	}

	const previous = staticData.capacity as { satisfied: boolean } | undefined;
	const seeded = staticData.capacitySeeded === true;
	const emit = seeded && previous?.satisfied !== true && satisfied === true;

	staticData.capacity = { satisfied };
	staticData.capacitySeeded = true;

	return emit ? [sample] : [];
}

/**
 * Poll AKT/USD via {@link coingeckoRequest} and emit when the spot price crosses the bound.
 *
 * The `.usd` spot price is compared to the threshold in the given direction; the last-seen
 * `satisfied` boolean is stored in `staticData.aktPrice`. Emission is the not-satisfied →
 * satisfied transition, after the baseline seed. When the CoinGecko free tier rate-limits, the
 * helper transparently falls back to the Console spot price (`source: 'console'`); in that case
 * market cap, volume and 24h change are unavailable, which we surface on the emitted item and via
 * a logged warning. Manual runs return the current sample without mutating state.
 */
async function pollAktPriceThreshold(
	this: IPollFunctions,
	staticData: IDataObject,
	isManual: boolean,
): Promise<IDataObject[]> {
	const threshold = this.getNodeParameter('threshold', 0) as number;
	const direction = this.getNodeParameter('direction', 'above') as string;

	const market: AktMarketData = await coingeckoRequest(this);
	const usd = market.usd;
	const satisfied = crosses(usd, threshold, direction);

	const sample: IDataObject = {
		event: 'aktPriceThreshold',
		usd,
		usdMarketCap: market.usdMarketCap ?? null,
		usd24hVol: market.usd24hVol ?? null,
		usd24hChange: market.usd24hChange ?? null,
		source: market.source,
		threshold,
		direction,
		satisfied,
	};

	// Console fallback returns the price only — flag that the richer fields are unavailable.
	if (market.source === 'console') {
		const warning =
			'AKT price served by the Console fallback (CoinGecko rate-limited): market cap, volume and 24h change are unavailable.';
		sample.warning = warning;
		this.logger.warn(`[AkashTrigger] ${warning}`);
	}

	if (isManual) {
		return [sample];
	}

	const previous = staticData.aktPrice as { satisfied: boolean } | undefined;
	const seeded = staticData.aktPriceSeeded === true;
	const emit = seeded && previous?.satisfied !== true && satisfied === true;

	staticData.aktPrice = { satisfied };
	staticData.aktPriceSeeded = true;

	return emit ? [sample] : [];
}
