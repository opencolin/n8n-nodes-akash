import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { chainPaths, chainRestRequest } from '../../../transport/chainRestRequest';

/**
 * Chain → Get Order — `GET /akash/market/v1beta5/orders/info`.
 *
 * KEYLESS on-chain read (Cosmos LCD, no `x-api-key`, no spend). Fetches a single
 * order identified by the 4-tuple order id `id.owner` + `id.dseq` + `id.gseq` +
 * `id.oseq` (VERIFIED live 2026-07-17). String components are omitted when blank;
 * the `gseq`/`oseq` sequence numbers default to 1 and are always sent as part of the
 * id.
 */
export async function executeChainGetOrder(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const owner = (this.getNodeParameter('owner', itemIndex, '') as string).trim();
	const dseq = (this.getNodeParameter('dseq', itemIndex, '') as string).trim();
	const gseq = this.getNodeParameter('gseq', itemIndex, 1) as number;
	const oseq = this.getNodeParameter('oseq', itemIndex, 1) as number;

	const qs: IDataObject = { 'id.gseq': gseq, 'id.oseq': oseq };
	if (owner) {
		qs['id.owner'] = owner;
	}
	if (dseq) {
		qs['id.dseq'] = dseq;
	}

	return chainRestRequest.call(this, chainPaths.orderInfo(), { qs, itemIndex });
}
