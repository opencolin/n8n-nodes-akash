# Akash Provider-Side HTTP Surface — feasibility for an HTTP-only n8n node

Research date 2026-07-17. Scope: the provider **gateway REST API** (`:8443`), its auth
model (mTLS on-chain cert vs JWT bearer), and provider **discovery / attributes / pricing /
uptime / audited attributes**. Verdict-first, then wire detail.

Verification legend:
- **[LIVE]** — I hit it with a read-only `curl` GET against a public endpoint on 2026-07-17.
- **[SRC]** — read from `akash-network/provider` `main` source (`gateway/rest/*.go`).
- **[DOCS]** — akash.network docs / AEP roadmap claim; not independently wire-verified.

FINANCIAL BOUNDARY honored: every live probe below is an unauthenticated read-only GET. No
funds moved, nothing signed, no POST/PUT to any authenticated endpoint.

---

## TL;DR verdict for the n8n node

| Capability | Endpoint | Feasible in HTTP-only n8n node? |
|---|---|---|
| Provider health / capacity | `GET :8443/status` | **YES** — unauth, plain JSON [LIVE] |
| Provider version | `GET :8443/version` | **YES** — unauth, plain JSON [LIVE] |
| Provider on-chain address | `GET :8443/address` | **YES** — unauth, plain JSON [LIVE] |
| Provider discovery (list, hostURI, attrs) | on-chain `GET /akash/provider/v1beta4/providers` **or** Console API | **YES** — unauth JSON [LIVE] |
| Uptime / audited / GPU capacity / pricing | Console API `console-api.akash.network` | **YES** — unauth JSON [LIVE] |
| Lease status | `GET :8443/lease/{d}/{g}/{o}/status` | **PARTIAL** — plain JSON but **mTLS/JWT-gated** [SRC/LIVE-401] |
| Service status | `GET :8443/lease/.../service/{svc}/status` | **PARTIAL** — plain JSON, auth-gated |
| Read active manifest | `GET :8443/lease/.../manifest` | **PARTIAL** — plain JSON, auth-gated |
| Submit manifest (start workload) | `PUT :8443/deployment/{dseq}/manifest` | **PARTIAL** — plain JSON PUT, auth-gated; but useless without a signed on-chain lease first |
| Service logs | `GET :8443/lease/.../logs` | **NO** — WebSocket upgrade [SRC] |
| Kube events | `GET :8443/lease/.../kubeevents` | **NO** — WebSocket upgrade [SRC] |
| Shell into container | `POST :8443/lease/.../shell` | **NO** — WebSocket upgrade [SRC] |

**Bottom line.** The *public* provider surface (`/status`, `/version`, `/address`) plus the
*aggregator/on-chain* surface (Console API + `v1beta4` provider list) give the n8n node a
complete **read-only observability + discovery + marketplace-pricing** feature set over plain
HTTP/1.1 JSON — no deps, no signing. Everything **lease-scoped** on the provider (status,
manifest read, manifest submit) is gated behind **mTLS client-cert OR JWT** whose identity is
an Akash wallet key — i.e. it needs a signing credential the node cannot hold under the
zero-dep / no-mnemonic rule. Logs/events/shell are **WebSocket** and are out regardless of auth.
So: build the read/discovery/pricing surface; do **not** attempt lease-scoped provider calls
in v1.

---

## 1. Provider gateway — transport, port, TLS

- **Port `:8443`**, HTTPS. [LIVE] all 60-ish online providers answer here; `hostUri` in the
  provider record already includes the port (`https://provider.europlots.com:8443`).
- **TLS cert is self-signed / not in the public WebPKI chain.** `curl` needs `-k`; from an
  n8n node the HTTP request must set `rejectUnauthorized: false` (n8n: the credential's
  "Ignore SSL Issues" / `skipSslCertificateValidation`). The provider proves identity via its
  on-chain server cert, not a CA — the node has no cheap way to pin this, so it must skip
  verification. Documented trade-off; matches how the official CLI dials providers.
- Server: `provider-services` (the daemon formerly `akash provider`), version **v0.14.2**
  live today [LIVE].

