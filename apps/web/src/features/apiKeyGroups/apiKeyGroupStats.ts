import type { ApiKeyGroup } from '@/services/api/apiKeyGroups';
import type { MonitoringAnalyticsApiKeyStatRow } from '@/services/api/usageService';
import {
  costInUsd,
  rawCostInUsd,
  rowTotalCost,
  toOptionalCny,
  type UsageSummaryMetrics,
} from '@/features/usage-analytics/usageAnalyticsModel';

/** Row id of the "keys in no reporting group" total. */
export const UNGROUPED_ROW_ID = '__ungrouped__';

export type ApiKeyGroupStatRow = {
  /** Group name, or UNGROUPED_ROW_ID for the keys in no group. */
  id: string;
  /** Members of the group (for the ungrouped row: keys seen in this scope). */
  keyCount: number;
  /** Members that had traffic in this scope. */
  activeKeyCount: number;
  requestCount: number;
  totalTokens: number;
  estimatedCost: number;
  estimatedCostCny?: number;
  /** Share of the scope's total spend (by tokens when nothing is priced). */
  share: number;
};

type KeyTotals = {
  requestCount: number;
  totalTokens: number;
  estimatedCost: number;
  estimatedCostCny?: number;
  costUsd: number;
};

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeHash = (value: string | null | undefined) =>
  String(value ?? '')
    .trim()
    .toLowerCase();

const addCny = (left?: number, right?: number) =>
  left === undefined && right === undefined ? undefined : (left ?? 0) + (right ?? 0);

const emptyTotals = (): KeyTotals => ({
  requestCount: 0,
  totalTokens: 0,
  estimatedCost: 0,
  costUsd: 0,
});

const addTotals = (target: KeyTotals, source: KeyTotals) => {
  target.requestCount += source.requestCount;
  target.totalTokens += source.totalTokens;
  target.estimatedCost += source.estimatedCost;
  target.estimatedCostCny = addCny(target.estimatedCostCny, source.estimatedCostCny);
  target.costUsd += source.costUsd;
};

/**
 * Sums per-key usage into one row per reporting group plus a trailing row for
 * the keys in no group. Pass the raw api_key_stats (not narrowed by the API key
 * keyword search). Groups may overlap, so rows can add up to more than the
 * total; shares are computed the same way as the API key ranking.
 */
export const buildApiKeyGroupStatRows = (
  apiKeyStats: MonitoringAnalyticsApiKeyStatRow[],
  groups: ApiKeyGroup[],
  summary?: UsageSummaryMetrics
): ApiKeyGroupStatRow[] => {
  const totalsByHash = new Map<string, KeyTotals>();
  apiKeyStats.forEach((row) => {
    const hash = normalizeHash(row.api_key_hash || row.id);
    if (!hash) return;
    const totals = totalsByHash.get(hash) ?? emptyTotals();
    addTotals(totals, {
      requestCount: toNumber(row.calls),
      totalTokens: toNumber(row.total_tokens),
      estimatedCost: rowTotalCost(row),
      estimatedCostCny: toOptionalCny(row.cost_cny),
      costUsd: rawCostInUsd(row),
    });
    totalsByHash.set(hash, totals);
  });

  const allTotals = emptyTotals();
  totalsByHash.forEach((totals) => addTotals(allTotals, totals));
  const totalCost = summary ? costInUsd(summary) : allTotals.costUsd;
  const totalTokens = summary?.totalTokens ?? allTotals.totalTokens;
  const toRow = (id: string, totals: KeyTotals, keyCount: number, activeKeyCount: number) => ({
    id,
    keyCount,
    activeKeyCount,
    requestCount: totals.requestCount,
    totalTokens: totals.totalTokens,
    estimatedCost: totals.estimatedCost,
    estimatedCostCny: totals.estimatedCostCny,
    share:
      totalCost > 0
        ? totals.costUsd / totalCost
        : totalTokens > 0
          ? totals.totalTokens / totalTokens
          : 0,
    costUsd: totals.costUsd,
  });

  const grouped = new Set<string>();
  const groupRows = groups.map((group) => {
    const members = new Set(group.apiKeyHashes.map(normalizeHash).filter(Boolean));
    const totals = emptyTotals();
    let activeKeyCount = 0;
    members.forEach((hash) => {
      grouped.add(hash);
      const keyTotals = totalsByHash.get(hash);
      if (!keyTotals) return;
      activeKeyCount += 1;
      addTotals(totals, keyTotals);
    });
    return toRow(group.name, totals, members.size, activeKeyCount);
  });

  const ungroupedTotals = emptyTotals();
  let ungroupedKeyCount = 0;
  totalsByHash.forEach((totals, hash) => {
    if (grouped.has(hash)) return;
    ungroupedKeyCount += 1;
    addTotals(ungroupedTotals, totals);
  });

  return [
    ...groupRows.sort(
      (left, right) =>
        right.costUsd - left.costUsd ||
        right.totalTokens - left.totalTokens ||
        (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
    ),
    toRow(UNGROUPED_ROW_ID, ungroupedTotals, ungroupedKeyCount, ungroupedKeyCount),
  ].map(({ costUsd: _costUsd, ...row }) => row);
};
