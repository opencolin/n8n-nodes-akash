import pkg from '../../package.json';

/**
 * Package-shape gate — the zero-runtime-dependency contract expressed as executable code.
 *
 * The Akash node speaks only to HTTP endpoints via n8n's built-in request helpers, so the
 * shipped package must carry NO runtime `dependencies` (devDependencies only). It must also
 * register exactly the compiled credential + node the `n8n` block points at, run under the
 * strict community-verification linter, and keep the scaffold-era homepage fix in place.
 *
 * This file lives under `test/`, which tsconfig.json intentionally does NOT include, so the
 * JSON import never lands in `dist/` and is never linted by the community verifier.
 */
describe('package shape (zero-runtime-dep gate)', () => {
	it('declares NO top-level runtime dependencies', () => {
		expect(pkg).not.toHaveProperty('dependencies');
	});

	it('runs under the strict community-verification linter', () => {
		expect(pkg.n8n.strict).toBe(true);
	});

	it('registers exactly the compiled AkashApi credential', () => {
		expect(pkg.n8n.credentials).toEqual(['dist/credentials/AkashApi.credentials.js']);
	});

	it('registers exactly the compiled Akash node', () => {
		expect(pkg.n8n.nodes).toEqual(['dist/nodes/Akash/Akash.node.js']);
	});

	it('pins the n8n nodes API version to 1', () => {
		expect(pkg.n8n.n8nNodesApiVersion).toBe(1);
	});

	it('points homepage at the Akash docs (guards the scaffold-homepage regression)', () => {
		expect(pkg.homepage).toBe('https://akash.network/docs');
	});

	it('is versioned 0.1.0', () => {
		expect(pkg.version).toBe('0.1.0');
	});
});
