import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { consoleApiRequest } from '../../transport/consoleApiRequest';

/**
 * Market → Estimate Cost — `POST /v1/pricing`.
 *
 * PUBLIC, KEYLESS, **non-spending**: a pure calculator. It estimates the monthly cost of a
 * deployment spec on Akash and — for comparison — on AWS, GCP and Azure. No funds move,
 * nothing is signed, `security: []` in the Console OpenAPI spec.
 *
 * Wire shape PINNED LIVE from the Console OpenAPI doc (`/v1/doc`, fetched keyless during the
 * v0.3.0 build — this closes the research §9 UNVERIFIED item). The request body is a single
 * resource spec of three REQUIRED numeric fields (an array of up to 10 specs is also accepted
 * by the endpoint; this operation sends one):
 *
 *   `{ cpu: <thousandths of a vCPU>, memory: <bytes>, storage: <bytes> }`
 *
 * The response mirrors it as `{ spec, akash, aws, gcp, azure }` (each a USD/month number).
 *
 * NOTE — the endpoint takes resource NUMBERS, not an SDL document: under the zero-runtime-dep
 * rule the node cannot parse SDL YAML into resource units, and the live `/v1/pricing` contract
 * is resource-based regardless. So this operation exposes cpu/memory/storage directly rather
 * than routing through the SDL-ingest helper (which serves the deployment write path instead).
 */
export async function executeMarketEstimate(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const cpu = this.getNodeParameter('cpu', itemIndex, 1000) as number;
	const memory = this.getNodeParameter('memory', itemIndex, 1073741824) as number;
	const storage = this.getNodeParameter('storage', itemIndex, 1073741824) as number;

	const body: IDataObject = { cpu, memory, storage };

	return consoleApiRequest.call(this, 'POST', '/v1/pricing', { body });
}
