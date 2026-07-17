# SDL + the deployment transaction flow (signing model, manifest, certificates)

Research agent output, 2026-07-17. Scope: **SDL** (Stack Definition Language) structure and the
**full deployment tx flow** a signer walks — CreateDeployment → orders/bids → CreateLease →
SendManifest → lease-status — plus **exactly what requires an on-chain signature vs what the
provider gateway accepts with an mTLS client cert**, and the **certificate model** (`akash cert
create`).

Sibling docs (read them for the surfaces they own, not repeated here):
- `chain-rest.md` — read-only LCD/REST query paths (deployment/market/provider/cert/bank).
- `provider-services.md` — provider gateway `:8443` REST + mTLS/JWT auth, discovery.
- `console-api.md` — the Akash **Console** managed API (server-side signing; the n8n-native write path).

**Verification legend** (per claim):
- **[LIVE]** — read-only `curl GET` against a public endpoint on 2026-07-17 (mainnet `akashnet-2`,
  app `2.1.0`, block ~27.7M). HTTP 200 with the shape shown.
- **[SRC]** — read from source: `akash-network/akashjs@main`, `akash-network/provider@main`,
  or `akash-network/docs@master`.
- **[DOCS]** — akash.network docs prose; not independently wire-probed.

**FINANCIAL BOUNDARY honored:** every live probe was an unauthenticated read-only GET. Nothing
signed, no funds moved, no POST/PUT to an authenticated service.

---

## 0. TL;DR — verdict for an HTTP-only, zero-runtime-dep n8n node

The deployment write path is a **Cosmos-SDK blockchain**. The state-changing steps
(`MsgCreateDeployment`, `MsgCreateLease`, `MsgCreateCertificate`, close/deposit/update) are
**signed protobuf transactions** — secp256k1 signature over a canonical `SignDoc`. That signing
step is **not** reproducible with n8n's plain-HTTP helper: it needs protobuf encoding + secp256k1
+ the Akash type registry (i.e. cosmjs/akashjs, heavy runtime deps). **SendManifest and
lease-status/logs are not chain txs** — they hit the **provider gateway over mutual TLS**, keyed
to an on-chain client certificate; n8n's `httpRequest` cannot present a client cert per request.

What plain HTTP **can** do natively (all [LIVE], see §7 and `chain-rest.md`):
- **Read everything**: deployments, orders, bids, leases, providers, certs, params, balances.
- **Broadcast a pre-signed tx**: `POST /cosmos/tx/v1beta1/txs` is plain JSON HTTP — but *signing*
  it is the part that needs crypto.
- **Fetch SignDoc inputs**: `GET /cosmos/auth/v1beta1/accounts/{addr}` → account number/sequence/pubkey.

**Conclusion:** an HTTP-only node **cannot** self-sign the create/lease txs and **cannot** speak
the mTLS manifest/status gateway. The zero-dep write path is therefore the **Console API**
(server-side signing, `x-api-key`; see `console-api.md`), with this doc's raw-chain flow reserved
for read/monitor operations + (optionally) broadcasting an externally-signed tx. Bundling
akashjs/cosmjs to sign in-node is the documented heavy last resort.

---

## 1. SDL structure

SDL is a YAML manifest (`deploy.yaml`, `.yml`/`.yaml`). **Current & only accepted `version`
string: `"2.0"`** [SRC docs `readme/stack-definition-language.md` §Version; also `sdl/README.md`].
Four required top-level sections + optional feature stanzas:

```
version | services | profiles | deployment        (+ persistent storage, gpu, stable payment, shm)
```

Two equivalent ways to spell compute resources both live under `version: "2.0"`:
- **flat form** (older examples): `web: { cpu: 2, memory: "2Gi", storage: "5Gi" }`
- **nested `resources:` form** (required for GPU / persistent / multi-volume storage):
  `resources: { cpu: {units}, memory: {size}, storage: [...], gpu: {units, attributes} }`

### 1a. `services` [SRC docs]
Map of service-name → service. Keys:

| Field | Req | Meaning |
|---|---|---|
| `image` | Yes | Docker image. Docs warn: avoid `:latest` (providers cache images heavily). |
| `command` / `args` | No | Override container entrypoint / args. |
| `env` | No | List of `KEY=value` strings. |
| `expose` | No | List of ingress rules (below). |
| `depends-on` | No | **Marked for future use — currently no effect on deployments** [DOCS]. |
| `params` | No | Service-specific settings; currently only `storage.<name>.{mount, readOnly}`. |

