# Changelog

All notable changes to `n8n-nodes-akash` are documented here. This project
adheres to [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/).

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
