import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { chainPaths } from '../../../transport/chainRestRequest';
import { paginateChain } from '../../../transport/pagination';

/**
 * Chain → List Deployments — `GET /akash/deployment/v1beta4/deployments/list`.
 *
 * KEYLESS on-chain read (Cosmos LCD, no `x-api-key`, no spend). Lists deployments
 * from the Akash `deployment` module across mainnet or sandbox-2 (selected by the
 * shared `network`/`chainBaseUrl` params the transport reads).
 *
 * Optional filters map to the module's `filters.*` query keys (VERIFIED live
 * 2026-07-17): `filters.owner` (an `akash1…` bech32 address), `filters.dseq`
 * (deployment sequence), `filters.state` (`active`|`closed`). Empty filters are
 * omitted so the server returns the unfiltered set. `paginateChain` owns the
 * `returnAll`/`limit` toggle and the URL-encoded `next_key` cursor loop, unwrapping
 * the `deployments[]` array from each page.
 */
export async function executeChainListDeployments(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject[]> {
	const owner = (this.getNodeParameter('owner', itemIndex, '') as string).trim();
	const dseq = (this.getNodeParameter('dseq', itemIndex, '') as string).trim();
	const state = (this.getNodeParameter('state', itemIndex, '') as string).trim();

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

	return paginateChain.call(this, chainPaths.deploymentsList(), 'deployments', filters, itemIndex);
}
