import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { chainPaths } from '../../../transport/chainRestRequest';
import { paginateChain } from '../../../transport/pagination';

/**
 * Chain → List Bids — `GET /akash/market/v1beta5/bids/list`.
 *
 * KEYLESS on-chain read (Cosmos LCD, no `x-api-key`, no spend). Lists provider bids
 * from the Akash `market` module across mainnet or sandbox-2. Bid prices are
 * multi-denom (`uakt`, `uact`, IBC-USDC) — treat every amount as an opaque string.
 *
 * Optional filters map to `filters.*` (VERIFIED live 2026-07-17):
 * `owner`, `dseq`, `gseq`, `oseq`, `provider`, `state`
 * (`open`|`active`|`lost`|`closed`). String filters are omitted when blank;
 * `gseq`/`oseq` are omitted when 0. `paginateChain` owns `returnAll`/`limit` +
 * `next_key`.
 */
export async function executeChainListBids(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject[]> {
	const owner = (this.getNodeParameter('owner', itemIndex, '') as string).trim();
	const dseq = (this.getNodeParameter('dseq', itemIndex, '') as string).trim();
	const provider = (this.getNodeParameter('provider', itemIndex, '') as string).trim();
	const state = (this.getNodeParameter('state', itemIndex, '') as string).trim();
	const gseq = this.getNodeParameter('gseq', itemIndex, 0) as number;
	const oseq = this.getNodeParameter('oseq', itemIndex, 0) as number;

	const filters: IDataObject = {};
	if (owner) {
		filters['filters.owner'] = owner;
	}
	if (dseq) {
		filters['filters.dseq'] = dseq;
	}
	if (provider) {
		filters['filters.provider'] = provider;
	}
	if (state) {
		filters['filters.state'] = state;
	}
	if (gseq > 0) {
		filters['filters.gseq'] = gseq;
	}
	if (oseq > 0) {
		filters['filters.oseq'] = oseq;
	}

	return paginateChain.call(this, chainPaths.bidsList(), 'bids', filters, itemIndex);
}
