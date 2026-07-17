# Ecosystem + Competitive Scan — Akash Network for n8n

Research agent output. Topic: prior-art integrations, CLI surface, Cloudmos→Console
heritage, pricing/market data APIs, AKT market sources, and ranked candidate n8n operations.

Verification legend:
- **VERIFIED (live)** — read-only GET probed against the live public endpoint on 2026-07-17.
- **VERIFIED (spec)** — read from the live OpenAPI document (`/v1/doc`, 92 paths, fetched 2026-07-17).
- **DOCS-CLAIM** — from Akash docs / blog / GitHub prose, not independently wire-checked.

No funds were sent, nothing was signed, no POST hit an authenticated endpoint. All live
probes were `curl GET` against public hosts.

---

## 0. TL;DR verdict (the load-bearing finding)

**The Akash Console API (`https://console-api.akash.network`) is the n8n-native path — a
direct analog of Tenki's Connect-JSON decision.** It is plain HTTP/1.1 JSON with two auth
modes and a large no-auth read surface. An HTTP-only, zero-runtime-dep node can do:

- **All read/monitoring** (public GETs, no key): GPU prices, capacity, providers, market,
  dashboard/stats, templates, chain data.
- **Full deploy lifecycle** via the **managed-wallet** model with just an `x-api-key`
  header — Console custodies the wallet and signs server-side, so **no cosmjs/akashjs
  bundling and no mnemonic in credentials**. POST SDL → poll bids → POST lease → close.

