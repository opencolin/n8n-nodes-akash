# STATUS — live progress log

> Newest entries at top. Any agent resuming this project: read ORCHESTRATION.md first,
> then this file, then RELEASE-PLAN.md (once the council lands it).

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