`expose[]` entry fields: `port` (req, container port), `as` (remap port), `proto`
(`tcp`|`udp`), `accept` (list of hostnames), `to` (list of `{service, global:bool}`),
`http_options` (`max_body_size`, `read_timeout`, `send_timeout`, `next_cases`, …).
Port→proto/ingress defaults: **`as: 80` ⇒ both 80 (HTTP) and 443 (HTTPS) exposed with a
self-signed cert**; anything else ⇒ tcp & udp. `to.global:true` = reachable from outside the
datacenter; `global:false` requires a `service` name (intra-deployment only). HTTPS from the
provider is **self-signed only** — real certs need a front end (Cloudflare) [DOCS].

```yaml
services:
  web:
    image: nginx
    env:
      - API_KEY=0xcafebabe
    expose:
      - port: 80
        as: 80
        accept: [ www.mysite.com ]
        http_options: { max_body_size: 2097152, next_cases: [ off ] }
        to:
          - global: true
```

### 1b. `profiles.compute` [SRC docs]
Named compute profiles; each is a resource request per service instance.
- `cpu` — vCPU share, fractional; `m` suffix = milli-CPU (`"100m"` = 1/10 vCPU). Nested: `cpu.units`.
- `memory` / `storage` — bytes, SI (`k,M,G,T,P,E` = 1000ⁿ) or binary (`Ki,Mi,Gi,Ti,…` = 1024ⁿ).
  Nested: `memory.size`, `storage.size` (or a **list** of storage volumes, see §1e).
- `gpu` — see §1d.

### 1c. `profiles.placement` + `deployment` [SRC docs]
`placement` = named datacenter profiles: `attributes` (key/value the provider must match),
optional `signedBy` (audited-attribute trust: `allOf` / `anyOf` lists of auditor `akash1…`
addresses — third-party certification of providers), and `pricing` (max price **per block** per
compute profile).

```yaml
profiles:
  placement:
    westcoast:
      attributes: { region: us-west }
      signedBy:
        allOf: [ "akash1vz375dkt0c60annyp6mkzeejfq0qpyevhseu05" ]
        anyOf: [ "akash1vl3gun7p8y4ttzajrtyevdy5sa2tjz3a29zuah" ]
      pricing:
        web: { denom: uakt, amount: 8 }     # 8 uakt/block max bid for the `web` compute profile
        db:  { denom: uakt, amount: 100 }
  # (older shorthand also valid: pricing: { web: 10u, db: 50u })
deployment:                                  # service -> placement -> compute+count
  web:
    westcoast: { profile: web, count: 20 }   # 20 instances of `web` in a `westcoast` datacenter
```

`denom`: `uakt` (native AKT). **Stable payments**: `denom` may be an IBC channel denom — docs
list **Axelar USDC** as `ibc/170C677610AC31DF0904FFE09CD3B5C657492170E7E52372E48756B71E56F2F1`
[DOCS]. (Live bid data shows this exact IBC denom in use — [LIVE], §7.)

### 1d. GPU support [SRC docs `stack-definition-language.md#gpu-support`]
GPU lives in the **nested** compute `resources.gpu`:

```yaml
profiles:
  compute:
    obtaingpu:
      resources:
        cpu:    { units: 1.0 }
        memory: { size: 1Gi }
        gpu:
          units: 1
          attributes:
            vendor:
              nvidia:
                - model: rtx4090          # model OPTIONAL; omit to accept any nvidia GPU
        storage: { size: 1Gi }
```
- Model list & canonical names: `akash-network/provider-configs/.../devices/pcie/gpus.json`.
- **Omit models** to bid across any GPU: `vendor: { nvidia: }` (empty).
- **Multiple models** = OR (any listed model bids): `nvidia: [ {model: rtx4090}, {model: t4} ]`.
- **Interface** requirement optional: `- model: a100\n  interface: sxm`. **Only `pcie` or `sxm`**
  are valid (never SXM variants like `sxm4`).

### 1e. Persistent storage [SRC docs `features/persistent-storage/*`]
Storage under `resources.storage` is a **list** (≤ **2 volumes per profile**): one mandatory
ephemeral container volume (size only) + one optional persistent volume.

Persistent volume attributes: `persistent: true` (default false), `class` (storage class),
`name` (links to `services.<svc>.params.storage.<name>`; default `default`). **Setting `class`
on a non-persistent volume is invalid.** Storage classes:

