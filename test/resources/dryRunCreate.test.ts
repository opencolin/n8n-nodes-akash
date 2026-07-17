import type { IExecuteFunctions } from 'n8n-workflow';

// Mock the Console transport so we can prove the dry-run builder issues ZERO network calls — the
// financial boundary depends on no POST ever leaving this op while dryRun is true.
jest.mock('../../nodes/Akash/transport/consoleApiRequest', () => ({
	consoleApiRequest: jest.fn(),
}));

import { executeDeploymentCreate } from '../../nodes/Akash/resources/deployment/create';
import { consoleApiRequest } from '../../nodes/Akash/transport/consoleApiRequest';

const consoleMock = consoleApiRequest as unknown as jest.Mock;

// A minimal but well-formed SDL — enough for lintSdlShape to run; the request assertion keys off the
// exact string, not its contents.
const SAMPLE_SDL = `version: "2.0"
services:
  web:
    image: nginx
profiles:
  compute:
    web:
      resources:
        cpu:
          units: 1
        memory:
          size: 512Mi
        storage:
          - size: 512Mi
  placement:
    dcloud:
      pricing:
        web:
          denom: uakt
          amount: 1000
deployment:
  web:
    dcloud:
      profile: web
      count: 1
`;

/**
 * Fake `this` exposing `getNodeParameter(name, itemIndex, fallback)` and `getNode()`. `resolveSdl`
 * and `lintSdlShape` are NOT mocked (they run for real over the params below); only the transport is.
 */
function makeFakeThis(params: Record<string, unknown>): IExecuteFunctions {
	return {
		getNodeParameter: (name: string, _itemIndex: number, fallback?: unknown) =>
			name in params ? params[name] : fallback,
		getNode: () => ({}),
	} as unknown as IExecuteFunctions;
}

beforeEach(() => {
	consoleMock.mockReset();
});

describe('executeDeploymentCreate (dry-run request builder)', () => {
	it('builds the exact {data:{sdl,deposit}} body and issues NO POST when dryRun is true', async () => {
		const ctx = makeFakeThis({
			dryRun: true,
			sdlSource: 'string',
			sdl: SAMPLE_SDL,
			deposit: 5,
		});

		const result = await executeDeploymentCreate.call(ctx, 0);

		// (1) the request body is exactly the spec-verified write-path envelope.
		expect(result.request).toEqual({ data: { sdl: SAMPLE_SDL, deposit: 5 } });

		// Envelope/metadata the integrator surfaces alongside the request.
		expect(result.dryRun).toBe(true);
		expect(result.method).toBe('POST');
		expect(result.endpoint).toBe('/v1/deployments');

		// (3) advisory SDL warnings are always an array.
		expect(Array.isArray(result.warnings)).toBe(true);

		// (2) the financial boundary holds: not a single transport call was made.
		expect(consoleMock).toHaveBeenCalledTimes(0);
	});

	it('throws and still issues NO POST when dryRun is false (spend path disabled this release)', async () => {
		const ctx = makeFakeThis({
			dryRun: false,
			sdlSource: 'string',
			sdl: SAMPLE_SDL,
			deposit: 5,
		});

		await expect(executeDeploymentCreate.call(ctx, 0)).rejects.toThrow();
		expect(consoleMock).toHaveBeenCalledTimes(0);
	});
});
