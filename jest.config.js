// Jest configuration for the Akash node test suite.
//
// `npm test` requires `npm install` to have pulled the `jest` + `ts-jest` devDeps
// first (added to package.json by the integrator). ts-jest compiles the *.test.ts
// files on the fly; tsconfig.json intentionally does NOT include test/, so tests
// never land in dist/ and are never linted by the community-verification linter.
module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	testMatch: ['**/test/**/*.test.ts'],
};