| Class | Backing device |
|---|---|
| `beta1` | HDD |
| `beta2` | SSD |
| `beta3` | NVMe |
| `ram`   | shared memory (SHM) — **must NOT be `persistent`; validation errors if it is** |

```yaml
profiles:
  compute:
    grafana:
      resources:
        cpu:    { units: 1 }
        memory: { size: 1Gi }
        storage:
          - size: 512Mi                    # ephemeral, unnamed
          - name: data                     # persistent volume
            size: 1Gi
            attributes: { persistent: true, class: beta2 }
services:
  postgres:
    image: postgres
    params:
      storage:
        data: { mount: /var/lib/postgres, readOnly: false }   # name must match the volume
```
SHM: add a `- name: shm, size: 1Gi, attributes: { class: ram }` volume and mount it at
`/dev/shm` via `params.storage.shm.mount`.

---

## 2. The deployment tx flow (end to end)

Client tool is **`provider-services`** (the renamed `akash` CLI; message layer = akashjs /
`@akashnetwork/chain-sdk`). Three distinct transport planes — this is the whole story:

| Plane | Transport | Auth | n8n-HTTP-native? |
|---|---|---|---|
| **A. Chain writes** (create deployment, create lease, cert, close…) | Cosmos tx → RPC `:26657` / broadcast via LCD | **secp256k1 signature** (wallet key) | **No** — needs signing crypto |
| **B. Chain reads** (deployments/orders/bids/leases/providers/certs/params) | LCD REST `:1317` (gRPC-gateway), plain JSON GET | none | **Yes** [LIVE] |
| **C. Provider gateway** (send-manifest, lease-status/logs/events/shell) | HTTPS `:8443` to provider host | **mTLS client cert** (on-chain) or JWT | **No** — mTLS per-request / WS |

Sequence (plane in brackets):

```
[A] 0. akash tx cert create client          -> publish client cert on-chain  (MsgCreateCertificate)
[A] 1. provider-services tx deployment create deploy.yml
          -> MsgCreateDeployment: manifest hash + escrow deposit; chain auto-creates an ORDER
[B] 2. query market bid list                 -> providers bid (price per block); read-only
[A] 3. provider-services tx market lease create
          -> MsgCreateLease over a chosen bid; escrow starts debiting immediately
[C] 4. provider-services send-manifest deploy.yml --dseq --provider
          -> PUT the manifest to the provider gateway over mTLS (NOT a chain tx)
[C] 5. provider-services lease-status / lease-logs
          -> GET service URIs / replica counts / logs from the provider gateway over mTLS
```

### Step 1 — CreateDeployment [SRC + DOCS, real tx output in docs part-7]
`provider-services tx deployment create deploy.yml --from <key>`. Signed. On success the tx log
emits (verbatim shape from docs):
- `akash.v1 / deployment-created`: `version` = **manifest hash** (hex, e.g.
  `2b86f778de8cc9df415490efa162c58e7a0c297fbac9cdb8d6c6600eda56f17e`), `owner`, `dseq`
  (**deployment sequence = block height at create**).
- `market / order-created`: `owner`, `dseq`, `gseq` (group seq, `1`), `oseq` (order seq, `1`).
- `transfer`: escrow deposit moved to the deployment escrow account. Docs example shows
  `5000000uakt` (5 AKT) deposit + `5000uakt` fee; **current chain minimum deposit is `500000uakt`
  = 0.5 AKT** ([LIVE] `/akash/deployment/v1beta4/params` → `min_deposits: 500000`).

**MsgCreateDeployment** message type URL: `/akash.deployment.v1beta4.MsgCreateDeployment` [SRC
akashjs `src/stargate/index.ts` `Message` enum]. Fields (proto / akashjs / docs):
`id: { owner, dseq }`, `groups: []` (derived from SDL placement/compute), `version: bytes`
(the SDL manifest hash), `deposit: { denom, amount }`, `depositor` (address funding escrow — may
differ from owner, enabling authz-funded deposits).

The on-chain deployment stores the hash; [LIVE] `/akash/deployment/v1beta4/deployments/info`
returns `deployment.hash` as **base64** (`bLTCo5xFV2obtovLJ/rUZDHLkzAbB8vlXpF2iJGKpaY=`) — same
SHA-256 as the hex `version` event, different encoding.

### Step 2 — orders & bids [LIVE, read-only]
Chain opens an **order**; providers post **bids**. Read via LCD (no signing):
`query market bid list --owner --dseq --state=open`. Bid shape [LIVE]:
`bid.id { owner, dseq, gseq, oseq, provider, bseq }`, `state`, `price { denom, amount }`,
plus an `escrow_account` (bid deposit). `order_max_bids` = 20 ([LIVE] market params). Bids close
automatically **~5 min** after the order opens ("bid not open" if you lease too late) [DOCS].

