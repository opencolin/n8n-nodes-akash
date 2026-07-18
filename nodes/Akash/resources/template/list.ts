import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { consoleApiRequest } from '../../transport/consoleApiRequest';

/**
 * Template → List — `GET /v1/templates-list`.
 *
 * KEYLESS, zero-spend, agent-safe: a public Console read that moves no funds and needs no
 * `x-api-key`. This is the awesome-akash template catalog — the one new user-facing feature of
 * the v1.0.0 publish gate.
 *
 * Verified response shape (live-probed 2026-07-17): the raw body is
 * `{ data: [ { title, templates: [ { id, name, logoUrl, summary, tags[] } ] } ] }` — 30 category
 * objects, each grouping its own `templates[]` array. The shared `consoleApiRequest` transport
 * strips the outer `{data:…}` envelope, so this call resolves to the ARRAY of category objects
 * `{ title, templates[] }` directly. The node's `execute()` spreads that array into one output
 * item per category.
 *
 * The cast is required because `consoleApiRequest` is declared `Promise<IDataObject>` for the common
 * single-object case, yet returns the unwrapped array at runtime for this endpoint.
 *
 * `itemIndex` is accepted for signature uniformity across resource executors even though this
 * operation takes no per-item parameters — mirrors the `gpu/prices.ts` idiom.
 */
export async function executeTemplateList(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject[]> {
	return (await consoleApiRequest.call(
		this,
		'GET',
		'/v1/templates-list',
	)) as unknown as IDataObject[];
}
