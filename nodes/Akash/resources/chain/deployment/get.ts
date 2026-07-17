import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { chainPaths, chainRestRequest } from '../../../transport/chainRestRequest';

/**
 * Chain → Get Deployment — `GET /akash/deployment/v1beta4/deployments/info`.
 *
 * KEYLESS on-chain read (Cosmos LCD, no `x-api-key`, no spend). Fetches a single
 * deployment (with its `groups[]` and inlined `escrow_account`) identified by the
 * `id.owner` + `id.dseq` query pair (VERIFIED live 2026-07-17).
 *
 * `dseq` is a resourceLocator — its list mode is backed by the integrator's
 * `searchChainDeployments` method — so we read it with `extractValue` to resolve
 * either a picked or a hand-typed sequence to a plain string. Empty id components
 * are omitted rather than sent blank.
 */
export async function executeChainGetDeployment(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const owner = (this.getNodeParameter('owner', itemIndex, '') as string).trim();
	const dseq = (
		this.getNodeParameter('dseq', itemIndex, '', { extractValue: true }) as string
	).trim();

	const qs: IDataObject = {};
	if (owner) {
		qs['id.owner'] = owner;
	}
	if (dseq) {
		qs['id.dseq'] = dseq;
	}

	return chainRestRequest.call(this, chainPaths.deploymentInfo(), { qs, itemIndex });
}
