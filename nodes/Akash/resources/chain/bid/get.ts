import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { chainPaths, chainRestRequest } from '../../../transport/chainRestRequest';

/**
 * Chain → Get Bid — `GET /akash/market/v1beta5/bids/info`.
 *
 * KEYLESS on-chain read (Cosmos LCD, no `x-api-key`, no spend). Fetches a single bid
 * identified by `id.owner` + `id.dseq` + `id.gseq` + `id.oseq` + `id.provider`
 * (VERIFIED live 2026-07-17). String components are omitted when blank; the
 * `gseq`/`oseq` sequence numbers default to 1 and are always sent as part of the id.
 */
export async function executeChainGetBid(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const owner = (this.getNodeParameter('owner', itemIndex, '') as string).trim();
	const dseq = (this.getNodeParameter('dseq', itemIndex, '') as string).trim();
	const provider = (this.getNodeParameter('provider', itemIndex, '') as string).trim();
	const gseq = this.getNodeParameter('gseq', itemIndex, 1) as number;
	const oseq = this.getNodeParameter('oseq', itemIndex, 1) as number;

	const qs: IDataObject = { 'id.gseq': gseq, 'id.oseq': oseq };
	if (owner) {
		qs['id.owner'] = owner;
	}
	if (dseq) {
		qs['id.dseq'] = dseq;
	}
	if (provider) {
		qs['id.provider'] = provider;
	}

	return chainRestRequest.call(this, chainPaths.bidInfo(), { qs, itemIndex });
}