It **cannot**: sign self-custody transactions (would require akashjs/cosmjs — banned), and
**cannot stream lease logs / open a shell** (provider websocket via
`console-provider-proxy.akash.network` — streaming, out of scope; matches the "no streaming
RPCs" rule). Lease *status* is pollable; live *logs* are not.

Financial boundary note: managed-wallet writes spend real credits ($100 trial, then
credit-card pay-as-you-go). These ship as node operations **for the human user**; agents
never call them. Everything an agent needs to test is in the no-auth read surface.

---

## 1. Prior art / competitive scan

### 1a. Existing n8n nodes
- **`n8n-nodes-akashchat`** (npm, author `fenilmodi00`, GitHub `fenilmodi00/n8n-nodes-akashchat`).
  The ONLY existing Akash n8n node. Scope = **LLM inference only** — POSTs to
  `https://chatapi.akash.network/api/v1/chat/completions` (OpenAI-compatible; Llama/Qwen/
  DeepSeek etc.), API key from `chatapi.akash.network`. DOCS-CLAIM.
  - **Implication:** it is *not* a compute/deployment/market node at all, and because the
    endpoint is OpenAI-compatible, n8n's built-in OpenAI node with a custom base URL already
    covers it. **The entire deploy / market / monitoring surface is open green field.** No
    prior-art collision with what we're building.
- No other Akash n8n community node found on npm or ncnodes.com (2026-07-17).

### 1b. Zapier / Make
- **No native Akash app on Zapier or Make.** Only generic HTTP/webhook modules can reach
  the API. DOCS-CLAIM (searched both marketplaces). Confirms an underserved automation niche.

### 1c. AI-agent deploy tools (directly relevant to "AI-agent deploy" workflow)
- **`@elizaos/plugin-akash`** (`elizaos-plugins/plugin-akash`, merged via elizaOS/eliza
  PR #2111). "Autonomous deployment" plugin for the Eliza agent framework. **Transport =
  self-custody signing**: requires `AKASH_MNEMONIC` + `AKASH_WALLET_ADDRESS`, `AKASH_GAS_*`,
  `AKASH_DEPOSIT`, bundles **akashjs**. Actions include `CREATE_DEPLOYMENT` + management
  actions. DOCS-CLAIM.
  - **Implication:** the existing agent tool takes the heavy path we're explicitly avoiding
    (mnemonic + akashjs + gas). Our differentiator: an **HTTP-only, managed-wallet AI-agent
    deploy tool** (no mnemonic, no signer) exposed to n8n's LangChain AI-Agent node. Real gap.
- **CI/CD deploy actions:** `TedcryptoOrg/akash-deploy-action`, "Akash on GitHub Actions
  Dynamic SDL" (GitHub Marketplace). Demonstrates demand for "deploy-on-push"; our
  deploy-on-webhook node is the n8n equivalent. DOCS-CLAIM.
- **`akashjs`** (`akash-network/akashjs`) — official TS SDK, the bundled-signer path. Heavy
  runtime dep → **blocks n8n community verification** → last resort only.

### 1d. Cloudmos → Console heritage (why the Console API exists)
- Cloudmos built **Akashlytics** (analytics), **Cloudmos Deploy**, **Cloudmos Alerts**.
- **Aug 2023:** Overclock Labs acquired Cloudmos via community governance **Prop 216**;
  **$300k AKT** ($200k community pool + $100k OCL) to open-source the whole codebase.
- **May 2024:** Cloudmos Deploy folded into **Akash Console**. `deploy.cloudmos.io` →
  `console.akash.network`; `stats.akash.network` is the old Akashlytics page. DOCS-CLAIM.
- **Relevance:** Cloudmos Alerts is the ancestor of Console's `/v1/alerts` +
  `/v1/notification-channels`. The whole Console API we target is the open-sourced Cloudmos
  backend. Repo: `akash-network/console` (TS monorepo). Self-custody fork: `console-air`.

---

## 2. Console API — the integration target

- **Base URL:** `https://console-api.akash.network`  (OpenAPI `servers[0].url`) — VERIFIED (spec)
- **OpenAPI JSON:** `https://console-api.akash.network/v1/doc` (OpenAPI 3.0.0, title
  "Akash Network Console API", version `v1`, **92 paths**) — VERIFIED (live)
- **Swagger UI:** `https://console-api.akash.network/v1/swagger` — VERIFIED (live)
- **Docs:** `https://akash.network/docs/api-documentation/console-api/` (Managed Wallet API);
  AEP-63 "Console API for Managed Wallet Users - v1" is the design spec.

### 2a. Auth model — VERIFIED (spec, `components.securitySchemes`)
| Scheme | Header | Use |
|---|---|---|
| `ApiKeyAuth` | `x-api-key: <key>` | **programmatic access → the n8n credential** |
| `BearerAuth` | `Authorization: Bearer <JWT>` (bearerFormat JWT) | interactive Console users |
| `x-user-id` / `x-owner-address` | header | internal/aux |

- **Global `security` is null** → each op declares its own; the whole read surface below has
  `security: []` (no auth). Write/account ops declare `[{BearerAuth},{ApiKeyAuth}]`.
- **API key provisioning:** generated in Console UI (API-keys page) after signup. Managed via
  `/v1/api-keys` (GET/POST/PATCH/DELETE, self-auth'd). New users get **$100 trial credits /
  30 days**, then **pay-as-you-go credit card** (USDC/USD-denominated managed wallet).
  DOCS-CLAIM. → n8n credential = single `x-api-key` string; credential test = `GET /v1/user/me`
  or `GET /v1/balances` (both AUTH).

### 2b. Managed-wallet deploy flow — DOCS-CLAIM + VERIFIED (spec shapes)
```
1. POST /v1/certificates                (x-api-key)          # one-time, create cert
2. POST /v1/deployments   body {data:<SDL/manifest obj>}     # broadcasts create tx, returns dseq
3. wait ~30s
4. GET  /v1/bids?dseq=<dseq>             (x-api-key)          # provider bids
5. POST /v1/leases        body {manifest:<string>, leases:[]}# accept bid(s) + push manifest
6. GET  /v1/deployments/{dseq}           (x-api-key)          # status (poll; no log stream)
7. POST /v1/deposit-deployment  / PUT /v1/deployments/{dseq}  # top up / update SDL
8. DELETE /v1/deployments/{dseq}                              # close, reclaim remaining funds
```
Every step above spends or commits credits → **human-only, agents never invoke**.

---

## 3. Read-only public endpoints (no auth) — the safe, agent-testable surface

All below have `security: []`. Live-probed responses trimmed.

### `/v1/gpu-prices` — VERIFIED (live) ★ highest-value data
Per-GPU-model availability + price in USD and uakt.
```json
{"availability":{"total":248,"available":117},
 "models":[{"vendor":"nvidia","model":"a100","ram":"80Gi","interface":"SXM4",
   "availability":{"total":48,"available":6},
   "providerAvailability":{"total":4,"available":3},
   "price":{"currency":"USD","min":1.13,"max":1.83,"avg":1.48,"weightedAverage":1.36,"med":1.48},
   "priceUakt":{"currency":"uakt","min":1780097.43,"max":3307107.7,"avg":2375820.04,...}},
  {"vendor":"nvidia","model":"h100",...,"price":{"min":2.01,"max":3.16,"avg":2.58,...}} ...]}
```

### `/v1/gpu` — VERIFIED (live)
Cluster-wide GPU inventory by vendor/model.
```json
{"gpus":{"total":{"allocatable":248,"allocated":131},
 "details":{"nvidia":[{"model":"a100","ram":"80Gi","interface":"SXM4","allocatable":48,"allocated":42},
   {"model":"h100","ram":"80Gi","interface":"SXM5","allocatable":63,"allocated":48},
   {"model":"h200","ram":"141Gi","interface":"SXM5","allocatable":40,"allocated":28}, ...]}}}
```
Related (VERIFIED spec): `/v1/gpu-models` (models per vendor from provider-configs),
`/v1/gpu-breakdown` (analytics by vendor/model).

### `/v1/network-capacity` — VERIFIED (live)
```json
{"resources":{"cpu":{"active":2858030,"pending":263000,"available":6986195,"total":10107225},
  "gpu":{"active":120,"pending":10,"available":117,"total":247},
  "memory":{...},"storage":{"ephemeral":{...},"persistent":{...},"total":{...}}},
 "activeProviderCount":60}
```
(cpu in millicores; memory/storage in bytes.)

### `/v1/providers` — VERIFIED (live)
Array; per provider:
```json
{"owner":"akash1ccktptfkvdc67msasmesuy5m7gpc76z75kukpz","name":null,
 "hostUri":"https://provider.ams1p0.mainnet.akashian.io:8443","createdHeight":865,
 "email":null,"website":null,"lastCheckDate":"2026-07-17T18:32:14.000Z",
 "ipRegion":null,"ipCountry":null,"stats":{"cpu":{...},"gpu":{...},"memory":{...},"storage":{...}},
 "gpuModels":[],"uptime1d":1,"uptime7d":0.1427,"uptime30d":0.0332,
 "isValidVersion":false,"isOnline":false,"lastOnlineDate":null,"isAudited":...}
```
Related: `/v1/providers/{address}` (detail), `/v1/provider-regions` (VERIFIED live — region
key + description + provider-address list), `/v1/provider-versions`,
`/v1/provider-attributes-schema`, `/v1/provider-dashboard/{owner}`,
`/v1/provider-earnings/{owner}`.

### `/v1/dashboard-data` — VERIFIED (live) ★ network stats (old Akashlytics)
```json
{"chainStats":{"bondedTokens":88496665093499,"totalSupply":295868912489891,
  "communityPool":5711935944274.09,"inflation":0.04,"stakingAPR":0.04012,
  "height":27761502,"transactionCount":37070408},
 "now":{"date":"2026-07-17T20:07:00Z","height":27761552,"activeLeaseCount":704,
  "totalLeaseCount":531999,"dailyLeaseCount":985,"totalUAktSpent":2807787507235,
  "dailyUUsdSpent":7534761378.24,"activeCPU":2701890,"activeGPU":126,
  "activeMemory":13779086511104,"activeStorage":43248916668928},
 "compare":{"date":"2026-07-16T...","activeLeaseCount":688, ...}}
```
Related (VERIFIED spec): `/v1/graph-data/{dataName}` (time series for charts).

### `/v1/market-data/{coin?}` — VERIFIED (live) — PARTIAL, do not rely on for market cap
```json
{"price":0.5434716,"volume":0,"marketCap":0,"marketCapRank":0,
 "priceChange24h":0,"priceChangePercentage24":0}
```
**Only `price` is populated; volume/marketCap/change return 0.** For real AKT market data use
CoinGecko (§4). Console market-data is fine only as a rough spot price.

### `/v1/templates-list` — VERIFIED (live)
Categorized deploy-template catalog (source: `akash-network/awesome-akash`). Shape
`{data:[{title:"AI - GPU", templates:[{id,name,logoUrl,summary,tags[]}, ...]}, ...]}`.
Detail: `/v1/templates/{id}`, `/v1/user/template/{id}`.

### `/v1/pricing` (POST, public) — VERIFIED (spec, `security:[]`)
Deployment cost estimator ("estimate price on akash and other cloud providers"). No funds,
no signing — a pure calculator. Body loosely typed in spec. *Not live-probed (POST); mark
UNVERIFIED wire until gated live-test.*

### `/v1/bid-screening` (POST, public) — VERIFIED (spec, `security:[]`)
Body `{resources:[], timezone, requirements?, reclamationWindow?}` → screens providers by
resource needs. Read-oriented, no spend.

### Other no-auth reads (VERIFIED spec)
`/v1/addresses/{address}` (+ `/deployments/{skip}/{limit}`, `/transactions/{skip}/{limit}`),
`/v1/deployment/{owner}/{dseq}` (public deployment detail by owner+dseq),
`/v1/leases-duration/{owner}`, `/v1/blocks`(+`/{height}`), `/v1/transactions`(+`/{hash}`),
`/v1/proposals`(+`/{id}`), `/v1/validators`(+`/{address}`), `/v1/auditors`,
`/v1/predicted-block-date/{height}`, `/v1/predicted-date-height/{timestamp}`,
`/v1/blockchain-status`, `/akash/deployment/v1beta*/deployments/{list,info}`,
`/akash/market/v1beta*/leases/list` (chain-fallback proxies).

---

## 4. AKT market-data source — CoinGecko (VERIFIED live)

Console `/v1/market-data` is price-only. Canonical full market data:
- `GET https://api.coingecko.com/api/v3/simple/price?ids=akash-network&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true`
- Live response (2026-07-17):
```json
{"akash-network":{"usd":0.543761,"usd_market_cap":158769894.88,
  "usd_24h_vol":3719477.70,"usd_24h_change":-2.957}}
```
- No auth for the free tier (rate-limited ~5–15 req/min). CoinGecko id = **`akash-network`**.
- Leases are priced in **uakt** (1 AKT = 1e6 uakt), so an AKT/USD watcher is functionally a
  cost watcher. `/v1/gpu-prices` already returns both USD and uakt, reducing the need.

---

## 5. Auth-required (`x-api-key`) endpoints — VERIFIED (spec)

**Read/account (auth, NO spend — safe node ops):** `GET /v1/deployments` (skip/limit),
`GET /v1/deployments/{dseq}`, `GET /v1/bids` & `/v1/bids/{dseq}`, `GET /v1/balances`,
`GET /v1/wallets`, `GET /v1/usage/history` & `/history/stats`, `GET /v1/weekly-cost`,
`GET /v1/user/me`, `GET /v1/deployment-settings/*`, `GET /v1/wallet-settings`,
`GET /v1/api-keys`.

**Write / fund-spending (FINANCIAL BOUNDARY — human-only, agents NEVER call):**
`POST /v1/deployments`, `PUT /v1/deployments/{dseq}`, `DELETE /v1/deployments/{dseq}`,
`POST /v1/leases`, `POST /v1/deposit-deployment`, `POST /v1/certificates`, `POST /v1/tx`
(raw signed tx via managed wallet), `POST /v1/create-jwt-token`.

**Alerts / notifications (Cloudmos Alerts heritage):** `/v1/alerts` (CRUD),
`/v1/deployment-alerts/{dseq}`, `/v1/notification-channels` (CRUD, +`/default`). Note: n8n is
itself an alerting engine, so these are low-priority as node ops — users wire alerts in n8n.

---

## 6. Akash CLI surface (context — the self-custody path we are NOT taking)

Standard `provider-services` / `akash` CLI flow (DOCS-CLAIM). SIGN = broadcasts a signed tx
(wallet + AKT gas); READ = query only.
- `akash tx deployment create deploy.yml` — **SIGN** (create deployment)
- `akash query market bid list --owner ... --dseq ...` — READ (list bids)
- `akash tx market lease create --provider ...` — **SIGN** (accept bid)
- `akash provider send-manifest deploy.yml --provider ...` — auth to provider (push manifest)
- `akash provider lease-status` / `lease-logs` / `lease-events` — provider queries; **logs are
  streaming** (websocket)
- `akash tx deployment close --dseq ...` — **SIGN** (close)
- `akash query market lease list`, `akash query deployment get` — READ

The CLI is the mnemonic/gas path; **only the READ queries map cleanly to an HTTP node, and
the Console API already exposes richer versions of them.** The SIGN steps are exactly what the
managed-wallet Console endpoints replace for an HTTP-only integration.

---

## 7. Candidate n8n operations — ranked by real-world value

Resource model mirrors Tenki (one `Akash` node, resources + operations; plus an `AkashTrigger`
polling node). "Spend" = crosses the financial boundary (human-only).

| # | Operation | Endpoint(s) | Auth | Spend | Value & why |
|---|---|---|---|---|---|
| 1 | **GPU price watch** (Trigger) | `GET /v1/gpu-prices` | none | no | **Killer feature.** Poll H100/A100/H200 avg price + availability, emit on threshold/availability change. Pure read, trivial HTTP, unique — no one else offers this in n8n. |
| 2 | **GPU/capacity availability watch** (Trigger) | `/v1/gpu`, `/v1/network-capacity` | none | no | "Fire when an H200 frees up." Pairs with deploy. High demand, read-only. |
| 3 | **Deploy from SDL** (deploy-on-webhook / CI-CD / AI-agent) | `POST /v1/deployments` → `GET /v1/bids` → `POST /v1/leases` | x-api-key | **yes** | Flagship write. HTTP-only via managed wallet (no cosmjs/mnemonic). Powers webhook-deploy and the AI-Agent deploy tool. |
| 4 | **Cost / credit monitor** (Trigger + op) | `/v1/weekly-cost`, `/v1/usage/history`, `/v1/balances` | x-api-key | no | Alert when trial credits low or daily spend spikes. High retention value. |
| 5 | **Deployment status / lease monitor** (Trigger + op) | `GET /v1/deployments`, `/v1/deployments/{dseq}`, `/v1/bids` | x-api-key | no | Alert on closed/underfunded lease, no active bids. Ops backbone. |
| 6 | **Close / update / deposit deployment** | `DELETE`/`PUT`/`POST /v1/deposit-deployment` | x-api-key | **yes** | Lifecycle completeness; auto-close idle GPU jobs to save money. |
| 7 | **Provider monitor** (Trigger + op) | `/v1/providers`, `/v1/providers/{address}`, `/v1/provider-earnings/{owner}` | none | no | Provider-operator audience: alert on offline/uptime-drop/audit change/earnings. |
| 8 | **Cost estimate before deploy** | `POST /v1/pricing`, `POST /v1/bid-screening` | none | no | Pre-flight "what will this cost / who can host it." No spend; guards the deploy op. |
| 9 | **Network stats snapshot** | `/v1/dashboard-data`, `/v1/graph-data/{dataName}` | none | no | Dashboards/reports (leases, spend, active GPU, staking APR). Easy read. |
| 10 | **AKT price watch** (Trigger) | CoinGecko `akash-network` (fallback `/v1/market-data`) | none | no | Budget/treasury alerts; leases priced in uakt. Slightly generic (any crypto node does price). |
| 11 | **Template browse + deploy** | `/v1/templates-list`, `/v1/templates/{id}` → deploy | none/key | maybe | Low-code "deploy ComfyUI/Ollama in one node." Nice funnel into #3. |
| 12 | **Chain / governance data** | `/v1/proposals`, `/v1/validators`, `/v1/transactions`, `/v1/blocks` | none | no | Niche (validators, governance bots). Cheap to add, low demand. |
| 13 | **Alerts/notification CRUD** | `/v1/alerts`, `/v1/notification-channels` | key | no | Low priority — n8n IS the alerting engine; redundant with #1/#4/#5. |

**Recommended v0.x spine:** read + monitoring first (ops #1,#2,#4,#5,#7,#8,#9 + `AkashTrigger`)
— zero-spend, agent-testable, immediately useful, differentiated. **Graft deploy writes**
(#3,#6,#11) once the managed-wallet flow is live-gated by the human against trial credits. The
AI-agent deploy tool (#3 exposed to n8n's LangChain node) is the strategic headline and the
clean HTTP-only answer to `@elizaos/plugin-akash`'s mnemonic-heavy approach.

---

## 8. What an HTTP-only node CAN and CANNOT do (verdict)

**CAN (HTTP/1.1 JSON, zero runtime deps):**
- Every read/monitor operation — public GETs need no key at all; account GETs need only `x-api-key`.
- Full deploy lifecycle create→bid→lease→deposit→update→close via managed-wallet `x-api-key`
  (Console signs server-side). No cosmjs, no akashjs, no mnemonic in credentials.
- Poll-based triggers for prices/capacity/leases/costs/providers (dedupe like `TenkiTrigger`).

**CANNOT:**
- Self-custody signing (own wallet/mnemonic) — needs akashjs/cosmjs → banned. Only
  Console-managed-wallet users get the write ops. Document this as the node's one boundary.
- Stream lease **logs** or open a **shell** — that's the provider websocket
  (`console-provider-proxy.akash.network`), streaming, out of scope. Lease **status** is
  pollable via `GET /v1/deployments/{dseq}`; live logs are not. Mirror Tenki's "no streaming,
  poll instead."

**Hard rule for planning:** the managed-wallet write endpoints spend real credits — every
live gate for them is human-run against the $100 trial / sandbox, never an agent. All
agent-side live verification stays inside §3's no-auth read surface (+ auth GETs with a
human-provided key).

---

## 9. Unverified items to live-gate later (with a human-provided key / gated POST)
- `POST /v1/pricing` and `POST /v1/bid-screening` exact request/response shapes (public but
  POST — not probed here). VERIFIED-spec only.
- `POST /v1/deployments` `data` object schema (the SDL/manifest envelope) — loosely typed as
  `{data:object}` in spec; needs a real managed-wallet dry run to pin field names.
- `POST /v1/leases` `{manifest:string, leases:[]}` element shape.
- Whether `/v1/alerts` is truly auth-optional (spec showed an optional `Authorization` header,
  ambiguous) — confirm before building alert ops.
- Console `/v1/market-data` zero-fields: confirm whether a coin param ever populates
  volume/marketCap, or treat as permanently price-only (recommend CoinGecko regardless).

## 10. Key URLs (quick ref)
- Console API base: `https://console-api.akash.network` · OpenAPI: `/v1/doc` · Swagger: `/v1/swagger`
- Managed Wallet API docs: `https://akash.network/docs/api-documentation/console-api/` · AEP-63
- Console repo: `github.com/akash-network/console` · self-custody fork: `akash-network/console-air`
- Templates source: `github.com/akash-network/awesome-akash`
- AKT market: `api.coingecko.com/api/v3/simple/price?ids=akash-network...`
- Prior art: npm `n8n-nodes-akashchat` (chat only); npm `@elizaos/plugin-akash` (mnemonic+akashjs)
- Stats site: `stats.akash.network` (old Akashlytics) · Deploy UI: `console.akash.network`
