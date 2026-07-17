import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { consoleApiRequest } from '../../transport/consoleApiRequest';

/**
 * Market → Screen Providers — `POST /v1/bid-screening`.
 *
 * PUBLIC, KEYLESS, **non-spending**: screens which providers could host a deployment spec and
 * pass its bid requirements. Read-oriented, `security: []` in the Console OpenAPI spec — no
 * funds move.
 *
 * Wire shape PINNED LIVE from the Console OpenAPI doc (`/v1/doc`, fetched keyless during the
 * v0.3.0 build — this closes the research §9 UNVERIFIED item). The body mirrors the on-chain
 * deployment group resource-units structure; REQUIRED top-level keys are `resources` and
 * `timezone`, and each `resources[]` element requires `resource`, `count` and `price`:
 *
 *   {
 *     resources: [{
 *       resource: {
 *         id, cpu:{units:{val}}, memory:{quantity:{val}}, gpu:{units:{val}},
 *         storage:[{name, quantity:{val}}], endpoints:[]
 *       },
 *       count, price:{denom, amount}
 *     }],
 *     timezone,
 *     reclamationWindow?   // only when > 0
 *   }
 *
 * All resource unit values are STRINGS on the wire (`cpu` millicores, `memory`/`storage` bytes,
 * `gpu` a count), matching the chain's resource-units encoding. This operation builds one
 * resource group; `count` is its replica count and `price` is the tenant's max bid price.
 * Returns `{ providers }`.
 */
export async function executeMarketBidScreening(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const cpuUnits = this.getNodeParameter('cpuUnits', itemIndex, '1000') as string;
	const memoryQuantity = this.getNodeParameter('memoryQuantity', itemIndex, '1073741824') as string;
	const gpuUnits = this.getNodeParameter('gpuUnits', itemIndex, '0') as string;
	const storageQuantity = this.getNodeParameter(
		'storageQuantity',
		itemIndex,
		'1073741824',
	) as string;
	const count = this.getNodeParameter('count', itemIndex, 1) as number;
	const priceDenom = this.getNodeParameter('priceDenom', itemIndex, 'uakt') as string;
	const priceAmount = this.getNodeParameter('priceAmount', itemIndex, '10000') as string;
	const timezone = this.getNodeParameter('timezone', itemIndex, 'America/Chicago') as string;
	const reclamationWindow = this.getNodeParameter('reclamationWindow', itemIndex, 0) as number;

	const body: IDataObject = {
		resources: [
			{
				resource: {
					id: 1,
					cpu: { units: { val: cpuUnits } },
					memory: { quantity: { val: memoryQuantity } },
					gpu: { units: { val: gpuUnits } },
					storage: [{ name: 'default', quantity: { val: storageQuantity } }],
					endpoints: [],
				},
				count,
				price: { denom: priceDenom, amount: priceAmount },
			},
		],
		timezone,
	};
	if (reclamationWindow > 0) {
		body.reclamationWindow = reclamationWindow;
	}

	return consoleApiRequest.call(this, 'POST', '/v1/bid-screening', { body });
}
