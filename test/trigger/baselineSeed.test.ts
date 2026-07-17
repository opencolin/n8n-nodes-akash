import type { IPollFunctions, INodeExecutionData } from 'n8n-workflow';

import { AkashTrigger } from '../../nodes/AkashTrigger/AkashTrigger.node';

/**
 * Baseline-seed-on-activation semantics for the `gpuPriceThreshold` event.
 *
 * Activating the trigger over an already-populated, already-"hot" marketplace (a price ALREADY
 * above the bound) must NOT flood the first poll: the first poll records current state silently and
 * only genuine post-activation transitions fire thereafter. Console-only event → no CoinGecko
 * dependency.
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

/** A `/v1/gpu-prices` body with a single `h200` model whose every price stat equals `avg`. */
function gpuPricesBody(avg: number) {
	return {
		availability: { total: 60, available: 12 },
		models: [
			{
				vendor: 'nvidia',
				model: 'h200',
				ram: '141Gi',
				interface: 'sxm',
				availability: { total: 20, available: 4 },
				providerAvailability: { total: 4, available: 1 },
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

describe('AkashTrigger · gpuPriceThreshold · baseline seed', () => {
	const params = {
		event: 'gpuPriceThreshold',
		gpuModel: 'h200',
		priceStat: 'avg',
		threshold: 2.5,
		direction: 'above',
	};

	it('does not flood the first poll when the surface is already above the bound', async () => {
		const staticData: Record<string, unknown> = {};
		const httpRequest = jest.fn();
		const ctx = makePollFunctions({ params, staticData, httpRequest });
		const trigger = new AkashTrigger();

		// Activation poll: price ALREADY above the bound → still null (baseline seed, no flood).
		httpRequest.mockResolvedValueOnce(gpuPricesBody(5.0));
		const activation = await trigger.poll.call(ctx);
		expect(activation).toBeNull();
		expect(emittedCount(activation)).toBe(0);

		// State was seeded: the seed flag is set and the already-satisfied state is recorded.
		expect(staticData.gpuPriceSeeded).toBe(true);
		expect(staticData.gpuPrice).toEqual({ h200: { satisfied: true } });

		// A following poll at the same already-above price → still null (no delayed flood).
		httpRequest.mockResolvedValueOnce(gpuPricesBody(5.0));
		expect(await trigger.poll.call(ctx)).toBeNull();

		expect(httpRequest).toHaveBeenCalledTimes(2);
	});
});
