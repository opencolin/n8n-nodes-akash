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
 * The keyless chain LCD plane fails with a DIFFERENT envelope — `{code:<grpc int>, message,
 * details:[]}` where `code` is a numeric gRPC status, not a string token — so it does not key into
 * this map; it is handled by HTTP-status → friendly-message mapping instead (see
 * {@link CHAIN_HTTP_STATUS_MESSAGES} and {@link normalizeAkashError}).
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

/**
 * Friendly messages for the **keyless chain LCD plane**, keyed by HTTP status. The gRPC-gateway
 * mirrors gRPC onto HTTP status (`docs/research/chain-rest.md` §7): a chain call that fails carries
 * one of these statuses, and the raw gRPC `message` is often terse ("Not Implemented",
 * "invalid address"), so we substitute a message that tells the operator what to do. `501` is the
 * load-bearing "wrong module version/path" signal — the pinned versions in `chainRestRequest`
 * exist precisely to avoid it.
 */
const CHAIN_HTTP_STATUS_MESSAGES: Record<number, string> = {
	400: 'Bad request: invalid input (e.g. a malformed bech32 `akash1…` address or filter value).',
	404: 'Not found: no matching on-chain record (often just an empty result set).',
	429: 'Rate limited: too many requests to the chain host — back off and retry.',
	501: 'Not implemented: wrong Cosmos module version or path — the pinned module versions are load-bearing (a `v1beta3` path is dead).',
};

/** One field-level validation error from the Console `data[]` array. */
interface FieldError {
	code?: string;
	path?: Array<string | number>;
	message?: string;
}

/**
 * A parsed error envelope plus the raw object it was read from (used as the `errorResponse`
 * payload passed to NodeApiError so the full context is preserved). Covers BOTH plane shapes:
 * the Console `{code:<string token>, message, data[]}` and the chain LCD `{code:<grpc int>,
 * message, details[]}`.
 */
interface ConsoleEnvelope {
	/** Console string token (`unauthorized`, `validation_error`, …); undefined for the LCD. */
	code?: string;
	/** Chain LCD numeric gRPC status code; undefined for the Console plane. */
	grpcCode?: number;
	message?: string;
	/** Console field-error array. */
	data?: FieldError[];
	/** Chain LCD `details[]` array (usually empty, but surfaced when present). */
	details?: unknown[];
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
 * Defensively locate the error envelope — the Console `{ error, message, code, type, data? }` OR
 * the chain LCD `{ code:<grpc int>, message, details:[] }`. n8n's HTTP helper wraps the upstream
 * response body in different places depending on how the request failed, so we probe the known
 * carriers in priority order and take the first that exposes a `code` (string OR numeric),
 * `message`, or `error` field.
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
		const grpcCode = typeof obj.code === 'number' ? obj.code : undefined;
		const message = typeof obj.message === 'string' ? obj.message : undefined;
		const errorField = typeof obj.error === 'string' ? obj.error : undefined;
		const details = Array.isArray(obj.details) ? (obj.details as unknown[]) : undefined;
		if (
			code !== undefined ||
			grpcCode !== undefined ||
			message !== undefined ||
			errorField !== undefined
		) {
			return { code, grpcCode, message, data: extractFieldErrors(obj), details, raw: obj };
		}
	}

	return { raw: {} };
}

/**
 * Read the HTTP status code off a thrown n8n HTTP error. n8n places it in different keys depending
 * on the failure path (`httpCode` is often a numeric string like `"501"`), so probe them in order.
 */