## 2. Public (unauthenticated) gateway endpoints — FEASIBLE

All three verified live against `provider.europlots.com`, `provider.hurricane.akash.pub`,
`provider.boogle.cloud` (2026-07-17). No auth header, no client cert.

### `GET :8443/version` [LIVE]
```json
{"akash":{"name":"provider-services","server_name":"provider-services",
  "version":"v0.14.2","commit":"498f8ec8...","go":"go version go1.26.2 linux/amd64",
  "build_deps":[ ...~300 entries... ]}}
```
`build_deps` is huge (~10 KB) — the node should surface `version`/`commit` and drop the rest.

### `GET :8443/address` [LIVE]
```json
{"address":"akash18ga02jzaq8cw52anyhzkwta5wygufgu6zsz6xc"}
```
The provider's on-chain owner address (bech32 `akash1…`, 44 chars).

### `GET :8443/status` [LIVE] — the money endpoint
Top-level keys: `cluster`, `bidengine`, `manifest`, `cluster_public_hostname`, `address`,
`leased_ip`. Trimmed live shape:
```json
{
  "cluster": {
    "leases": 24,
    "inventory": {
      "active":  [ {"cpu":4000,"gpu":0,"memory":32000000000,"storage_ephemeral":60000000000}, ... ],
      "pending": [ ... ],
      "available": {
        "nodes": [
          {"name":"ceph1",
           "allocatable":{"cpu":47400,"gpu":0,"memory":122716651520,"storage_ephemeral":138702508620},
           "available": {"cpu":145,"gpu":0,"memory":22513100800,"storage_ephemeral":79378272844}}
        ]
      }
    }
  },
  "bidengine": {"orders": 0},
  "manifest":  {"deployments": 1},
  "cluster_public_hostname": "provider.europlots.com",
  "address": "akash18ga02...",
  "leased_ip": null
}
```
Field notes: `cpu` is in **millicpu** (4000 = 4 cores); `memory`/`storage_*` in **bytes**;
`gpu` an integer count. `cluster.leases` = active lease count on that provider. This one GET
powers a "provider health / free capacity / GPU availability" n8n node with zero auth.
> NOTE: on **GPU providers** the `available.nodes[]` entries carry GPU model/attribute detail;
> the CPU-only providers I probed report `gpu:0`. Shape of the GPU sub-object is **UNVERIFIED**
> live (didn't catch a free GPU node at probe time) — confirm against a GPU provider before
> relying on nested GPU field names.

## 3. Authenticated (lease-scoped) gateway endpoints — mostly NOT feasible

### Exact route table [SRC] (`gateway/rest/router.go`, `path.go`, `main`)

Public (no auth middleware):
| Method | Path | Handler |
|---|---|---|
| GET | `/version` | version |
| GET | `/address` | address |
| GET | `/status` | status |

Authenticated — every route below is wrapped in `prepareAuthMiddleware` →
`authorizeProviderMiddleware` → `requireOwner` and (lease routes) `requireLeaseID`:
| Method | Path | Transport | Scope |
|---|---|---|---|
| PUT | `/deployment/{dseq}/manifest` | JSON | SendManifest |
| GET | `/lease/{dseq}/{gseq}/{oseq}/manifest` | JSON | GetManifest |
| GET | `/lease/{dseq}/{gseq}/{oseq}/status` | JSON | Status |
| GET | `/lease/{dseq}/{gseq}/{oseq}/service/{serviceName}/status` | JSON | Status |
| GET | `/lease/{dseq}/{gseq}/{oseq}/logs` | **WebSocket** | Logs |
| GET | `/lease/{dseq}/{gseq}/{oseq}/kubeevents` | **WebSocket** | Events |
| POST | `/lease/{dseq}/{gseq}/{oseq}/shell` | **WebSocket** | Shell |
| POST | `/lease/{dseq}/{gseq}/{oseq}/attestation/quote` | JSON | Attestation |
| POST | `/hostname/migrate` | JSON | — |
| POST | `/endpoint/migrate` | JSON | — |

Path IDs: `dseq` = deployment sequence (block height), `gseq` = group, `oseq` = order.

`leaseStatusHandler`/`leaseServiceStatusHandler` → `writeJSON()` (plain JSON) [SRC].
`leaseLogsHandler`/`leaseKubeEventsHandler`/`leaseShellHandler` → `websocket.Upgrader{}.Upgrade()`
[SRC] — persistent WS streams, **not reachable by n8n's HTTP/1.1 JSON helper** (same wall
Tenki hit; no streaming in an HTTP node).

