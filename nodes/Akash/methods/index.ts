// Barrel for the Akash node's dynamic dropdown methods.
//
// v0.1.0 ships no dynamic dropdowns: the keyless GPU + network read ops take no
// id inputs, so there is nothing to populate from a listSearch/loadOptions call
// yet. The barrel is intentionally empty but present so the node can spread it
// into its `methods` block today and stay forward-compatible:
//
//     import { loadOptions, listSearch } from './methods';
//     // ...
//     methods = { loadOptions, listSearch };
//
// The real methods land in 0.3.0 alongside resourceLocators:
//   - listSearch.searchProviders        ↔ provider `address` (from `/v1/providers`)
//   - listSearch.searchChainDeployments ↔ chain deployment `dseq` (from chain deployments/list)
//   - loadOptions.*                     ↔ any option-style dropdowns introduced then
//
// Filling these objects is purely additive — it never changes the node's
// `methods` wiring, so no coordination with the router is required at that point.

export const loadOptions = {};

export const listSearch = {};
