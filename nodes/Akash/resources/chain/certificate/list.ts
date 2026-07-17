import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { chainPaths } from '../../../transport/chainRestRequest';
import { paginateChain } from '../../../transport/pagination';

/**
 * Chain → List Certificates — `GET /akash/cert/v1/certificates/list`.
 *
 * KEYLESS on-chain read (Cosmos LCD, no `x-api-key`, no spend). Lists deployment
 * certificates from the Akash `cert` module across mainnet or sandbox-2.
 *
 * GOTCHA (VERIFIED 2026-07-17): the `cert` module uses the **SINGULAR** `filter.`
 * query prefix — `filter.owner`, `filter.serial`, `filter.state`
 * (`valid`|`revoked`) — NOT the `filters.` prefix used by `deployment`/`market`.
 * Empty filters are omitted. `paginateChain` owns `returnAll`/`limit` + `next_key`,
 * unwrapping the `certificates[]` array from each page.
 */
export async function executeChainListCertificates(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject[]> {
	const owner = (this.getNodeParameter('owner', itemIndex, '') as string).trim();
	const serial = (this.getNodeParameter('serial', itemIndex, '') as string).trim();
	const state = (this.getNodeParameter('state', itemIndex, '') as string).trim();

	const filters: IDataObject = {};
	if (owner) {
		filters['filter.owner'] = owner;
	}
	if (serial) {
		filters['filter.serial'] = serial;
	}
	if (state) {
		filters['filter.state'] = state;
	}

	return paginateChain.call(
		this,
		chainPaths.certificatesList(),
		'certificates',
		filters,
		itemIndex,
	);
}
