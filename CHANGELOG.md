# Changelog

All notable changes to `n8n-nodes-akash` are documented here. This project
adheres to [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-07-17

The **publish gate**. Freezes the entire **zero-spend** surface — read, monitor,
trigger, and AI-agent-read — as the stable public contract, ready for npm
publish and n8n verified-community submission. Adds the template catalog, ships
the full README, and locks the packaging/verification gate. Deliberately shipped
**before** any fund-spending write, so verification never depends on a human
financial gate. Still **zero runtime dependencies** and **no code path that
spends funds**; the managed-wallet DEPLOY write path stays deferred to v1.1.0
(HUMAN-ONLY). The node stays `version: [1]` — the package version reaches
`1.0.0`, but no wire or behavior change touches the node's `typeVersion`.

### Added

- **Template resource** — keyless awesome-akash catalog browse: `list`
  (`GET /v1/templates-list`, the catalog grouped by category) and `get`
  (`GET /v1/templates/{id}`), with a `searchTemplates` resourceLocator wired
  through `methods.listSearch` for the template `id` picker.
- **Finalized node metadata** — codex `.node.json` on both `Akash` and
  `AkashTrigger` (categories, primary + credential documentation URLs →
  `akash.network/docs`), node categories/subtitles, credential descriptions +
  doc URLs, and light/dark SVG icons for the nodes and the credential.
- **README** — a full per-resource operation reference; the mainnet/sandbox-2
  endpoint + **pinned-module-version** table (`deployment v1beta4`,
  `market v1beta5`, `provider v1beta4`, `cert v1`; stale `v1beta3` → 501); the
  credential-is-optional / keyless-first guidance; the AI-Agent tool note
  (`N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true`); example workflows; and the
  prominent **financial-boundary** + **security-posture** statements.
- **Package-shape verification gate** — the executable check that
  `package.json` carries no `dependencies` key (zero runtime deps) and that the
  n8n block is well-formed, run as part of the publish gate alongside the full
  read/trigger regression suite.

### Security posture

Unchanged. **Zero runtime dependencies**, **no mnemonic**, and **no fund-moving
code path**. Every operation frozen into this release is a keyless public read,
an authenticated (`x-api-key`) non-spending `GET`, or the dry-run Create builder
that sends nothing. The chain LCD and provider-gateway planes stay keyless; the
only secret the credential holds is the `x-api-key`. The managed-wallet DEPLOY
write path — the only path that can move funds — remains deferred to v1.1.0 and
is **HUMAN-ONLY**.

## [0.4.0] - 2026-07-17

Lights up the AUTHENTICATED (`x-api-key`) managed-wallet backbone — cost/credit
visibility and managed-deployment monitoring — **and** de-risks the write-path
SHAPE with a zero-spend dry-run builder, all **without crossing the financial
boundary**. Still **zero runtime dependencies**, still **no mnemonic and no code
path that spends funds**: every new operation is a `GET` or a dry-run request
builder that sends nothing. The managed-wallet spend path stays deferred to
v1.1.0 (HUMAN-ONLY). Purely additive — no wire or behavior change to existing
ops, so the node stays `version: [1]`.

### Added

- **Account resource** — authed (`x-api-key`), **non-spending** managed-wallet
  reads: `getBalance` (`GET /v1/balances`, USD credit), `getUsage`
  (`GET /v1/usage/history` + `/stats`, optional address/date window), `getWallets`
  (`GET /v1/wallets` — `address`, `creditAmount`, `isTrialing`), `getWeeklyCost`
  (`GET /v1/weekly-cost`), and `whoami` (`GET /v1/user/me`, the credential-test
  endpoint). Each is a plain read — no lease, no spend.
- **Deployment resource** — managed-wallet deployment reads plus the zero-spend
  builder: `list` (`GET /v1/deployments?skip=&limit=`) and `get`
  (`GET /v1/deployments/{dseq}` → `leases[].status.services{uris,replicas,
  ready_replicas,forwarded_ports,ips}` — **poll-based status, explicitly not
  logs**) are authed reads; `getPublic` (`GET /v1/deployment/{owner}/{dseq}`) is
  a keyless public read; **`create` (Dry Run)** builds and validates the
  `POST /v1/deployments` body `{data:{sdl,deposit}}` from the SDL-ingest helper
  and returns it **without sending** (`dryRun` default **TRUE**; no POST is
  wired — the real write path lands in v1.1.0). `create` is a write op and moves
  no funds by construction.
- **Bid resource** — `listForDeployment` (`GET /v1/bids?dseq=`), the authed
  managed-wallet bid poll for a deployment, distinct from the keyless chain bids
  shipped in v0.3.0.
- **resourceLocator** — `searchDeployments` (managed deployment `dseq` from the
  authed `GET /v1/deployments`), wired through `methods.listSearch` and backing
  the Deployment `get` and Bid `listForDeployment` DSEQ pickers.
- **New `Akash Trigger` events** — `deploymentStatusChange` (closed /
  underfunded / no-active-bids off `GET /v1/deployments/{dseq}`) and
  `costThreshold` (credits-low / daily-spend-spike off `GET /v1/weekly-cost` and
  `GET /v1/balances`), both authed `x-api-key` polls with the existing
  baseline-seed / dedupe semantics. The `akashApi` credential is attached to the
  trigger as optional so keyless events keep working with nothing configured.
- **Credential test** — `akashApi` verifies against `GET /v1/user/me` (200 with a
  valid key, 401 without).

### Security posture

**Zero runtime dependencies** and **no mnemonic** — unchanged. Every operation
added here is a `GET` or a dry-run request builder: **no code path spends funds.**
The authed reads carry only an `x-api-key` and take no lease; the `deployment:
create` dry-run defaults on and never flips to send implicitly, and turning it
off throws rather than spending. Write ops are never exposed as fund-moving AI
tools — `create` rides the node-level `usableAsTool` only because it is
dry-run-only and moves nothing. The live managed-wallet spend gate remains
deferred to v1.1.0 and is **HUMAN-ONLY**.

## [0.3.0] - 2026-07-17

Extends the node across all three keyless read planes — Console, on-chain Cosmos
LCD, and the provider gateway — and marks every read op agent-callable. Still
**zero runtime dependencies** (no `cosmjs`/`akashjs`; every plane is reached
through n8n's built-in `httpRequest` helper) and **no code path that can spend
funds** — every operation added here is a keyless public read.

### Added

- **Chain resource** — keyless Cosmos chain-REST (LCD) read spine over the Akash
  on-chain modules, with **pinned module versions** single-sourced in the
  transport (`deployment v1beta4`, `market v1beta5`, `provider v1beta4`,
  `cert v1`; the stale `v1beta3` paths are dead/501). Operations: list/get
  deployments, list/get leases, list/get orders, list/get bids, list
  certificates, and Cosmos `bank` balances (`getBalance`). Works against
  **mainnet** (`api.akashnet.net`) and **sandbox-2** (`api.sandbox-2.aksh.pw`)
  via a `network` dropdown plus an additive `chainBaseUrl` override, with
  URL-encoded `next_key` cursor pagination (`returnAll` / `limit`).
- **Provider resource** — provider monitoring over the Console registry and the
  provider gateway: `list` / `get` (uptime, online + audit status, GPU models,
  capacity), `getRegions`, `getEarnings`, and **`getStatus`** which reads the
  provider `:8443` gateway `/status` + `/version` (self-signed cert tolerated
  via `skipSslCertificateValidation`).
- **Market resource** — public, non-spending pre-deploy sizing: **`estimate`**
  (`POST /v1/pricing`, cpu/memory/storage → per-cloud USD/month) and
  **`screenBids`** (`POST /v1/bid-screening`).
- **SDL ingest helper** — binary-or-string SDL resolution + an advisory shape
  linter, staged for the create path in a later release.
- **resourceLocators** — from-list pickers wired through `methods.listSearch`:
  `searchProviders` (provider address from `/v1/providers`) and
  `searchChainDeployments` (deployment `dseq` from the chain deployments list).
- **`usableAsTool`** — the node is now agent-callable; every v0.3.0 operation is
  a keyless, zero-spend read, so exposing it to AI agents moves no funds.
- **New `Akash Trigger` events** — `providerStatusChange` (online/audit/uptime
  transitions), `deploymentStateChange`, and `leaseStateChange`, each a keyless
  public read following the existing baseline-seed / transition-only semantics.

### Security posture

Unchanged. The node holds **no mnemonic**, signs nothing, and spends no AKT; the
chain LCD and provider-gateway planes are keyless and never attach an
`x-api-key`. Still **zero runtime dependencies**. No operation in this release
moves funds; the future write path will go only through the Akash Console
managed wallet (server-side signing).

## [0.2.0] - 2026-07-17

Adds event-driven monitoring on top of the keyless read surface. Still **zero
runtime dependencies** and no code path that can spend funds — every trigger
event is a keyless public GET.

### Added

- **`Akash Trigger` node** — a polling trigger with four keyless, zero-spend
  events:
  - **GPU Price Threshold** (`gpuPriceThreshold`) — polls `GET /v1/gpu-prices`
    and emits when a selected GPU model's price crosses a bound (per-model
    dropdown populated live from the marketplace).
  - **GPU Availability Change** (`gpuAvailabilityChange`) — polls `GET /v1/gpu`
    and emits when the free-unit count for any SKU changes.
  - **Capacity Available** (`capacityAvailable`) — polls
    `GET /v1/network-capacity` and emits when available network capacity crosses
    a bound.
  - **AKT Price Threshold** (`aktPriceThreshold`) — emits when the AKT/USD spot
    price crosses a bound.
- **Baseline-seed on activation** — the first poll after activation records the
  current surface as a baseline and does **not** emit, so turning the trigger on
  never floods the workflow with historical state; events fire only on
  subsequent transitions.
- **Shared `coingeckoRequest` transport** — fetches AKT/USD from CoinGecko and
  falls back to the Console `GET /v1/market-data` endpoint on any CoinGecko
  error (rate-limit/network/non-2xx) or missing price. Under the Console
  fallback, market-cap / 24h-volume / 24h-change are unavailable and the trigger
  surfaces a warning; the spot price is always returned.

### Security posture

Unchanged from 0.1.0. The trigger holds **no mnemonic**, signs nothing, and
spends no AKT — all four events are keyless public reads. Still **zero runtime
dependencies** (CoinGecko and the Console are reached through n8n's built-in
`httpRequest` helper).

## [0.1.0] - 2026-07-17

Foundation release. Ships the keyless public read surface for Akash Network —
the decentralized compute marketplace — with zero runtime dependencies and no
code path that can spend funds.

### Added

- **`Akash` node** (versioned, `version: [1]`) with keyless public reads:
  - **GPU → Get Prices** — `GET /v1/gpu-prices` (per-model marketplace pricing
    and availability across providers).
  - **GPU → Get Inventory** — `GET /v1/gpu` (live GPU allocatable/allocated
    inventory across the network).
  - **GPU → Get Models** — `GET /v1/gpu-models` (catalog of GPU models offered
    on Akash).
  - **Network → Get Capacity** — `GET /v1/network-capacity` (live
    cpu/gpu/memory/storage capacity and active provider count).
  - **Network → Get Stats** — `GET /v1/dashboard-data` (network dashboard:
    chain stats, leases, spend, active GPU, staking APR, height).
- **`akashApi` credential** — a single `apiKey` sent as the `x-api-key` header
  (plus an optional `baseUrl`, default `https://console-api.akash.network`).
  The credential is declared **optional at the node level**, so all v0.1.0
  GPU/network reads run with **no key attached**; a key is only needed for the
  authenticated operations arriving in later releases. Credential test:
  `GET /v1/user/me`.
- **Console transport** — a shared request helper that auto-detects
  keyless-vs-authed mode, conditionally strips the outer `{ data: … }` envelope
  (only when present, never for array payloads), and normalizes every failure
  into a readable `NodeApiError` via an extensible Console error map.
- **Packaging** — `n8n.strict` enabled; **zero runtime dependencies**
  (devDependencies only); codex `.node.json` metadata; MIT license; CI workflow
  (build + lint + test).

### Security posture

This package **never holds a mnemonic**, never signs a self-custody chain
transaction, and never spends AKT directly. It bundles **zero runtime
dependencies** (no `cosmjs`/`akashjs`). No operation in this release moves
funds. Authenticated writes in future releases will go **only** through the
Akash Console managed wallet, which signs server-side.
