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
import { providerOperations, providerFields } from './descriptions/ProviderDescription';
import { marketOperations, marketFields } from './descriptions/MarketDescription';
import { chainOperations, chainFields } from './descriptions/ChainDescription';
import { loadOptions, listSearch } from './methods';
import { executeGpuPrices } from './resources/gpu/prices';
import { executeGpuInventory } from './resources/gpu/inventory';
import { executeGpuModels } from './resources/gpu/models';
import { executeNetworkCapacity } from './resources/network/capacity';
import { executeNetworkStats } from './resources/network/stats';
import { executeProviderList } from './resources/provider/list';
import { executeProviderGet } from './resources/provider/get';
import { executeProviderRegions } from './resources/provider/regions';
import { executeProviderEarnings } from './resources/provider/earnings';
import { executeProviderStatus } from './resources/provider/status';
import { executeMarketEstimate } from './resources/market/estimate';
import { executeMarketBidScreening } from './resources/market/bidScreening';
import { executeChainListDeployments } from './resources/chain/deployment/list';
import { executeChainGetDeployment } from './resources/chain/deployment/get';
import { executeChainListLeases } from './resources/chain/lease/list';
import { executeChainGetLease } from './resources/chain/lease/get';
import { executeChainListOrders } from './resources/chain/order/list';
import { executeChainGetOrder } from './resources/chain/order/get';
import { executeChainListBids } from './resources/chain/bid/list';
import { executeChainGetBid } from './resources/chain/bid/get';
import { executeChainListCertificates } from './resources/chain/certificate/list';
import { executeChainGetBalance } from './resources/chain/account/balance';

/**
 * Akash — decentralized compute marketplace, read plane.
 *
 * v0.3.0 spans all three keyless read planes the node speaks, every op a public, zero-spend read:
 *   - Console plane — GPU marketplace prices/inventory/models, network capacity/stats, the provider
 *     registry (list/get/regions/earnings), and the public non-spending marketplace ops
 *     (`estimate` → `POST /v1/pricing`, `screenBids` → `POST /v1/bid-screening`).
 *   - Chain LCD plane — keyless Cosmos REST reads of the `deployment`/`market`/`cert` modules and
 *     `bank` balances across mainnet + sandbox-2 (pinned module versions live in `chainRestRequest`).
 *   - Provider gateway plane — the provider `:8443` `/status` + `/version` (self-signed cert).
 *
 * `usableAsTool: true`: every v0.3.0 op is a read that moves no funds, so the node is safe to expose
 * to agents. The future spend-capable write op (0.4.0) rides a `typeVersion` bump and is gated then.
 *
 * The `akashApi` credential stays `required: false` — the public reads run keyless; it only carries
 * an `x-api-key` when a user attaches one (and the chain/gateway planes never attach it at all).
 *
 * The node is a versioned node (`version: [1]`) from day one. Akash has already churned its on-chain
 * module versions live (`deployment` past `v1beta3`→`v1beta4`, `market` to `v1beta5`); when the next
 * wire bump or behavior change lands it rides a node `typeVersion` bump — old workflows pin the prior
 * version and keep running — never a package major.
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
			'Read Akash Network: GPU marketplace prices and inventory, network capacity, provider registry and gateway status, marketplace cost estimates and bid screening, and on-chain deployments, leases, orders, bids, certificates and balances — keyless public reads, no spend',
		usableAsTool: true,
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
				// Alphabetized by name (n8n lint requires it once an options field has 5+ entries).
				options: [
					{
						name: 'Chain',
						value: 'chain',
					},
					{
						name: 'GPU',
						value: 'gpu',
					},
					{
						name: 'Market',
						value: 'market',
					},
					{
						name: 'Network',
						value: 'network',
					},
					{
						name: 'Provider',
						value: 'provider',
					},
				],
				default: 'gpu',
			},
			...gpuOperations,
			...gpuFields,
			...networkOperations,
			...networkFields,
			...providerOperations,
			...providerFields,
			...marketOperations,
			...marketFields,
			...chainOperations,
			...chainFields,
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
				} else if (resource === 'provider' && operation === 'list') {
					result = await executeProviderList.call(this, itemIndex);
				} else if (resource === 'provider' && operation === 'get') {
					result = await executeProviderGet.call(this, itemIndex);
				} else if (resource === 'provider' && operation === 'getRegions') {
					result = await executeProviderRegions.call(this, itemIndex);
				} else if (resource === 'provider' && operation === 'getEarnings') {
					result = await executeProviderEarnings.call(this, itemIndex);
				} else if (resource === 'provider' && operation === 'getStatus') {
					result = await executeProviderStatus.call(this, itemIndex);
				} else if (resource === 'market' && operation === 'estimate') {
					result = await executeMarketEstimate.call(this, itemIndex);
				} else if (resource === 'market' && operation === 'screenBids') {
					result = await executeMarketBidScreening.call(this, itemIndex);
				} else if (resource === 'chain' && operation === 'listDeployments') {
					result = await executeChainListDeployments.call(this, itemIndex);
				} else if (resource === 'chain' && operation === 'getDeployment') {
					result = await executeChainGetDeployment.call(this, itemIndex);
				} else if (resource === 'chain' && operation === 'listLeases') {
					result = await executeChainListLeases.call(this, itemIndex);
				} else if (resource === 'chain' && operation === 'getLease') {
					result = await executeChainGetLease.call(this, itemIndex);
				} else if (resource === 'chain' && operation === 'listOrders') {
					result = await executeChainListOrders.call(this, itemIndex);
				} else if (resource === 'chain' && operation === 'getOrder') {
					result = await executeChainGetOrder.call(this, itemIndex);
				} else if (resource === 'chain' && operation === 'listBids') {
					result = await executeChainListBids.call(this, itemIndex);
				} else if (resource === 'chain' && operation === 'getBid') {
					result = await executeChainGetBid.call(this, itemIndex);
				} else if (resource === 'chain' && operation === 'listCertificates') {
					result = await executeChainListCertificates.call(this, itemIndex);
				} else if (resource === 'chain' && operation === 'getBalance') {
					result = await executeChainGetBalance.call(this, itemIndex);
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`The operation "${operation}" is not supported for resource "${resource}"`,
						{ itemIndex },
					);
				}

				// Executors return a single IDataObject or an array; normalize so an array payload
				// (e.g. provider list rows, chain list pages) spreads into one item each.
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
