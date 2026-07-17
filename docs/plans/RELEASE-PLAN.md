# n8n-nodes-akash — Final Release Plan

> Synthesized by the PM council chair, 2026-07-17. This is the authoritative release
> train for the `n8n-nodes-akash` community node. Implementation agents: read this file,
> then `docs/research/` (especially `console-api.md` + `chain-rest.md`), then
> `docs/plans/STATUS.md`. Every release must leave `main` green
> (`npm run build && npm run lint`; `+ npm test` from 0.1.0) and satisfy its acceptance
> criteria before merge/tag.
>
> **FINANCIAL BOUNDARY (non-negotiable, from ORCHESTRATION.md):** no mainnet AKT
> transaction is ever executed by an agent. Agent live gates use public read endpoints
> (no key) or authenticated GETs with a human-provided key (NON-SPENDING). Every
> managed-wallet write **spends real mainnet USD credit** and is **HUMAN-ONLY**.

---

## 1. Council summary

### Personas who proposed

| Persona | Core optimization |
|---|---|
| **Risk-first delivery PM** | Sequence by blast radius so the biggest unknowns die earliest; nothing that spends money is ever on the agent path; de-risk the write-path SHAPE with a zero-spend dry-run before crossing the financial boundary; every release carries tagged live gates + a documented fallback. |
| **Power-user / workflows PM** | Map every release to a concrete n8n job a builder installs today (GPU-price watchers, capacity alerts, cost monitors, deploy-on-webhook, AI-Agent tools); killer Trigger early; resourceLocators + binary-data SDL + `usableAsTool` node craft; publish the zero-spend surface first, graft deploy additively. |
| **Platform PM** | n8n community-node conventions, npm verification (zero runtime deps), single-`x-api-key`/no-mnemonic credential, **versioned nodes** to absorb wire bumps without a package major, codex metadata + CI; reach a stable, verifiable 1.0.0, add writes additively. |

### Judge verdicts (3 lenses)

| Lens | Winner | Runner-up scores |
|---|---|---|
| **Shippability / lands-green** | **Risk-first (9)** | Platform 8, Power-user 7 |
| **Per-release user value** | **Power-user (9)** | Platform 7, Risk-first 5 |
| **n8n ecosystem idiom / verification-readiness** | **Platform (9)** | Power-user 8, Risk-first 7 |
| **Aggregate** | Power-user **24** · Platform **24** · Risk-first **21** | — |

### Winner and synthesis decision

**Spine: Power-user / workflows PM** (tied top aggregate; decisive winner on per-release
user value; strong on ecosystem).

The Tenki sibling chair weighted **shippability** highest because Tenki's existential
unknown was the wire protocol (Connect-JSON acceptance was UNVERIFIED until a live key
arrived). **Akash is different: research has already retired that unknown.** `console-api.md`
and `chain-rest.md` live-probed the transport on 2026-07-17 — Console API returns the
documented `x-api-key` 401/200 envelopes, and the keyless chain LCD returns 200 across five
public hosts. The transport is VERIFIED read-side before a single line of node code. With the
existential risk gone, the highest-value organizing principle shifts from *risk-retirement*
to *user-value density* — exactly the axis the Power-user train wins, and exactly why the
risk-first spine (whose conditional 2.0.0 could strand the flagship, and whose 0.3.0
dry-run-only centerpiece installs nothing runnable) is **not** chosen as the spine here.

Power-user and Platform tie at 24. Power-user's structure is the better **spine** (killer
Trigger lands 2nd and zero-spend; publish the whole zero-spend surface at 1.0.0; deploy is an
**additive 1.1.0**, never a gratuitous major). Platform's mechanisms are grafted **wholesale**
because they are the cleaner ecosystem answer. Risk-first's gate discipline is grafted because
it operationalizes the FINANCIAL BOUNDARY better than any other proposal.

Grafted per the judges' cross-recommendations:

- **From Platform PM** — **versioned nodes (`NodeVersionedType`) from 0.1.0** so a future
  chain module-version bump (the research-demonstrated `v1beta4`→`v1beta5` churn that killed
  `v1beta3`) rides a node `typeVersion` bump, never a package major → the "no 2.0.0" promise
  is *structural*, not aspirational. Codex `.node.json` metadata (categories, primary +
  credential documentation URLs → `akash.network/docs`); `.github/workflows/ci.yml`
  (build+lint+test); the **loud no-mnemonic README security statement**; the
  `cred-class-field-documentation-url-miscased` eslint disable (same as Tenki); fix the
  scaffold's `package.json` `homepage` (still wrongly points at `tenki.cloud/docs`).
- **From Risk-first PM** — the **dry-run Create request-builder** (default `dryRun: true`,
  constructs + validates the `POST /v1/deployments` body and **never sends it**) to de-risk
  the write-path SHAPE with **zero spend** before the money boundary; the rigorous **live-gate
  tagging taxonomy** (`LIVE [no key · public]` / `LIVE [needs x-api-key · NON-SPENDING]` /
  `LIVE [HUMAN-ONLY · SPENDS]`); a **per-release FALLBACK** for when an assumption dies; the
  **keyless chain-REST read spine** (pinned `deployment/v1beta4`, `market/v1beta5`,
  `provider/v1beta4`, `cert/v1`; `next_key` URL-encode pagination; multi-denom passthrough;
  a **501-on-`v1beta3` regression gate** proving the version pins are load-bearing);
  **sandbox-2 parity**; and **baseline-seed-on-activation** so a Trigger does not flood on its
  first poll.
