import type { INodeProperties } from 'n8n-workflow';

export const providerOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['provider'],
			},
		},
		// Options are alphabetized by `name` (n8n lint requires it for 5+ options).
		options: [
			{
				name: 'Get',
				value: 'get',
				action: 'Get a provider',
				description:
					'Get one provider by owner address, including uptime1d/7d/30d, isOnline, isAudited, per-attribute auditedBy and capacity stats — keyless, no spend',
			},
			{
				name: 'Get Earnings',
				value: 'getEarnings',
				action: 'Get provider earnings',
				description: 'Get earnings for a provider by owner address — keyless, no spend',
			},
			{
				name: 'Get Regions',
				value: 'getRegions',
				action: 'Get provider regions',
				description:
					'List the provider regions advertised on Akash and how many providers serve each — keyless, no spend',
			},
			{
				name: 'Get Status',
				value: 'getStatus',
				action: 'Get provider gateway status',
				description:
					'Read a provider gateway :8443 /status and /version (live cluster inventory and daemon version) via its on-chain hostUri — keyless, no spend',
			},
			{
				name: 'List',
				value: 'list',
				action: 'List providers',
				description:
					'List Akash providers with uptime, online and audit status, GPU models and capacity — keyless, no spend',
			},
		],
		default: 'list',
	},
];

export const providerFields: INodeProperties[] = [
	// ---------------------------------------------------------------------------
	// Provider address resourceLocator — Get / Get Status
	// ---------------------------------------------------------------------------
	{
		displayName: 'Provider',
		name: 'providerAddress',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: 'The provider to read — pick it from the list or paste its owner address',
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: {
					searchListMethod: 'searchProviders',
					searchable: true,
				},
			},
			{
				displayName: 'By Address',
				name: 'id',
				type: 'string',
				hint: 'Provider owner address (akash1…)',
				placeholder: 'akash1...',
				validation: [
					{
						type: 'regex',
						properties: {
							regex: '^akash1[0-9a-z]{38,}$',
							errorMessage: 'Enter a valid akash1… owner address',
						},
					},
				],
			},
		],
		displayOptions: {
			show: {
				resource: ['provider'],
				operation: ['get', 'getStatus'],
			},
		},
	},

	// ---------------------------------------------------------------------------
	// Owner address — Get Earnings
	// ---------------------------------------------------------------------------
	{
		displayName: 'Owner Address',
		name: 'owner',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'akash1...',
		description: 'The provider owner address (akash1…) to fetch earnings for',
		displayOptions: {
			show: {
				resource: ['provider'],
				operation: ['getEarnings'],
			},
		},
	},
	{
		displayName: 'From',
		name: 'from',
		type: 'dateTime',
		default: '',
		description: 'Optional start of the earnings window. Left empty uses the endpoint default.',
		displayOptions: {
			show: {
				resource: ['provider'],
				operation: ['getEarnings'],
			},
		},
	},
	{
		displayName: 'To',
		name: 'to',
		type: 'dateTime',
		default: '',
		description: 'Optional end of the earnings window. Left empty uses the endpoint default.',
		displayOptions: {
			show: {
				resource: ['provider'],
				operation: ['getEarnings'],
			},
		},
	},

	// ---------------------------------------------------------------------------
	// List — pagination + client-side filters
	// ---------------------------------------------------------------------------
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: {
			show: {
				resource: ['provider'],
				operation: ['list'],
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
				resource: ['provider'],
				operation: ['list'],
				returnAll: [false],
			},
		},
	},
	{
		displayName: 'Only Online',
		name: 'onlyOnline',
		type: 'boolean',
		default: false,
		description: 'Whether to keep only providers that are currently online',
		displayOptions: {
			show: {
				resource: ['provider'],
				operation: ['list'],
			},
		},
	},
	{
		displayName: 'Only Audited',
		name: 'onlyAudited',
		type: 'boolean',
		default: false,
		description: 'Whether to keep only providers that have audited attributes',
		displayOptions: {
			show: {
				resource: ['provider'],
				operation: ['list'],
			},
		},
	},
];
