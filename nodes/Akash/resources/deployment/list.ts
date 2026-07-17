import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { paginateConsole } from '../../transport/pagination';

/**
 * Deployment → List — `GET /v1/deployments?skip=&limit=`.
 *
 * AUTHED, NON-SPENDING managed-wallet read: lists the deployments owned by the wallet behind the
 * attached `x-api-key`. It is a GET only — no lease is taken, no funds move. (The credential is
 * declared `required: false` at the node level so keyless public reads still work; this op needs a
 * key and simply returns nothing useful without one.)
 *
 * Envelope shape is spec-VERIFIED (`docs/research/console-api.md`): the endpoint returns
 * `{ "data": { "deployments":[ … ] } }`. After `consoleApiRequest` strips the outer `{data}` the
 * body is the object `{ deployments:[ … ] }`, so `paginateConsole` is told `itemsKey =
 * 'deployments'` (the page array lives under that key — it is NOT a bare array). If the live shape
 * turns out to differ, `paginateConsole` returns `[]` defensively rather than throwing, so the op
 * degrades safely.
 *
 * `paginateConsole` reads this op's own `returnAll` / `limit` node params and walks the Console
 * `skip`/`limit` pages, so no query string is supplied here.
 */
export async function executeDeploymentList(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject[]> {
	return paginateConsole.call(this, '/v1/deployments', 'deployments', {}, itemIndex);
}
