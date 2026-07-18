import type { INodeProperties } from 'n8n-workflow';

export const templateOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['template'],
			},
		},
		// Options are alphabetized by `name` per n8n lint.
		options: [
			{
				name: 'Get',
				value: 'get',
				action: 'Get a template',
				description: 'Get one awesome-akash template by ID — keyless, no spend',
			},
			{
				name: 'List',
				value: 'list',
				action: 'List templates',
				description:
					'List the awesome-akash template catalog grouped by category — keyless, no spend',
			},
		],
		default: 'list',
	},
];

export const templateFields: INodeProperties[] = [
	// ---------------------------------------------------------------------------
	// Template id resourceLocator — Get
	// ---------------------------------------------------------------------------
	{
		displayName: 'Template',
		name: 'templateId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: 'The template to read — pick it from the catalog or paste its template ID',
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: {
					searchListMethod: 'searchTemplates',
					searchable: true,
				},
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				hint: 'awesome-akash template ID',
				placeholder: 'akash-network-awesome-akash-comfyui',
			},
		],
		displayOptions: {
			show: {
				resource: ['template'],
				operation: ['get'],
			},
		},
	},
];
