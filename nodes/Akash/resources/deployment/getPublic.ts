import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { consoleApiRequest } from '../../transport/consoleApiRequest';

/**
 * Deployment → Get Public — `GET /v1/deployment/{owner}/{dseq}`.
 *
 * KEYLESS public deployment detail (note the SINGULAR `/deployment/` path, distinct from the authed
 * `/v1/deployments/{dseq}` list resource). Resolves with or without a credential: `consoleApiRequest`
 * simply omits the `x-api-key` header when none is attached. Zero-spend read.
 *
 * `owner` (an `akash1…` address) and `dseq` are plain string params; both are trimmed and
 * URL-encoded into the path so an empty or unusual value cannot corrupt the request line.
 */
export async function executeDeploymentGetPublic(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const owner = (this.getNodeParameter('owner', itemIndex, '') as string).trim();
	const dseq = (this.getNodeParameter('dseq', itemIndex, '') as string).trim();

	return consoleApiRequest.call(
		this,
		'GET',
		'/v1/deployment/' + encodeURIComponent(owner) + '/' + encodeURIComponent(dseq),
	);
}
