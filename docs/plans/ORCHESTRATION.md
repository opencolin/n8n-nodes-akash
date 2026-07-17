# ORCHESTRATION — how this repo is built

Read this first if you are an agent resuming the project. Then STATUS.md (newest-first
log), then RELEASE-PLAN.md once the council lands it.

## What this is

`n8n-nodes-akash` — an n8n community node package for Akash Network
(https://akash.network, docs at https://akash.network/docs), the decentralized compute
marketplace. Sibling project to `n8n-nodes-tenki` (in `/Users/colin/Code/n8n`), which is
COMPLETE through v2.1.0 and is the reference for every convention used here.

## Process (mirrors the Tenki playbook that shipped 8 tagged releases)

1. Scaffold repo from Tenki's configs (tsconfig/gulpfile/eslint/prettier/jest). DONE.
2. Research + PM council workflow: parallel research agents write `docs/research/`,
   4 PM personas propose release trains, 3 judges score, a chair synthesizes
   `docs/plans/RELEASE-PLAN.md`.
3. Per release: worktree `.worktrees/release-vX.Y.Z` on branch `release/vX.Y.Z`, run the
   release-implementer workflow (Partition → parallel Build → Integrate → 2 Reviewers →
   Fix), orchestrator fixes minors inline, merges --no-ff (or via GitHub PR once the
   remote exists), tags, pushes.
4. STATUS.md updated at every step so any agent can resume.

Reusable release-implementer script (parameterize with {version, worktree, repo}):
`~/.claude/projects/-Users-colin-Code-n8n/ad14cd4b-1e53-40f3-9d6e-5152d99c88cf/workflows/scripts/tenki-release-implementer-wf_a6df0897-ec6.js`
— the CONTEXT block inside references Tenki docs paths; pass the right repo/worktree args
and ensure this repo's RELEASE-PLAN.md carries the per-release scope the partition agent
reads.

## Critical architecture question (research must answer FIRST)

Akash's control plane is a Cosmos blockchain: creating deployments/leases requires
SIGNED transactions (wallet mnemonic, AKT fees) — not n8n-HTTP-friendly. Research must
decide the auth/transport model before any planning:

- **Akash Console API** (console.akash.network) — REST + API key, managed deployments.
  If it covers create/close/logs, it is the n8n-native path (mirror of Tenki's
  Connect-JSON decision). Verify endpoints + auth header from docs/SDK, not memory.
- **Read-only chain queries** (REST/RPC endpoints, e.g. LCD/gRPC-gateway) — deployments,
  leases, providers, market prices. No signing; always feasible.
- **Raw tx signing in-node** (bundle cosmjs/akashjs) — heavy runtime deps (blocks n8n
  community verification), mnemonic-in-credential security questions. Last resort;
  document trade-offs if chosen.

## Hard rules (learned on Tenki — do not relearn)

- Verify wire contracts LIVE before trusting SDK descriptors/docs; record VERIFIED vs
  UNVERIFIED per field in docs/research/. (Tenki's exec-artifact flow was dead on the
  live gateway; only live gates caught it.)
- No streaming RPCs in an HTTP node; poll instead.
- Zero runtime deps in package.json (n8n verification gate). devDeps only.
- Orchestrator git hygiene: run git via `git -C <abs-path>` from the main checkout;
  never `cd` into a worktree you will remove; never create tags inside piped command
  chains; resolve STATUS.md merge conflicts by keeping both sections.
- Secrets: `.env.local` (gitignored) only; scan history before any public push.
- FINANCIAL BOUNDARY: no mainnet AKT transactions are ever executed by agents — live
  gates use read-only queries and the Akash sandbox/testnet (faucet tokens) only;
  anything spending real AKT is done by the human.

## Timers

Orchestrator self-paces with ScheduleWakeup ticks (60s floor) while workflows run in
background; long fallback (20 min) when a completion notification is expected.
