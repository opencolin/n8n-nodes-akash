import type { INodeProperties } from 'n8n-workflow';

/**
 * Chain resource — KEYLESS on-chain Cosmos LCD reads (resource value `chain`).
 *
 * Every operation here is a public, unauthenticated GET against the Akash chain REST
 * (LCD): mainnet `https://api.akashnet.net` or sandbox-2 `https://api.sandbox-2.aksh.pw`,
 * selected by the shared `network` param (or overridden by `chainBaseUrl`). No
 * `x-api-key`, no wallet, no spend — safe to expose as AI-Agent read tools.
 *
 * The two shared params `network` + `chainBaseUrl` are the CONTRACT the transport's
 * `chainRestRequest` reads to resolve the base URL; their names must stay exact.
 *
 * Filter query keys differ by module (VERIFIED live 2026-07-17): `deployment`/`market`
 * use the plural `filters.*` prefix, while `cert` uses the SINGULAR `filter.*` prefix —
 * that mapping lives in the executors, not here. This file only defines the n8n UI.
 */

export const chainOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['chain'],
			},
		},
		options: [
			{
				name: 'Get Balance',
				value: 'getBalance',
				action: 'Get a wallet balance',
				description:
					'Read the AKT and other token balances an akash1 address holds on chain, as opaque integer amounts per denom — keyless, no spend',
			},
			{
				name: 'Get Bid',
				value: 'getBid',
				action: 'Get a bid',
				description:
					'Get one provider bid by its full on-chain ID (owner, DSEQ, GSEQ, OSEQ, provider), with its escrow account — keyless, no spend',
			},
			{
				name: 'Get Deployment',
				value: 'getDeployment',
				action: 'Get a deployment',
				description:
					'Get one on-chain deployment by owner and DSEQ, including its groups and inlined escrow account — keyless, no spend',
			},
			{
				name: 'Get Lease',
				value: 'getLease',
				action: 'Get a lease',
				description:
					'Get one lease by its full on-chain ID (owner, DSEQ, GSEQ, OSEQ, provider), with its escrow payment — keyless, no spend',
			},
			{
				name: 'Get Order',
				value: 'getOrder',
				action: 'Get an order',
				description:
					'Get one marketplace order by its on-chain ID (owner, DSEQ, GSEQ, OSEQ) — keyless, no spend',
			},
			{
				name: 'List Bids',
				value: 'listBids',
				action: 'List bids',
				description:
					'List provider bids on the Akash marketplace, filterable by owner, deployment, provider or state — keyless, no spend',
			},
			{
				name: 'List Certificates',
				value: 'listCertificates',
				action: 'List certificates',
				description:
					'List on-chain deployment certificates, filterable by owner, serial or state — keyless, no spend',
			},
			{
				name: 'List Deployments',
				value: 'listDeployments',
				action: 'List deployments',
				description:
					'List on-chain deployments, filterable by owner, DSEQ or state (active or closed) — keyless, no spend',
			},
			{
				name: 'List Leases',
				value: 'listLeases',
				action: 'List leases',
				description:
					'List active and historical leases on the Akash marketplace, filterable by owner, deployment, provider or state — keyless, no spend',
			},
			{
				name: 'List Orders',
				value: 'listOrders',
				action: 'List orders',
				description:
					'List marketplace orders, filterable by owner, deployment or state — keyless, no spend',
			},
		],
		default: 'listDeployments',
	},
];

