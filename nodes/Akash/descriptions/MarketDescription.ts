import type { INodeProperties } from 'n8n-workflow';

export const marketOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['market'],
			},
		},
		options: [
			{
				name: 'Estimate Cost',
				value: 'estimate',
				action: 'Estimate deployment cost',
				description:
					'Estimate the monthly cost of a CPU/memory/storage spec on Akash versus AWS, GCP and Azure — public, keyless, non-spending',
			},
			{
				name: 'Screen Providers',
				value: 'screenBids',
				action: 'Screen providers for a deployment spec',
				description:
					'Screen which providers can host a deployment spec and meet its bid requirements — public, keyless, non-spending',
			},
		],
		default: 'estimate',
	},
];

export const marketFields: INodeProperties[] = [
	// ---------------------------------------------------------------------------
	// Estimate Cost — POST /v1/pricing (cpu/memory/storage numbers)
	// ---------------------------------------------------------------------------
	{
		displayName: 'CPU (Millicores)',
		name: 'cpu',
		type: 'number',
		default: 1000,
		required: true,
		typeOptions: {
			minValue: 0,
		},
		description: 'CPU in thousandths of a vCPU. 1000 = 1 vCPU.',
		displayOptions: {
			show: {
				resource: ['market'],
				operation: ['estimate'],
			},
		},
	},
	{
		displayName: 'Memory (Bytes)',
		name: 'memory',
		type: 'number',
		default: 1073741824,
		required: true,
		typeOptions: {
			minValue: 0,
		},
		description: 'Memory in bytes. 1073741824 = 1 GiB.',
		displayOptions: {
			show: {
				resource: ['market'],
				operation: ['estimate'],
			},
		},
	},
	{
		displayName: 'Storage (Bytes)',
		name: 'storage',
		type: 'number',
		default: 1073741824,
		required: true,
		typeOptions: {
			minValue: 0,
		},
		description: 'Ephemeral storage in bytes. 1073741824 = 1 GiB.',
		displayOptions: {
			show: {
				resource: ['market'],
				operation: ['estimate'],
			},
		},
	},

	// ---------------------------------------------------------------------------
	// Screen Providers — POST /v1/bid-screening (resource-units strings)
	// ---------------------------------------------------------------------------
	{
		displayName: 'CPU (Millicores)',
		name: 'cpuUnits',
		type: 'string',
		default: '1000',
		description: 'CPU units in millicores, as a string. 1000 = 1 vCPU.',
		displayOptions: {
			show: {
				resource: ['market'],
				operation: ['screenBids'],
			},
		},
	},
	{
		displayName: 'Memory (Bytes)',
		name: 'memoryQuantity',
		type: 'string',
		default: '1073741824',
		description: 'Memory in bytes, as a string. 1073741824 = 1 GiB.',
		displayOptions: {
			show: {
				resource: ['market'],
				operation: ['screenBids'],
			},
		},
	},
	{
		displayName: 'GPU Units',
		name: 'gpuUnits',
		type: 'string',
		default: '0',
		description: 'GPU unit count, as a string. Use 0 for a CPU-only deployment.',
		displayOptions: {
			show: {
				resource: ['market'],
				operation: ['screenBids'],
			},
		},
	},
	{
		displayName: 'Storage (Bytes)',
		name: 'storageQuantity',
		type: 'string',
		default: '1073741824',
		description: 'Ephemeral storage in bytes, as a string. 1073741824 = 1 GiB.',
		displayOptions: {
			show: {
				resource: ['market'],
				operation: ['screenBids'],
			},
		},
	},
	{
		displayName: 'Replica Count',
		name: 'count',
		type: 'number',
		default: 1,
		typeOptions: {
			minValue: 1,
		},
		description: 'Number of replicas of this resource group',
		displayOptions: {
			show: {
				resource: ['market'],
				operation: ['screenBids'],
			},
		},
	},
	{
		displayName: 'Price Denom',
		name: 'priceDenom',
		type: 'string',
		default: 'uakt',
		description: 'Denomination of the max bid price, e.g. uakt or an IBC stablecoin denom',
		displayOptions: {
			show: {
				resource: ['market'],
				operation: ['screenBids'],
			},
		},
	},
	{
		displayName: 'Max Price Amount',
		name: 'priceAmount',
		type: 'string',
		default: '10000',
		description: 'Maximum bid price per block, as an integer string in the chosen denom',
		displayOptions: {
			show: {
				resource: ['market'],
				operation: ['screenBids'],
			},
		},
	},
	{
		displayName: 'Timezone',
		name: 'timezone',
		type: 'string',
		default: 'America/Chicago',
		required: true,
		description: 'Client IANA timezone used to screen provider availability, e.g. America/Chicago',
		displayOptions: {
			show: {
				resource: ['market'],
				operation: ['screenBids'],
			},
		},
	},
	{
		displayName: 'Reclamation Window (Seconds)',
		name: 'reclamationWindow',
		type: 'number',
		default: 0,
		typeOptions: {
			minValue: 0,
		},
		description:
			'Optional. When greater than 0, only providers whose reclamation window is at least this many seconds are considered.',
		displayOptions: {
			show: {
				resource: ['market'],
				operation: ['screenBids'],
			},
		},
	},
];
