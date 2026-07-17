# STATUS — live progress log

> Newest entries at top. Any agent resuming this project: read ORCHESTRATION.md first,
> then this file, then RELEASE-PLAN.md (once the council lands it).

## 2026-07-17

- **T+0 — Repo scaffolded** at `/Users/colin/Code/n8n-nodes-akash` from the Tenki
  conventions (tsconfig/gulpfile/eslint/prettier/jest copied verbatim; package.json
  adapted, n8n block empty until first node lands; node_modules copied for build speed).
  Research + PM council workflow launching next. No GitHub remote yet.

## Next actions (in order)

1. Research + PM council workflow → docs/research/ + docs/plans/RELEASE-PLAN.md.
   Research MUST settle the auth/transport model (Console API vs read-only chain REST vs
   bundled signer) before the council plans releases — see ORCHESTRATION.md.
2. Baseline commit, then per-release worktree workflow loop exactly as Tenki.
3. Create GitHub repo (opencolin/n8n-nodes-akash) when the user wants it shared.
