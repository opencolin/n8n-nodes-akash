import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { consoleApiRequest } from '../../transport/consoleApiRequest';

/**
 * Deployment → Get — `GET /v1/deployments/{dseq}`.
 *
 * AUTHED, NON-SPENDING managed-wallet read: fetches one managed deployment by its `dseq`, returning
 * the `deployment` record plus `leases[].status.services{uris,replicas,ready_replicas,
 * forwarded_ports,ips}`. That per-service block is the **poll-based status** substitute for live log
 * streaming — the node is explicitly NOT a logs/exec bridge (that would need a provider
 * WebSocket/mTLS channel, out of scope). A GET only: no lease, no spend.
 *
 * `dseq` is a resourceLocator (from-list mode backed by `searchDeployments`), so it is read with
 * `extractValue` to resolve either a picked or a hand-typed sequence to a plain string. The value is
 * URL-encoded into the path.
 */
export async function executeDeploymentGet(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const dseq = this.getNodeParameter('dseq', itemIndex, '', { extractValue: true }) as string;

	return consoleApiRequest.call(this, 'GET', '/v1/deployments/' + encodeURIComponent(dseq));
}