function extractHttpStatus(error: any): number | undefined {
	const raw = error?.httpCode ?? error?.response?.statusCode ?? error?.statusCode;
	if (typeof raw === 'number') {
		return Number.isFinite(raw) ? raw : undefined;
	}
	if (typeof raw === 'string') {
		const parsed = Number.parseInt(raw, 10);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
}

/**
 * Map an HTTP status from the chain LCD plane to a friendly message. Explicit statuses
 * (400/404/429/501) win; any other 5xx is a transient host error worth a retry/failover. Returns
 * `undefined` for statuses we do not specialise (the caller then falls back to the server message).
 */
function chainHttpStatusMessage(status: number | undefined): string | undefined {
	if (status === undefined) {
		return undefined;
	}
	if (CHAIN_HTTP_STATUS_MESSAGES[status] !== undefined) {
		return CHAIN_HTTP_STATUS_MESSAGES[status].trim();
	}
	if (status >= 500) {
		return 'Transient chain host error — retry, or try another public LCD host.';
	}
	return undefined;
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
 * Map a failed request from ANY Akash plane onto a readable {@link NodeApiError}.
 *
 * Always invoked with an `IExecuteFunctions`-shaped `this`, so `this.getNode()` is available
 * (chain/gateway transports call it with an `IExecuteFunctions | ILoadOptionsFunctions` context —
 * both expose `getNode()`).
 *
 * Headline priority:
 *   1. Console string `code` → {@link CONSOLE_ERROR_MAP} (the primary plane).
 *   2. Chain LCD / gateway HTTP status → {@link chainHttpStatusMessage} (400/404/429/501/5xx). The
 *      LCD envelope's `code` is a numeric gRPC status (not a Console token), so it does not key
 *      into the map above and this status mapping is what makes a failed chain call legible.
 *   3. The raw server `message`.
 *   4. A generic fallback.
 *
 * The description carries whatever provenance is available (Console code, gRPC code, HTTP status,
 * the server message when distinct, and Console `data[]` / LCD `details[]` entries). Never
 * rethrows a bare HTTP error.
 */
export function normalizeAkashError(this: IExecuteFunctions, error: any): NodeApiError {
	// If it is already a NodeApiError, pass it through unchanged.
	if (error instanceof NodeApiError) {
		return error;
	}

	const envelope = extractEnvelope(error);
	const normalizedCode = envelope.code?.toLowerCase();
	const httpStatus = extractHttpStatus(error);
	const serverMessage =
		envelope.message ?? (typeof error?.message === 'string' ? error.message : undefined);

	const message =
		(normalizedCode ? CONSOLE_ERROR_MAP[normalizedCode] : undefined) ??
		chainHttpStatusMessage(httpStatus) ??
		serverMessage ??
		DEFAULT_CONSOLE_ERROR;

	const descriptionParts: string[] = [];
	if (envelope.code) {
		descriptionParts.push(`Console code: ${envelope.code}`);
	}
	if (envelope.grpcCode !== undefined) {
		descriptionParts.push(`Chain gRPC code: ${envelope.grpcCode}`);
	}
	if (httpStatus !== undefined) {
		descriptionParts.push(`HTTP ${httpStatus}`);
	}
	if (envelope.message && envelope.message !== message) {
		descriptionParts.push(envelope.message);
	}
	if (envelope.data && envelope.data.length > 0) {
		descriptionParts.push(envelope.data.map(renderFieldError).join('; '));
	}
	if (envelope.details && envelope.details.length > 0) {
		descriptionParts.push(renderDetails(envelope.details));
	}
	const description = descriptionParts.length > 0 ? descriptionParts.join(' — ') : undefined;

	// Preserve the original envelope (or the raw error) as the error response payload.
	const errorObject: JsonObject =
		Object.keys(envelope.raw).length > 0
			? envelope.raw
			: ({ message: serverMessage ?? DEFAULT_CONSOLE_ERROR } as JsonObject);

	return new NodeApiError(this.getNode(), errorObject, { message, description });
}

/** Render chain LCD `details[]` entries into a compact, readable string. */
function renderDetails(details: unknown[]): string {
	return details
		.map((entry) => {
			if (typeof entry === 'string') {
				return entry;
			}
			try {
				return JSON.stringify(entry);
			} catch {
				return String(entry);
			}
		})
		.join('; ');
}
