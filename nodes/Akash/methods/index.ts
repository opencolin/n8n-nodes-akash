// Barrel for the Akash node's dynamic dropdown methods.
//
// v0.3.0 lit up the two keyless resourceLocators the read planes introduced:
//   - listSearch.searchProviders        ↔ provider `providerAddress` (from `/v1/providers`)
//   - listSearch.searchChainDeployments ↔ chain deployment `dseq` (from chain deployments/list)
//
// v0.4.0 adds the authed managed-wallet deployment picker:
//   - listSearch.searchDeployments      ↔ deployment/bid `dseq` (from authed `GET /v1/deployments`)
//
// v1.0.0 adds the keyless awesome-akash template picker:
//   - listSearch.searchTemplates        ↔ template `templateId` (from keyless `GET /v1/templates-list`)
//
// The node spreads this barrel into its `methods` block:
//
//     import { loadOptions, listSearch } from './methods';
//     // ...
//     methods = { loadOptions, listSearch };
//
// Filling `listSearch` is purely additive — it never changes the node's `methods` wiring, so no
// router change is required. `loadOptions` stays empty: every dropdown so far is an `options` field
// or a resourceLocator, none needs a dynamically loaded option set yet.

import {
	searchChainDeployments,
	searchDeployments,
	searchProviders,
	searchTemplates,
} from './listSearch';

export const loadOptions = {};

export const listSearch = {
	searchProviders,
	searchChainDeployments,
	searchDeployments,
	searchTemplates,
};
