import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { lintSdlShape, resolveSdl } from '../../transport/sdl';

/**
 * Deployment → Create (Dry Run) — the zero-spend write-path SHAPE de-risker.
 *
 * This op constructs and validates the `POST /v1/deployments` request body
 * `{ data: { sdl: '<yaml string>', deposit: <USD number> } }` from the SDL-ingest helper, but — in
 * this release — **never sends it**. It exists to prove the write-path SHAPE (body envelope, SDL
 * pass-through, deposit units) without crossing the FINANCIAL BOUNDARY: the Console managed wallet
 * signs and broadcasts a real Cosmos tx server-side and **spends real mainnet USD credit**, so the
 * actual POST is deliberately deferred to v1.1.0 behind a HUMAN-ONLY gate.
 *
 * `dryRun` DEFAULTS TRUE and never flips to send implicitly. When it is on we return the
 * fully-constructed request plus any advisory SDL shape `warnings` and issue NO network call. When
 * it is explicitly turned off we throw rather than spend — the send path is not wired here.
 *
 * NOTE: this executor must NOT call `consoleApiRequest` in the dry-run branch — the request is
 * returned as data, not issued. (`test/resources/dryRunCreate.test.ts` asserts zero transport calls.)
 */
export async function executeDeploymentCreate(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const dryRun = this.getNodeParameter('dryRun', itemIndex, true) as boolean;
	const sdl = await resolveSdl.call(this, itemIndex);
	const deposit = this.getNodeParameter('deposit', itemIndex, 0) as number;

	const { warnings } = lintSdlShape(sdl);
	const request = { data: { sdl, deposit } };

	if (dryRun) {
		return { dryRun: true, method: 'POST', endpoint: '/v1/deployments', request, warnings };
	}

	// dryRun=false: a HUMAN-ONLY managed-wallet spend that lands in v1.1.0 — NOT wired here. Throw
	// rather than send so no agent (and no accidental toggle) can ever cross the financial boundary.
	throw new NodeOperationError(
		this.getNode(),
		'Live deployment creation spends real mainnet USD credit and is disabled in this release. Keep Dry Run on; the managed-wallet write path lands in v1.1.0.',
		{ itemIndex },
	);
}