- **From Power-user PM (spine's own strengths, kept intact)** — killer GPU/AKT-price/capacity
  Trigger at **0.2.0**; **resourceLocators** on every id field via `methods/listSearch`;
  **binary-property SDL ingest** (read `deploy.yaml` from a binary property OR an expression
  string, no YAML lib → zero-dep); granular **`usableAsTool` on READ ops only** (writes never);
  provider-gateway `:8443` `/status` `/version` read (`skipSslCertificateValidation`, documented
  self-signed trade-off); **template catalog browse**; and the explicit
  **verification-lint gate + `packageShape.test.ts`** at 1.0.0.
- **Absorbed honesty detail (Power-user → all)** — the Console **managed wallet spends mainnet
  USD credit, NOT sandbox**. Sandbox-2 is for **chain-REST reads only** (and any hypothetical
  future self-custody testnet write with faucet tokens). The 1.1.0 HUMAN-ONLY spend gate runs
  against the **$100 mainnet trial credit**, capped, human-executed.
- **Open gap decided** — in-node versioning: see
  [§3 In-node versioning decision](#in-node-versioning-decision).

### Release train at a glance

| Version | Theme | Retires / delivers |
|---|---|---|
| **0.1.0** | Foundation + zero-auth GPU/network read intelligence | Console transport + `x-api-key` credential handshake (auth **model already VERIFIED**; this proves the node's implementation live); the differentiated keyless read surface |
| **0.2.0** | AkashTrigger: GPU-price, capacity & AKT-price watchers | The killer feature, zero-spend, agent-safe, landed 2nd |
| **0.3.0** | Provider + chain-REST marketplace intelligence + AI-agent read tools | Keyless on-chain read spine (pinned versions, sandbox-2 parity, `next_key` pagination), provider gateway, pre-deploy cost tools, resourceLocators, `usableAsTool` reads |
| **0.4.0** | Authenticated account/deployment/lease reads + cost/status monitors + **dry-run Create** | The `x-api-key` ops backbone (NON-SPENDING) **and** the write-path SHAPE de-risked with zero spend |
| **1.0.0** | **PUBLISH GATE** — read + monitor + trigger + AI-agent-read complete | npm publish + n8n community verification; template browse; the API-stability + zero-dep promise |
| **1.1.0** | Managed-wallet **DEPLOY** lifecycle (additive) | The flagship write path via Console server-side signing; every fund-spending gate **HUMAN-ONLY** |

---

## 2. Per-release plan

Legend for scope checklists: file paths are relative to repo root. `[ ]` = deliverable.
Live-gate tags declare the account/network each gate needs and whether it is agent-safe:
`LIVE [no key · <surface>]` = agent-runnable, no spend · `LIVE [needs x-api-key · NON-SPENDING]`
= agent-runnable with a human-provided key, GET-only, zero spend ·
`LIVE [HUMAN-ONLY · SPENDS mainnet USD credit]` = a human executes it, agents never do.

---

### v0.1.0 — Foundation + zero-auth GPU/network read intelligence

**Theme:** Stand up the zero-dep versioned-node skeleton, the single `x-api-key` credential
(no-mnemonic posture), the Console transport with its `{data}` envelope + error normalization,
and the highest-value **keyless** public reads — the differentiator ships first, no key, no
spend, fully agent-testable. Prove the node's own `x-api-key` handshake live in this release
(the auth *model* is already VERIFIED in research; this retires the *implementation* risk early).

**Scope**

- [ ] `credentials/AkashApi.credentials.ts` — name `akashApi`; single `apiKey` field
  (`type: string`, `typeOptions.password: true`, required); `IAuthenticateGeneric` injects
  header `x-api-key: {{$credentials.apiKey}}`; `baseUrl` field default
  `https://console-api.akash.network`; `documentationUrl` → `https://akash.network/docs` (with
  the `cred-class-field-documentation-url-miscased` eslint disable, same as Tenki);
  `ICredentialTestRequest` → `GET /v1/user/me` (200 with key, 401 without). **NO mnemonic, NO
  client cert** (certs removed from Akash), no `userId` for the core path.
- [ ] `credentials/akash.svg` — Akash logo, light + dark variants; `gulp build:icons` copies to `dist`.
- [ ] `nodes/Akash/Akash.node.ts` — **versioned node** (`NodeVersionedType` / `version: 1`),
  resource/operation router; `credentials: [{ name: 'akashApi', required: false }]` so public
  reads run keyless; resources `gpu`, `network`.
- [ ] `nodes/Akash/Akash.node.json` — codex metadata: node `n8n-nodes-akash.akash`,
  `codexVersion "1.0"`, categories `["Development","Infrastructure","Utility"]`,
  primary + credential documentation → `https://akash.network/docs`.
- [ ] `nodes/Akash/akash.svg`.
- [ ] `nodes/Akash/transport/consoleApiRequest.ts` — `this.helpers.httpRequestWithAuthentication`
  wrapper; POST/GET; injects `x-api-key` only when a credential is attached; **strips the outer
  `{data:…}` envelope**; base URL from credential/override.
- [ ] `nodes/Akash/transport/errors.ts` — normalize the Console envelope
  `{error, message, code, type, data?}` → `NodeApiError` (key on `code`: `unauthorized`,
  `validation_error`, …; surface `message` + `data[]` field errors); seed
  Unauthorized / "Invalid API key". Leave a hook for the chain LCD `{code, message, details}`
  shape (added 0.3.0).
- [ ] `nodes/Akash/resources/gpu/prices.ts` (`GET /v1/gpu-prices`), `inventory.ts`
  (`GET /v1/gpu`), `models.ts` (`GET /v1/gpu-models`).
- [ ] `nodes/Akash/resources/network/capacity.ts` (`GET /v1/network-capacity`), `stats.ts`
  (`GET /v1/dashboard-data`).
- [ ] `nodes/Akash/descriptions/GpuDescription.ts`, `NetworkDescription.ts`.
- [ ] `nodes/Akash/methods/index.ts` (loadOptions/listSearch stubs, wired in 0.3.0).
- [ ] `package.json` — register `dist/credentials/AkashApi.credentials.js` +
  `dist/nodes/Akash/Akash.node.js` in the n8n block (`strict: true`); **fix `homepage`**
  (`tenki.cloud/docs` → `akash.network/docs`); NO `dependencies` key (devDeps only);
  `README.md`, `CHANGELOG.md`, `LICENSE` (MIT).
- [ ] `.github/workflows/ci.yml` — build + lint + test on push/PR (verification hygiene).
- [ ] `test/transport/envelope.test.ts`, `test/transport/errors.test.ts`,
  `test/verification/packageShape.test.ts` (**asserts `package.json.dependencies` is absent**
  and the n8n block is well-formed — the zero-runtime-dep gate as executable code).

**Acceptance criteria**

- [ ] **STATIC:** `npm run build` (tsc + gulp build:icons) clean; `npm run lint`
  (eslint-plugin-n8n-nodes-base under `n8n.strict: true`) zero errors/warnings;
  `npm test` green (envelope-strip, error-normalize, packageShape).
- [ ] **STATIC:** `dependencies` key absent (zero runtime deps); node loads in a local n8n
  instance with `akashApi` marked optional — public ops execute with no credential attached.
- [ ] **LIVE [no key · Console public]:** `GET /v1/gpu-prices`, `/v1/gpu`, `/v1/gpu-models`,
  `/v1/network-capacity`, `/v1/dashboard-data` on `console-api.akash.network` return the
  researched shapes (`price.avg/weightedAverage`, `availability.total/available`,
  `chainStats/now` blocks); `{data}` envelope stripped; a bad path maps to `NodeApiError`.
- [ ] **LIVE [needs x-api-key · NON-SPENDING]:** the credential test `GET /v1/user/me`
  returns 200 with a human-provided key and 401 `{"error":"UnauthorizedError",…}` /
  "Invalid API key" with a bogus key — **this retires the node's own auth-handshake
  implementation risk in release 1** (the auth model is already VERIFIED in `console-api.md`).
- [ ] **FALLBACK** if the node's `x-api-key` injection fails live despite the verified model:
  ship keyless-Console + chain-REST reads only, defer the credential to 0.4.0, record in STATUS.md.

---

### v0.2.0 — AkashTrigger: GPU-price, capacity & AKT-price watchers (killer feature)

**Theme:** The research-declared killer feature, landed **second** and **zero-spend**: a
poll-based Trigger that fires a workflow when an H100/A100/H200 average price crosses a bound,
GPU units free up, network capacity opens, or AKT/USD moves. Pure read, no key, agent-safe.

**Scope**

- [ ] `nodes/AkashTrigger/AkashTrigger.node.ts` — `IPollFunctions` polling trigger,
  **self-contained request shape** (does not import the `IExecuteFunctions` transport helpers,
  mirrors `TenkiTrigger`); dedupe + cursor in `getWorkflowStaticData`; **baseline-seed on
  activation** (seed last-seen state so an already-populated surface does not flood the first
  poll); events `gpuPriceThreshold`, `gpuAvailabilityChange`, `capacityAvailable`,
  `aktPriceThreshold`.
- [ ] `nodes/AkashTrigger/AkashTrigger.node.json` — codex metadata (node
  `n8n-nodes-akash.akashTrigger`, categories `["Development","Infrastructure"]`);
  `nodes/AkashTrigger/akash.svg`.
- [ ] `nodes/Akash/transport/coingeckoRequest.ts` — CoinGecko
  `simple/price?ids=akash-network&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true`
  with a Console `GET /v1/market-data` spot-price fallback (research: Console market-data
  returns 0 for volume/mcap → CoinGecko is canonical, Console is the fallback for `price` only).
- [ ] Event config: per-GPU-model selector sourced from `/v1/gpu-prices` `models[]`; comparator
  (`min`/`avg`/`weightedAverage`/`max`); threshold + direction; availability-delta detection off
  `/v1/gpu` and `/v1/network-capacity`.
- [ ] `package.json` — add `dist/nodes/AkashTrigger/AkashTrigger.node.js` to the n8n block.
- [ ] `test/trigger/dedupe.test.ts`, `test/trigger/threshold.test.ts`,
  `test/trigger/baselineSeed.test.ts`.

**Acceptance criteria**

- [ ] **STATIC:** build/lint/test green; trigger emits only on threshold-cross / state-change
  (dedupe unit-verified against static data); baseline-seed unit-verified (no first-poll flood);
  no runtime deps added.
- [ ] **LIVE [no key · Console public + CoinGecko]:** a poll cycle over `/v1/gpu-prices` emits
  when a model's avg price crosses a test bound and stays silent otherwise; `capacityAvailable`
  fires off `/v1/network-capacity`; `aktPriceThreshold` reads live CoinGecko `akash-network`
  (Console `/v1/market-data` fallback exercised).
- [ ] **FALLBACK** if CoinGecko rate-limits (free tier ~5–15 req/min): fall back to Console
  `/v1/market-data` `price` and warn that mcap/volume/change are unavailable; documented.

---

### v0.3.0 — Provider + chain-REST marketplace intelligence + AI-agent read tools

**Theme:** The complete **keyless** intelligence surface an operator or agent installs without a
key: provider monitoring (Console + on-chain + gateway `:8443`), the full read-only Cosmos chain
spine across mainnet **and** sandbox-2, pre-deploy cost/bid estimation, the SDL ingest helper,
resourceLocators, and every read op exposed as a tool n8n's LangChain Agent can call.

**Scope**

- [ ] `nodes/Akash/transport/chainRestRequest.ts` — no-auth LCD GET wrapper; resolves Network +
  Base URL; **hard-codes the VERIFIED module versions as constants** (`deployment v1beta4`,
  `market v1beta5`, `provider v1beta4`, `cert v1`); treats `denom` (`uakt`/`uact`/IBC-USDC) as
  opaque data (never assume `uakt`). Node params: Network dropdown (mainnet
  `https://api.akashnet.net` / sandbox-2 `https://api.sandbox-2.aksh.pw`) + Base URL override
  (additive, non-breaking, no credential needed).
- [ ] `nodes/Akash/transport/pagination.ts` — Cosmos cursor loop on `pagination.limit` +
  `pagination.key`; **URL-encode `next_key`** (`+`→`%2B`, `=`→`%3D` — VERIFIED gotcha); loop
  until `next_key` null, ignore `count_total` (unreliable); cap iterations; `returnAll` toggle.
  Console `skip`/`limit` walker for `/v1/providers` etc. in the same helper.
- [ ] `nodes/Akash/transport/providerGatewayRequest.ts` — `:8443` GET with
  `skipSslCertificateValidation: true` (documented self-signed trade-off; providers prove
  identity via on-chain cert, not WebPKI).
- [ ] `nodes/Akash/transport/sdl.ts` — SDL ingest helper: read SDL YAML from a **binary
  property** (uploaded `deploy.yaml`) **OR** an expression string; **pass through as a plain
  string** (NO YAML parse, NO manifest hash, NO protobuf → zero-dep); optional client-side shape
  lint (services / profiles.compute / profiles.placement / deployment; GPU
  `resources.gpu.attributes.vendor.<nvidia>[{model, interface ∈ pcie|sxm}]`; storage list ≤2
  volumes, persistent `class` ∈ `beta1|beta2|beta3|ram`, `ram` never persistent). Consumed by
  cost estimate now; by Create in 0.4.0/1.1.0.
- [ ] `nodes/Akash/resources/provider/list.ts` (`GET /v1/providers`), `get.ts`
  (`/v1/providers/{address}` — `uptime1d/7d/30d`, `isOnline`, `isAudited`, per-attr `auditedBy`),
  `regions.ts` (`/v1/provider-regions`), `earnings.ts` (`/v1/provider-earnings/{owner}`),
  `status.ts` (gateway `:8443/status` + `/version` + `/address` via on-chain `hostUri`).
- [ ] `nodes/Akash/resources/chain/` — keyless on-chain reads:
  `deployment/list.ts` + `get.ts` (`deployment/v1beta4/deployments/{list,info}`,
  filters `filters.owner|dseq|state`),
  `lease/list.ts` + `get.ts` (`market/v1beta5/leases/{list,info}`),
  `order/list.ts` + `get.ts` and `bid/list.ts` + `get.ts` (`market/v1beta5/{orders,bids}`),
  `certificate/list.ts` (`cert/v1/certificates/list`, note **singular** `filter.` prefix),
  `account/balance.ts` (`cosmos/bank/v1beta1/balances/{addr}[/by_denom]` — multi-denom, integer
  strings). Single-item GETs via `id.owner=&id.dseq=&id.gseq=&id.oseq=&id.provider=` params.
- [ ] `nodes/Akash/resources/market/estimate.ts` (`POST /v1/pricing`, public, non-spending),
  `bidScreening.ts` (`POST /v1/bid-screening`, public, non-spending).
- [ ] `nodes/Akash/methods/listSearch.ts` + `methods/index.ts` — `searchProviders` resourceLocator
  (from-list via `/v1/providers`); `searchChainDeployments` (from-list via chain
  `deployments/list`, value=`dseq`).
- [ ] `nodes/Akash/descriptions/ProviderDescription.ts`, `MarketDescription.ts`,
  `ChainDescription.ts` (or per-resource Deployment/Lease/Order/Bid/Certificate/Account).
- [ ] `nodes/Akash/Akash.node.ts` — set **`usableAsTool: true`**; tighten every **read** op
  description/hint for agent legibility (`$fromAI`-friendly); register `provider`, `market`,
  and chain resources + `methods: { listSearch }`.
- [ ] `nodes/AkashTrigger/AkashTrigger.node.ts` — add `providerStatusChange` event
  (offline / uptime-drop / audit change off `/v1/providers`) and a chain
  `deploymentStateChange` / `leaseStateChange` event (poll chain `*/info`, emit on transition,
  Include-Closed toggle).
- [ ] `nodes/Akash/transport/errors.ts` — extend to map the chain LCD envelope
  `{code, message, details}`: 400 bad bech32 / input, 404 not-found, **501 wrong module
  version**, 429 rate-limit (back off), 5xx (retry / host failover).
- [ ] `test/transport/pagination.test.ts` (**`next_key` URL-encode round-trip** — regression-locks
  the VERIFIED gotcha), `test/transport/moduleVersions.test.ts` (**asserts no `v1beta3` path
  remains** — the 501 regression gate as a unit test), `test/transport/sdlIngest.test.ts`
  (binary + string), `test/methods/searchProviders.test.ts`.

**Acceptance criteria**

- [ ] **STATIC:** build/lint/test green; pagination `next_key` URL-encode round-trip unit-tested;
  a test asserts the pinned versions are load-bearing (no `v1beta3` in any built path); SDL helper
  unit-tested for binary AND string inputs; node exports `usableAsTool`; zero deps.
- [ ] **LIVE [no key · Console public]:** `/v1/providers`, `/v1/providers/{address}`,
  `/v1/provider-regions`, `/v1/provider-earnings/{owner}` return researched shapes;
  **`POST /v1/pricing` + `POST /v1/bid-screening` wire shapes pinned live** (were spec-only —
  closes the research §9 UNVERIFIED items); provider resourceLocator lists + filters live.
- [ ] **LIVE [no key · chain REST mainnet]:** list + get deployments/leases/orders/bids/certs and
  `bank` balances for a known `akash1…` address on `api.akashnet.net`; a multi-page cursor
  advances end-to-end (exercises `next_key` URL-encode live); a deliberately wrong `v1beta3` path
  returns **501** and surfaces as a normalized `NodeApiError`.
- [ ] **LIVE [no key · chain REST sandbox-2]:** the identical paths on `api.sandbox-2.aksh.pw`
  return 200 (parity check via the Network toggle).
- [ ] **LIVE [no key · provider gateway :8443]:** provider `status.ts` reaches `/status` +
  `/version` on a live provider `hostUri` (`skipSslCertificateValidation`) and returns
  inventory/version JSON; `providerStatusChange` dedupes.
- [ ] **FALLBACK** if a single default public LCD proves unreliable long-term: default provider
  discovery to the Console API and treat the LCD as optional/advanced (user-supplied base URL);
  documented. If `next_key` encoding ever diverges from VERIFIED: degrade to single-page + `limit`
  and warn on truncation.

---

### v0.4.0 — Authenticated account/deployment/lease reads + cost/status monitors + dry-run Create

**Theme:** With a human-supplied `x-api-key` (read-only, **no spend**), light up cost/credit
visibility and managed-deployment/lease monitoring — the ops backbone and retention feature —
**and** retire the write-path SHAPE unknown as far as possible **without crossing the financial
boundary**: a `deployment: create` request-builder that constructs + validates the
`POST /v1/deployments` body but **never sends it** (`dryRun` default TRUE, no POST wired).

**Scope**

- [ ] `nodes/Akash/resources/account/balance.ts` (`GET /v1/balances`), `usage.ts`
  (`/v1/usage/history` + `/history/stats`), `weeklyCost.ts` (`/v1/weekly-cost`), `whoami.ts`
  (`/v1/user/me`), `wallets.ts` (`/v1/wallets` — `address`, `creditAmount`, `isTrialing`).
- [ ] `nodes/Akash/resources/deployment/list.ts` (`GET /v1/deployments?skip=&limit=`), `get.ts`
  (`/v1/deployments/{dseq}` → `deployment` + `leases[].status.services{uris,replicas,
  ready_replicas,forwarded_ports,ips}` — **poll-based status, explicitly NOT logs**),
  `getPublic.ts` (`/v1/deployment/{owner}/{dseq}`, keyless).
- [ ] `nodes/Akash/resources/bid/listForDeployment.ts` (`GET /v1/bids?dseq=` — the managed-wallet
  bid poll, distinct from the keyless chain bids in 0.3.0).
- [ ] `nodes/Akash/resources/deployment/create.ts` — **dry-run request builder**: builds
  `POST /v1/deployments` body `{data:{sdl:'<yaml string>', deposit:<USD number>}}` from the
  0.3.0 SDL-ingest helper; **`dryRun` toggle DEFAULT TRUE returns the fully-constructed +
  validated request and performs NO network write** (the POST path is not wired until 1.1.0).
  **NOT `usableAsTool`** (it is a write op). Spend-warning copy in the description.
- [ ] `nodes/Akash/methods/listSearch.ts` — add `searchDeployments` (from-list via
  `GET /v1/deployments`, value=`dseq`); deployment resourceLocator.
- [ ] `nodes/Akash/descriptions/AccountDescription.ts`, `DeploymentDescription.ts`,
  `BidDescription.ts`.
- [ ] `nodes/AkashTrigger/AkashTrigger.node.ts` — add `deploymentStatusChange`
  (closed / underfunded / no-active-bids off `/v1/deployments/{dseq}`) and `costThreshold`
  (credits-low / daily-spend-spike off `/v1/weekly-cost`, `/v1/balances`) events.
- [ ] Credential test hardened: `GET /v1/user/me` → 200 with key, 401 envelope without.
- [ ] `test/resources/dryRunCreate.test.ts` — asserts the EXACT body `{data:{sdl,deposit}}`,
  envelope handling, and that **no POST is issued** when `dryRun` is true (mocked transport).

**Acceptance criteria**

- [ ] **STATIC:** build/lint/test green; deployment resourceLocator wired; dry-run request-builder
  unit test asserts the exact body and that the transport POST is never called; write op is
  `usableAsTool: false`; zero deps.
- [ ] **LIVE [needs x-api-key · NON-SPENDING]:** with the human-provided key, `GET /v1/balances`,
  `/v1/usage/history`, `/v1/weekly-cost`, `/v1/user/me`, `/v1/wallets`, `/v1/deployments`,
  `/v1/bids` return researched shapes; deployment resourceLocator lists live `dseq`s;
  `deploymentStatusChange` / `costThreshold` triggers dedupe. **Zero POST, zero lease, zero spend.**
- [ ] **LIVE [needs x-api-key · NON-SPENDING]:** `deployment: create` with `dryRun=true` returns
  the constructed request and performs **no** POST (assert no new deployment appears in
  `/v1/deployments` afterward). No live spend gate in this release — the real POST is deferred to
  1.1.0.
- [ ] **LIVE [no key · Console public]:** `GET /v1/deployment/{owner}/{dseq}` resolves keylessly.
- [ ] **FALLBACK** if the dry-run body cannot be validated non-destructively: keep Create
  dry-run-only and defer ALL spend to the 1.1.0 human gate; documented.

---

### v1.0.0 — PUBLISH GATE: read + monitor + trigger + AI-agent-read complete

**Theme:** Freeze and harden the entire **zero-spend** surface as the stable public contract,
add the template catalog, ship docs, pass n8n community verification, publish to npm.
Deliberately **before** any fund-spending write so verification never depends on a human
financial gate. This is the API-stability + zero-runtime-dep promise.

**Scope**

- [ ] `nodes/Akash/resources/template/list.ts` (`GET /v1/templates-list`), `get.ts`
  (`/v1/templates/{id}`) — one-node awesome-akash template catalog.
- [ ] `nodes/Akash/methods/listSearch.ts` — `searchTemplates` resourceLocator.
- [ ] `nodes/Akash/descriptions/TemplateDescription.ts`.
- [ ] Finalize display names, light + dark icons, and codex `.node.json` on both `Akash` and
  `AkashTrigger`; `usableAsTool: true` on **read ops only** (Create/write stays
  `usableAsTool: false`); node categories/subtitles.
- [ ] `credentials/AkashApi.credentials.ts` — final descriptions + doc URLs; `icon` (light/dark →
  `akash.svg`); assert the only secret is `apiKey`.
- [ ] `README.md` — credential setup (Console → Settings → API Keys), the mainnet/sandbox-2
  endpoint + **pinned-module-version** table, per-resource operation reference, example
  workflows, the `N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true` self-host tool note, a prominent
  **FINANCIAL BOUNDARY** statement, and the **loud security posture** (graft from Platform PM):
  *"this package never holds a mnemonic, never signs a self-custody chain tx, never spends AKT
  directly; the only write path is the Console managed wallet, which signs server-side; live
  log/shell streaming is a documented non-goal (provider WebSocket/mTLS)."*
- [ ] `package.json` — version `1.0.0`; `files` whitelist (`dist`, `README`, `CHANGELOG`,
  `LICENSE`); `repository`/`homepage` → `n8n-nodes-akash` repo + `akash.network/docs`; keywords
  (`akash, akt, depin, decentralized-cloud, deployment`); `CHANGELOG.md` 1.0.0 section.
- [ ] `test/verification/packageShape.test.ts` — assert `dependencies` absent + well-formed n8n
  block; full read/trigger regression suite.

**Acceptance criteria**

- [ ] **STATIC (publish gate):** full build/lint/test green; **n8n community verification lint
  passes with no undocumented suppressions** (only the documented
  `documentation-url-miscased` disable); `dependencies` absent (asserted in test);
  README + CHANGELOG present; `npm pack --dry-run` = `dist` + README + CHANGELOG + LICENSE only;
  every `*.node.json` codex validates; node + `AkashTrigger` + `akashApi` credential load in a
  real n8n custom-nodes dir; read ops show as tools in the AI-Agent node; icons render
  light + dark.
- [ ] **LIVE [no key · mainnet + sandbox-2 + Console + CoinGecko]:** full read/monitor/trigger
  regression green — GPU/network/provider/market public reads, chain deployments/leases/orders/
  bids/certs/balances, CoinGecko AKT, template browse; every trigger event dedupes.
- [ ] **LIVE [needs x-api-key · NON-SPENDING]:** account reads + dry-run Create green.
- [ ] **LIVE [HUMAN-ONLY — release act, no funds]:** a human runs `npm publish` and submits the
  package to the n8n verified-community program (public, persistent action — agents never publish).
- [ ] **FALLBACK** if community verification flags an issue: fix statically and re-gate; publish
  is a human act and never blocks on the deferred 1.1.0 spend gate.

---

### v1.1.0 — Managed-wallet DEPLOY lifecycle (additive, human-gated)

> **⛔ PRE-1.1.0 HUMAN GATE (added 2026-07-17 after the v0.4.0 review):** the node sets
> node-level `usableAsTool: true` and n8n has no per-operation tool flag, so
> `deployment:create` is reachable by AI Agents. This is SAFE in 0.4.0–1.0.0 only because
> create is dry-run-only (throws on `dryRun=false`, zero network on `dryRun=true`).
> DO NOT wire the live POST in this release until the user decides one of:
> (a) split write ops into a separate non-`usableAsTool` node (recommended), or
> (b) drop `usableAsTool` from the main node, or (c) accept agent-reachable spend with an
> explicit opt-in mechanism. Implementation agents: if this gate is undecided, build
> everything EXCEPT flipping the dry-run guard, and leave the live POST throwing.


**Theme:** The strategic flagship write path — deploy-on-webhook + AI-Agent-adjacent deploy, via
the Console **managed wallet** (server-side Cosmos signing, `x-api-key`, zero runtime deps, no
mnemonic): create → poll bids → lease → deposit/update/close, with live status polling. Additive
minor (no breaking change; the 0.4.0 dry-run default is unchanged). **Every fund-spending gate is
HUMAN-ONLY behind the financial boundary. The managed wallet spends mainnet USD credit, NOT
sandbox.**

**Scope**

- [ ] `nodes/Akash/resources/deployment/create.ts` — wire the real send behind `dryRun=false`:
  `POST /v1/deployments` body `{data:{sdl:'<yaml>', deposit:<USD>}}` → strip `{data}` →
  `{dseq, manifest, signTx}`. Default remains `dryRun: true` (purely additive capability; agents
  never spend by default; `dryRun=false` documented HUMAN-ONLY).
- [ ] `nodes/Akash/resources/lease/create.ts` — `POST /v1/leases`
  `{manifest:'<from create>', leases:[{dseq,gseq,oseq,provider}]}` →
  `{deployment, leases[], escrow_account}` with `leases[].status.services` URIs/ports.
- [ ] `nodes/Akash/resources/deployment/deposit.ts` (`POST /v1/deposit-deployment`
  `{data:{dseq,deposit}}`, USD), `update.ts` (`PUT /v1/deployments/{dseq}`, new SDL),
  `close.ts` (`DELETE /v1/deployments/{dseq}` → `{data:{success:true}}`, reclaims escrow).
- [ ] `nodes/Akash/transport/poll.ts` — bounded bid-poll orchestration: after create, poll
  `GET /v1/bids?dseq=` until bids present (delay ~30–60s; **no streaming**), surface for lease
  selection; expose create / list-bids / create-lease as **separate ops** so users compose the
  wait with n8n Wait/loop nodes.
- [ ] `nodes/Akash/descriptions/DeploymentDescription.ts` + `LeaseDescription.ts` — write ops with
  a "spends real mainnet USD credit" notice; `credentials` `required: true` on write ops only
  (public reads stay keyless); **write ops are NEVER `usableAsTool`** (agents cannot trigger spend).
- [ ] `README.md` + docs — the deploy-on-webhook example workflow; the **self-custody escape-hatch
  DEFER note**: in-node self-custody signing is intentionally NOT built (would need akashjs/cosmjs,
  blocks verification); if ever required, use an **external signer-sidecar** that POSTs an
  already-signed protobuf to `POST /cosmos/tx/v1beta1/txs` (plain HTTP), keeping package deps at
  zero — never a bundled signer. `docs/examples/` deploy-lifecycle workflow JSON.
- [ ] `test/resources/deployCreate.test.ts`, `deployLease.test.ts` — request-body shaping, SDL
  ingest, `{data}` envelope handling, an assertion that **all spend ops are `usableAsTool:false`**
  and that no `akashjs`/`cosmjs`/`protobuf`/`secp256k1` is imported anywhere — **mocked, NO live
  spend**.

**Acceptance criteria**

- [ ] **STATIC:** build/lint/test green; deploy request-body + SDL-ingest unit-tested against
  mocked responses; write ops require credential + are `usableAsTool:false`; **`package.json`
  STILL zero runtime deps** (no signer bundled); the 1.0.0 read/trigger/dry-run surface is
  unchanged (no regressions).
- [ ] **LIVE [no key · Console public]:** pre-deploy cost estimate (`POST /v1/pricing`,
  `POST /v1/bid-screening`) returns 200 (shape proxy for the request builder).
- [ ] **LIVE [needs x-api-key · NON-SPENDING]:** the request-builder + SDL-ingest path validates
  against `POST /v1/pricing` and dry-run Create; `dseq`/lease read shapes validate against
  chain REST `api.sandbox-2.aksh.pw` — leaving only the actual managed-wallet tx to the human gate.
- [ ] **LIVE [HUMAN-ONLY · managed wallet · SPENDS mainnet USD credit — executed by the human,
  never an agent, capped ≤ the $100 trial credit]:** one end-to-end lifecycle
  `POST /v1/deployments` → `GET /v1/bids?dseq=` → `POST /v1/leases` → confirm lease active via
  `leases[].status.services` → `POST /v1/deposit-deployment` → `PUT /v1/deployments/{dseq}` →
  `DELETE /v1/deployments/{dseq}`; pins the live `{data:…}` create/lease request+response shapes
  (closes the research §9 UNVERIFIED write-path items) and confirms close reclaims remaining
  credit. **Sandbox is NOT an option for this gate — the managed wallet is mainnet-USD.**
- [ ] **FALLBACK** if the human gate shows the lifecycle fails (no server-side sign / no bids /
  lease rejected): keep Create dry-run-only, mark create/lease/deposit/close experimental in the
  CHANGELOG, and the 1.0.0 read/trigger/pre-deploy surface still stands unaffected.

---

## 3. Guidance for implementation agents

### Locked-in universal decisions (apply to every release)

1. **Auth/transport model — VERIFIED (read-side, live) in `docs/research/`.** The node has
   **three plain-HTTP/1.1-JSON planes, zero runtime deps**:
   - **Primary — Akash Console API** (`https://console-api.akash.network`). Single **`x-api-key`**
     header credential. Covers the rich read surface **and** the full managed-wallet write
     lifecycle (Console signs + broadcasts the Cosmos tx **server-side**; the node never touches
     a mnemonic, never signs, never needs cosmjs/akashjs, never needs mTLS certs). Auth **model
     VERIFIED live** (401 `"Invalid API key"` / 200 envelopes probed 2026-07-17). Write **wire
     SHAPE** (`POST /v1/deployments` `{data:{sdl,deposit}}`, `POST /v1/leases`
     `{manifest,leases[]}`) is **spec-verified, live-UNVERIFIED** — de-risked by the 0.4.0
     dry-run builder, pinned at the 1.1.0 HUMAN-ONLY gate.
   - **Secondary — keyless Cosmos chain REST (LCD)** for on-chain reads. Default
     `https://api.akashnet.net` (mainnet), override `https://api.sandbox-2.aksh.pw` (sandbox-2).
     No auth. **VERIFIED live** on five public hosts. **Pin the module versions as constants:**
     `deployment/v1beta4`, `market/v1beta5`, `provider/v1beta4`, `cert/v1` — the old `v1beta3`
     paths are **dead (HTTP 501)**; a `v1beta3` probe returning 501 is the load-bearing signal
     that a version guess is wrong (regression-gated as a unit test).
   - **Tertiary — provider gateway `:8443`** `/status` `/version` `/address` (keyless, plain
     JSON, `skipSslCertificateValidation: true` — self-signed, documented trade-off). VERIFIED
     live.
   - **NOT used — self-custody signing** (cosmjs/akashjs). Banned dep weight; blocks community
     verification. **Escape hatch (documented only):** an external signer-sidecar POSTs a
     pre-signed protobuf to `POST /cosmos/tx/v1beta1/txs` (plain HTTP) — never a bundled signer.
2. **No streaming RPCs from an HTTP node — ever.** Deployment **logs / shell / exec** run over a
   WebSocket/mTLS bridge (`console-provider-proxy.akash.network`; provider `:8443/lease/…/{logs,
   kubeevents,shell}`) and are **out of scope**. Model every wait as **polling**: bid poll
   (`GET /v1/bids?dseq=`, ~30–60s), deployment/lease **status** (`GET /v1/deployments/{dseq}` →
   `leases[].status.services{uris,replicas,ready_replicas,forwarded_ports,ips}`), chain state
   (`*/info` + `x-cosmos-block-height` header). Status is the documented substitute for logs, not
   a gap to fix.
3. **Error normalization → always `NodeApiError`, never a raw HTTP throw; respect
   `continueOnFail()`; set `pairedItem`.**
   - Console: `{error, message, code, type, data?}` — key on `code` (`unauthorized`,
     `validation_error`, …), surface `message` + `data[]`.
   - Chain LCD: `{code (grpc-status), message, details}` — HTTP mirrors gRPC: **400** bad
     bech32/input, **404** not-found (often empty-result), **501** wrong module version/path,
     **429** back off, **5xx** retry / failover to the next public host.
   - Provider gateway lease-scoped: **401** `{"message":"unauthorized access"}` — expected wall,
     do not expose lease-scoped provider ops.
4. **Pagination.** Console lists use `skip`/`limit`. Chain lists use Cosmos
   `pagination.limit` + `pagination.key`; **URL-encode `next_key`** (`+`→`%2B`, `=`→`%3D` —
   VERIFIED gotcha; a unit test round-trips it), loop until `next_key` is null, **ignore
   `count_total`** (unreliable/expensive), cap iterations (the active-deployment set is tens of
   thousands). One `returnAll` toggle across all List ops.
5. **Polling / Trigger rules.** `AkashTrigger` uses the n8n `poll` framework (`IPollFunctions`) +
   `getWorkflowStaticData` dedupe on id+state, with a stored cursor and
   **baseline-seed-on-activation** (seed last-seen state so an already-populated surface does not
   flood the first poll). No webhooks exist — polling only.
6. **Credential design.** One credential `akashApi`: a single `apiKey` string
   (`password: true`), header `x-api-key`; optional Console `baseUrl` override; a Network selector
   + chain LCD base URL as **node params** (chain + gateway reads need **no** credential).
   `required: false` at the node level so public reads run keyless; **`required: true` only on
   write ops**. Credential test = `GET /v1/user/me`. **NO mnemonic, NO client cert (removed from
   Akash), NO `userId` on the core path.**
7. **FINANCIAL BOUNDARY.** Every Console write **spends real mainnet USD managed-wallet credit**
   ($100 trial, then CC pay-as-you-go). Write ops are **never `usableAsTool`**; the dry-run
   default never flips to send by default. Agent live gates use public reads (no key) or authed
   GETs with a human-provided key (NON-SPENDING). **Sandbox-2 is for chain-REST reads only** — the
   managed wallet is mainnet-USD, so the 1.1.0 lifecycle spend gate has no sandbox option and is
   HUMAN-ONLY, capped ≤ the trial credit.
8. **Every release leaves `main` green** (`npm run build && npm run lint && npm test`) and
   satisfies its live-gate acceptance before merge/tag. `dependencies` stays absent (asserted by
   `test/verification/packageShape.test.ts`).

### n8n conventions

- **Node style:** programmatic **versioned** node (`NodeVersionedType`). One `Akash` node
  (resources + operations) + one `AkashTrigger` poll node. Structure code as
  `nodes/Akash/resources/<name>/<op>.ts` with shared helpers in `nodes/Akash/transport/`
  (`consoleApiRequest`, `chainRestRequest`, `providerGatewayRequest`, `coingeckoRequest`,
  `pagination`, `poll`, `errors`, `sdl`). Keep the resource/operation model uniform.
- **resourceLocator:** on every id field, from-list mode via `methods/listSearch`
  (`searchProviders`, `searchDeployments`, `searchChainDeployments`, `searchTemplates`).
- **AI-Agent tool:** `usableAsTool: true` with `$fromAI`-friendly descriptions on **READ ops
  only**. Write/deploy ops are explicitly **not** `usableAsTool` (spend).
- **SDL ingest:** read from a **binary property** (`deploy.yaml`) OR an expression string; pass
  through as a plain string — **no YAML lib** (zero-dep).
- **Metadata for verification:** codex `.node.json` (categories, primary + credential
  documentation URLs), node + credential SVG icons (light/dark), the
  `n8n-community-node-package` keyword, `n8n.strict: true`, and a clean
  `eslint-plugin-n8n-nodes-base` pass (only the documented
  `cred-class-field-documentation-url-miscased` disable). `.github/workflows/ci.yml` runs
  build+lint+test. `package.json` `files`/n8n blocks list only files that exist in `dist/`;
  **fix the scaffold `homepage`** (`tenki.cloud/docs` → `akash.network/docs`).

<a id="in-node-versioning-decision"></a>
### In-node versioning decision

The whole train is **additive — no package major is required** (deploy lands as 1.1.0; the
dry-run Create default never flips to send-by-default). Nevertheless, implement `Akash.node.ts`
as a **versioned node (`NodeVersionedType` / a `version` array) from 0.1.0**. Akash has already
demonstrated live wire churn (`deployment` bumped past `v1beta3`→`v1beta4`, `market` to
`v1beta5`); when the next module-version bump or any behavior change lands, it rides a node
`typeVersion` bump (old workflows pin the prior node version and keep running) — **never a
package major**. This makes the "no 2.0.0" promise structural rather than aspirational.

### Full endpoint reference (distilled from `docs/research/`)

Legend: **[LIVE]** live-probed 200/401 on 2026-07-17 · **[SPEC]** read from the Console OpenAPI
`/v1/doc` · **[SPEND]** crosses the FINANCIAL BOUNDARY (HUMAN-ONLY).

**Console API — public reads, no key (`https://console-api.akash.network`)** [LIVE unless noted]
- `GET /v1/gpu-prices` — per-model `{vendor,model,ram,interface,availability{total,available},
  providerAvailability,price{USD min/max/avg/weightedAverage/med},priceUakt}`.
- `GET /v1/gpu` · `/v1/gpu-models` · `/v1/gpu-breakdown` — cluster GPU inventory/analytics.
- `GET /v1/network-capacity` — `{resources{cpu,gpu,memory,storage{active,pending,available,
  total}},activeProviderCount}` (cpu in millicores; memory/storage in bytes).
- `GET /v1/dashboard-data` — `chainStats` + `now` + `compare` (leases, spend, active GPU,
  staking APR, height). Related `GET /v1/graph-data/{dataName}` [SPEC].
- `GET /v1/providers` · `/v1/providers/{address}` — `uptime1d/7d/30d`, `isOnline`, `isAudited`,
  `attributes[].auditedBy`, `stats`, `gpuModels`, `hostUri`. `/v1/provider-regions` [LIVE],
  `/v1/provider-earnings/{owner}`, `/v1/provider-dashboard/{owner}` [SPEC].
- `GET /v1/market-data/{coin?}` — **`price` only**; volume/mcap/change return 0 → use CoinGecko.
- `GET /v1/templates-list` [LIVE] · `/v1/templates/{id}` [SPEC] — awesome-akash catalog.
- `POST /v1/pricing` [SPEC] · `POST /v1/bid-screening` [SPEC] — pre-deploy estimate/screen, no
  spend (public POST; live-pin shapes in 0.3.0).
- `GET /v1/deployment/{owner}/{dseq}` [SPEC] — public deployment detail. Plus `/v1/blocks`,
  `/v1/transactions`, `/v1/validators`, `/v1/proposals`, `/v1/addresses/{address}`,
  `/v1/blockchain-status`, `/v1/auditors`.

**Console API — authed reads, `x-api-key`, NON-SPENDING** [SPEC; 401 [LIVE]]
- `GET /v1/user/me` (credential test) · `/v1/balances` (USD credit) · `/v1/wallets?userId=`
  (`address,creditAmount,isTrialing`) · `/v1/usage/history[/stats]?address=` · `/v1/weekly-cost`.
- `GET /v1/deployments?skip=&limit=` · `/v1/deployments/{dseq}`
  (→ `leases[].status.services{uris,replicas,ready_replicas,forwarded_ports,ips}`) ·
  `GET /v1/bids?dseq=` · `/v1/api-keys` (list; value shown only at create).

**Console API — managed-wallet writes, `x-api-key`, [SPEND] HUMAN-ONLY** [SPEC]
- `POST /v1/deployments` `{data:{sdl:'<yaml>',deposit:<USD>}}` → `{dseq,manifest,signTx}`.
- `GET /v1/bids?dseq=` (poll ~30–60s) → `POST /v1/leases`
  `{manifest,leases:[{dseq,gseq,oseq,provider}]}` → `{deployment,leases[],escrow_account}`.
- `POST /v1/deposit-deployment` `{data:{dseq,deposit}}` · `PUT /v1/deployments/{dseq}` (new SDL) ·
  `DELETE /v1/deployments/{dseq}` → `{data:{success:true}}` (reclaims escrow).
- Avoid `POST /v1/tx` (base64 protobuf `value` → needs cosmjs) and `POST /v1/certificates`
  (**removed** — returns 400, mTLS no longer required). Deposits are **USD numbers**, not uakt.

**Cosmos chain REST (LCD) — keyless reads** — mainnet `https://api.akashnet.net`, sandbox-2
`https://api.sandbox-2.aksh.pw` [LIVE]. **Pinned versions:**
- `GET /akash/deployment/v1beta4/deployments/list` (filters `filters.owner|dseq|state|gseq|oseq`)
  · `/deployments/info?id.owner=&id.dseq=` · `/params`.
- `GET /akash/market/v1beta5/{leases,bids,orders}/list` (filters `filters.owner|dseq|gseq|oseq|
  provider|state`) · `/…/info?id.owner=&id.dseq=&id.gseq=&id.oseq=&id.provider=` · `/params`.
- `GET /akash/provider/v1beta4/providers` · `/providers/{owner}` (no `/params` — 501).
- `GET /akash/cert/v1/certificates/list` (**singular** `filter.owner|serial|state`).
- `GET /cosmos/bank/v1beta1/balances/{addr}[/by_denom?denom=uakt]` — **multi-denom** (`uakt`,
  `uact`, IBC-USDC `ibc/170C67…`); bank amounts are **integer** strings, price/escrow amounts are
  **18-dp decimal** strings. Never assume `uakt`.
- `GET /cosmos/auth/v1beta1/accounts/{addr}` (SignDoc inputs, escape-hatch only).
- Pagination `pagination.limit` + URL-encoded `pagination.key`; footer
  `pagination.next_key` (loop until null). Every response carries `x-cosmos-block-height`.
- Sandbox-2 faucet `http://faucet.sandbox-2.aksh.pw/` (faucet AKT — never mainnet AKT).

**Provider gateway `:8443` — keyless reads (`skipSslCertificateValidation`)** [LIVE]
- `GET /status` (cluster inventory: cpu millicpu, memory/storage bytes, `leases`) · `/version`
  (surface `version`/`commit`, drop `build_deps`) · `/address`.
- Lease-scoped (`/lease/{dseq}/{gseq}/{oseq}/{status,manifest,logs,kubeevents,shell}`) and
  `PUT /deployment/{dseq}/manifest` are **mTLS/JWT-gated (401) or WebSocket** — **out of scope**.

**CoinGecko — AKT market data (keyless, free tier ~5–15 req/min)** [LIVE]
- `GET https://api.coingecko.com/api/v3/simple/price?ids=akash-network&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true`
  → `{akash-network:{usd,usd_market_cap,usd_24h_vol,usd_24h_change}}`. Console `/v1/market-data`
  is the `price`-only fallback.

**SDL cheat-sheet (`sdl-and-tx-flow.md`)** — `version: "2.0"` only; sections `services`,
`profiles.compute`, `profiles.placement`, `deployment`. GPU nested
`resources.gpu.attributes.vendor.<nvidia>[{model, interface ∈ pcie|sxm}]` (omit model = any).
Storage list ≤ 2 volumes; persistent `class ∈ beta1(HDD)|beta2(SSD)|beta3(NVMe)|ram(SHM)`; `ram`
must NOT be persistent. `denom` may be `uakt` or an IBC stable denom. Pass SDL to Console as a
**plain string** — no client-side manifest hash / protobuf.

**Full authoritative catalog:** `docs/research/console-api.md` (managed-wallet surface),
`chain-rest.md` (LCD read reference + pagination gotcha), `provider-services.md` (gateway +
auth wall), `sdl-and-tx-flow.md` (SDL + signing model), `ecosystem.md` (prior art, CoinGecko,
ranked ops).
