import { NodeApiError } from 'n8n-workflow';
import type { IExecuteFunctions } from 'n8n-workflow';

import { CONSOLE_ERROR_MAP, normalizeAkashError } from '../../nodes/Akash/transport/errors';

/**
 * Minimal `this` stand-in: `normalizeAkashError` only ever touches `getNode()`.
 */
const fakeThis = {
	getNode: () => ({ name: 'Akash', type: 'akash' }),
} as unknown as IExecuteFunctions;

describe('normalizeAkashError', () => {
	it('returns a NodeApiError instance', () => {
		const err = { response: { body: { code: 'unauthorized', message: 'Invalid API key' } } };
		const result = normalizeAkashError.call(fakeThis, err);
		expect(result).toBeInstanceOf(NodeApiError);
	});

	// CRITICAL acceptance test: every documented Console code maps to its friendly message.
	// Iterating the map dynamically means codes added by later releases are auto-covered
	// without editing this test.
	describe('taxonomy mapping', () => {
		it.each(Object.keys(CONSOLE_ERROR_MAP))(
			'maps code "%s" to its friendly NodeApiError message',
			(code) => {
				const err = { response: { body: { code, message: 'raw server message' } } };
				const result = normalizeAkashError.call(fakeThis, err);
				expect(result.message).toBe(CONSOLE_ERROR_MAP[code]);
			},
		);
	});

	it('falls back to the server message for an unknown code', () => {
		const err = {
			response: { body: { code: 'some_unmapped_code', message: 'raw server message' } },
		};
		const result = normalizeAkashError.call(fakeThis, err);
		expect(result.message).toBe('raw server message');
	});

	it('passes an existing NodeApiError through unchanged', () => {
		const original = new NodeApiError(fakeThis.getNode(), { message: 'boom' });
		const result = normalizeAkashError.call(fakeThis, original);
		expect(result).toBe(original);
	});

	it('surfaces data[] field errors in the description for a validation_error envelope', () => {
		const err = {
			error: 'BadRequestError',
			code: 'validation_error',
			message: 'Validation error',
			data: [{ code: 'invalid_type', path: ['userId'], message: 'Required' }],
		};
		const result = normalizeAkashError.call(fakeThis, err);
		expect(result.message).toBe(CONSOLE_ERROR_MAP.validation_error);
		expect(result.description).toContain('userId: Required');
	});
});
