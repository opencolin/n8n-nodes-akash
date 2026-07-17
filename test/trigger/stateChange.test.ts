import type { IPollFunctions, INodeExecutionData } from 'n8n-workflow';

import { AkashTrigger } from '../../nodes/AkashTrigger/AkashTrigger.node';

/**
 * Transition + baseline-seed + Include-Closed semantics for the v0.3.0 state events
 * (`providerStatusChange`, `deploymentStateChange`, `leaseStateChange`).
 *
 * These events are all **keyless public reads**: `providerStatusChange` polls the Console
 * `/v1/providers` feed, and the two chain events poll the keyless Cosmos LCD info endpoints. The
 * mock `helpers.httpRequest` returns whatever body is queued regardless of URL, so each test drives
 * the poller through activation (silent seed) → transition (single emit) → hold (dedupe).
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

/** Number of items a poll result emitted (0 for a `null` result). */
function emittedCount(result: INodeExecutionData[][] | null): number {
	return result === null ? 0 : result[0].length;
}

/** The first emitted item's JSON (throws if nothing was emitted). */
function firstJson(result: INodeExecutionData[][] | null): Record<string, unknown> {
	if (result === null) {
		throw new Error('expected an emitted item but poll returned null');
	}
	return result[0][0].json as Record<string, unknown>;
}

/** A `/v1/providers` body with one provider whose online/audit/uptime state is parameterised. */
function providersBody(isOnline: boolean, isAudited = true, uptime1d = 99) {
	return {
		providers: [
			{
				owner: 'akash1prov',
				hostUri: 'https://provider.example:8443',
				isOnline,
				isAudited,
				uptime1d,
				uptime7d: uptime1d,
				uptime30d: uptime1d,
			},
		],
	};
}

/** A chain `deployments/info` body for a single deployment in `state`. */
function deploymentInfoBody(state: string) {
	return { deployment: { id: { owner: 'akash1own', dseq: '123' }, state } };
}

/** A chain `leases/info` body for a single lease in `state`. */
function leaseInfoBody(state: string) {
	return {
		lease: {
			id: { owner: 'akash1own', dseq: '123', gseq: 1, oseq: 1, provider: 'akash1prov' },
			state,
		},
	};
}

describe('AkashTrigger · providerStatusChange', () => {
	const params = { event: 'providerStatusChange' };

	it('seeds silently, emits once on the online → offline flip, then dedupes', async () => {
		const staticData: Record<string, unknown> = {};
		const httpRequest = jest.fn();
		const ctx = makePollFunctions({ params, staticData, httpRequest });
		const trigger = new AkashTrigger();

		// Activation poll: provider already online → silent seed.
		httpRequest.mockResolvedValueOnce(providersBody(true));
		expect(await trigger.poll.call(ctx)).toBeNull();
		expect(staticData.providerStatusSeeded).toBe(true);

		// Provider goes offline → one emit flagged `offline`.
		httpRequest.mockResolvedValueOnce(providersBody(false));
		const crossed = await trigger.poll.call(ctx);
		expect(emittedCount(crossed)).toBe(1);
		const json = firstJson(crossed);
		expect(json.address).toBe('akash1prov');
		expect(json.isOnline).toBe(false);
		expect(json.changes).toEqual(['offline']);

		// Still offline → deduped (no second online → offline flip).
		httpRequest.mockResolvedValueOnce(providersBody(false));
		expect(await trigger.poll.call(ctx)).toBeNull();
	});

	it('emits an audit-lost change when isAudited flips true → false', async () => {
		const staticData: Record<string, unknown> = {};
		const httpRequest = jest.fn();
		const ctx = makePollFunctions({ params, staticData, httpRequest });
		const trigger = new AkashTrigger();

		httpRequest.mockResolvedValueOnce(providersBody(true, true));
		await trigger.poll.call(ctx);

		httpRequest.mockResolvedValueOnce(providersBody(true, false));
		const json = firstJson(await trigger.poll.call(ctx));
		expect(json.changes).toEqual(['audit-lost']);
		expect(json.isAudited).toBe(false);
	});

	it('manual run returns the current snapshot without mutating state', async () => {
		const staticData: Record<string, unknown> = {};
		const httpRequest = jest.fn().mockResolvedValueOnce(providersBody(true));
		const ctx = makePollFunctions({ params, staticData, httpRequest, mode: 'manual' });
		const trigger = new AkashTrigger();

		const result = await trigger.poll.call(ctx);
		expect(emittedCount(result)).toBe(1);
		expect(firstJson(result).address).toBe('akash1prov');
		expect(staticData.providerStatusSeeded).toBeUndefined();
		expect(staticData.providerStatus).toBeUndefined();
	});
});

describe('AkashTrigger · deploymentStateChange · includeClosed', () => {
	const base = {
		event: 'deploymentStateChange',
		network: 'mainnet',
		owner: 'akash1own',
		dseq: '123',
	};

	it('suppresses the active → closed transition when Include Closed is off', async () => {
		const staticData: Record<string, unknown> = {};
		const httpRequest = jest.fn();
		const ctx = makePollFunctions({
			params: { ...base, includeClosed: false },
			staticData,
			httpRequest,
		});
		const trigger = new AkashTrigger();

		httpRequest.mockResolvedValueOnce(deploymentInfoBody('active'));
		expect(await trigger.poll.call(ctx)).toBeNull();

		httpRequest.mockResolvedValueOnce(deploymentInfoBody('closed'));
		expect(await trigger.poll.call(ctx)).toBeNull();

		// State is still recorded so a later re-open would emit.
		expect(staticData.deploymentState).toEqual({ 'akash1own/123': { state: 'closed' } });
	});

	it('emits the active → closed transition when Include Closed is on', async () => {
		const staticData: Record<string, unknown> = {};
		const httpRequest = jest.fn();
		const ctx = makePollFunctions({
			params: { ...base, includeClosed: true },
			staticData,
			httpRequest,
		});
		const trigger = new AkashTrigger();

		httpRequest.mockResolvedValueOnce(deploymentInfoBody('active'));
		await trigger.poll.call(ctx);

		httpRequest.mockResolvedValueOnce(deploymentInfoBody('closed'));
		const json = firstJson(await trigger.poll.call(ctx));
		expect(json.state).toBe('closed');
		expect(json.previousState).toBe('active');
		expect(json.owner).toBe('akash1own');
		expect(json.dseq).toBe('123');
	});
});

describe('AkashTrigger · leaseStateChange', () => {
	const params = {
		event: 'leaseStateChange',
		network: 'mainnet',
		owner: 'akash1own',
		dseq: '123',
		gseq: '1',
		oseq: '1',
		provider: 'akash1prov',
		includeClosed: false,
	};

	it('emits a non-closed transition (active → insufficient_funds), then dedupes', async () => {
		const staticData: Record<string, unknown> = {};
		const httpRequest = jest.fn();
		const ctx = makePollFunctions({ params, staticData, httpRequest });
		const trigger = new AkashTrigger();

		httpRequest.mockResolvedValueOnce(leaseInfoBody('active'));
		expect(await trigger.poll.call(ctx)).toBeNull();

		httpRequest.mockResolvedValueOnce(leaseInfoBody('insufficient_funds'));
		const json = firstJson(await trigger.poll.call(ctx));
		expect(json.state).toBe('insufficient_funds');
		expect(json.previousState).toBe('active');
		expect(json.provider).toBe('akash1prov');

		httpRequest.mockResolvedValueOnce(leaseInfoBody('insufficient_funds'));
		expect(await trigger.poll.call(ctx)).toBeNull();
	});
});