export const chainFields: INodeProperties[] = [
	// ---------------------------------------------------------------------------
	// Shared across every chain operation — the transport reads these two by name.
	// ---------------------------------------------------------------------------
	{
		displayName: 'Network',
		name: 'network',
		type: 'options',
		default: 'mainnet',
		description: 'Which Akash network the keyless Cosmos LCD reads target',
		options: [
			{
				name: 'Mainnet',
				value: 'mainnet',
				description: 'The production Akash network (api.akashnet.net)',
			},
			{
				name: 'Sandbox 2',
				value: 'sandbox-2',
				description: 'The faucet-funded sandbox-2 test network (api.sandbox-2.aksh.pw)',
			},
		],
		displayOptions: {
			show: {
				resource: ['chain'],
			},
		},
	},
	{
		displayName: 'Chain Base URL',
		name: 'chainBaseUrl',
		type: 'string',
		default: '',
		placeholder: 'https://api.akashnet.net',
		description:
			'Advanced: override the Cosmos LCD base URL to read from your own Akash node instead of the selected network default',
		displayOptions: {
			show: {
				resource: ['chain'],
			},
		},
	},

	// ---------------------------------------------------------------------------
	// List operations — pagination (paginateChain reads returnAll/limit by name).
	// ---------------------------------------------------------------------------
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: {
			show: {
				resource: ['chain'],
				operation: ['listDeployments', 'listLeases', 'listOrders', 'listBids', 'listCertificates'],
			},
		},
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: {
			minValue: 1,
		},
		description: 'Max number of results to return',
		displayOptions: {
			show: {
				resource: ['chain'],
				operation: ['listDeployments', 'listLeases', 'listOrders', 'listBids', 'listCertificates'],
				returnAll: [false],
			},
		},
	},

	// ---------------------------------------------------------------------------
	// List operations — optional filters (empty = unfiltered).
	// ---------------------------------------------------------------------------
	{
		displayName: 'Owner Address',
		name: 'owner',
		type: 'string',
		default: '',
		placeholder: 'akash1...',
		description:
			'Filter by the owner address (an akash1 bech32 address); leave blank for all owners',
		displayOptions: {
			show: {
				resource: ['chain'],
				operation: ['listDeployments', 'listLeases', 'listOrders', 'listBids', 'listCertificates'],
			},
		},
	},
	{
		displayName: 'Deployment Sequence',
		name: 'dseq',
		type: 'string',
		default: '',
		placeholder: 'e.g. 16122570',
		description: 'Filter by deployment sequence (DSEQ); leave blank for all deployments',
		displayOptions: {
			show: {
				resource: ['chain'],
				operation: ['listDeployments', 'listLeases', 'listOrders', 'listBids'],
			},
		},
	},
	{
		displayName: 'Provider Address',
		name: 'provider',
		type: 'string',
		default: '',
		placeholder: 'akash1...',
		description:
			'Filter by provider address (an akash1 bech32 address); leave blank for all providers',
		displayOptions: {
			show: {
				resource: ['chain'],
				operation: ['listLeases', 'listBids'],
			},
		},
	},
	{
		displayName: 'Group Sequence',
		name: 'gseq',
		type: 'number',
		default: 0,
		typeOptions: {
			minValue: 0,
		},
		description: 'Filter by group sequence (GSEQ); 0 means no filter',
		displayOptions: {
			show: {
				resource: ['chain'],
				operation: ['listLeases', 'listOrders', 'listBids'],
			},
		},
	},
	{
		displayName: 'Order Sequence',
		name: 'oseq',
		type: 'number',
		default: 0,
		typeOptions: {
			minValue: 0,
		},
		description: 'Filter by order sequence (OSEQ); 0 means no filter',
		displayOptions: {
			show: {
				resource: ['chain'],
				operation: ['listLeases', 'listOrders', 'listBids'],
			},
		},
	},
	{
		displayName: 'Serial',
		name: 'serial',
		type: 'string',
		default: '',
		placeholder: 'e.g. 1234',
		description: 'Filter by certificate serial number; leave blank for all serials',
		displayOptions: {
			show: {
				resource: ['chain'],
				operation: ['listCertificates'],
			},
		},
	},
	{
		displayName: 'State',
		name: 'state',
		type: 'string',
		default: '',
		description:
			'State filter (leave blank for all). By resource: deployments active/closed; leases active/insufficient_funds/closed; orders open/active/closed; bids open/active/lost/closed; certificates valid/revoked.',
		displayOptions: {
			show: {
				resource: ['chain'],
				operation: ['listDeployments', 'listLeases', 'listOrders', 'listBids', 'listCertificates'],
			},
		},
	},

	// ---------------------------------------------------------------------------
	// Get Deployment — DSEQ resourceLocator (from-list via searchChainDeployments).
	// ---------------------------------------------------------------------------
	{
		displayName: 'Deployment',
		name: 'dseq',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description:
			'The deployment to read — pick one from the discovered on-chain list or paste its DSEQ',
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: {
					searchListMethod: 'searchChainDeployments',
					searchable: true,
				},
			},
			{
				displayName: 'By DSEQ',
				name: 'id',
				type: 'string',
				hint: 'Enter the deployment sequence (DSEQ)',
				placeholder: 'e.g. 16122570',
			},
		],
		displayOptions: {
			show: {
				resource: ['chain'],
				operation: ['getDeployment'],
			},
		},
	},

	// ---------------------------------------------------------------------------
	// Get operations — id components.
	// ---------------------------------------------------------------------------
	{
		displayName: 'Owner Address',
		name: 'owner',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'akash1...',
		description: 'The owner address (an akash1 bech32 address) that identifies the record',
		displayOptions: {
			show: {
				resource: ['chain'],
				operation: ['getDeployment', 'getLease', 'getOrder', 'getBid'],
			},
		},
	},
	{
		displayName: 'Deployment Sequence',
		name: 'dseq',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 16122570',
		description: 'The deployment sequence (DSEQ) that identifies the record',
		displayOptions: {
			show: {
				resource: ['chain'],
				operation: ['getLease', 'getOrder', 'getBid'],
			},
		},
	},
	{
		displayName: 'Group Sequence',
		name: 'gseq',
		type: 'number',
		default: 1,
		typeOptions: {
			minValue: 1,
		},
		description: 'The group sequence (GSEQ) component of the lease, order or bid ID',
		displayOptions: {
			show: {
				resource: ['chain'],
				operation: ['getLease', 'getOrder', 'getBid'],
			},
		},
	},
	{
		displayName: 'Order Sequence',
		name: 'oseq',
		type: 'number',
		default: 1,
		typeOptions: {
			minValue: 1,
		},
		description: 'The order sequence (OSEQ) component of the lease, order or bid ID',
		displayOptions: {
			show: {
				resource: ['chain'],
				operation: ['getLease', 'getOrder', 'getBid'],
			},
		},
	},
	{
		displayName: 'Provider Address',
		name: 'provider',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'akash1...',
		description: 'The provider address (an akash1 bech32 address) component of the lease or bid ID',
		displayOptions: {
			show: {
				resource: ['chain'],
				operation: ['getLease', 'getBid'],
			},
		},
	},

	// ---------------------------------------------------------------------------
	// Get Balance — address + optional denom.
	// ---------------------------------------------------------------------------
	{
		displayName: 'Address',
		name: 'address',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'akash1...',
		description: 'The akash1 bech32 address whose on-chain token balances to read',
		displayOptions: {
			show: {
				resource: ['chain'],
				operation: ['getBalance'],
			},
		},
	},
	{
		displayName: 'Denomination',
		name: 'denom',
		type: 'string',
		default: '',
		placeholder: 'uakt',
		description:
			'Optional single denom to read (e.g. uakt); leave blank to return every denom the address holds',
		displayOptions: {
			show: {
				resource: ['chain'],
				operation: ['getBalance'],
			},
		},
	},
];
