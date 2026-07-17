import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { accountOperations, accountFields } from './descriptions/AccountDescription';
import { bidOperations, bidFields } from './descriptions/BidDescription';
import { deploymentOperations, deploymentFields } from './descriptions/DeploymentDescription';
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
import { executeAccountBalance } from './resources/account/balance';
import { executeAccountUsage } from './resources/account/usage';
import { executeAccountWeeklyCost } from './resources/account/weeklyCost';
import { executeAccountWhoami } from './resources/account/whoami';
import { executeAccountWallets } from './resources/account/wallets';
import { executeBidListForDeployment } from './resources/bid/listForDeployment';
import { executeDeploymentList } from './resources/deployment/list';
import { executeDeploymentGet } from './resources/deployment/get';
import { executeDeploymentGetPublic } from './resources/deployment/getPublic';
import { executeDeploymentCreate } from './resources/deployment/create';

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
 * v0.4.0 adds the AUTHED, NON-SPENDING `x-api-key` managed-wallet backbone — all reads or a zero-spend
 * request builder, no code path that moves funds:
 *   - Account — credit balance, usage history, managed wallets, weekly cost, and whoami
 *     (`/v1/balances`, `/v1/usage/history[/stats]`, `/v1/wallets`, `/v1/weekly-cost`, `/v1/user/me`).
 *   - Deployment — managed list/get (`/v1/deployments[/{dseq}]`, poll-based `leases[].status.services`
 *     status, explicitly NOT logs), keyless public get (`/v1/deployment/{owner}/{dseq}`), and a
 *     ZERO-SPEND dry-run Create that builds + validates the `POST /v1/deployments` body and sends
 *     NOTHING (`dryRun` default TRUE; the real write path lands in v1.1.0 behind a HUMAN-ONLY gate).
 *   - Bid — the managed-wallet bid poll for a deployment (`/v1/bids?dseq=`).
 *
 * `usableAsTool: true`: every read op moves no funds, so the node is safe to expose to agents. n8n has
 * no per-operation tool flag, so `deployment: create` is exposed too — but it is DRY-RUN-ONLY (wires no
 * POST, returns the request as data), so an agent calling it moves nothing; the real spend path (v1.1.0)
 * stays behind `dryRun` default TRUE, which an agent cannot flip implicitly.
 *
 * The `akashApi` credential stays `required: false` — the public reads run keyless; the authed account/
 * deployment/bid reads carry an `x-api-key` when a user attaches one (and the chain/gateway planes never
 * attach it at all).
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
			'Read Akash Network: GPU marketplace prices and inventory, network capacity, provider registry and gateway status, marketplace cost estimates and bid screening, on-chain deployments/leases/orders/bids/certs/balances, plus authed (x-api-key) managed-wallet account/deployment/bid reads and a zero-spend dry-run deployment builder — no code path spends funds',
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
						name: 'Account',
						value: 'account',
					},
					{
						name: 'Bid',
						value: 'bid',
					},
					{
						name: 'Chain',
						value: 'chain',
					},
					{
						name: 'Deployment',
						value: 'deployment',
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
			...accountOperations,
			...accountFields,
			...bidOperations,
			...bidFields,
			...deploymentOperations,
			...deploymentFields,
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

				if (resource === 'account' && operation === 'getBalance') {
					result = await executeAccountBalance.call(this, itemIndex);
				} else if (resource === 'account' && operation === 'getUsage') {
					result = await executeAccountUsage.call(this, itemIndex);
				} else if (resource === 'account' && operation === 'getWeeklyCost') {
					result = await executeAccountWeeklyCost.call(this, itemIndex);
				} else if (resource === 'account' && operation === 'whoami') {
					result = await executeAccountWhoami.call(this, itemIndex);
				} else if (resource === 'account' && operation === 'getWallets') {
					result = await executeAccountWallets.call(this, itemIndex);
				} else if (resource === 'bid' && operation === 'listForDeployment') {
					result = await executeBidListForDeployment.call(this, itemIndex);
				} else if (resource === 'deployment' && operation === 'list') {
					result = await executeDeploymentList.call(this, itemIndex);
				} else if (resource === 'deployment' && operation === 'get') {
					result = await executeDeploymentGet.call(this, itemIndex);
				} else if (resource === 'deployment' && operation === 'getPublic') {
					result = await executeDeploymentGetPublic.call(this, itemIndex);
				} else if (resource === 'deployment' && operation === 'create') {
					// `deployment: create` is DRY-RUN-ONLY here: it builds + returns the POST body and wires
					// no network write (dryRun default TRUE; the executor throws if dryRun is turned off).
					// n8n has no per-operation tool flag, so it rides the node-level `usableAsTool: true`, but
					// because it moves no funds by construction that exposure crosses no financial boundary —
					// the real managed-wallet spend path lands in v1.1.0 behind a HUMAN-ONLY gate.
					result = await executeDeploymentCreate.call(this, itemIndex);
				} else if (resource === 'gpu' && operation === 'getPrices') {
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
