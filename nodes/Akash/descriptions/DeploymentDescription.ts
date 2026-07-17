import type { INodeProperties } from 'n8n-workflow';

/**
 * Deployment resource — managed-wallet deployment reads (resource value `deployment`) plus the
 * ZERO-SPEND dry-run Create request-builder.
 *
 * `list` / `get` are AUTHED, NON-SPENDING `x-api-key` reads of the Console managed-wallet plane
 * (`GET /v1/deployments`, `GET /v1/deployments/{dseq}` — poll-based `leases[].status.services`
 * status, explicitly NOT logs). `getPublic` is a KEYLESS public read
 * (`GET /v1/deployment/{owner}/{dseq}`). None of the three moves funds.
 *
 * `create` is the write-path SHAPE de-risker: it builds + validates the `POST /v1/deployments` body
 * `{ data: { sdl, deposit } }` and, with `dryRun` DEFAULT TRUE, returns that request and sends
 * NOTHING. Turning `dryRun` off would spend real mainnet USD credit through the Console managed
 * wallet and is disabled until v1.1.0 — so this op is a WRITE op and is NOT exposed as an AI-Agent
 * tool (the node's `usableAsTool` gating lives in `Akash.node.ts`).
 *
 * The `sdlSource` / `sdl` / `sdlBinaryProperty` field names are LOAD-BEARING — the shared
 * `resolveSdl` helper reads them by those exact names. `returnAll` / `limit` mirror the
 * ChainDescription pattern so `paginateConsole` finds them.
 */

export const deploymentOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['deployment'],
			},
		},
		options: [
			{
				name: 'Create (Dry Run)',
				value: 'create',
				action: 'Build a deployment create request without spending',
				description:
					'Build and validate the POST /v1/deployments request from an SDL, returning it WITHOUT sending it. Dry Run defaults on; turning it off would spend real mainnet USD credit through the Console managed wallet and is disabled until v1.1.0.',
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a managed deployment',
				description:
					'Get one managed deployment by DSEQ, including its leases and per-service status (URIs, replicas, forwarded ports, IPs) — authed x-api-key read, no spend',
			},
			{
				name: 'Get Public',
				value: 'getPublic',
				action: 'Get a public deployment',
				description: 'Get a public deployment detail by owner address and DSEQ — keyless, no spend',
			},
			{
				name: 'List',
				value: 'list',
				action: 'List managed deployments',
				description:
					'List the deployments owned by the wallet behind the attached API key — authed x-api-key read, no spend',
			},
		],
		default: 'list',
	},
];

export const deploymentFields: INodeProperties[] = [
	// ---------------------------------------------------------------------------
	// List — pagination (paginateConsole reads returnAll/limit by name).
	// ---------------------------------------------------------------------------
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: {
			show: {
				resource: ['deployment'],
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
				resource: ['deployment'],
				operation: ['list'],
				returnAll: [false],
			},
		},
	},

	// ---------------------------------------------------------------------------
	// Get — DSEQ resourceLocator (from-list via searchDeployments).
	// ---------------------------------------------------------------------------
	{
		displayName: 'Deployment',
		name: 'dseq',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description:
			'The managed deployment to read — pick one from the discovered list or paste its DSEQ',
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
				resource: ['deployment'],
				operation: ['get'],
			},
		},
	},

	// ---------------------------------------------------------------------------
	// Get Public — owner + DSEQ (plain strings, keyless).
	// ---------------------------------------------------------------------------
	{
		displayName: 'Owner Address',
		name: 'owner',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'akash1...',
		description: 'The owner address (an akash1 bech32 address) that owns the deployment',
		displayOptions: {
			show: {
				resource: ['deployment'],
				operation: ['getPublic'],
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
		description: 'The deployment sequence (DSEQ) that identifies the deployment',
		displayOptions: {
			show: {
				resource: ['deployment'],
				operation: ['getPublic'],
			},
		},
	},

	// ---------------------------------------------------------------------------
	// Create (Dry Run) — SDL ingest + deposit + the spend-blocking dryRun toggle.
	// The sdlSource / sdl / sdlBinaryProperty names are read verbatim by resolveSdl.
	// ---------------------------------------------------------------------------
	{
		displayName: 'SDL Source',
		name: 'sdlSource',
		type: 'options',
		default: 'string',
		description: 'Where to read the SDL deployment manifest from',
		options: [
			{
				name: 'Binary',
				value: 'binary',
				description: 'Read the SDL from an uploaded binary property (e.g. a deploy.yaml file)',
			},
			{
				name: 'String',
				value: 'string',
				description: 'Provide the SDL YAML inline as an expression string',
			},
		],
		displayOptions: {
			show: {
				resource: ['deployment'],
				operation: ['create'],
			},
		},
	},
	{
		displayName: 'SDL',
		name: 'sdl',
		type: 'string',
		default: '',
		typeOptions: {
			rows: 8,
		},
		placeholder: 'version: "2.0"\nservices:\n  web:\n    image: nginx',
		description: 'The SDL deployment manifest as a YAML string; passed to Console verbatim',
		displayOptions: {
			show: {
				resource: ['deployment'],
				operation: ['create'],
				sdlSource: ['string'],
			},
		},
	},
	{
		displayName: 'SDL Binary Property',
		name: 'sdlBinaryProperty',
		type: 'string',
		default: 'data',
		description: 'Name of the binary property holding the uploaded SDL file (e.g. deploy.yaml)',
		displayOptions: {
			show: {
				resource: ['deployment'],
				operation: ['create'],
				sdlSource: ['binary'],
			},
		},
	},
	{
		displayName: 'Deposit (USD)',
		name: 'deposit',
		type: 'number',
		default: 5,
		typeOptions: {
			minValue: 0,
		},
		description:
			'The escrow deposit to fund the deployment with, in USD (Console deposits are USD numbers, not uakt)',
		displayOptions: {
			show: {
				resource: ['deployment'],
				operation: ['create'],
			},
		},
	},
	{
		displayName: 'Dry Run',
		name: 'dryRun',
		type: 'boolean',
		default: true,
		description:
			'Whether to only build and return the deployment-create request without sending it. Turning this OFF would submit a real deployment through the Console managed wallet and spend real mainnet USD credit — the live send path is disabled until v1.1.0, so leave this on.',
		displayOptions: {
			show: {
				resource: ['deployment'],
				operation: ['create'],
			},
		},
	},
];
