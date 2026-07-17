import type { INodeProperties } from 'n8n-workflow';

/**
 * Account resource — AUTHED, NON-SPENDING managed-wallet reads (resource value `account`).
 *
 * Every operation is an `x-api-key` GET against the Console managed-wallet plane — credit balance
 * (`GET /v1/balances`), usage history (`GET /v1/usage/history[/stats]`), managed wallets
 * (`GET /v1/wallets`), rolling weekly cost (`GET /v1/weekly-cost`), and the identity behind the key
 * (`GET /v1/user/me`). None moves funds: each is a plain read. The `akashApi` credential is
 * `required: false` at the node level so keyless public reads elsewhere still work; these ops simply
 * return a normalized 401 without a key.
 *
 * The operation options are alphabetized by name (n8n lint requires it once an options field has 5+
 * entries).
 */

export const accountOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['account'],
			},
		},
		options: [
			{
				name: 'Get Balance',
				value: 'getBalance',
				action: 'Get the managed wallet credit balance',
				description:
					'Read the managed wallet USD credit balance behind the attached API key — authed x-api-key read, no spend',
			},
			{
				name: 'Get Usage History',
				value: 'getUsage',
				action: 'Get account usage history',
				description:
					'Read billing and usage history for an address over an optional date window, or its aggregate statistics — authed x-api-key read, no spend',
			},
			{
				name: 'Get Wallets',
				value: 'getWallets',
				action: 'Get managed wallets',
				description:
					'List the managed wallet records for a user, including chain address, USD credit and trial flag — authed x-api-key read, no spend',
			},
			{
				name: 'Get Weekly Cost',
				value: 'getWeeklyCost',
				action: 'Get the rolling weekly cost',
				description:
					'Read the managed wallet rolling weekly spend figure — authed x-api-key read, no spend',
			},
			{
				name: 'Who Am I',
				value: 'whoami',
				action: 'Get the current user',
				description:
					'Resolve the user identity behind the attached API key (the credential-test endpoint) — authed x-api-key read, no spend',
			},
		],
		default: 'getBalance',
	},
];

export const accountFields: INodeProperties[] = [
	// ---------------------------------------------------------------------------
	// Get Usage History — optional address + date window + statistics toggle.
	// ---------------------------------------------------------------------------
	{
		displayName: 'Address',
		name: 'address',
		type: 'string',
		default: '',
		placeholder: 'akash1...',
		description:
			'Owner address (an akash1 bech32 address) to read usage for; leave empty to let the managed wallet owner be inferred',
		displayOptions: {
			show: {
				resource: ['account'],
				operation: ['getUsage'],
			},
		},
	},
	{
		displayName: 'Start Date',
		name: 'startDate',
		type: 'string',
		default: '',
		placeholder: 'e.g. 2026-07-01',
		description: 'Start of the usage window (ISO date); forwarded only when set',
		displayOptions: {
			show: {
				resource: ['account'],
				operation: ['getUsage'],
			},
		},
	},
	{
		displayName: 'End Date',
		name: 'endDate',
		type: 'string',
		default: '',
		placeholder: 'e.g. 2026-07-17',
		description: 'End of the usage window (ISO date); forwarded only when set',
		displayOptions: {
			show: {
				resource: ['account'],
				operation: ['getUsage'],
			},
		},
	},
	{
		displayName: 'Aggregate Statistics',
		name: 'statistics',
		type: 'boolean',
		default: false,
		description:
			'Whether to return aggregate usage statistics (/v1/usage/history/stats) instead of the raw history',
		displayOptions: {
			show: {
				resource: ['account'],
				operation: ['getUsage'],
			},
		},
	},

	// ---------------------------------------------------------------------------
	// Get Wallets — required userId query param.
	// ---------------------------------------------------------------------------
	{
		displayName: 'User ID',
		name: 'userId',
		type: 'string',
		default: '',
		required: true,
		description:
			'The user ID whose managed wallets to list (required by the endpoint); resolve it from Who Am I when unknown',
		displayOptions: {
			show: {
				resource: ['account'],
				operation: ['getWallets'],
			},
		},
	},
];
