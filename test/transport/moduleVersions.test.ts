import { CHAIN_MODULE_VERSIONS, chainPaths } from '../../nodes/Akash/transport/chainRestRequest';

/**
 * The 501 regression gate, as a unit test.
 *
 * Akash 2.x bumped the Cosmos module versions; the old `v1beta3` paths are DEAD (HTTP 501). The
 * pinned versions live in `CHAIN_MODULE_VERSIONS` and every path is built from them via
 * `chainPaths.*`. This test asserts (a) the pins are exactly the VERIFIED set and (b) no built path
 * ever reintroduces a dead version — so a regression that hardcodes `v1beta3` (or the dead
 * `market/v1beta4`) fails here instead of at runtime with a 501.
 */
describe('CHAIN_MODULE_VERSIONS', () => {
	it('pins exactly the VERIFIED Akash 2.x module versions', () => {
		expect(CHAIN_MODULE_VERSIONS).toEqual({
			deployment: 'v1beta4',
			market: 'v1beta5',
			provider: 'v1beta4',
			cert: 'v1',
		});
	});
});

describe('chainPaths — 501 regression gate', () => {
	const builtPaths: Array<[string, string]> = Object.entries(chainPaths).map(([name, fn]) => [
		name,
		(fn as () => string)(),
	]);

	it.each(builtPaths)('path %s (%s) contains no dead v1beta3 segment', (_name, path) => {
		expect(path).not.toContain('v1beta3');
	});

	it('deployment paths carry the pinned deployment/v1beta4 version', () => {
		expect(chainPaths.deploymentsList()).toContain('/deployment/v1beta4/');
		expect(chainPaths.deploymentInfo()).toContain('/deployment/v1beta4/');
	});

	it('market paths use market/v1beta5, not the dead market/v1beta4 routes', () => {
		const marketBuilders = [
			chainPaths.leasesList,
			chainPaths.leaseInfo,
			chainPaths.ordersList,
			chainPaths.orderInfo,
			chainPaths.bidsList,
			chainPaths.bidInfo,
		];
		for (const builder of marketBuilders) {
			expect(builder()).toContain('/market/v1beta5/');
			expect(builder()).not.toContain('v1beta4');
		}
	});

	it('certificate path carries the pinned cert/v1 version', () => {
		expect(chainPaths.certificatesList()).toContain('/cert/v1/');
		expect(chainPaths.certificatesList()).not.toContain('v1beta');
	});
});
