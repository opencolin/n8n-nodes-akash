import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { consoleApiRequest } from '../../transport/consoleApiRequest';

/**
 * Bid → List for Deployment — `GET /v1/bids?dseq={dseq}`.
 *
 * AUTHED, NON-SPENDING `x-api-key` read: the managed-wallet bid poll for one deployment. After a
 * deployment is created (v1.1.0) providers place bids; this GET returns the current bid set for a
 * `dseq` — distinct from the keyless chain `market/v1beta5/bids` reads shipped in v0.3.0. A GET
 * only: no lease is accepted, no funds move.
 *
 * `dseq` is a resourceLocator (from-list via `searchDeployments`), read with `extractValue` to
 * resolve a picked or hand-typed sequence to a plain string. `dseq` is a required query param on
 * this endpoint. After the outer `{data}` envelope is stripped the body is expected to be a bare
 * array of `{ bid, escrow_account }` rows; anything else degrades to a single- or zero-row result
 * rather than throwing, so the router can spread it into one item per bid.
 */
export async function executeBidListForDeployment(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject[]> {
	const dseq = (
		this.getNodeParameter('dseq', itemIndex, '', { extractValue: true }) as string
	).trim();

	const response = (await consoleApiRequest.call(this, 'GET', '/v1/bids', {
		qs: { dseq },
	})) as unknown;

	if (Array.isArray(response)) {
		return response as IDataObject[];
	}
	return response && typeof response === 'object' ? [response as IDataObject] : [];
}
