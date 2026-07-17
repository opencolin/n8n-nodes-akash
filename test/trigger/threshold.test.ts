import type { IPollFunctions, INodeExecutionData } from 'n8n-workflow';

import { AkashTrigger } from '../../nodes/AkashTrigger/AkashTrigger.node';

/**
 * Threshold-cross semantics for the `gpuPriceThreshold` event.
 *
 * Drives the REAL `poll()` black-box against a mocked `IPollFunctions`. The event is Console-only
 * (`/v1/gpu-prices`), so nothing here depends on the CoinGecko helper. A single persistent
 * `staticData` object threads the dedupe cursor across polls, exactly as n8n does at runtime.
 */

/** Build a mock `IPollFunctions` whose `helpers.httpRequest` returns the queued bodies. */
function makePollFunctions(opts: {
	params: Record<string, unknown>;
	staticData: Record<string, unknown>;
	httpRequest: jest.Mock;
	mode?: 'trigger' | 'manual';
}): IPollFunctions {
	return {
		getMode: () => opts.mode ?? 'trigger',
		getNode: () => ({ name: 'Akash Trigger', type: 'akashTrigger' }),
		getWorkflowStaticData: () => opts.staticData,
		getNodeParameter: (name: string, fallback?: unknown) =>
			name in opts.params ? opts.params[name] : fallback,
		helpers: { httpRequest: opts.httpRequest },
		logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
	} as unknown as IPollFunctions;
}

/** A `/v1/gpu-prices` body with a single `h100` model whose every price stat equals `avg`. */
function gpuPricesBody(avg: number) {
	return {
		availability: { total: 100, available: 40 },
		models: [
			{
				vendor: 'nvidia',
				model: 'h100',
				ram: '80Gi',
				interface: 'sxm',
				availability: { total: 50, available: 10 },
				providerAvailability: { total: 8, available: 3 },
				price: {
					currency: 'USD',
					min: avg,
					max: avg,
					avg,
					weightedAverage: avg,
					med: avg,
				},
			},
		],
	};
}

/** Number of items a poll result emitted (0 for a `null` result). */
function emittedCount(result: INodeExecutionData[][] | null): number {
	return result === null ? 0 : result[0].length;
}

describe('AkashTrigger · gpuPriceThreshold · threshold cross', () => {
	const params = {
		event: 'gpuPriceThreshold',
		gpuModel: 'h100',
		priceStat: 'avg',
		threshold: 2.5,
		direction: 'above',
	};

	it('emits only on the not-satisfied → satisfied transition, dedupes, then re-arms', async () => {
		const staticData: Record<string, unknown> = {};
		const httpRequest = jest.fn();
		const ctx = makePollFunctions({ params, staticData, httpRequest });
		const trigger = new AkashTrigger();

		// 1. Seed poll — price below the bound → no emit (baseline seed), cursor recorded.
		httpRequest.mockResolvedValueOnce(gpuPricesBody(2.0));
		expect(emittedCount(await trigger.poll.call(ctx))).toBe(0);
		expect(staticData.gpuPriceSeeded).toBe(true);

		// 2. Still below → null.
		httpRequest.mockResolvedValueOnce(gpuPricesBody(2.1));
		expect(await trigger.poll.call(ctx)).toBeNull();

		// 3. Crosses above → emits exactly once.
		httpRequest.mockResolvedValueOnce(gpuPricesBody(3.0));
		const crossed = await trigger.poll.call(ctx);
		expect(emittedCount(crossed)).toBe(1);
		expect(crossed![0][0].json).toMatchObject({
			event: 'gpuPriceThreshold',
			model: 'h100',
			priceStat: 'avg',
			price: 3.0,
			direction: 'above',
		});

		// 4. Still above → null (dedupe — the satisfied state is unchanged).
		httpRequest.mockResolvedValueOnce(gpuPricesBody(3.2));
		expect(await trigger.poll.call(ctx)).toBeNull();

		// 5. Falls back below → null, and the key re-arms (satisfied → false).
		httpRequest.mockResolvedValueOnce(gpuPricesBody(1.9));
		expect(await trigger.poll.call(ctx)).toBeNull();

		// 6. Crosses above again → emits again (genuine re-cross).
		httpRequest.mockResolvedValueOnce(gpuPricesBody(2.8));
		expect(emittedCount(await trigger.poll.call(ctx))).toBe(1);

		// One HTTP read per poll, six polls total.
		expect(httpRequest).toHaveBeenCalledTimes(6);
	});

	it('honors the "below" direction (fires when price drops to or under the bound)', async () => {
		const staticData: Record<string, unknown> = {};
		const httpRequest = jest.fn();
		const ctx = makePollFunctions({
			params: { ...params, direction: 'below', threshold: 2.0 },
			staticData,
			httpRequest,
		});
		const trigger = new AkashTrigger();

		// Seed above the bound (not satisfied for "below") → no emit.
		httpRequest.mockResolvedValueOnce(gpuPricesBody(3.0));
		expect(await trigger.poll.call(ctx)).toBeNull();

		// Drops to/under the bound → satisfied for "below" → emits once.
		httpRequest.mockResolvedValueOnce(gpuPricesBody(1.5));
		expect(emittedCount(await trigger.poll.call(ctx))).toBe(1);
	});
});
