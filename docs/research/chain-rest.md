# Read-only Cosmos/Akash chain queries over plain HTTP (LCD/REST)

Reference for the n8n node's read-only chain surface: Akash `deployment`/`market`/`provider`/`cert`
modules + Cosmos `bank` balances (AKT). All of this is **public, unauthenticated, read-only** GET
data — no signing, no fees, n8n-`httpRequest`-native.

**Verification legend:** `[LIVE]` = confirmed by a read-only GET during this research (2026-07-17,
mainnet block ~27.76M); `[SRC]` = read from akash-network/net repo; `[DOCS]` = docs/known-behavior,
not independently probed. Every path below marked `[LIVE]` returned HTTP 200 with the documented shape.

---

## 1. Chain identity (all `[LIVE]`)

| Field | Value | How |
|---|---|---|
| Mainnet chain-id | **`akashnet-2`** | GET `/cosmos/base/tendermint/v1beta1/node_info` → `default_node_info.network` |
| App version | **`2.1.0`** | `.application_version.version` |
| Cosmos-SDK | **`v0.53.7-akash.2`** | `.application_version.cosmos_sdk_version` |
| Bech32 prefix | `akash` (addresses `akash1…`) | observed in every id |
| AKT denom | **`uakt`**, 1 AKT = 1,000,000 uakt (integer strings) | bank balance |

> Akash 2.x is **multi-denom**: escrow/lease/bid prices appear in `uakt`, `uact`, or IBC denoms
> (e.g. USDC `ibc/170C677610AC31DF0904FFE09CD3B5C657492170E7E52372E48756B71E56F2F1`). Never assume
> `uakt`. Bank _balances_ observed as plain `uakt` here, but treat `denom` as a variable everywhere.

---

## 2. Public REST hosts

No API key, no auth header. Plain HTTP/1.1 JSON (gRPC-gateway / LCD). All CORS-irrelevant (n8n is
server-side). Recommended, in priority order:

| Host | Notes | Status |
|---|---|---|
| `https://api.akashnet.net` | **Official** (provider "Akash Network" in net repo). Default. | `[LIVE]` 200 |
| `https://akash-api.polkachu.com` | Polkachu, Cloudflare-fronted, exposes `x-cosmos-block-height`. Polkachu documents a ~300 req/min public cap `[DOCS]`. | `[LIVE]` 200 |
| `https://akash-rest.publicnode.com` | Allnodes. Good fallback. | `[LIVE]` 200 |
| `https://rest.cosmos.directory/akash` | cosmos.directory load-balancing proxy across community nodes; handy default but adds a hop. | `[LIVE]` 200 |
| `https://rpc.akt.dev/rest` | akt.dev; note the `/rest` prefix. | `[LIVE]` 200 |

All five serve the **identical** `v1beta4`/`v1beta5`/`v1` module paths below (parity `[LIVE]` on the
first three). Full official list: `https://raw.githubusercontent.com/akash-network/net/main/mainnet/meta.json`
→ `.apis.rest[]` `[SRC]` (also lists ecostake, Lavender.Five `…/akash`, c29r3 `…/api`, Kleomedes,
Cosmonaut Stakes, ValidatorNode, Bro_n_Bro).

**Node-design tip:** make base URL a credential/param (default `https://api.akashnet.net`) so users
can point at their own node. No `Authorization` header. Optionally send `Accept: application/json`.

---

## 3. Module API versions — **BUMPED in Akash 2.x** (all `[LIVE]`)

The old v1beta3 paths that most stale docs/AI memory cite are **gone (HTTP 501 Not Implemented)**.
Verified current versions by probing every `vNbetaM`/`vN`:

| Module | **Current version** | Dead (501) |
|---|---|---|
| deployment | **`v1beta4`** | v1beta1/2/3, v1 |
| market | **`v1beta5`** | v1beta1–4, v1 |
| provider | **`v1beta4`** | v1beta1/2/3, v1 |
| cert | **`v1`** | v1beta1/2/3 |