### Auth: both mTLS client-cert AND JWT bearer are accepted [SRC]
`gateway/rest/auth.go` `prepareAuthMiddleware`:
```
tok := AuthHeaderTokenExtractor(r)                    // "Authorization: bearer <jwt>"
claims := gwutils.AuthProcess(ctx, r.TLS.PeerCertificates, tok)  // cert OR jwt
authorizeProviderMiddleware → claims.AuthorizeForProvider(provider)
```
So a v0.14.x provider authenticates a request by **either**:
1. **mTLS**: the TLS handshake presents a client cert whose CN is the tenant's `akash1…`
   address; the provider verifies it against the on-chain `cert` module. [SRC/DOCS]
2. **JWT bearer**: `Authorization: bearer <token>` (lowercase `bearer` accepted by the
   extractor), a JWT the tenant **signs with their wallet private key** (secp256k1), which the
   provider validates by fetching the tenant pubkey from chain. [SRC/DOCS]

**Live proof of the gate** [LIVE]: `GET :8443/lease/1/1/1/status` with no cert/token →
```
HTTP 401
{"message":"unauthorized access"}
```

### Why this is a wall for the n8n node
Both auth methods bind to a **wallet signing key**:
- mTLS needs a client cert minted from the mnemonic (`provider-services tx cert create client`)
  — an on-chain tx (fees) plus a `<address>.pem` key file the node would have to hold. [DOCS]
- JWT (AEP-64, **Final 2025-10-28**) is **ES256K / secp256k1**, signed by the tenant key.
  Claims: `iss` (owner `akash1…`), `iat`/`exp`/`nbf`, `version:"v1"`, `leases` access object,
  optional `jti` + `permissions` (actions: logs, shell, status, restart, manifest, migrate);
  access tiers **full / scoped / granular**. [DOCS/roadmap]

Generating either credential means holding a mnemonic and doing secp256k1 signing in-node —
exactly the zero-runtime-dep / no-mnemonic-in-credential line ORCHESTRATION.md draws. **JWT is
the lighter of the two** (a JWT can be minted without an on-chain tx, unlike a cert), so if a
future release ever does lease-scoped provider calls, JWT (ES256K) is the path to cost — but it
still needs a secp256k1 signer bundled. Treat as a documented heavy last resort, not v1.

> Even if auth were solved, `PUT /deployment/{dseq}/manifest` (start a workload) is inert
> without a **signed on-chain lease** existing first (create deployment → provider bids →
> accept bid/create lease — all signed txs). Manifest submit is the *last* step of a flow whose
> earlier steps are off-limits. Do not expose it standalone.

## 4. Provider discovery / attributes — FEASIBLE two ways

### (a) On-chain provider module over REST (LCD) [LIVE]
```
GET {lcd}/akash/provider/v1beta4/providers?pagination.limit=N
GET {lcd}/akash/provider/v1beta4/providers/{owner}
```
Verified 200 on **three independent public LCDs**: `akash-api.polkachu.com`,
`rest-akash.ecostake.com`, `akash-rest.publicnode.com`. Returns:
```json
{"providers":[{"owner":"akash1qpy...","host_uri":"https://provider.forgeelectronics.uk:8443",
  "attributes":[{"key":"host","value":"akash"},{"key":"tier","value":"community"},
    {"key":"organization","value":"Forge Electronics"},{"key":"region",...},
    {"key":"hardware-cpu-arch","value":"x86_64"}, ...],
  "info":{"email":"...","website":"..."}}]}
```
**Version gotcha**: the current module version is **`v1beta4`**. `v1beta3` returns
`{"code":12,"message":"Not Implemented"}` on these nodes (I hit this first) — always use
`v1beta4`. `pagination.limit`/`pagination.key` are standard Cosmos SDK params. The node should
let the user pick an LCD base URL (default a reliable public one) since not every node enables
every gRPC-gateway route.

