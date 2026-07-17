import type { INodeProperties } from 'n8n-workflow';

export const networkOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['network'],
			},
		},
		options: [
			{
				name: 'Get Capacity',
				value: 'getCapacity',
				action: 'Get network capacity',
				description:
					'Live cpu/gpu/memory/storage capacity and active provider count — keyless, no spend',
			},
			{
				name: 'Get Stats',
				value: 'getStats',
				action: 'Get network dashboard stats',
				description:
					'Network dashboard: chain stats, leases, spend, active GPU, staking APR, height — keyless, no spend',
			},
		],
		default: 'getCapacity',
	},
];

export const networkFields: INodeProperties[] = [];
