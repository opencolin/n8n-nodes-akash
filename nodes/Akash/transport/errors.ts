import type { IExecuteFunctions, JsonObject } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

/**
 * Friendly, user-facing messages keyed by the **lowercased** Console error code.
 *
 * The Akash Console API (the primary plane) fails with a canonical JSON envelope
 * `{ error, message, code, type, data? }`, where `code` is a stable machine token
 * (`unauthorized`, `validation_error`, `not_found`, …) and `data` (when present) is an
 * array of field errors `{ code, path, message }`. Codes are normalised to lowercase and
 * looked up here. This map is intentionally extensible: later releases append entries.
 *
 * Following the sibling Tenki convention, each taxonomy name is registered under BOTH the
 * snake_case spelling and the concatenated-lowercase spelling, because the lookup lowercases
 * the incoming code but does NOT strip separators — so `not_found` and `notFound` both resolve.
 *
 * Chain LCD envelope {code, message, details} is mapped in 0.3.0.
 */
export const CONSOLE_ERROR_MAP: Record<string, string> = {
	unauthorized: 'Unauthorized: check your Akash Console API key (x-api-key).',
	validation_error: 'Validation error: check the request values.',
	validationerror: 'Validation error: check the request values.',
	not_found: 'Not found: the requested resource does not exist.',
	notfound: 'Not found: the requested resource does not exist.',
	rate_limited: 'Rate limited: too many requests — retry later.',
	ratelimited: 'Rate limited: too many requests — retry later.',
};

/** Fallback message when no code-specific mapping applies. */
const DEFAULT_CONSOLE_ERROR = 'The Akash Console API request failed.';

/** One field-level validation error from the Console `data[]` array. */
interface FieldError {
	code?: string;
	path?: Array<string | number>;
	message?: string;
}

/**
 * A parsed Console error envelope plus the raw object it was read from (used as the
 * `errorResponse` payload passed to NodeApiError so the full context is preserved).
 */
interface ConsoleEnvelope {
	code?: string;
	message?: string;
	data?: FieldError[];
	raw: JsonObject;
}

/**
 * Coerce an arbitrary candidate (object, JSON string, or nothing) into a plain object.
 * Returns `undefined` when the candidate cannot be interpreted as an object.
 */
function toObject(candidate: unknown): JsonObject | undefined {
	if (candidate === null || candidate === undefined) {
		return undefined;
	}
	if (typeof candidate === 'string') {
		const trimmed = candidate.trim();
		if (!trimmed.startsWith('{')) {
			return undefined;
		}
		try {
			const parsed: unknown = JSON.parse(trimmed);
			return typeof parsed === 'object' && parsed !== null ? (parsed as JsonObject) : undefined;
		} catch {
			return undefined;
		}
	}
	if (typeof candidate === 'object') {
		return candidate as JsonObject;
	}
	return undefined;
}

/** Read the optional `data[]` array of field errors off a parsed envelope object. */
function extractFieldErrors(obj: JsonObject): FieldError[] | undefined {
	const data = obj.data;
	if (!Array.isArray(data)) {
		return undefined;
	}
	const fieldErrors: FieldError[] = [];
	for (const entry of data) {
		const item = toObject(entry);
		if (!item) {
			continue;
		}
		const path = Array.isArray(item.path)
			? (item.path.filter(
					(segment) => typeof segment === 'string' || typeof segment === 'number',
				) as Array<string | number>)
			: undefined;
		fieldErrors.push({
			code: typeof item.code === 'string' ? item.code : undefined,
			path,
			message: typeof item.message === 'string' ? item.message : undefined,
		});
	}
	return fieldErrors.length > 0 ? fieldErrors : undefined;
}

/**
 * Defensively locate the Console `{ error, message, code, type, data? }` envelope. n8n's HTTP
 * helper wraps the upstream response body in different places depending on how the request
 * failed, so we probe the known carriers in priority order and take the first that exposes a
 * `code`, `message`, or `error` field.
 */
function extractEnvelope(error: any): ConsoleEnvelope {
	const candidates: unknown[] = [
		error?.response?.body,
		error?.cause?.response?.body,
		error?.response?.data,
		error?.error,
		error,
	];

	for (const candidate of candidates) {
		const obj = toObject(candidate);
		if (!obj) {
			continue;
		}
		const code = typeof obj.code === 'string' ? obj.code : undefined;
		const message = typeof obj.message === 'string' ? obj.message : undefined;
		const errorField = typeof obj.error === 'string' ? obj.error : undefined;
		if (code !== undefined || message !== undefined || errorField !== undefined) {
			return { code, message, data: extractFieldErrors(obj), raw: obj };
		}
	}

	return { raw: {} };
}

/** Render a single field error as `path.segments: message` (or a sensible partial). */
function renderFieldError(field: FieldError): string {
	const path = field.path && field.path.length > 0 ? field.path.join('.') : undefined;
	if (path && field.message) {
		return `${path}: ${field.message}`;
	}
	return field.message ?? path ?? field.code ?? 'invalid';
}

/**
 * Map a failed Console API request onto a readable {@link NodeApiError}.
 *
 * Always invoked with an `IExecuteFunctions` `this`, so `this.getNode()` is available.
 * Reads the Console error envelope (`{ error, message, code, type, data? }`) from wherever n8n
 * placed it, derives a friendly headline from {@link CONSOLE_ERROR_MAP} (falling back to the
 * server message, then a generic message), attaches any `data[]` field errors to the
 * description, and never rethrows a bare HTTP error.
 */
export function normalizeAkashError(this: IExecuteFunctions, error: any): NodeApiError {
	// If it is already a NodeApiError, pass it through unchanged.
	if (error instanceof NodeApiError) {
		return error;
	}

	const envelope = extractEnvelope(error);
	const normalizedCode = envelope.code?.toLowerCase();
	const serverMessage =
		envelope.message ?? (typeof error?.message === 'string' ? error.message : undefined);

	const message =
		(normalizedCode ? CONSOLE_ERROR_MAP[normalizedCode] : undefined) ??
		serverMessage ??
		DEFAULT_CONSOLE_ERROR;

	const descriptionParts: string[] = [];
	if (envelope.code) {
		descriptionParts.push(`Console code: ${envelope.code}`);
	}
	if (envelope.message && envelope.message !== message) {
		descriptionParts.push(envelope.message);
	}
	if (envelope.data && envelope.data.length > 0) {
		descriptionParts.push(envelope.data.map(renderFieldError).join('; '));
	}
	const description = descriptionParts.length > 0 ? descriptionParts.join(' — ') : undefined;

	// Preserve the original envelope (or the raw error) as the error response payload.
	const errorObject: JsonObject =
		Object.keys(envelope.raw).length > 0
			? envelope.raw
			: ({ message: serverMessage ?? DEFAULT_CONSOLE_ERROR } as JsonObject);

	return new NodeApiError(this.getNode(), errorObject, { message, description });
}
