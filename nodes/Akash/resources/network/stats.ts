import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';

import { consoleApiRequest } from '../../transport/consoleApiRequest';

/**
 * Network → Get Stats — `GET /v1/dashboard-data`.
 *
 * KEYLESS, zero-spend, agent-safe: a public Console read that moves no funds and
 * needs no `x-api-key`. Returns the network dashboard roll-up used by the Console home page.
 *
 * Verified response shape (live-probed 2026-07-17) — three sibling blocks:
 * `{ chainStats: { bondedTokens, totalSupply, communityPool, inflation, stakingAPR,
 *     height, transactionCount },
 *   now: { date, height, activeLeaseCount, totalLeaseCount, dailyLeaseCount,
 *     totalUAktSpent, dailyUAktSpent, totalUUsdSpent, dailyUUsdSpent,
 *     activeCPU, activeGPU, activeMemory, activeStorage, … },
 *   compare: { …same keys as `now`, sampled 24h earlier for delta computation… } }`.
 * `stakingAPR`/`inflation` are fractions (0.04 = 4%); spend totals are in micro-units
 * (uakt/uusd); CPU is millicores; memory/storage are bytes.
 *
 * `itemIndex` is accepted for signature uniformity across resource executors even
 * though this operation takes no per-item parameters — mirrors the Tenki `whoAmI` idiom.
 */
export async function executeNetworkStats(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	return consoleApiRequest.call(this, 'GET', '/v1/dashboard-data');
}
