// Barrel for the Akash node's dynamic dropdown methods.
//
// v0.3.0 lights up the two resourceLocators the read planes introduced:
//   - listSearch.searchProviders        ↔ provider `providerAddress` (from `/v1/providers`)
//   - listSearch.searchChainDeployments ↔ chain deployment `dseq` (from chain deployments/list)
//
// The node spreads this barrel into its `methods` block:
//
//     import { loadOptions, listSearch } from './methods';
//     // ...
//     methods = { loadOptions, listSearch };
//
// Filling `listSearch` is purely additive — it never changes the node's `methods` wiring, so no
// router change is required. `loadOptions` stays empty: every v0.3.0 dropdown is an `options` field
// or a resourceLocator, none needs a dynamically loaded option set yet.

import { searchChainDeployments, searchProviders } from './listSearch';

export const loadOptions = {};

export const listSearch = { searchProviders, searchChainDeployments };
