import type { INodeProperties } from 'n8n-workflow';

export const gpuOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['gpu'],
			},
		},
		options: [
			{
				name: 'Get Prices',
				value: 'getPrices',
				action: 'Get GPU marketplace prices',
				description:
					'Per-model GPU pricing (min/avg/weightedAverage/max USD) and availability across Akash providers — keyless, no spend',
			},
			{
				name: 'Get Inventory',
				value: 'getInventory',
				action: 'Get GPU cluster inventory',
				description: 'Live GPU availability across the Akash network — keyless, no spend',
			},
			{
				name: 'Get Models',
				value: 'getModels',
				action: 'Get available GPU models',
				description: 'List the GPU models offered on Akash — keyless, no spend',
			},
		],
		default: 'getPrices',
	},
];

export const gpuFields: INodeProperties[] = [];