`501` from the gRPC-gateway means "unknown route/version" — use it as the signal that a version guess
is wrong. `provider` has **no** `/params` RPC (501 on all); query the providers list instead.
`audit`/`escrow` modules exist on-chain but their gateway list paths were not resolved here `[DOCS]`
(escrow account state is already inlined in deployment/lease responses — see §5, so a dedicated escrow
query is rarely needed).

---

## 4. Endpoint catalog (paths relative to host; all `[LIVE]` unless noted)

### Deployment — `akash/deployment/v1beta4`
- `GET /akash/deployment/v1beta4/deployments/list` — list. Filters: `filters.owner`, `filters.dseq`,
  `filters.state` (`active`|`closed`), `filters.gseq`, `filters.oseq`. + pagination (§6).
- `GET /akash/deployment/v1beta4/deployments/info?id.owner={a}&id.dseq={n}` — single deployment.
- `GET /akash/deployment/v1beta4/params` — module params.
- `GET /akash/deployment/v1beta4/groups/info?id.owner=&id.dseq=&id.gseq=` — single group `[DOCS]`.

### Market — `akash/market/v1beta5`
- `GET /akash/market/v1beta5/leases/list` — filters: `filters.owner|dseq|gseq|oseq|provider|state`
  (state `active`|`insufficient_funds`|`closed`).
- `GET /akash/market/v1beta5/leases/info?id.owner=&id.dseq=&id.gseq=&id.oseq=&id.provider=` — single lease.
- `GET /akash/market/v1beta5/bids/list` — same filter keys (`filters.provider`, `filters.state`=`open|active|lost|closed`).
- `GET /akash/market/v1beta5/bids/info?id.owner=&id.dseq=&id.gseq=&id.oseq=&id.provider=` — single bid `[DOCS]`.
- `GET /akash/market/v1beta5/orders/list` — filters `filters.owner|dseq|gseq|oseq|state` (`open|active|closed`).
- `GET /akash/market/v1beta5/orders/info?id.owner=&id.dseq=&id.gseq=&id.oseq=` — single order `[DOCS]`.
- `GET /akash/market/v1beta5/params`.

### Provider — `akash/provider/v1beta4`
- `GET /akash/provider/v1beta4/providers` — list all providers (+ pagination).
- `GET /akash/provider/v1beta4/providers/{owner}` — single provider (path param, `akash1…`).

### Cert — `akash/cert/v1`
- `GET /akash/cert/v1/certificates/list` — filters: `filter.owner`, `filter.serial`, `filter.state`
  (`valid`|`revoked`). Note **singular `filter.`** here vs `filters.` on deployment/market `[DOCS]`.

### Cosmos bank (AKT balances) — standard SDK
- `GET /cosmos/bank/v1beta1/balances/{address}` — all denoms held. `[LIVE]`
- `GET /cosmos/bank/v1beta1/balances/{address}/by_denom?denom=uakt` — single denom (AKT). `[LIVE]`
- `GET /cosmos/bank/v1beta1/spendable_balances/{address}` — spendable (excludes vesting/locked) `[DOCS]`.
- Also available: `/cosmos/staking/v1beta1/...` `[LIVE]`, `/cosmos/base/tendermint/v1beta1/blocks/latest`, etc.

---

## 5. Response shapes (trimmed, `[LIVE]`)