### Step 3 — CreateLease [SRC + DOCS]
`provider-services tx market lease create --dseq --provider --from <key>`. Signed. Accepts one
bid → `lease.state: active`. **MsgCreateLease** type URL:
`/akash.market.v1beta5.MsgCreateLease` [SRC]. Field: `bid_id: { owner, dseq, gseq, oseq,
provider }`. **Escrow debiting begins the moment the lease is active — even before the manifest
is sent** [DOCS hint]. Lease shape [LIVE `/akash/market/v1beta5/leases/list`]:
`lease.id { owner, dseq, gseq, oseq, provider, bseq }`, `state`, `price { denom, amount }`.

### Step 4 — SendManifest (NOT a chain tx) [SRC provider gateway + DOCS]
`provider-services send-manifest deploy.yml --dseq --provider --from <key>`. This **PUTs the
manifest JSON to the provider's gateway over mutual TLS** — no chain interaction, no fee. Flags:
`--dseq`, `--gseq` (default 1), `--oseq` (default 1), `--provider`, `--from` (selects the key/cert
used for the mTLS handshake). The provider validates the presented client cert against the
tenant's on-chain certificate before accepting.

### Step 5 — lease-status / logs [SRC provider gateway + DOCS, real output]
`provider-services lease-status --dseq --provider --from <key>` → JSON with service URIs (verbatim
docs output):
```json
{ "services": { "web": { "name":"web","available":1,"total":1,
  "uris":["rga3h05jetf9h3p6dbk62m19ck.ingress.ewr1p0.mainnet.akashian.io"],
  "replicas":1,"ready_replicas":1,"available_replicas":1 } },
  "forwarded_ports": {} }
```
`lease-logs` / `lease-events` stream (WebSocket) from the same gateway.

---

## 3. What REQUIRES signing vs what the gateway accepts with mTLS

| Action | Requires on-chain signature? | Message / endpoint |
|---|---|---|
| Publish client certificate | **Yes** (tx) | `/akash.cert.v1.MsgCreateCertificate` |
| Create deployment | **Yes** (tx) | `/akash.deployment.v1beta4.MsgCreateDeployment` |
| Deposit / update / close deployment | **Yes** (tx) | `MsgDepositDeployment` / `MsgUpdateDeployment` / `MsgCloseDeployment` (`…deployment.v1beta4`) |
| Pause/start/close group | **Yes** (tx) | `MsgPauseGroup` / `MsgStartGroup` / `MsgCloseGroup` (`…deployment.v1beta4`) |
| Create / close lease | **Yes** (tx) | `/akash.market.v1beta5.MsgCreateLease`, `MsgCloseLease` |
| **Send manifest** | **No** (mTLS to provider) | `PUT :8443/deployment/{dseq}/manifest` |
| **Lease status / logs / events / shell** | **No** (mTLS to provider) | `GET/POST :8443/lease/{dseq}/{gseq}/{oseq}/…` |
| Read anything (deployments/bids/leases/providers/params/balances) | **No** (public GET) | LCD REST — see `chain-rest.md` |

All chain message type URLs above are verbatim from akashjs `src/stargate/index.ts` `enum Message`
[SRC]. Note the version skew that live probes confirm: **deployment module = v1beta4, market
module = v1beta5, cert module = v1, provider module = v1beta4** (§7).

