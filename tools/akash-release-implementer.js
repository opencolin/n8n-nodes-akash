export const meta = {
  name: 'akash-release-implementer',
  description: 'Implement one release of n8n-nodes-akash in its git worktree: plan-partition, parallel build, integrate, verify, review, fix',
  phases: [
    { title: 'Partition', detail: 'split release scope into disjoint work packages' },
    { title: 'Build', detail: 'parallel builder agents in the release worktree' },
    { title: 'Integrate', detail: 'wire package.json, npm build+lint until green' },
    { title: 'Review', detail: 'acceptance-criteria reviewers' },
    { title: 'Fix', detail: 'address confirmed review issues' },
  ],
}

const { version, worktree, repo } = args
const CONTEXT = `Project: n8n-nodes-akash — an n8n community node for Akash Network (decentralized compute marketplace).
You are working on release v${version} INSIDE the git worktree at ${worktree} (branch release/v${version}). ALL file edits must happen under ${worktree} — never touch ${repo} itself (that is the main checkout; ${worktree} shares its git history).
Authoritative inputs (read before doing anything):
- ${worktree}/docs/plans/RELEASE-PLAN.md — your release's section "v${version}" plus the "Guidance for implementation agents" section and its endpoint reference.
- ${worktree}/docs/research/ — console-api.md (Console API: x-api-key), chain-rest.md (keyless LCD hosts + pinned module versions), provider-services.md (:8443 gateway), sdl-and-tx-flow.md, ecosystem.md. VERIFIED/UNVERIFIED markers matter.
- ${worktree}/docs/plans/ORCHESTRATION.md — playbook + hard rules.
Key facts (auth model LOCKED by the council): primary = Akash Console API, single x-api-key header, managed wallet signs server-side; secondary = keyless Cosmos chain LCD REST (mainnet api.akashnet.net, sandbox-2 api.sandbox-2.aksh.pw; next_key pagination, pinned module versions per RELEASE-PLAN); tertiary = provider gateway :8443 (keyless, skipSslCertificateValidation). NO mnemonic handling, NO cosmjs/akashjs runtime deps — zero runtime deps total. FINANCIAL BOUNDARY: no code path may spend funds implicitly; live gates marked HUMAN-ONLY-SPENDS are never executed by agents; keyless public GETs against LCD/provider endpoints ARE allowed and encouraged for live verification during this build.
n8n conventions: programmatic node style, n8n-workflow types only, tabs for indentation (prettier config), strict TypeScript must compile, follow the sibling project /Users/colin/Code/n8n (n8n-nodes-tenki, shipped v2.1.0) for layout/idioms: resources/<name>/<op>.ts, descriptions/, transport/ with normalized errors + pagination helpers, dynamic error-map test.`

phase('Partition')
const PARTITION_SCHEMA = {
  type: 'object', required: ['packages', 'integratorInstructions'],
  properties: {
    packages: {
      type: 'array', minItems: 1, maxItems: 4,
      items: {
        type: 'object', required: ['name', 'files', 'instructions'],
        properties: {
          name: { type: 'string' },
          files: { type: 'array', items: { type: 'string' }, description: 'worktree-relative file paths this package exclusively owns' },
          instructions: { type: 'string', description: 'complete self-contained build instructions incl. relevant scope items from the plan' },
        },
      },
    },
    integratorInstructions: { type: 'string', description: 'wiring work reserved for the single integrator: package.json n8n block + version bump, cross-file glue, anything touching shared files' },
  },
}
const partition = await agent(`${CONTEXT}

Read the v${version} section of RELEASE-PLAN.md and partition its scope checklist into 1-4 work packages with STRICTLY DISJOINT file sets (no two packages may list or edit the same file; shared/wiring files like package.json, index files, or files another package creates that need later edits go to the integrator). Each package's instructions must be self-contained: quote the relevant scope items, name exact files, describe expected exports/imports between packages so they compose without the builders talking to each other. Keep interfaces explicit (e.g. "transport exports async function tenkiApiRequest(this: IExecuteFunctions, ...): Promise<IDataObject>").`, { label: 'partition', phase: 'Partition', schema: PARTITION_SCHEMA })

