# n8n-nodes-akash

An [n8n](https://n8n.io) community node package for [Akash Network](https://akash.network) — the decentralized compute marketplace.

The package ships two nodes: **Akash** (a resource/operation node covering GPU,
network, provider, market, chain, account, deployment, bid, and template reads)
and **Akash Trigger** (a polling trigger for price, capacity, provider, and
deployment/lease events). Both reach Akash over plain HTTP/JSON with **zero
runtime dependencies**.

## Status

**v1.0.0** — the complete **read + monitor + trigger + AI-agent-read** surface.
This is the publish gate: the entire zero-spend contract is frozen as the stable
public API. **No operation in this release spends funds** — every op is a public
read, an authenticated (non-spending) `GET`, or a dry-run request builder that
sends nothing. **Zero runtime dependencies** (no `cosmjs`/`akashjs`).

The managed-wallet **DEPLOY** write path — the only path that can move funds — is
**deferred to v1.1.0** behind a **human-only** gate. See
[Financial boundary](#financial-boundary).

## Install

In n8n, follow the [community-nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/):

**Settings → Community Nodes → Install →** `n8n-nodes-akash`

(Self-hosted n8n requires community nodes to be enabled.)

## Credential setup

**The credential is optional.** Every GPU, network, provider, market, chain, and
template read — and every trigger event except the two authenticated ones — runs
**keyless**, with no credential attached. You only need a key for the **Account**
resource, the authenticated **Deployment**/**Bid** reads, and the
`deploymentStatusChange` / `costThreshold` trigger events.

When you do need one:

1. Open **Akash Console → Settings → API Keys** and create a key.
2. In n8n, create an **Akash API** credential and paste the key into **API Key**.

| Field   | Detail                                                             |
| ------- | ----------------------------------------------------------------- |
| API Key | Sent as the `x-api-key` header. Stored as a password.             |
| Base URL | Console API base, defaults to `https://console-api.akash.network`. |

The credential test calls `GET /v1/user/me` (200 with a valid key, 401 without).
There is **no mnemonic and no client certificate** — the only secret is the
`x-api-key`.

## Endpoints and pinned module versions

The node talks to three keyless HTTP planes plus the authenticated Console API:

| Plane                     | Base URL                                    | Auth        | Notes                                                        |
| ------------------------- | ------------------------------------------- | ----------- | ----------------------------------------------------------- |
| Console API               | `https://console-api.akash.network`         | none / `x-api-key` | Public reads keyless; Account + managed reads need a key.   |
| Chain LCD — mainnet       | `https://api.akashnet.net`                  | none        | Cosmos REST reads. Default for the **Chain** resource.      |
| Chain LCD — sandbox-2     | `https://api.sandbox-2.aksh.pw`             | none        | Chain-REST reads only. Selected via the **Network** dropdown. |
| Provider gateway          | `https://<provider-host>:8443`              | none        | `getStatus` uses `skipSslCertificateValidation` (see below). |

The Chain resource resolves mainnet vs. sandbox-2 through its **Network**
dropdown (with an additive **Chain Base URL** override); no credential is needed
on any chain read.

**Pinned Cosmos module versions.** The on-chain module paths are pinned as
constants — Akash has already retired older versions, so a stale path returns
`HTTP 501`:

| Module     | Pinned version | Stale (returns 501) |
| ---------- | -------------- | ------------------- |
| deployment | `v1beta4`      | `v1beta3`           |
| market     | `v1beta5`      | `v1beta3`           |
| provider   | `v1beta4`      | `v1beta3`           |
| cert       | `v1`           | `v1beta3`           |

**Provider gateway TLS.** Provider `:8443` gateways serve self-signed
certificates, so `getStatus` reads set `skipSslCertificateValidation`. This is a
documented trade-off: provider identity is proven **on-chain** (via the
provider's registered `hostUri` and audited attributes), not through WebPKI.

## Operations

All operations are keyless reads unless marked **authed** — and **authed means an
`x-api-key` GET or a dry-run builder; nothing here spends funds**.

### GPU (keyless)

| Operation     | Value         | Endpoint             | Returns                                              |
| ------------- | ------------- | -------------------- | --------------------------------------------------- |
| Get Prices    | `getPrices`   | `GET /v1/gpu-prices` | Per-model marketplace pricing + availability.       |
| Get Inventory | `getInventory`| `GET /v1/gpu`        | Live allocatable/allocated GPU inventory.           |
| Get Models    | `getModels`   | `GET /v1/gpu-models` | Catalog of GPU models offered on Akash.             |

### Network (keyless)

| Operation    | Value        | Endpoint                   | Returns                                                   |
| ------------ | ------------ | -------------------------- | -------------------------------------------------------- |
| Get Capacity | `getCapacity`| `GET /v1/network-capacity` | Live cpu/gpu/memory/storage capacity + provider count.   |
| Get Stats    | `getStats`   | `GET /v1/dashboard-data`   | Network dashboard: chain stats, leases, spend, GPU, APR. |

### Provider (keyless)

| Operation    | Value        | Endpoint                          | Returns                                                       |
| ------------ | ------------ | --------------------------------- | ------------------------------------------------------------ |
| List         | `list`       | `GET /v1/providers`               | Provider registry (uptime, online/audit status, GPU models). |
| Get          | `get`        | `GET /v1/providers/{address}`     | One provider's detail + audited attributes.                  |
| Get Regions  | `getRegions` | `GET /v1/provider-regions`        | Provider regions.                                            |
| Get Earnings | `getEarnings`| `GET /v1/provider-earnings/{owner}` | Provider earnings for an owner.                            |
| Get Status   | `getStatus`  | provider `:8443` `/status` + `/version` | Live cluster inventory + gateway version (self-signed TLS). |

### Market (keyless, public, non-spending)

| Operation        | Value        | Endpoint                | Returns                                              |
| ---------------- | ------------ | ----------------------- | --------------------------------------------------- |
| Estimate Cost    | `estimate`   | `POST /v1/pricing`      | Pre-deploy USD/month estimate for a resource spec.  |
| Screen Providers | `screenBids` | `POST /v1/bid-screening`| Screen providers/bids for a deployment spec.        |

Both are **public POSTs that move no funds** — they size a deployment before you
ever cross the financial boundary.

### Chain (keyless Cosmos LCD — mainnet + sandbox-2)

| Operation          | Value             | Endpoint                                      |
| ------------------ | ----------------- | --------------------------------------------- |
| List Deployments   | `listDeployments` | `GET akash/deployment/v1beta4/deployments/list` |
| Get Deployment     | `getDeployment`   | `GET akash/deployment/v1beta4/deployments/info` |
| List Leases        | `listLeases`      | `GET akash/market/v1beta5/leases/list`        |
| Get Lease          | `getLease`        | `GET akash/market/v1beta5/leases/info`        |
| List Orders        | `listOrders`      | `GET akash/market/v1beta5/orders/list`        |
| Get Order          | `getOrder`        | `GET akash/market/v1beta5/orders/info`        |
| List Bids          | `listBids`        | `GET akash/market/v1beta5/bids/list`          |
| Get Bid            | `getBid`          | `GET akash/market/v1beta5/bids/info`          |
| List Certificates  | `listCertificates`| `GET akash/cert/v1/certificates/list`         |
| Get Balance        | `getBalance`      | `GET cosmos/bank/v1beta1/balances/{addr}`     |

List ops share a **Return All** / **Limit** toggle and follow Cosmos `next_key`
cursor pagination. `getBalance` returns **multi-denom** integer-string amounts
(`uakt`, IBC stables, …) — denominations are passed through as opaque data, never
assumed to be `uakt`.

### Account (authed `x-api-key`, non-spending)

| Operation        | Value          | Endpoint                        | Returns                                       |
| ---------------- | -------------- | ------------------------------- | --------------------------------------------- |
| Get Balance      | `getBalance`   | `GET /v1/balances`              | Managed-wallet USD credit balance.            |
| Get Usage History| `getUsage`     | `GET /v1/usage/history[/stats]` | Usage history (optionally aggregated).        |
| Get Wallets      | `getWallets`   | `GET /v1/wallets`               | Managed wallets (`address`, `creditAmount`, `isTrialing`). |
| Get Weekly Cost  | `getWeeklyCost`| `GET /v1/weekly-cost`           | Rolling weekly cost.                          |
| Who Am I         | `whoami`       | `GET /v1/user/me`               | The current authenticated user.               |

### Deployment

| Operation        | Value       | Endpoint                            | Auth    | Returns                                                   |
| ---------------- | ----------- | ----------------------------------- | ------- | -------------------------------------------------------- |
| List             | `list`      | `GET /v1/deployments`               | authed  | Managed deployments (`skip`/`limit`).                    |
| Get              | `get`       | `GET /v1/deployments/{dseq}`        | authed  | `leases[].status.services` — **poll-based status, not logs**. |
| Get Public       | `getPublic` | `GET /v1/deployment/{owner}/{dseq}` | keyless | Public deployment detail.                                |
| Create (Dry Run) | `create`    | builds `POST /v1/deployments` body  | authed  | See below — **builds and validates, sends nothing**.     |

**Create is a dry-run builder.** It ingests SDL from a **binary property** or an
expression **string** (no YAML library — zero-dep), constructs and validates the
`POST /v1/deployments` body `{data:{sdl,deposit}}`, and returns it. The **Dry
Run** toggle **defaults on** and performs **no network write**; the real send is
deferred to v1.1.0 and is human-only. Create is a write op — it is **never**
exposed as an AI-Agent tool.

Deployment **status is polling, not streaming.** Logs / shell / exec run over a
provider WebSocket/mTLS bridge and are an intentional non-goal — `get` returns
`leases[].status.services{uris,replicas,ready_replicas,forwarded_ports,ips}` as
the documented substitute.

### Bid

| Operation           | Value               | Endpoint             | Auth   | Returns                                     |
| ------------------- | ------------------- | -------------------- | ------ | ------------------------------------------- |
| List for Deployment | `listForDeployment` | `GET /v1/bids?dseq=` | authed | Managed-wallet bid poll for a deployment.   |

Distinct from the keyless chain bids under the **Chain** resource.

### Template (keyless — new in v1.0.0)

| Operation | Value  | Endpoint                | Returns                                              |
| --------- | ------ | ----------------------- | --------------------------------------------------- |
| List      | `list` | `GET /v1/templates-list`| The awesome-akash catalog, grouped by category.     |
| Get       | `get`  | `GET /v1/templates/{id}`| One template's detail (backed by a resourceLocator).|

## Akash Trigger events

The **Akash Trigger** node polls Akash and emits an item on a threshold-cross or
state transition. Every event **baseline-seeds on activation** (the first poll
records current state and does not emit) and **dedupes** via node static data, so
turning a trigger on never floods the workflow.

| Event                    | Value                    | Source                                                       | Auth    |
| ------------------------ | ------------------------ | ------------------------------------------------------------ | ------- |
| GPU Price Threshold      | `gpuPriceThreshold`      | `GET /v1/gpu-prices`                                         | keyless |
| GPU Availability Change  | `gpuAvailabilityChange`  | `GET /v1/gpu`                                                | keyless |
| Capacity Available       | `capacityAvailable`      | `GET /v1/network-capacity`                                   | keyless |
| AKT Price Threshold      | `aktPriceThreshold`      | CoinGecko `akash-network` (Console `/v1/market-data` fallback) | keyless |
| Provider Status Change   | `providerStatusChange`   | `GET /v1/providers`                                         | keyless |
| Deployment State Change  | `deploymentStateChange`  | chain `deployment/v1beta4` info                             | keyless |
| Lease State Change       | `leaseStateChange`       | chain `market/v1beta5` info                                 | keyless |
| Deployment Status Change | `deploymentStatusChange` | `GET /v1/deployments/{dseq}`                                | authed  |
| Cost Threshold           | `costThreshold`          | `GET /v1/weekly-cost` + `GET /v1/balances`                  | authed  |

The AKT price event reads live CoinGecko `akash-network`; on a CoinGecko error or
rate-limit it falls back to the Console `/v1/market-data` spot price (and warns
that market-cap / 24h volume / 24h change are then unavailable).

## Use as an AI-Agent tool

Every **read** operation on the Akash node is exposed via `usableAsTool`, so you
can attach the node to an **AI Agent** and let the model call GPU/network/
provider/market/chain/template reads. Operation and field descriptions are
written for `$fromAI` argument filling. The write path (**Deployment → Create**)
is dry-run-only and moves no funds by construction.

> **Self-hosted n8n:** community nodes are not available as AI-Agent tools until
> you set `N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true` on your instance and
> restart. Without it, the Akash node will not appear in the Agent's tool picker.
> (Not required on n8n Cloud.)

## Example workflows

- **H100 price-drop watcher** — **Akash Trigger → GPU Price Threshold** (select
  the H100 model, comparator, and bound) → a notify node (Slack/Email). Fires
  only when the average price crosses your bound; keyless, zero-spend.
- **Pre-deploy cost estimate** — **Akash → Market → Estimate Cost** with a
  cpu/memory/storage spec, run before you ever deploy, to size a deployment in
  USD/month. Public POST, no funds moved.
- **Chain balance monitor** — **Akash → Chain → Get Balance** for an `akash1…`
  address on a Schedule trigger, or **Akash Trigger → Cost Threshold** to watch
  managed-wallet credit and daily-spend spikes.

## Financial boundary

**No operation in v1.0.0 spends funds.** Every Console managed-wallet **write**
spends **real mainnet USD credit** and is **deferred to v1.1.0** behind a
**human-only** gate. Write operations are **never triggered by agents** — the
only write op that exists today (**Deployment → Create**) is dry-run-only, is not
`usableAsTool`, and sends nothing.

**Sandbox-2 is for chain-REST reads only.** The Console managed wallet is
**mainnet-USD**, not a sandbox — there is no testnet path for spending, which is
exactly why the v1.1.0 deploy lifecycle is human-executed and capped.

## Security posture

> This package **never holds a mnemonic**, **never signs a self-custody chain
> transaction**, and **never spends AKT directly**; the only write path is the
> Console **managed wallet**, which signs **server-side**; live log/shell
> streaming is a documented **non-goal** (provider WebSocket/mTLS).

- **Zero runtime dependencies** — no `cosmjs`, no `akashjs`; every plane is
  reached through n8n's built-in HTTP helper.
- The chain LCD and provider-gateway planes are **keyless** and never attach an
  `x-api-key`.
- The only secret the credential holds is the `x-api-key` — no mnemonic, no
  client certificate (certificates were removed from Akash).

## Links

- [Akash Network docs](https://akash.network/docs)
- [Changelog](CHANGELOG.md)

## License

[MIT](LICENSE)