**Signing mechanics** (why plain HTTP can't do it) [SRC akashjs `src/rpc/index.ts`]: akashjs signs
with cosmjs `SigningStargateClient.connectWithSigner(rpc, signer, { registry: Registry(akashTypes),
gasPrice: "0.025uakt" })`. Building the tx needs the Akash protobuf type registry + a secp256k1
`OfflineSigner`; the signature is over the SHA-256 of the serialized `SignDoc` (TxBody+AuthInfo).
n8n's `httpRequest` provides none of this. Broadcasting the *result* is plain HTTP
(`POST /cosmos/tx/v1beta1/txs`, base64 `tx_bytes`) — so a viable split is "sign elsewhere, broadcast
over HTTP," but the node cannot originate the signature without bundling crypto.

**Manifest version hash** [SRC]: akashjs re-exports `SDL` from `@akashnetwork/chain-sdk`
(`SDL.fromString(yaml).manifest()`); the on-chain `version`/`hash` is the SHA-256 of the
canonicalized (deterministically-sorted) manifest groups. Reproducing it in pure JS is possible
but non-trivial (must match the canonical sort byte-for-byte) — another argument against a hand-rolled
HTTP-only writer.

---

## 4. Certificate model — `akash cert create` (mTLS) [SRC akashjs + docs `decentralized-cloud/mtls.md`]

Every tenant account must publish a **client certificate on-chain before deploying** (providers
publish a **server** cert). The cert is the identity the provider gateway checks on the mTLS
handshake for manifest/status/logs/shell.

**CLI** [DOCS]:
```
akash tx cert create client --from=main                 # tenant (client) cert — SIGNED tx
akash tx cert create server example.com --from=main     # provider (server) cert; domains must match HostURI
akash tx cert revoke  --from=main [--serial=<#>]
akash query cert list --owner="$(akash keys show main -a)" [--state=valid|revoked]
```
- Default validity **365 days**; `--naf`(not-after, `180d` or RFC3339) / `--nbf`(not-before).
- Local storage: cert + private key in one file `~/.akash/<address>.pem`; `--rie` = revoke-if-exists
  to avoid the interactive prompt. Only the **public** cert is committed on-chain; the private key
  never leaves the client.

**Exact cert generated** [SRC akashjs `CertificateManager.generatePEM()`]:
- Key: **EC / `secp256r1` (P-256)** keypair (`rs.KEYUTIL.generateKeypair("EC","secp256r1")`).
- X.509 **v3, self-signed**: `issuer == subject == "/CN=<akash1… address>"`.
- Extensions: `keyUsage {keyEncipherment, dataEncipherment}` (critical),
  `extKeyUsage { clientAuth }`, `basicConstraints { cA: true }` (critical).
- `sigalg: SHA256withECDSA`; `serial = floor(Date.now()*1000)`; default notAfter = notBefore + 1yr.
- Published via **`MsgCreateCertificate`** (`/akash.cert.v1.MsgCreateCertificate`) — `cert`
  (base64 PEM) + `pubkey`. [LIVE] `/akash/cert/v1/certificates/list` returns exactly
  `certificate.{ state, cert(base64 PEM), pubkey }`.

**Provider-side enforcement** [SRC `akash-network/provider` `gateway/utils/utils.go`
`NewServerTLSConfig`]: gateway TLS uses `ClientAuth: tls.RequestClientCert` +
`VerifyPeerCertificate` → `atls.ValidatePeerCertificates(ctx, cquery, peerCerts,
[ExtKeyUsageClientAuth])`. I.e. the presented client cert is validated against the tenant's
**on-chain** certificate. **Newer providers also accept a JWT bearer** (`gateway/rest/auth.go`,
`/address` + `AuthProcess`) as an alternative to mTLS — see `provider-services.md`. Neither mTLS
nor the WS shell is expressible with n8n's `httpRequest` (no per-request client-cert/keypair).

---

## 5. Provider gateway REST routes [SRC `akash-network/provider` `gateway/rest/router.go`]

Host = provider `host_uri` from chain (e.g. `https://provider.forgeelectronics.uk:8443` — [LIVE]).
Path prefixes: `DeploymentPathPrefix=/deployment/{dseq}`, `LeasePathPrefix=/lease/{dseq}/{gseq}/{oseq}`.

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET  | `/version` | provider version | none |
| GET  | `/status` | provider health/capacity | none |
| GET  | `/address` | provider account (JWT flow) | none |
| **PUT** | `/deployment/{dseq}/manifest` | **send manifest** | mTLS/JWT |
| GET  | `/lease/{dseq}/{gseq}/{oseq}/status` | **lease status** (URIs, replicas) | mTLS/JWT |
| GET  | `/lease/{dseq}/{gseq}/{oseq}/manifest` | fetch stored manifest | mTLS/JWT |
| GET  | `/lease/{dseq}/{gseq}/{oseq}/logs` | container logs (stream) | mTLS/JWT |
| GET  | `/lease/{dseq}/{gseq}/{oseq}/kubeevents` | k8s events (stream) | mTLS/JWT |
| GET  | `/lease/{dseq}/{gseq}/{oseq}/service/{serviceName}/status` | per-service status | mTLS/JWT |
| POST | `/lease/{dseq}/{gseq}/{oseq}/shell` | exec shell (WebSocket) | mTLS/JWT |

---

## 6. Message-type version reference [SRC akashjs `src/stargate/index.ts`, main]

```
MsgCreateCertificate  /akash.cert.v1.MsgCreateCertificate
MsgRevokeCertificate  /akash.cert.v1.MsgRevokeCertificate
MsgCreateDeployment   /akash.deployment.v1beta4.MsgCreateDeployment
MsgDepositDeployment  /akash.deployment.v1beta4.MsgDepositDeployment
MsgUpdateDeployment   /akash.deployment.v1beta4.MsgUpdateDeployment
MsgCloseDeployment    /akash.deployment.v1beta4.MsgCloseDeployment
MsgCloseGroup|PauseGroup|StartGroup   /akash.deployment.v1beta4.*
MsgCreateLease        /akash.market.v1beta5.MsgCreateLease
```
Signing client: cosmjs `SigningStargateClient`, `gasPrice = 0.025uakt`, registry =
`getAkashTypeRegistry()`. Query client: `Tendermint34Client` + protobuf RPC (RPC `:26657`) — but
the **LCD gRPC-gateway REST** (§7) gives the same reads over plain JSON, which is what the node uses.

---

## 7. Live-probed read surface (all [LIVE] 2026-07-17, `https://api.akashnet.net`)

Version strings that actually answer on mainnet (others → HTTP 501 "Not Implemented"):

| Query | Path (HTTP 200) | Dead variants |
|---|---|---|
| Providers | `/akash/provider/v1beta4/providers` | v1beta3 → 501 |
| Deployments list | `/akash/deployment/v1beta4/deployments/list` | v1beta3 → 501 |
| Deployment get | `/akash/deployment/v1beta4/deployments/info?id.owner=…&id.dseq=…` | |
| Deployment params | `/akash/deployment/v1beta4/params` → `min_deposits: [{uakt,500000},{uact,500000}]` | |
| Orders list | `/akash/market/v1beta5/orders/list` | |
| Bids list | `/akash/market/v1beta5/bids/list` | v1beta4 → 501 |
| Leases list | `/akash/market/v1beta5/leases/list` | v1beta4 → 501 |
| Market params | `/akash/market/v1beta5/params` → `bid_min_deposit 500000, order_max_bids 20` | |
| Certificates | `/akash/cert/v1/certificates/list` | v1beta3/v1beta4 → 501 |
| Auth account (SignDoc inputs) | `/cosmos/auth/v1beta1/accounts/{addr}` → account_number, sequence, secp256k1 pubkey | |
| Tx broadcast/simulate | `POST /cosmos/tx/v1beta1/txs`, `POST /cosmos/tx/v1beta1/simulate` (handlers reached) | |

Observed live shapes worth noting:
- **Deposit floor is 0.5 AKT** (`500000uakt`) now, not the 5 AKT in older docs.
- Live bids/leases show prices in `uakt` **and** `uact` and the Axelar-USDC IBC denom
  `ibc/170C677610AC31DF0904FFE09CD3B5C657492170E7E52372E48756B71E56F2F1` — stable payments are in
  active use. (`uact` appears alongside `uakt` in `min_deposits`; treat denom as data, don't assume `uakt`.)
- `order.spec.requirements.signed_by` and `attributes` (e.g. `console/trials: "true"`) are visible
  on open orders — the SDL `signedBy`/`placement.attributes` round-trip onto the chain order.

Sibling `chain-rest.md` has the full field-by-field read reference; `provider-services.md` has the
gateway/auth detail; `console-api.md` is the managed server-side-signing path.

---

## 8. Sources
- SDL: `github.com/akash-network/docs` — `readme/stack-definition-language.md`, `sdl/README.md`,
  `sdl/deployment.yaml`, `features/persistent-storage/*`.
- tx flow: `docs` — `guides/cli/detailed-steps/part-{6,7,8,9,10}.*`,
  `cli/provider-services_{send-manifest,lease-status}.md`, `decentralized-cloud/mtls.md`.
- messages/signing/cert: `github.com/akash-network/akashjs@main` — `src/stargate/index.ts`,
  `src/rpc/index.ts`, `src/sdl/index.ts`, `src/certificates/certificate-manager/CertificateManager.ts`.
- gateway routes/mTLS: `github.com/akash-network/provider@main` — `gateway/rest/router.go`,
  `gateway/rest/path.go`, `gateway/utils/utils.go`, `gateway/rest/server.go`.
- live: `https://api.akashnet.net` LCD (mainnet `akashnet-2`, app `2.1.0`), 2026-07-17.
- API index: `github.com/akash-network/akash-api/blob/main/docs/swagger-ui/swagger.yaml`.
