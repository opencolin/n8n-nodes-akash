# STATUS — live progress log

> Newest entries at top. Any agent resuming this project: read ORCHESTRATION.md first,
> then this file, then RELEASE-PLAN.md (once the council lands it).

## 2026-07-18 — ✅ AUTHED LIVE GATES RUN (real x-api-key) → v1.0.1

User supplied a Console x-api-key via gitignored .env.local. Every NON-SPENDING authed
gate run live; account confirmed trial wallet, zero deployments, nothing spent.

**VERIFIED:** /v1/user/me 200 (+ bogus-key 401 envelope exactly as researched);
/v1/balances + /v1/weekly-cost 200 {data}; /v1/deployments = {data:{deployments,
pagination}} (confirms the v0.4.0 review fix); /v1/wallets requires userId (400
otherwise), rows carry address/creditAmount/isTrialing; /v1/usage/history REQUIRES
address (400 otherwise — server does NOT infer), returns daily rows; /stats returns
{totalSpent, averageSpentPerDay, totalDeployments, averageDeploymentsPerDay}.

**MISMATCH FOUND → FIXED in v1.0.1** (80 tests): usage.ts assumed address optional;
now auto-resolves via /v1/user/me → /v1/wallets (new resources/account/resolveWallet.ts);
wallets.ts userId likewise auto-resolves; descriptions updated.

**STILL PENDING (human):** ⛔ PRE-1.1.0 usableAsTool×write gate decision; npm publish
(both packages); the one real-spend v1.1.0 lifecycle gate.

## 2026-07-17 — 🏁 v1.0.0 PUBLISH GATE MERGED + TAGGED — train paused at human gates

- **v1.0.0 GREEN, merged + tagged** (run `wf_b6fdaf27-c1e`, 7 agents, 76 tests).
  Template browse/get (deduped from-list search — orchestrator applied the dedupe
  pre-merge), packaging finalized (files: dist/README/CHANGELOG/LICENSE), zero runtime
  deps holds. Publish-readiness statically green.
- **v0.4.0 was merged + tagged** earlier today (74 tests; one builder package failed
  garbled and the integrator authored it to spec, then reviewers caught + fix agent
  fixed the Console list envelope bugs; see run `wf_bf0b2fd3-9ff`).
- **TRAIN PAUSED — remaining work is behind HUMAN decisions:**
  1. ⛔ PRE-1.1.0 GATE (RELEASE-PLAN v1.1.0 section): usableAsTool × live-POST decision —
     split writes into a non-tool node (recommended) / drop usableAsTool / accept with
     opt-in. v1.1.0 must not wire the live POST until decided.
  2. Console x-api-key in .env.local → run the deferred NON-SPENDING authed live gates
     (account reads, credential test, searchDeployments, dryRun no-POST assert).
  3. npm publish + n8n verified-community submission (HUMAN-ONLY release act).
  4. The one real-spend lifecycle gate (1.1.0) — HUMAN-ONLY, mainnet USD credit.

## 2026-07-17 — v0.3.0 MERGED + TAGGED + PUSHED; v0.4.0 launched; repo PUBLIC

- **Repo public:** https://github.com/opencolin/n8n-nodes-akash (main + tags pushed;
  history secret-scanned clean before publish).
- **v0.3.0 GREEN, merged + tagged** (`v0.3.0`, merge `8e8b35c`; run `wf_53b3a799-cdf`,
  9 agents, 62 tests). Chain LCD spine (pinned versions, next_key pagination), provider
  monitoring incl. :8443 gateway, market estimate + bid screening, SDL ingest,
  resourceLocators, usableAsTool reads, deployment/provider state-change triggers.
  Reviewers LIVE-PROBED endpoints and caught 3 real majors pre-merge (deployment.id.dseq
  path; Etc/UTC rejected by /v1/bid-screening — default now America/Chicago); fix agent
  resolved all, re-verified green.
- **v0.4.0 workflow launched** (run `wf_bf0b2fd3-9ff`) in `.worktrees/release-v0.4.0`:
  authed account/deployment/lease reads + cost/status monitors + dry-run Create builder.
  NOTE: its authed live gates need a human Console x-api-key in .env.local — absent this
  session, so those gates defer (build does not block).
## 2026-07-17 — v0.4.0 INTEGRATED (GREEN, not yet merged)

