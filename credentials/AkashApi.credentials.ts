import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

export class AkashApi implements ICredentialType {
	name = 'akashApi';

	displayName = 'Akash API';

	// The community `documentation-url-miscased` rule camelCases the whole value, so it
	// rejects any full URL; keep the real docs URL and suppress that main-repo-only rule.
	// eslint-disable-next-line n8n-nodes-base/cred-class-field-documentation-url-miscased
	documentationUrl = 'https://akash.network/docs';

	icon: Icon = { light: 'file:akash.svg', dark: 'file:akash.svg' };

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description:
				'Akash Console API key, sent as the x-api-key header. Create one at Akash Console → Settings → API Keys. Only needed for authenticated account/deployment operations — all public GPU/network/provider/chain reads run with no credential.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://console-api.akash.network',
			description:
				'The Akash Console API base URL. Leave the default unless you are targeting a self-hosted or proxy Console endpoint.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'x-api-key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl || "https://console-api.akash.network"}}',
			url: '/v1/user/me',
			method: 'GET',
		},
	};
}
