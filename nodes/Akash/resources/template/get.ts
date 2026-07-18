import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { consoleApiRequest } from '../../transport/consoleApiRequest';

/**
 * Template → Get — `GET /v1/templates/{id}` ([SPEC] per research console-api.md).
 *
 * KEYLESS, zero-spend, agent-safe: a single awesome-akash template detail read that moves no funds
 * and needs no `x-api-key`.
 *
 * `id` is read from the `templateId` resourceLocator with `extractValue` so both the from-list
 * (`searchTemplates`) and manual by-ID modes resolve to the same freeform template-id string, which
 * is then URL-encoded into the path.
 */
export async function executeTemplateGet(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const id = this.getNodeParameter('templateId', itemIndex, '', { extractValue: true }) as string;

	return consoleApiRequest.call(this, 'GET', `/v1/templates/${encodeURIComponent(id)}`);
}