**deployments/list** item:
```json
{ "deployment": { "id": {"owner":"akash1…","dseq":"16122570"}, "state":"active",
    "hash":"bLTCo5x…=", "created_at":"16122572", "reclamation":null },
  "groups": [ { "id":{"owner","dseq","gseq":1}, "state":"open",
     "group_spec": { "name":"dcloud", "requirements":{"signed_by":{"all_of":[],"any_of":[]},"attributes":[]},
       "resources":[{ "resource":{ "id":1,
           "cpu":{"units":{"val":"500"},"attributes":[]},
           "memory":{"quantity":{"val":"536870912"}},
           "storage":[{"name":"default","quantity":{"val":"536870912"}}],
           "gpu":{"units":{"val":"0"}},
           "endpoints":[{"kind":"SHARED_HTTP","sequence_number":0}] },
         "count":1, "price":{"denom":"uact","amount":"584.635140000000000000"} }] },
     "created_at":"16122572" } ],
  "escrow_account": { "id":{"scope":"deployment","xid":"akash1…/16122570"},
     "state":{ "owner":"akash1…","state":"open",
        "transferred":[{"denom":"uakt","amount":"0.0…"},{"denom":"uact","amount":"0.0…"}],
        "settled_at":"16122572",
        "funds":[{"denom":"uact","amount":"292317.57…"}],
        "deposits":[{"owner":"akash1…","height":"0","source":"balance",
                     "balance":{"denom":"uact","amount":"292317.57…"}}] } } }
```
Top-level: `{ "deployments":[…], "pagination":{…} }`. **Amounts in prices/escrow are decimal strings**
(18-dp fixed), unlike bank amounts (integers).

**leases/list** item: `{ "lease": { "id":{owner,dseq,gseq,oseq,provider,bseq}, "state":"active",
"price":{denom,amount}, "created_at, closed_on, reason, reclamation }, "escrow_payment":{ id:{aid:{scope,xid},xid}, state:{owner,state,rate:{denom,amount},balance:{denom,amount},…} } }`.
Lease id is the full 6-tuple; `bseq` currently `0`.

**bids/list** item: `{ "bid":{ id:{owner,dseq,gseq,oseq,provider,bseq}, state:"open",
price:{denom,amount}, created_at, resources_offer:[{resources:{cpu,memory,storage,gpu…}, count}] },
"escrow_account":{…} }`. Bid prices may be IBC/USDC denoms.

**orders/list** item: `{ "order":{ id:{owner,dseq,gseq,oseq}, state:"open",
spec:{name,requirements:{signed_by,attributes},resources:[…]} } }`. Order id is a **4-tuple** (no provider/bseq).

**providers** item: `{ "owner":"akash1…", "host_uri":"https://provider.…:8443",
"attributes":[{"key","value"},…], "info":{email,website}, … }`. Attributes are free-form host metadata.

**certificates/list** item: `{ "certificate":{ "state":"valid", "cert":"<base64 PEM>",
"pubkey":"<base64>" }, "serial":"…" }`.

**bank balances**: `{ "balances":[{"denom":"uakt","amount":"635979"}], "pagination":{next_key,total} }`
(integer uakt). `by_denom` → `{ "balance":{"denom":"uakt","amount":"635979"} }`.

---

## 6. Pagination (Cosmos SDK standard, `[LIVE]`)

Query params on any `list` endpoint:
- `pagination.limit=<n>` — page size.
- `pagination.key=<base64>` — cursor from previous `pagination.next_key`. **CRITICAL GOTCHA:** the
  key is base64 containing `+` and `=`; it **must be URL-encoded** (`+`→`%2B`, `=`→`%3D`) or the query
  breaks. Verified: encoding `next_key` and re-sending it returned the correct next page.
