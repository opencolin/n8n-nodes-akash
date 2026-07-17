import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { gpuOperations, gpuFields } from './descriptions/GpuDescription';
import { networkOperations, networkFields } from './descriptions/NetworkDescription';
import { loadOptions, listSearch } from './methods';
import { executeGpuPrices } from './resources/gpu/prices';
import { executeGpuInventory } from './resources/gpu/inventory';
import { executeGpuModels } from './resources/gpu/models';
import { executeNetworkCapacity } from './resources/network/capacity';
import { executeNetworkStats } from './resources/network/stats';

/**
 * Akash — decentralized compute marketplace, read plane.
 *
 * v0.1.0 ships the keyless public read surface only: GPU marketplace prices,
 * cluster GPU inventory, GPU models, and network capacity/stats — all served by
 * the Akash Console API with no key and no spend. The `akashApi` credential is
 * declared `required: false` so these public reads run keyless; it only carries
 * an `x-api-key` when a user attaches one.
 *
 * Deliberately deferred to 0.3.0: `usableAsTool` (agent-callable reads),
 * resourceLocators (from-list id pickers wired through `./methods`), and the
 * chain-REST + provider-gateway read planes.
 *
 * The node is a versioned node (`version: [1]`) from day one. Akash has already
 * churned its on-chain module versions live (`deployment` past `v1beta3`→
 * `v1beta4`, `market` to `v1beta5`); when the next wire bump or behavior change
 * lands it rides a node `typeVersion` bump — old workflows pin the prior version
 * and keep running — never a package major.
 */
export class Akash implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Akash',
		name: 'akash',
		icon: 'file:akash.svg',
		group: ['transform'],
		version: [1],
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Read Akash Network GPU marketplace prices, cluster inventory, and network capacity/stats — keyless public reads, no spend',
		defaults: {
			name: 'Akash',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'akashApi',
				required: false,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'GPU',
						value: 'gpu',
					},
					{
						name: 'Network',
						value: 'network',
					},
				],
				default: 'gpu',
			},
			...gpuOperations,
			...gpuFields,
			...networkOperations,
			...networkFields,
		],
	};

	methods = { loadOptions, listSearch };

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const resource = this.getNodeParameter('resource', itemIndex) as string;
				const operation = this.getNodeParameter('operation', itemIndex) as string;

				let result: IDataObject | IDataObject[];

				if (resource === 'gpu' && operation === 'getPrices') {
					result = await executeGpuPrices.call(this, itemIndex);
				} else if (resource === 'gpu' && operation === 'getInventory') {
					result = await executeGpuInventory.call(this, itemIndex);
				} else if (resource === 'gpu' && operation === 'getModels') {
					result = await executeGpuModels.call(this, itemIndex);
				} else if (resource === 'network' && operation === 'getCapacity') {
					result = await executeNetworkCapacity.call(this, itemIndex);
				} else if (resource === 'network' && operation === 'getStats') {
					result = await executeNetworkStats.call(this, itemIndex);
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`The operation "${operation}" is not supported for resource "${resource}"`,
						{ itemIndex },
					);
				}

				// Executors return a single IDataObject, but normalize defensively so an
				// array payload (e.g. per-model price rows) spreads into one item each.
				if (Array.isArray(result)) {
					for (const entry of result) {
						returnData.push({ json: entry, pairedItem: { item: itemIndex } });
					}
				} else {
					returnData.push({ json: result, pairedItem: { item: itemIndex } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: itemIndex },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
