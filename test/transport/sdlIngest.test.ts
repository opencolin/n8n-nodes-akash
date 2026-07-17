import type { IExecuteFunctions } from 'n8n-workflow';

import { lintSdlShape, resolveSdl } from '../../nodes/Akash/transport/sdl';

// A well-formed SDL (space-indented YAML — kept at column 0 so no editor tabs leak into the text).
const WELL_FORMED_SDL = `version: "2.0"
services:
  web:
    image: nginx
    expose:
      - port: 80
        as: 80
        to:
          - global: true
profiles:
  compute:
    web:
      resources:
        cpu:
          units: 1
        memory:
          size: 512Mi
        gpu:
          units: 1
          attributes:
            vendor:
              nvidia:
                - model: a100
                  interface: sxm
        storage:
          - size: 512Mi
          - name: data
            size: 1Gi
            attributes:
              persistent: true
              class: beta2
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

// Deliberately malformed: missing profiles/deployment sections, invalid GPU interface, three
// storage volumes, and a persistent `ram` volume.
const MALFORMED_SDL = `services:
  web:
    image: nginx
    resources:
      gpu:
        attributes:
          vendor:
            nvidia:
              - model: a100
                interface: nvlink
      storage:
        - size: 1Gi
        - name: cache
          size: 1Gi
          attributes:
            persistent: true
            class: ram
        - name: extra
          size: 1Gi
`;

/**
 * Fake `this` exposing `getNodeParameter(name, itemIndex, fallback)` and a mocked
 * `helpers.getBinaryDataBuffer`.
 */
function makeFakeThis(params: Record<string, unknown>, binaryBuffer?: Buffer): IExecuteFunctions {
	return {
		getNodeParameter: (name: string, _itemIndex: number, fallback?: unknown) =>
			name in params ? params[name] : fallback,
		helpers: {
			getBinaryDataBuffer: jest.fn().mockResolvedValue(binaryBuffer ?? Buffer.alloc(0)),
		},
	} as unknown as IExecuteFunctions;
}

describe('resolveSdl', () => {
	it('returns the raw expression string verbatim for sdlSource="string"', async () => {
		const ctx = makeFakeThis({ sdlSource: 'string', sdl: WELL_FORMED_SDL });
		await expect(resolveSdl.call(ctx, 0)).resolves.toBe(WELL_FORMED_SDL);
	});

	it('decodes the binary property buffer to the same UTF-8 text for sdlSource="binary"', async () => {
		const ctx = makeFakeThis(
			{ sdlSource: 'binary', sdlBinaryProperty: 'data' },
			Buffer.from(WELL_FORMED_SDL, 'utf8'),
		);

		await expect(resolveSdl.call(ctx, 0)).resolves.toBe(WELL_FORMED_SDL);

		// Called as getBinaryDataBuffer(itemIndex, binaryPropertyName).
		expect(ctx.helpers.getBinaryDataBuffer).toHaveBeenCalledWith(0, 'data');
	});

	it('defaults the binary property name to "data"', async () => {
		const ctx = makeFakeThis({ sdlSource: 'binary' }, Buffer.from('version: "2.0"', 'utf8'));

		await resolveSdl.call(ctx, 0);
		expect(ctx.helpers.getBinaryDataBuffer).toHaveBeenCalledWith(0, 'data');
	});
});

describe('lintSdlShape', () => {
	it('passes a well-formed SDL with no warnings', () => {
		expect(lintSdlShape(WELL_FORMED_SDL).warnings).toEqual([]);
	});

	it('flags an obviously malformed SDL', () => {
		const { warnings } = lintSdlShape(MALFORMED_SDL);
		const joined = warnings.join(' | ');

		expect(warnings.length).toBeGreaterThan(0);
		expect(joined).toContain('profiles');
		expect(joined).toContain('deployment');
		expect(joined.toLowerCase()).toContain('interface');
		expect(joined).toContain('ram');
		expect(joined).toMatch(/volumes/);
	});

	it('never throws and reports empty input', () => {
		expect(() => lintSdlShape('')).not.toThrow();
		expect(lintSdlShape('').warnings).toEqual(['SDL is empty.']);
	});
});