- `pagination.offset=<n>` — alternative to key (don't combine with key).
- `pagination.count_total=true` — populate `pagination.total`. **Unreliable/expensive on large sets**
  (observed `total` echoing page size, not the true count) — do not depend on it; loop on `next_key`.
- `pagination.reverse=true` `[DOCS]`.

Response footer: `"pagination": { "next_key": "<base64|null>", "total": "<string>" }`. Loop until
`next_key` is `null`. **n8n implementation:** `returnAll` = follow `next_key` (URL-encoded) until null;
cap iterations to avoid runaway loops on the full active-deployment set (tens of thousands).

**Consistency:** every response carries header `x-cosmos-block-height` (+ `grpc-metadata-x-cosmos-block-height`)
= the block the read reflects `[LIVE]`. Surface it for provenance. Querying a _past_ height via the
**request** header `x-cosmos-block-height: <h>` requires an **archive** node; most public hosts prune,
so historical reads generally fail — treat as unsupported `[UNVERIFIED]`.

---

## 7. Errors (`[LIVE]`)

Body: `{ "code": <grpc-status>, "message": "<text>", "details": [] }`. HTTP status mirrors gRPC:
- bad bech32 address → HTTP **400**, `code:3` `"invalid address: decoding bech32 failed…"`.
- missing deployment → HTTP **404**, `code:5` `"codespace deployment code 4: Deployment not found"`.
- wrong module version → HTTP **501** (unknown route).

n8n error mapping: 400→bad input (surface `message`), 404→not-found (often empty-result semantics),
501→version/path bug, 429→back off (rate limit), 5xx→retry/failover to next host.

---

## 8. Sandbox / testnet + faucet (all `[SRC]`, REST `[LIVE]`)

Source of truth: `https://raw.githubusercontent.com/akash-network/net/main/<network>/meta.json`.
Live networks in the net repo: `mainnet`, `sandbox-2`, `testnet-oracle`, `testnet-reclamation`.

**Sandbox-2** (the free faucet-funded network for safe write-path testing):
- chain-id **`sandbox-2`**, app **v2.1.0** (same binary as mainnet) — `[LIVE]` node_info.
- REST: **`https://api.sandbox-2.aksh.pw`** — `[LIVE]`, serves identical `deployment/v1beta4`,
  `market/v1beta5`, `provider/v1beta4`, `cert/v1` paths.
- RPC: `https://rpc.sandbox-2.aksh.pw:443` · gRPC: `grpc.sandbox-2.aksh.pw:9090`.
- **Faucet: `http://faucet.sandbox-2.aksh.pw/`** (redirects 301; dispenses sandbox AKT). Gas token
  `uakt`, min gas price 0.00025.
- Explorer: `https://explorer.sandbox-2.aksh.pw/akash`.

Sandbox is where any future _write_ path (SDL deploy, lease create) can be exercised with faucet
tokens — **never mainnet AKT** per the FINANCIAL BOUNDARY. Read queries in this doc need no funds.

---

## 9. Verdict — what an HTTP-only n8n node CAN / CANNOT do here

**CAN (fully HTTP-native, zero deps, no auth, safe):**
- List & get **deployments, groups, leases, bids, orders, providers, certificates** across mainnet
  and sandbox, with owner/state/dseq/provider filters and full `next_key` pagination.
- Read **AKT (and any-denom) wallet balances** via `cosmos/bank` — an "Account/Balance" resource.
- Report the marketplace: active leases, open orders, bid prices per provider, provider host metadata
  and attributes, deployment escrow funding/state. Poll-based "watch my deployment/lease state"
  triggers are trivially built on `*/info` + block-height header.
- Multi-host failover and user-supplied node URL; all read paths verified on 5 public hosts.

**CANNOT (out of scope for a read-only HTTP node):**
- Create/close deployments, place/accept bids, create leases, register certs — these require **signed
  Cosmos txs** (mnemonic, AKT gas, secp256k1). Not this module; belongs to Console-API or a signing
  path (heavy cosmjs/akashjs dep — separate research).
- Stream provider logs/lease-status (gRPC/websocket) — HTTP-poll only.
- Reliable historical/point-in-time reads (archive nodes not publicly guaranteed).

**Bottom line:** the entire read-only chain surface is a clean, dependency-free n8n resource set.
Ship it against `https://api.akashnet.net` (override-able), hard-code the **verified** versions
`deployment/v1beta4`, `market/v1beta5`, `provider/v1beta4`, `cert/v1` (NOT the v1beta3 in stale docs),
URL-encode `pagination.key`, and treat `denom` as multi-currency.