### (b) Akash Console API — the richer, easier aggregator [LIVE]
Base `https://console-api.akash.network`, **all unauthenticated JSON GET**, CORS-open, this is
what the official Console web UI uses.

- `GET /v1/providers` → array of every provider with hostUri + live derived metadata.
- `GET /v1/providers/{owner}` → single provider; keys include:
  `owner, name, hostUri, akashVersion, isOnline, lastOnlineDate, isValidVersion,`
  `uptime1d, uptime7d, uptime30d, isAudited, attributes[], stats{cpu,gpu,memory,storage},`
  `gpuModels[], deploymentCount, leaseCount, ipCountry/ipLat/ipLon, organization, tier,`
  `hardwareCpu, hardwareGpuModels[], hardwareMemory, networkSpeedDown/Up,`
  `featPersistentStorage, featEndpointCustomDomain, ...`
- Each `attributes[]` entry is `{"key","value","auditedBy":[<auditor akash1… addresses>]}` —
  i.e. **audited attributes come for free here** (`isAudited` + per-attr `auditedBy`), no
  separate audit-module call needed. [LIVE]

**Uptime** (1d/7d/30d as 0–1 floats) is Console-derived, not on-chain — the on-chain modules do
not expose uptime, so for uptime the node must use the Console API. [LIVE]

## 5. Pricing & network capacity — FEASIBLE via Console API [LIVE]

- `GET /v1/network-capacity` →
  `{"resources":{"cpu":{active,pending,available,total}, "gpu":{...}, "memory":{...},
    "storage":{...}}, "activeProviderCount":60}` — whole-network supply snapshot.
- `GET /v1/gpu-prices` → GPU marketplace pricing, per model:
  ```json
  {"availability":{"total":248,"available":117},
   "models":[{"vendor":"nvidia","model":"a100","ram":"80Gi","interface":"SXM4",
     "availability":{"total":48,"available":6},
     "providerAvailability":{"total":4,"available":3},
     "price":{"currency":"USD","min":1.13,"max":1.83,"avg":1.48,"weightedAverage":1.36,"med":1.48},
     "priceUakt":{"currency":"uakt","min":1780097.43,"max":3307107.7,"avg":2375820.04,...}}]}
  ```
  Gives both USD and `uakt` (micro-AKT) price bands per GPU SKU. [LIVE]
- `GET /v1/pricing` → **404** (no such path; pricing is per-resource elsewhere). Deployment
  cost estimation in Console is a separate `POST /v1/pricing`-style calc — **UNVERIFIED**, not
  probed (would need body); the GPU/capacity GETs above are the safe verified pricing surface.

> Marketplace bid/lease pricing also exists on-chain (`akash.market.v1beta5` orders/bids/leases)
> but those REST routes are inconsistently enabled across LCD nodes; for pricing UX the Console
> API is the pragmatic verified source.

## 6. What to build (recommendation)

An **"Akash Provider" read node** entirely on n8n's HTTP helper, zero deps:
- Operations off the gateway public surface: **Provider Status**, **Provider Version**,
  **Provider Address** (`:8443/{status,version,address}`, `rejectUnauthorized:false`).
- Operations off discovery/aggregator: **List Providers**, **Get Provider**, **Network
  Capacity**, **GPU Prices**, **Provider Uptime/Audit** (Console API + `v1beta4` LCD).

Explicitly **out of scope for v1** (document why): lease status/manifest read (mTLS/JWT +
wallet key), manifest submit (needs prior signed lease), and logs/events/shell (WebSocket).
Note the JWT (AEP-64, ES256K) path as the eventual — but dep-heavy — door to lease-scoped calls.

## Open items to re-verify before coding
- GPU sub-object field names inside `:8443/status` `available.nodes[]` on a live **GPU** provider.
- Whether a single default public LCD reliably serves `provider/v1beta4` long-term, or the node
  should default to the Console API for discovery and treat LCD as optional/advanced.
- Console API stability/rate-limits (undocumented public API; no key required today [LIVE]).
