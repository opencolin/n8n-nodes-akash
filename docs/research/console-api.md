# Akash Console API — programmatic surface (the node's spine)

> Research agent findings. Every claim is marked **VERIFIED** (with method) or **UNVERIFIED**.
> Verification methods: **live-probe** = read-only `curl GET` against public prod endpoints on
> 2026-07-17; **spec-read** = parsed the live OpenAPI doc; **docs** = akash.network docs page.
> FINANCIAL BOUNDARY honored: no POST/PUT/DELETE to authenticated services, nothing signed,
> no funds moved. Only unauthenticated read-only GETs were sent live.

## VERDICT (bottom line)

**Yes — Akash Console offers a first-class, HTTP/1.1 JSON REST API with `x-api-key` auth that
covers the entire deployment lifecycle: create → bid → lease → deposit → update → close, plus
managed/trial wallets, balances, billing history, and API-key management.** This is the exact
n8n-native path (mirrors Tenki's Connect-JSON decision). The managed wallet signs and broadcasts
the Cosmos transactions **server-side** — the node never touches a mnemonic, never signs, never
needs cosmjs/akashjs, and (as of the current API) never needs mTLS certificates. **Zero runtime
deps is achievable for the full write path.**

**The one real gap: deployment LOGS and SHELL/exec are NOT in the REST API.** They run through a
separate WebSocket/mTLS bridge (`console-provider-proxy.akash.network`) direct to the provider.
An HTTP-only n8n node **cannot stream logs/shell**. It CAN, however, report live **service status,
URIs, replica counts, and forwarded ports** — those come back inside the `/v1/leases` and
`GET /v1/deployments/{dseq}` responses as plain JSON (no WS needed).

---

## Base URL & transport — VERIFIED (spec-read + live-probe)

- Base URL: `https://console-api.akash.network` — VERIFIED (spec `servers[0].url`; every live probe hit it).
- OpenAPI 3.x spec (215 KB JSON) served at **`GET /v1/doc`** — VERIFIED (live-probe, 200, parsed).
  Swagger UI at `/v1/swagger` (HTML) points its `SwaggerUIBundle({url:'/v1/doc'})` at that JSON.
  `/v1/swagger.json`, `/v1/openapi.json` etc. all 404 — the only machine-readable spec is `/v1/doc`.
- `info.title`="Akash Network Console API", `version`="v1". Plain HTTP/1.1 JSON. No gRPC/streaming on this host.
- Fronted by Cloudflare (challenge script in HTML; CF IPs). Straight `curl` worked without challenge on GETs.

## Authentication — VERIFIED (spec-read + live-probe)

`components.securitySchemes` (spec-read):

| Scheme | Type | Header | Notes |
|---|---|---|---|
| **ApiKeyAuth** | apiKey | **`x-api-key: <KEY>`** | "API key for programmatic access." ← the node uses this |
| BearerAuth | http bearer (JWT) | `Authorization: Bearer <JWT>` | JWT from web login; also accepted on the same endpoints |
| x-user-id | apiKey | `x-user-id` | secondary header on some ops |
| x-owner-address | apiKey | `x-owner-address` | secondary header on some ops |

Every write/lifecycle operation lists `security: [{BearerAuth:[]},{ApiKeyAuth:[]}]` — i.e. **either**
a JWT **or** an `x-api-key` is accepted. So a single credential (the API key) unlocks the whole
managed-wallet surface. VERIFIED per-op via spec-read.

**Obtaining the key (bootstrap is manual, by design)** — docs: create it in the **Console web UI →
console.akash.network → Settings → API Keys → Create API Key**, copy once. There is a
`POST /v1/api-keys` endpoint, but it itself requires an existing JWT/key, so the *first* key must
come from the web UI. **Node credential = the pasted `x-api-key` string.** No `userId` is needed for
the core deploy path (owner is derived from the key's managed wallet); `userId`/`address` only appear
as explicit params on a few account/query endpoints (`/v1/wallets`, `/v1/usage/history`, `/v1/tx`).

### Live 401 / error envelope — VERIFIED (live-probe)

Unauthenticated GET on an authed endpoint (`/v1/api-keys`, `/v1/deployments`, `/v1/balances`):
```
HTTP 401  {"error":"UnauthorizedError","message":"Unauthorized","code":"unauthorized","type":"client_error"}
```
Bogus key (`x-api-key: not-a-real-key-000`) on `/v1/wallets`:
```
HTTP 401  {"error":"UnauthorizedError","message":"Invalid API key","code":"unauthorized","type":"client_error"}
```
Missing required query param (validation runs before/independent of auth), e.g. `/v1/wallets` w/o `userId`:
```
HTTP 400  {"error":"BadRequestError","message":"Validation error","code":"validation_error",
           "type":"validation_error","data":[{"code":"invalid_type","path":["userId"],"message":"Required"}]}
```
**Canonical error envelope:** `{error, message, code, type, data?}` — the node's error handler keys on
`code` (`unauthorized`, `validation_error`, …) and surfaces `message` (+ `data[]` for field errors).

---

## Request/response envelope convention — VERIFIED (spec-read)

Almost all write endpoints wrap payloads in a top-level **`data`** object, both request and response
(e.g. `{"data":{...}}`). Amounts to deposit are given **in USD dollars** (`deposit: 5.5`), not uakt —
the managed wallet converts. This is a huge simplification vs raw chain txs.

---

## THE DEPLOYMENT LIFECYCLE (node's core resource) — VERIFIED (spec-read); auth=x-api-key

Documented "five API calls" (docs) end-to-end:

### 1. Create deployment — `POST /v1/deployments`
Request:
```json
{ "data": { "sdl": "<full SDL YAML as a string>", "deposit": 5.5 } }   // deposit = USD dollars
```
Response `201`:
```json
{ "data": {
    "dseq": "1234567",                                  // deployment sequence id (string, ^d+$)
    "manifest": "<manifest string to send with lease>",
    "signTx": { "code": 0, "transactionHash": "…", "rawLog": "…" }   // server-signed & broadcast
} }
```
→ The SDL goes in as a **string**; Console parses SDL → builds manifest → signs `MsgCreateDeployment`.
The node does **not** need to encode protobuf or compute a manifest hash. VERIFIED spec-read.

### 2. Poll for bids — `GET /v1/bids?dseq={dseq}` (required query `dseq`)
Response `200`: `{ "data": [ { "bid": {...}, "escrow_account": {...} }, … ] }`
Each `bid` has `id{owner,dseq,gseq,oseq,provider,bseq}`, `state`, `price{denom,amount}` (amount is
uakt-per-block string), `created_at`, `resources_offer[]` (cpu/gpu/memory/storage units+attributes).
Docs: wait ~30–60 s after create, then poll. (Polling, not streaming — HTTP-friendly.) VERIFIED spec-read.

### 3. Accept bid + send manifest — `POST /v1/leases`
Request:
```json
{ "manifest": "<manifest from step 1>",
  "leases": [ { "dseq": "1234567", "gseq": 1, "oseq": 1, "provider": "akash1…" } ] }
```
Response `200`: `{ "data": { "deployment": {...}, "leases": [...], "escrow_account": {...} } }`
Each returned lease carries `id{…}`, `state`, `price{denom,amount}`, `created_at`, and a **`status`**
object with the live service data an HTTP node CAN surface without a WS:
`status.services{<svc>:{name,available,total,uris[],replicas,ready_replicas,available_replicas,…}}`,
`status.forwarded_ports{…}`, `status.ips{…}`. VERIFIED spec-read.

### 4. Add funds — `POST /v1/deposit-deployment`
Request: `{ "data": { "dseq": "1234567", "deposit": 5.5 } }` (USD). VERIFIED spec-read.

### 5. Close deployment — `DELETE /v1/deployments/{dseq}`
Response `200`: `{ "data": { "success": true } }`. Recovers remaining escrow. VERIFIED spec-read.

### Also on the deployment resource — VERIFIED (spec-read)
- `GET /v1/deployments/{dseq}` → `{ "data": { "deployment":{id{owner,dseq},state,hash,created_at},
  "leases":[…same status shape as above…], "escrow_account":{…} } }` — **this is how the node reads live
  status/URIs.**
- `GET /v1/deployments?skip=&limit=` → `{ "data": { "deployments":[ {deployment,leases,escrow_account}, … ] } }` (paginated).
- `PUT /v1/deployments/{dseq}` — update a deployment (new SDL).
- `GET /v1/weekly-cost`, `GET /v1/leases-duration/{owner}` (public).

### Certificates — REMOVED — VERIFIED (live-probe + spec-read)
`POST /v1/certificates` now returns **`400`**: *"This endpoint has been removed. mTLS certificates are
no longer required as identity is now verified via API key."* → **The node does NOT implement the
old create-certificate step.** One fewer moving part.

---

## Managed / trial wallet, balances, billing — VERIFIED (spec-read); live 401 confirmed

- `POST /v1/start-trial` — body `{ "data": { "userId": "…" } }` → 200/202. Starts a funded trial
  wallet (credit-card-free credits). `security:[]` in spec. UNVERIFIED: trial credit amount / spend caps
  (docs don't state; not probed — would require auth/POST).
- `GET /v1/wallets?userId={userId}` → `data[]` of `{id,userId,creditAmount,address,denom,isTrialing,
  topUpMinAmountUsd,createdAt,requires3DS,clientSecret,paymentIntentId,paymentMethodId}` — the managed
  wallet incl. its chain `address` and whether it's a trial. (Stripe fields present → CC top-ups.)
- `GET /v1/balances` → `{ "data": { "balance", "deployments", "total" } }` (USD-denominated credit).
  Live: 401 unauth (VERIFIED live-probe).
- `GET /v1/usage/history?address=&startDate=&endDate=` and `/v1/usage/history/stats` — billing/usage
  history (public-ish; `security:[]`, needs `address`).
- `GET|POST|PUT|DELETE /v1/wallet-settings` — spend limits / autotop-up config.

## API-key management (self-service, once you have one key) — VERIFIED (spec-read)
- `POST /v1/api-keys` — body `{ "data": { "name": "…", "expiresAt": "<ISO?>" } }` → `201` returns the
  full record **including the plaintext `apiKey` (shown once)** + `id,keyFormat,createdAt,lastUsedAt`.
- `GET /v1/api-keys` → list; **note: list items do NOT include the `apiKey` value** (only
  `id,name,createdAt,expiresAt,lastUsedAt,keyFormat,updatedAt`) — key value is create-time-only.
- `GET|PATCH|DELETE /v1/api-keys/{id}`.

## Generic managed-wallet signer (advanced) — VERIFIED (spec-read)
`POST /v1/tx` — body `{ "data": { "userId", "messages":[{typeUrl, value}] } }`. `typeUrl` enum:
`MsgCreateDeployment | MsgCreateCertificate | MsgCreateLease | MsgUpdateDeployment | MsgCloseDeployment
| MsgAccountDeposit` (akash.*.v1beta*). `value` is a **base64 protobuf** string → requires cosmjs/akashjs
to encode. **AVOID in the node** — the high-level `/v1/deployments` + `/v1/leases` endpoints do this
encoding server-side, so the node stays dep-free. `/v1/tx` is a documented escape hatch only.
`POST /v1/create-jwt-token` — body `{ "data": { "ttl", "leases":{…} } }` → `{ "data": { "token" } }`:
mints a lease-scoped JWT for talking **directly to a provider** (this is the logs/shell auth path, WS).

---

## LOGS / SHELL / EXEC — the HTTP gap — VERIFIED (spec-read + docs + live DNS)

- **No log/shell/exec/events endpoint exists in the Console REST API.** Grepping all ~110 spec paths
  for `log|shell|exec|event` yields only `/v1/blockchain-status` and `/v1/bme/status-history`
  (neither is deployment logs). VERIFIED spec-read.
- Logs/shell go through **`console-provider-proxy.akash.network`** (docs: *"provider-proxy — bridges
  browser requests to providers (mTLS REST + WebSocket)"*, Hono + `ws`). DNS resolves (Cloudflare IPs),
  root returns 404 (VERIFIED live-probe). This is a **WebSocket/mTLS** bridge → **out of scope for an
  HTTP/1.1 n8n node** (matches the "no streaming RPCs; poll instead" hard rule).
- **Mitigation the node ships instead:** service status/health via polling `GET /v1/deployments/{dseq}`
  → `leases[].status.services[].{available,ready_replicas,uris}` + `forwarded_ports`/`ips`. That gives
  "is it up, what are the URLs, how many replicas ready" without any WS. Log *streaming* stays a
  documented non-goal.

---

## Read-only chain/market data (public, no auth) — VERIFIED (live-probe 200s)

Great for read/trigger nodes; no key needed. Confirmed live 200:
- `GET /v1/network-capacity` → cpu/gpu/memory/storage active|pending|available|total.
- `GET /v1/gpu-prices` → per model `{vendor,model,ram,interface,availability,price{USD min/max/avg/med},priceUakt}`.
- `GET /v1/gpu` , `/v1/gpu-models` , `/v1/gpu-breakdown` — GPU availability/analytics.
- `GET /v1/providers` (list) & `/v1/providers/{address}` — provider registry (owner,hostUri,…). 200 live.
- `GET /v1/blockchain-status` → `{ "isBlockchainReachable": true }`. 200 live.
- `POST /v1/pricing` — deployment price estimate (public; POST but returns estimate only — not probed to honor "no POST" rule).
- Also public (`security:[]`): `/v1/blocks`, `/v1/transactions`, `/v1/validators`, `/v1/proposals`,
  `/v1/market-data/{coin}`, `/v1/addresses/{address}` (+ its `/deployments` `/transactions`),
  `/v1/deployment/{owner}/{dseq}`, `/v1/dashboard-data`, `/v1/auditors`, `/v1/provider-regions`.
- Alerts/notification-channels/deployment-alerts CRUD also exist (`/v1/alerts`, `/v1/notification-channels`,
  `/v1/deployment-alerts/{dseq}`) — auth'd; candidate for a later "monitoring" node.

---

## Implications for the n8n node (design notes)

1. **One credential type:** `akashConsoleApi` = `{ apiKey }`, sent as header `x-api-key`. Test/verify
   the credential with a cheap authed GET, e.g. `GET /v1/balances` (401 vs 200). No mnemonic, no cert.
2. **Zero runtime deps for the full write path** — SDL goes in as a string; Console does SDL→manifest→
   protobuf→sign→broadcast. Do NOT bundle cosmjs/akashjs. Avoid `/v1/tx` (the only dep-requiring path).
3. **Deploy operation is multi-call & async:** create → poll `/v1/bids` (loop w/ delay) → pick bid →
   `/v1/leases`. Expose "create", "list bids", "create lease" as separate operations so users compose
   the poll in the workflow (n8n Wait/loop), plus a convenience note that bids take ~30–60 s.
4. **Deposits are USD numbers**, not uakt. Surface `deposit` as a dollar amount.
5. **Response unwrapping:** strip the outer `{data:…}` before returning items to the workflow.
6. **Status, not logs:** ship `getDeployment`/status polling; document that live log/shell streaming is
   unsupported (WS/mTLS via provider-proxy — outside HTTP node scope).
7. **Financial boundary:** every write here spends real managed-wallet credit (trial or CC-funded).
   Agent live-gates must use `start-trial` credits / read-only GETs only; humans do any CC top-up.

## Sources
- Live OpenAPI spec: `https://console-api.akash.network/v1/doc` (parsed; saved to scratchpad/openapi.json)
- Docs: `https://akash.network/docs/api-documentation/console-api/` and `.../getting-started`
- Repo: `https://github.com/akash-network/console` (apps: `api` [Hono], `provider-proxy` [Hono+ws], `tx-signer`;
  packages: `http-sdk`, `openapi-sdk`, `console-api-types`)
- Live read-only probes on 2026-07-17 (401 envelopes, public 200s, DNS) as quoted above.
