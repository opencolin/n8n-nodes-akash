# n8n-nodes-akash

An [n8n](https://n8n.io) community node for [Akash Network](https://akash.network) — the decentralized compute marketplace.

## Status

**v0.1.0** — keyless GPU + network read intelligence. The credential is
optional; **no operation in this release spends funds**. This is the foundation
release of a train that adds triggers, provider/chain-REST marketplace reads,
and (much later, human-gated) managed-wallet deploys.

## Install

In n8n, go to **Settings → Community Nodes → Install** and enter:

```
n8n-nodes-akash
```

(Self-hosted n8n requires community nodes to be enabled.)

## Credential setup

The v0.1.0 GPU and network reads are **public** — they work with **no
credential attached**. A credential is only needed for the authenticated
operations arriving in later releases.

When you do need one:

1. Open **Akash Console → Settings → API Keys** and create a key.
2. In n8n, create an **Akash API** credential and paste the key into **API
   Key**. (Base URL defaults to `https://console-api.akash.network`.)

The key is sent as the `x-api-key` header. The credential test calls
`GET /v1/user/me`.

## Operations

All v0.1.0 operations are keyless public reads against the Akash Console API
(base URL `https://console-api.akash.network`):

| Resource | Operation      | Endpoint                 | Returns                                                        |
| -------- | -------------- | ------------------------ | ------------------------------------------------------------- |
| GPU      | Get Prices     | `GET /v1/gpu-prices`     | Per-model marketplace pricing and availability                |
| GPU      | Get Inventory  | `GET /v1/gpu`            | Live GPU allocatable/allocated inventory across the network   |
| GPU      | Get Models     | `GET /v1/gpu-models`     | Catalog of GPU models offered on Akash                        |
| Network  | Get Capacity   | `GET /v1/network-capacity` | Live cpu/gpu/memory/storage capacity + active provider count |
| Network  | Get Stats      | `GET /v1/dashboard-data` | Network dashboard: chain stats, leases, spend, active GPU     |

## Financial boundary

**No path in this release spends funds.** Every operation is a read. Every
future managed-wallet write will spend **real mainnet USD credit** and is
**human-gated** — never executed automatically by an agent.

## Security posture

This package **never holds a mnemonic**, **never signs a self-custody chain
transaction**, **never spends AKT directly**, and **bundles zero runtime
dependencies**. Authenticated writes (future releases) go **only** through the
Akash Console managed wallet, which signs server-side.

## Links

- [Release plan](docs/plans/RELEASE-PLAN.md)
- [Changelog](CHANGELOG.md)
- [Akash Network docs](https://akash.network/docs)

## License

[MIT](LICENSE)
