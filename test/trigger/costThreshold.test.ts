import type { IPollFunctions, INodeExecutionData } from 'n8n-workflow';

import { AkashTrigger } from '../../nodes/AkashTrigger/AkashTrigger.node';

/**
 * Threshold-cross / dedupe / baseline-seed / credential-guard semantics for the AUTHED
 * `costThreshold` event.
 *
 * Drives the REAL `poll()` black-box against a mocked `IPollFunctions`. Unlike the keyless events,
 * this one reads the managed-account Console API via `helpers.httpRequestWithAuthentication` (the
 * `x-api-key` path) and asserts a credential is attached first, so the mock supplies both
 * `getCredentials` and `httpRequestWithAuthentication`. Every mocked read is a GET — nothing here
 * signs or spends. A single persistent `staticData` object threads the dedupe cursor across polls.
 */

/** Build a mock authed `IPollFunctions` returning queued bodies from `httpRequestWithAuthentication`. */
function makePollFunctions(opts: {
	params: Record<string, unknown>;
	staticData: Record<string, unknown>;
	httpRequest: jest.Mock;
	credentials?: jest.Mock;
	mode?: 'trigger' | 'manual';
}): IPollFunctions {
	return {
		getMode: () => opts.mode ?? 'trigger',
		getNode: () => ({ name: 'Akash Trigger', type: 'akashTrigger' }),
		getWorkflowStaticData: () => opts.staticData,
		getNodeParameter: (name: string, fallback?: unknown) =>
			name in opts.params ? opts.params[name] : fallback,
		getCredentials: opts.credentials ?? jest.fn().mockResolvedValue({ apiKey: 'test-key' }),
		helpers: { httpRequestWithAuthentication: opts.httpRequest },
		logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
	} as unknown as IPollFunctions;
}

/** A `/v1/balances` body (real `{ data: … }` envelope) with the given USD credit balance. */
function balancesBody(balance: number) {
	return { data: { balance, deployments: 0, total: balance } };
}

/** A `/v1/weekly-cost` body with the given daily-spend figure. */
function weeklyCostBody(dailySpend: number) {
	return { data: { dailySpend, weeklyCost: dailySpend * 7 } };
}

/** Number of items a poll result emitted (0 for a `null` result). */
function emittedCount(result: INodeExecutionData[][] | null): number {
	return result === null ? 0 : result[0].length;
}

describe('AkashTrigger · costThreshold · creditsLow (direction below)', () => {
	const params = {
		event: 'costThreshold',
		costMetric: 'creditsLow',
		threshold: 10,
		direction: 'below',
	};

	it('emits only on the not-satisfied → satisfied transition, dedupes, then re-arms', async () => {
		const staticData: Record<string, unknown> = {};
		const httpRequest = jest.fn();
		const ctx = makePollFunctions({ params, staticData, httpRequest });
		const trigger = new AkashTrigger();

		// 1. Seed poll — credit above the bound (not satisfied for "below") → silent seed.
		httpRequest.mockResolvedValueOnce(balancesBody(50));
		expect(emittedCount(await trigger.poll.call(ctx))).toBe(0);
		expect(staticData.costThresholdSeeded).toBe(true);

		// 2. Still above → null.
		httpRequest.mockResolvedValueOnce(balancesBody(20));
		expect(await trigger.poll.call(ctx)).toBeNull();

		// 3. Drops to/under the bound → satisfied → emits exactly once, carrying the current value.
		httpRequest.mockResolvedValueOnce(balancesBody(5));
		const crossed = await trigger.poll.call(ctx);
		expect(emittedCount(crossed)).toBe(1);
		expect(crossed![0][0].json).toMatchObject({
			event: 'costThreshold',
			costMetric: 'creditsLow',
			value: 5,
			threshold: 10,
			direction: 'below',
			satisfied: true,
		});

		// 4. Still below → null (dedupe).
		httpRequest.mockResolvedValueOnce(balancesBody(3));
		expect(await trigger.poll.call(ctx)).toBeNull();

		// 5. Recovers above → null, key re-arms.
		httpRequest.mockResolvedValueOnce(balancesBody(40));
		expect(await trigger.poll.call(ctx)).toBeNull();

		// 6. Drops below again → emits again (genuine re-cross).
		httpRequest.mockResolvedValueOnce(balancesBody(8));
		expect(emittedCount(await trigger.poll.call(ctx))).toBe(1);

		// One authed GET per poll, six polls total.
		expect(httpRequest).toHaveBeenCalledTimes(6);
		// It was called through the akashApi credential, GET only.
		const [credName, options] = httpRequest.mock.calls[0];
		expect(credName).toBe('akashApi');
		expect(options).toMatchObject({ method: 'GET', url: 'https://console-api.akash.network/v1/balances' });
	});

	it('manual run returns the current snapshot without mutating state', async () => {
		const staticData: Record<string, unknown> = {};
		const httpRequest = jest.fn().mockResolvedValueOnce(balancesBody(4));
		const ctx = makePollFunctions({ params, staticData, httpRequest, mode: 'manual' });
		const trigger = new AkashTrigger();

		const result = await trigger.poll.call(ctx);
		expect(emittedCount(result)).toBe(1);
		expect(result![0][0].json).toMatchObject({ value: 4, satisfied: true });
		expect(staticData.costThresholdSeeded).toBeUndefined();
		expect(staticData.costThreshold).toBeUndefined();
	});
});

describe('AkashTrigger · costThreshold · dailySpendSpike (direction above)', () => {
	const params = {
		event: 'costThreshold',
		costMetric: 'dailySpendSpike',
		threshold: 25,
		direction: 'above',
	};

	it('reads /v1/weekly-cost and fires when recent spend crosses above the bound', async () => {
		const staticData: Record<string, unknown> = {};
		const httpRequest = jest.fn();
		const ctx = makePollFunctions({ params, staticData, httpRequest });
		const trigger = new AkashTrigger();

		// Seed below the bound → silent seed.
		httpRequest.mockResolvedValueOnce(weeklyCostBody(10));
		expect(await trigger.poll.call(ctx)).toBeNull();

		// Spend spikes above the bound → emits once.
		httpRequest.mockResolvedValueOnce(weeklyCostBody(40));
		const crossed = await trigger.poll.call(ctx);
		expect(emittedCount(crossed)).toBe(1);
		expect(crossed![0][0].json).toMatchObject({
			costMetric: 'dailySpendSpike',
			value: 40,
			direction: 'above',
		});

		// The daily-spend read targets /v1/weekly-cost.
		expect(httpRequest.mock.calls[0][1]).toMatchObject({
			url: 'https://console-api.akash.network/v1/weekly-cost',
		});
	});
});

describe('AkashTrigger · costThreshold · credential guard', () => {
	it('throws an actionable error when no akashApi credential is attached', async () => {
		const staticData: Record<string, unknown> = {};
		const httpRequest = jest.fn();
		const credentials = jest.fn().mockRejectedValue(new Error('no credential'));
		const ctx = makePollFunctions({
			params: { event: 'costThreshold', costMetric: 'creditsLow', threshold: 10, direction: 'below' },
			staticData,
			httpRequest,
			credentials,
		});
		const trigger = new AkashTrigger();

		await expect(trigger.poll.call(ctx)).rejects.toThrow(/requires an Akash API key/i);
		// The guard trips before any HTTP read is attempted.
		expect(httpRequest).not.toHaveBeenCalled();
	});
});
