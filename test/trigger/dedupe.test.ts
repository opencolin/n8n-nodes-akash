import type { IPollFunctions, INodeExecutionData } from 'n8n-workflow';

import { AkashTrigger } from '../../nodes/AkashTrigger/AkashTrigger.node';

/**
 * Dedupe semantics for the `gpuPriceThreshold` event, verified against the static-data cursor.
 *
 * Once a threshold is crossed, holding the same above-threshold price across subsequent polls must
 * NOT re-emit: the stored `satisfied` boolean suppresses the repeat. This is the "emit only on
 * state change" guarantee. Console-only event → no CoinGecko dependency.
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

/** A `/v1/gpu-prices` body with a single `a100` model whose every price stat equals `avg`. */
function gpuPricesBody(avg: number) {
	return {
		availability: { total: 80, available: 20 },
		models: [
			{
				vendor: 'nvidia',
				model: 'a100',
				ram: '40Gi',
				interface: 'pcie',
				availability: { total: 30, available: 6 },
				providerAvailability: { total: 5, available: 2 },
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

describe('AkashTrigger · gpuPriceThreshold · dedupe', () => {
	const params = {
		event: 'gpuPriceThreshold',
		gpuModel: 'a100',
		priceStat: 'avg',
		threshold: 3.0,
		direction: 'above',
	};

	it('emits exactly once across two consecutive identical above-threshold polls', async () => {
		const staticData: Record<string, unknown> = {};
		const httpRequest = jest.fn();
		const ctx = makePollFunctions({ params, staticData, httpRequest });
		const trigger = new AkashTrigger();

		let totalEmitted = 0;

		// Seed below the bound → arms the key, no emit.
		httpRequest.mockResolvedValueOnce(gpuPricesBody(2.5));
		totalEmitted += emittedCount(await trigger.poll.call(ctx));

		// First above-threshold poll → the crossing emits once.
		httpRequest.mockResolvedValueOnce(gpuPricesBody(4.0));
		totalEmitted += emittedCount(await trigger.poll.call(ctx));

		// Second identical above-threshold poll → deduped by static data, no re-emit.
		httpRequest.mockResolvedValueOnce(gpuPricesBody(4.0));
		const second = await trigger.poll.call(ctx);
		totalEmitted += emittedCount(second);

		expect(second).toBeNull();
		expect(totalEmitted).toBe(1);

		// The satisfied state persisted in static data is what suppressed the repeat.
		expect(staticData.gpuPrice).toEqual({ a100: { satisfied: true } });
	});
});