- **v0.4.0 wired + GREEN** in `.worktrees/release-v0.4.0` (`build && lint && test` all
  pass; 14 suites / 74 tests). Authed (`x-api-key`, NON-SPENDING) backbone: **Account**
  (balance / usage / wallets / weekly-cost / whoami), managed **Deployment** reads
  (list / get) + keyless getPublic + the **ZERO-SPEND dry-run `create`** builder
  (`dryRun` default TRUE, no POST wired — real spend deferred to v1.1.0, HUMAN-ONLY),
  managed-wallet **Bid** poll (`listForDeployment`), the `searchDeployments`
  resourceLocator, and two new authed trigger events (`deploymentStatusChange`,
  `costThreshold`). Version bumped 0.3.0 → 0.4.0; still **zero runtime deps**, no
  mnemonic, no fund-moving code path.
- **Integrator note:** the `account-and-bid-authed-reads` builder package did not land its
  files in the worktree (Account/Bid descriptions + `resources/account/*` +
  `resources/bid/listForDeployment.ts` were absent). The integrator authored them to spec
  from RELEASE-PLAN §v0.4.0 + `docs/research/console-api.md`, mirroring the existing
  Console-plane resource/description idioms. Worth a review pass before merge.
- **Not yet run:** the LIVE `x-api-key` NON-SPENDING gates (`/v1/balances`, `/v1/wallets`,
  `/v1/usage/history`, `/v1/weekly-cost`, `/v1/user/me`, `/v1/deployments`, `/v1/bids`
  shape confirmation) — HUMAN-provided key required; account/wallet/usage/bid response
  shapes are read defensively pending that gate.

## 2026-07-17 — v0.2.0 MERGED + TAGGED; v0.3.0 launched

- **v0.2.0 GREEN, merged + tagged** (`v0.2.0`, merge `7c75ec3`; run `wf_1ae45622-ff8`,
  6 agents, ZERO review issues, 28 tests). AkashTrigger polling node: GPU-price /
  capacity / AKT-price watchers, baseline seeding + dedupe, CoinGecko parser
  (shape-verified). All keyless Console reads the trigger uses live-verified 200.
- **v0.3.0 workflow launched** (run `wf_53b3a799-cdf`) in `.worktrees/release-v0.3.0`:
  provider + chain-REST marketplace intelligence, next_key pagination, provider :8443
  gateway reads, SDL ingest, cost estimate/bid screening, resourceLocators,
  usableAsTool on reads.

## 2026-07-17 — v0.1.0 MERGED + TAGGED; v0.2.0 launched

- **v0.1.0 GREEN, merged + tagged** (`v0.1.0`, merge `06c5d79`; run `wf_9ea31272-274`,
  7 agents, 24 tests). AkashApi credential (optional, keyless branch for public ops),
  Console transport with envelope strip + normalized errors, GPU inventory/models/prices
  + network capacity/stats reads. 5 keyless Console reads live-verified 200 during the
  build. Deferred: /v1/user/me credential test (needs human x-api-key), load-in-n8n.
  Orchestrator fixed the one minor (stale Tenki comment in jest.config.js) pre-merge.
- **v0.2.0 workflow launched** (run `wf_1ae45622-ff8`) in `.worktrees/release-v0.2.0`:
  AkashTrigger — GPU-price / capacity / AKT-price watchers with baseline seeding.

## 2026-07-17 — v0.1.0 workflow launched

- Release-implementer adapted for Akash (context block: Console API x-api-key spine,
  keyless LCD, financial boundary) and committed at `tools/akash-release-implementer.js`
  — invoke via Workflow scriptPath with args {version, worktree, repo}. Live copy this
  session: scratchpad/akash-release-implementer.js (run `wf_9ea31272-274`).
- Worktree `.worktrees/release-v0.1.0` (branch `release/v0.1.0`) from main `53780d5`.

## 2026-07-17 — 🏁 PM COUNCIL COMPLETE → RELEASE-PLAN.md landed

