import type { INodeProperties } from 'n8n-workflow';

/**
 * Bid resource — the AUTHED, NON-SPENDING managed-wallet bid poll (resource value `bid`).
 *
 * `listForDeployment` is an `x-api-key` GET of `GET /v1/bids?dseq=` — the provider bids placed
 * against one managed deployment, the poll step between Create and (v1.1.0) lease selection. It is
 * distinct from the keyless chain `market/v1beta5/bids` reads under the Chain resource, and moves no
 * funds: no bid is accepted, no lease is taken.
 *
 * The `dseq` resourceLocator reuses `searchDeployments` (the managed `/v1/deployments` list) and is
 * gated to `resource: ['bid']`, so it never collides with the Deployment resource's own `dseq`
 * fields — the same established disjoint-displayOptions pattern used across the node.
 */

export const bidOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['bid'],
			},
		},
		options: [
			{
				name: 'List for Deployment',
				value: 'listForDeployment',
				action: 'List bids for a deployment',
				description:
					'List the provider bids placed against one managed deployment by DSEQ — authed x-api-key read, no spend',
			},
		],
		default: 'listForDeployment',
	},
];

export const bidFields: INodeProperties[] = [
	// ---------------------------------------------------------------------------
	// List for Deployment — DSEQ resourceLocator (from-list via searchDeployments).
	// ---------------------------------------------------------------------------
	{
		displayName: 'Deployment',
		name: 'dseq',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: 'The managed deployment to poll bids for — pick one from the list or paste its DSEQ',
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: {
					searchListMethod: 'searchDeployments',
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
				resource: ['bid'],
				operation: ['listForDeployment'],
			},
		},
	},
];
