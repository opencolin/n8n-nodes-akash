import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { chainRestRequest } from '../../../transport/chainRestRequest';

/**
 * Chain → Get Balance — `GET /cosmos/bank/v1beta1/balances/{address}`.
 *
 * KEYLESS on-chain read (Cosmos LCD, no `x-api-key`, no spend). Reads the token
 * balances held by an `akash1…` address from the standard Cosmos `bank` module.
 * `bank` has no Akash module version, so the path is hard-coded literally (there is
 * no `chainPaths` helper for it).
 *
 * Akash is MULTI-DENOM: an address may hold `uakt`, `uact`, and/or IBC denoms
 * (e.g. USDC `ibc/170C67…`). Bank amounts are opaque INTEGER strings — never assume
 * `uakt`, never coerce to a number, and surface every denom the chain returns.
 *
 *  - No `denom` set → `.../balances/{address}` → `{ balances:[{denom,amount}], pagination }`
 *    (all denoms held).
 *  - `denom` set → `.../balances/{address}/by_denom?denom=<denom>` → `{ balance:{denom,amount} }`
 *    (that single denom; zero-amount when the address does not hold it).
 */
export async function executeChainGetBalance(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const address = (this.getNodeParameter('address', itemIndex, '') as string).trim();
	const denom = (this.getNodeParameter('denom', itemIndex, '') as string).trim();

	const encodedAddress = encodeURIComponent(address);
	const basePath = `/cosmos/bank/v1beta1/balances/${encodedAddress}`;

	// With a denom → the single-denom `/by_denom` sub-path; without → all denoms held.
	const endpoint = denom ? `${basePath}/by_denom` : basePath;
	const qs: IDataObject = {};
	if (denom) {
		qs.denom = denom;
	}

	return chainRestRequest.call(this, endpoint, { qs, itemIndex });
}
