import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { chainPaths } from '../../../transport/chainRestRequest';
import { paginateChain } from '../../../transport/pagination';

/**
 * Chain → List Orders — `GET /akash/market/v1beta5/orders/list`.
 *
 * KEYLESS on-chain read (Cosmos LCD, no `x-api-key`, no spend). Lists orders from
 * the Akash `market` module across mainnet or sandbox-2.
 *
 * Optional filters map to `filters.*` (VERIFIED live 2026-07-17):
 * `owner`, `dseq`, `gseq`, `oseq`, `state` (`open`|`active`|`closed`). An order id is
 * a 4-tuple (no provider/bseq). String filters are omitted when blank; `gseq`/`oseq`
 * are omitted when 0. `paginateChain` owns `returnAll`/`limit` + `next_key`.
 */
export async function executeChainListOrders(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject[]> {
	const owner = (this.getNodeParameter('owner', itemIndex, '') as string).trim();
	const dseq = (this.getNodeParameter('dseq', itemIndex, '') as string).trim();
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
	if (state) {
		filters['filters.state'] = state;
	}
	if (gseq > 0) {
		filters['filters.gseq'] = gseq;
	}
	if (oseq > 0) {
		filters['filters.oseq'] = oseq;
	}

	return paginateChain.call(this, chainPaths.ordersList(), 'orders', filters, itemIndex);
}
