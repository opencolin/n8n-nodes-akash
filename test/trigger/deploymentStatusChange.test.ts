import type { IPollFunctions, INodeExecutionData } from 'n8n-workflow';

import { AkashTrigger } from '../../nodes/AkashTrigger/AkashTrigger.node';

/**
 * Status-transition / baseline-seed / status-derivation / credential-guard semantics for the AUTHED
 * `deploymentStatusChange` event.
 *
 * Drives the REAL `poll()` black-box against a mocked `IPollFunctions`. This event reads the managed
 * deployment detail via the authed `GET /v1/deployments/{dseq}` (`helpers.httpRequestWithAuthentication`,
 * the `x-api-key` path) and asserts a credential is attached first — the mock supplies both
 * `getCredentials` and `httpRequestWithAuthentication`. Every mocked read is a GET; nothing signs or
 * spends. A single persistent `staticData` object threads the dedupe cursor across polls.
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

/**
 * A `/v1/deployments/{dseq}` detail body (real `{ data: … }` envelope).
 *
 * `state` is the deployment state string, `leases` the accepted-lease array, and `escrow` an optional
 * escrow_account override (e.g. `{ state: 'overdrawn' }` or `{ balance: { amount: 0 } }`).
 */
function deploymentDetailBody(opts: {
	state: string;
	leases?: unknown[];
	escrow?: Record<string, unknown>;
}) {
	return {
		data: {
			deployment: { id: { owner: 'akash1own', dseq: '456' }, state: opts.state },
			leases: opts.leases ?? [],
			escrow_account: opts.escrow ?? { state: 'open', balance: { amount: 100 } },
		},
	};
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

describe('AkashTrigger · deploymentStatusChange · status transitions', () => {
	const params = { event: 'deploymentStatusChange', dseq: '456' };

	it('seeds silently, emits once on active → underfunded, then dedupes', async () => {
		const staticData: Record<string, unknown> = {};
		const httpRequest = jest.fn();
		const ctx = makePollFunctions({ params, staticData, httpRequest });
		const trigger = new AkashTrigger();

		// Activation poll: funded, one lease → status "active" → silent seed.
		httpRequest.mockResolvedValueOnce(deploymentDetailBody({ state: 'active', leases: [{ id: {} }] }));
		expect(await trigger.poll.call(ctx)).toBeNull();
		expect(staticData.deploymentStatusSeeded).toBe(true);
		expect(staticData.deploymentStatus).toEqual({ '456': { status: 'active' } });

		// Escrow overdrawn → status "underfunded" → one emit carrying the prior status.
		httpRequest.mockResolvedValueOnce(
			deploymentDetailBody({ state: 'active', leases: [{ id: {} }], escrow: { state: 'overdrawn' } }),
		);
		const crossed = await trigger.poll.call(ctx);
		expect(emittedCount(crossed)).toBe(1);
		const json = firstJson(crossed);
		expect(json).toMatchObject({
			event: 'deploymentStatusChange',
			dseq: '456',
			status: 'underfunded',
			previousStatus: 'active',
		});

		// Still underfunded → deduped.
		httpRequest.mockResolvedValueOnce(
			deploymentDetailBody({ state: 'active', leases: [{ id: {} }], escrow: { state: 'overdrawn' } }),
		);
		expect(await trigger.poll.call(ctx)).toBeNull();

		// The read went through the akashApi credential, GET only, to the dseq detail path.
		const [credName, options] = httpRequest.mock.calls[0];
		expect(credName).toBe('akashApi');
		expect(options).toMatchObject({
			method: 'GET',
			url: 'https://console-api.akash.network/v1/deployments/456',
		});
	});

	it('derives "no-active-bids" when a live deployment has no leases, and emits into "closed"', async () => {
		const staticData: Record<string, unknown> = {};
		const httpRequest = jest.fn();
		const ctx = makePollFunctions({ params, staticData, httpRequest });
		const trigger = new AkashTrigger();

		// Seed: active/open deployment with no leases → "no-active-bids".
		httpRequest.mockResolvedValueOnce(deploymentDetailBody({ state: 'active', leases: [] }));
		expect(await trigger.poll.call(ctx)).toBeNull();
		expect(staticData.deploymentStatus).toEqual({ '456': { status: 'no-active-bids' } });

		// A bid gets accepted (one lease) → "active" → emit.
		httpRequest.mockResolvedValueOnce(deploymentDetailBody({ state: 'active', leases: [{ id: {} }] }));
		expect(firstJson(await trigger.poll.call(ctx))).toMatchObject({
			status: 'active',
			previousStatus: 'no-active-bids',
		});

		// Teardown → "closed" is an alertable signal for this event (unlike the keyless chain event) → emit.
		httpRequest.mockResolvedValueOnce(deploymentDetailBody({ state: 'closed', leases: [{ id: {} }] }));
		expect(firstJson(await trigger.poll.call(ctx))).toMatchObject({
			status: 'closed',
			previousStatus: 'active',
		});
	});

	it('treats a non-positive escrow balance as underfunded', async () => {
		const staticData: Record<string, unknown> = {};
		const httpRequest = jest.fn();
		const ctx = makePollFunctions({ params, staticData, httpRequest });
		const trigger = new AkashTrigger();

		httpRequest.mockResolvedValueOnce(deploymentDetailBody({ state: 'active', leases: [{ id: {} }] }));
		await trigger.poll.call(ctx);

		httpRequest.mockResolvedValueOnce(
			deploymentDetailBody({
				state: 'active',
				leases: [{ id: {} }],
				escrow: { state: 'open', balance: { amount: 0 } },
			}),
		);
		expect(firstJson(await trigger.poll.call(ctx))).toMatchObject({ status: 'underfunded' });
	});

	it('manual run returns the current snapshot without mutating state', async () => {
		const staticData: Record<string, unknown> = {};
		const httpRequest = jest
			.fn()
			.mockResolvedValueOnce(deploymentDetailBody({ state: 'active', leases: [{ id: {} }] }));
		const ctx = makePollFunctions({ params, staticData, httpRequest, mode: 'manual' });
		const trigger = new AkashTrigger();

		const result = await trigger.poll.call(ctx);
		expect(emittedCount(result)).toBe(1);
		expect(firstJson(result)).toMatchObject({ dseq: '456', status: 'active' });
		expect(staticData.deploymentStatusSeeded).toBeUndefined();
		expect(staticData.deploymentStatus).toBeUndefined();
	});
});

describe('AkashTrigger · deploymentStatusChange · guards', () => {
	it('throws when the required DSEQ is missing', async () => {
		const staticData: Record<string, unknown> = {};
		const httpRequest = jest.fn();
		const ctx = makePollFunctions({
			params: { event: 'deploymentStatusChange', dseq: '' },
			staticData,
			httpRequest,
		});
		const trigger = new AkashTrigger();

		await expect(trigger.poll.call(ctx)).rejects.toThrow(/Deployment Sequence \(DSEQ\) is required/i);
		expect(httpRequest).not.toHaveBeenCalled();
	});

	it('throws an actionable error when no akashApi credential is attached', async () => {
		const staticData: Record<string, unknown> = {};
		const httpRequest = jest.fn();
		const credentials = jest.fn().mockRejectedValue(new Error('no credential'));
		const ctx = makePollFunctions({
			params: { event: 'deploymentStatusChange', dseq: '456' },
			staticData,
			httpRequest,
			credentials,
		});
		const trigger = new AkashTrigger();

		await expect(trigger.poll.call(ctx)).rejects.toThrow(/requires an Akash API key/i);
		expect(httpRequest).not.toHaveBeenCalled();
	});
});