Research (5 docs: console-api, chain-rest, provider-services, sdl-and-tx-flow, ecosystem) +
3 PM proposals + 3 judge lenses synthesized by the chair into
`docs/plans/RELEASE-PLAN.md`. **6-release train decided:**
0.1.0 (foundation + zero-auth GPU/network reads) → 0.2.0 (AkashTrigger: GPU-price/
capacity/AKT-price watchers, killer feature 2nd) → 0.3.0 (provider + chain-REST
marketplace intelligence + AI-agent read tools) → 0.4.0 (authed account/deployment/lease
reads + cost/status monitors + dry-run Create) → 1.0.0 (PUBLISH GATE, zero-spend surface)
→ 1.1.0 (managed-wallet DEPLOY lifecycle, additive, HUMAN-ONLY spend).

- **Spine: Power-user / workflows PM** (tied top aggregate 24/24 with Platform; decisive
  user-value winner). Rationale: unlike Tenki (whose existential unknown was the wire
  protocol), Akash's transport is ALREADY VERIFIED read-side in research — Console API
  returns the documented x-api-key 401/200 envelopes and the keyless chain LCD returns 200
  on 5 hosts. With the existential risk retired, the chair shifts the top-weighted lens
  from shippability to user-value density. Risk-first (21) NOT chosen as spine — its
  conditional 2.0.0 could strand the flagship and its 0.3.0 dry-run-only centerpiece
  installs nothing runnable.
- **Grafts:** from Platform — versioned nodes (NodeVersionedType) from 0.1.0 so the
  "no 2.0.0" promise is structural, codex .node.json metadata, .github CI, verification-lint
  gate + packageShape.test.ts, loud no-mnemonic README posture, homepage fix. From
  Risk-first — dry-run Create request-builder (zero-spend write-SHAPE de-risk before the
  money boundary), live-gate tagging taxonomy (no-key / needs-x-api-key-NON-SPENDING /
  HUMAN-ONLY-SPENDS), per-release FALLBACKs, keyless chain-REST spine (pinned
  deployment/v1beta4 · market/v1beta5 · provider/v1beta4 · cert/v1; next_key URL-encode;
  501-on-v1beta3 regression gate; sandbox-2 parity), baseline-seed triggers.
- **AUTH MODEL (locked):** primary = Akash Console API, single `x-api-key` header, managed
  wallet signs server-side → zero runtime deps, no mnemonic, no cert (certs removed from
  Akash). Secondary = keyless Cosmos LCD (mainnet api.akashnet.net / sandbox-2
  api.sandbox-2.aksh.pw). Tertiary = provider gateway :8443 /status /version (keyless,
  skipSslCertificateValidation). Self-custody cosmjs/akashjs = banned; escape hatch =
  external signer-sidecar POSTing a pre-signed protobuf to /cosmos/tx/v1beta1/txs.
- **FINANCIAL BOUNDARY:** the managed wallet spends MAINNET USD credit (NOT sandbox);
  sandbox-2 is for chain-REST reads only. The one real-spend gate (1.1.0 lifecycle) is
  HUMAN-ONLY, capped ≤ the $100 trial credit, and never blocks the 1.0.0 publish. Write
  ops are never usableAsTool. Write wire SHAPE is spec-verified / live-UNVERIFIED — pinned
  at the 1.1.0 human gate, de-risked by the 0.4.0 dry-run builder.
- **Next:** baseline-commit RELEASE-PLAN.md + research to main, then per-release worktree
  workflow loop (Partition → Build∥ → Integrate → Review∥ → Fix) exactly as Tenki.

## 2026-07-17

- **T+0 — Repo scaffolded** at `/Users/colin/Code/n8n-nodes-akash` from the Tenki
  conventions (tsconfig/gulpfile/eslint/prettier/jest copied verbatim; package.json
  adapted, n8n block empty until first node lands; node_modules copied for build speed).
  Research + PM council workflow launching next. No GitHub remote yet.

## Next actions (in order)

1. ✅ DONE — Research + PM council → docs/research/ (5 docs) + docs/plans/RELEASE-PLAN.md.
   Auth/transport model settled: Console API (x-api-key, server-side signing) primary +
   keyless chain LCD + provider gateway :8443; no bundled signer.
2. Baseline-commit RELEASE-PLAN.md + docs/research/ to main.
3. Per-release worktree workflow loop exactly as Tenki: branch release/vX.Y.Z, run the
   release-implementer workflow (Partition → Build∥ → Integrate → Review∥ → Fix), verify
   build+lint+test green + the release's live gates, merge --no-ff, tag. Start at v0.1.0.
4. Create GitHub repo (opencolin/n8n-nodes-akash) when the user wants it shared / before
   the first PR-based merge.
