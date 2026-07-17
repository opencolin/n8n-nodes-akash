import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { consoleApiRequest } from '../../transport/consoleApiRequest';

/**
 * Provider → Get Earnings — `GET /v1/provider-earnings/{owner}`.
 *
 * KEYLESS, zero-spend, agent-safe: a public Console read of a provider's earnings, returned
 * under an `earnings` block. The provider-operator audience uses it to alert on earnings
 * changes; it moves no funds and needs no `x-api-key`.
 *
 * `owner` is the provider owner address (`akash1…`). The optional `from` / `to` bounds map to
 * the endpoint's `from` / `to` query params and are only sent when set, so an empty window
 * means "the endpoint's own default range".
 */
export async function executeProviderEarnings(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const owner = this.getNodeParameter('owner', itemIndex, '') as string;
	const from = this.getNodeParameter('from', itemIndex, '') as string;
	const to = this.getNodeParameter('to', itemIndex, '') as string;

	const qs: IDataObject = {};
	if (from) {
		qs.from = from;
	}
	if (to) {
		qs.to = to;
	}

	return consoleApiRequest.call(
		this,
		'GET',
		`/v1/provider-earnings/${encodeURIComponent(owner)}`,
		{ qs },
	);
}