log(`v${version}: ${partition.packages.length} work packages: ${partition.packages.map(p => p.name).join(', ')}`)

phase('Build')
const buildReports = await parallel(partition.packages.map(p => () =>
  agent(`${CONTEXT}

You are the builder for work package "${p.name}". You exclusively own these files (create/edit ONLY these): ${p.files.join(', ')}

Instructions:
${p.instructions}

Write complete, production-quality code (no TODOs, no placeholder bodies). Match the plan's conventions exactly (resources/<name>/<op>.ts layout, error normalization, lowerCamelCase JSON fields). Do not run npm install/build (the integrator will) — but keep TypeScript strict-safe. Do not commit. Return a short report: files written and any interface notes the integrator needs.`, { label: `build:${p.name}`, phase: 'Build' })
))

phase('Integrate')
const integration = await agent(`${CONTEXT}

You are the integrator for v${version}. The builders finished these packages:
${buildReports.filter(Boolean).map((r, i) => `--- ${partition.packages[i]?.name ?? 'pkg' + i} ---\n${r}`).join('\n')}

Integrator instructions from the planner:
${partition.integratorInstructions}

Do, in the worktree ${worktree}:
1. Wiring: package.json "n8n" block (dist/ paths for credentials + nodes), bump "version" to "${version}", any cross-file glue the builders left.
2. Run: cd ${worktree} && npm run build && npm run lint  (node_modules is already installed). Fix EVERY error — iterate until both are fully green. You may edit any file to get there.
3. Check dist/ contains exactly the files package.json's n8n block references.
Do not commit. Return: GREEN or NOT-GREEN, plus the final build/lint output tail and a list of files you changed.`, { label: 'integrate', phase: 'Integrate' })

phase('Review')
const REVIEW_SCHEMA = {
  type: 'object', required: ['issues'],
  properties: {
    issues: {
      type: 'array',
      items: {
        type: 'object', required: ['file', 'summary', 'severity'],
        properties: { file: { type: 'string' }, summary: { type: 'string' }, severity: { enum: ['blocker', 'major', 'minor'] } },
      },
    },
    deferredLiveGates: { type: 'array', items: { type: 'string' } },
  },
}
const reviews = await parallel([
  `acceptance-criteria audit: go through EVERY acceptance item in the v${version} section of RELEASE-PLAN.md; verify each against the actual code (read the files). Items requiring a live tk_ key: list under deferredLiveGates, not issues.`,
  `correctness & conventions review: wire-protocol fidelity vs docs/research/rest-endpoints.md (paths, headers, field casing), n8n node conventions (displayOptions, credential test, error handling via NodeApiError, continueOnFail), TypeScript strictness, no unused/dead code.`,
].map((lens, i) => () =>
  agent(`${CONTEXT}

You are reviewer ${i + 1} for release v${version}. Integration report:
${integration}

Lens: ${lens}

Only report real, confirmed defects (read the code first); do not speculate. severity=blocker only if the release must not merge.`, { label: `review:${i + 1}`, phase: 'Review', schema: REVIEW_SCHEMA })
))

const issues = reviews.filter(Boolean).flatMap(r => r.issues).filter(i => i.severity !== 'minor')
const deferred = [...new Set(reviews.filter(Boolean).flatMap(r => r.deferredLiveGates || []))]

phase('Fix')
let fixReport = 'no fixes needed'
if (issues.length) {
  log(`${issues.length} blocker/major issues to fix`)
  fixReport = await agent(`${CONTEXT}

Fix these confirmed review issues in the worktree, then re-run cd ${worktree} && npm run build && npm run lint until green:
${JSON.stringify(issues, null, 2)}

Do not commit. Return GREEN or NOT-GREEN plus what you changed.`, { label: 'fix', phase: 'Fix' })
} else {
  log('no blocker/major issues from review')
}

const minorIssues = reviews.filter(Boolean).flatMap(r => r.issues).filter(i => i.severity === 'minor')
return {
  version,
  integration: String(integration).slice(0, 2000),
  fixedIssues: issues,
  minorIssuesOutstanding: minorIssues,
  deferredLiveGates: deferred,
  fixReport: String(fixReport).slice(0, 2000),
}
