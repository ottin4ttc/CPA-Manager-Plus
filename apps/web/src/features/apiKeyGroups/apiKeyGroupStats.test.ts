import { describe, expect, it } from 'vitest';
import type { MonitoringAnalyticsApiKeyStatRow } from '@/services/api/usageService';
import { buildApiKeyGroupStatRows, UNGROUPED_ROW_ID } from './apiKeyGroupStats';

const hA = 'a'.repeat(64);
const hB = 'b'.repeat(64);
const hC = 'c'.repeat(64);
const hD = 'd'.repeat(64);

const statRow = (
  hash: string,
  values: { calls: number; tokens: number; cost: number; costCny?: number }
): MonitoringAnalyticsApiKeyStatRow => ({
  id: hash,
  api_key_hash: hash,
  calls: values.calls,
  success_calls: values.calls,
  failure_calls: 0,
  success_rate: 1,
  input_tokens: values.tokens,
  output_tokens: 0,
  cached_tokens: 0,
  cache_read_tokens: 0,
  cache_creation_tokens: 0,
  total_tokens: values.tokens,
  cost: values.cost,
  cost_cny: values.costCny,
  average_latency_ms: null,
  last_seen_ms: 0,
});

const stats = [
  statRow(hA, { calls: 10, tokens: 1000, cost: 1 }),
  statRow(hB, { calls: 20, tokens: 2000, cost: 2 }),
  statRow(hC, { calls: 30, tokens: 3000, cost: 3 }),
  statRow(hD, { calls: 40, tokens: 4000, cost: 4 }),
];

describe('buildApiKeyGroupStatRows', () => {
  it('counts a shared key in every group that contains it', () => {
    const rows = buildApiKeyGroupStatRows(stats, [
      { name: '业务线/小麦', apiKeyHashes: [hA, hB] },
      { name: '研发/线上', apiKeyHashes: [hB, hC] },
    ]);

    expect(rows.map((row) => [row.id, row.requestCount, row.estimatedCost])).toEqual([
      ['研发/线上', 50, 5],
      ['业务线/小麦', 30, 3],
      [UNGROUPED_ROW_ID, 40, 4],
    ]);
    expect(rows[0].share).toBeCloseTo(0.5);
    expect(rows[2].share).toBeCloseTo(0.4);
  });

  it('keeps empty groups and members without traffic', () => {
    const rows = buildApiKeyGroupStatRows(stats, [
      { name: 'empty', apiKeyHashes: [] },
      { name: 'idle', apiKeyHashes: ['e'.repeat(64), hA.toUpperCase()] },
    ]);

    expect(rows.find((row) => row.id === 'empty')).toMatchObject({
      keyCount: 0,
      activeKeyCount: 0,
      requestCount: 0,
      share: 0,
    });
    expect(rows.find((row) => row.id === 'idle')).toMatchObject({
      keyCount: 2,
      activeKeyCount: 1,
      requestCount: 10,
    });
  });

  it('always ends with the ungrouped row, even when every key is grouped', () => {
    const rows = buildApiKeyGroupStatRows(stats, [{ name: 'all', apiKeyHashes: [hA, hB, hC, hD] }]);

    expect(rows[rows.length - 1]).toMatchObject({
      id: UNGROUPED_ROW_ID,
      keyCount: 0,
      requestCount: 0,
      estimatedCost: 0,
    });
  });

  it('sums repeated rows for one key and keeps CNY separate', () => {
    const rows = buildApiKeyGroupStatRows(
      [
        statRow(hA, { calls: 1, tokens: 10, cost: 0, costCny: 7.2 }),
        statRow(hA, { calls: 2, tokens: 20, cost: 1 }),
        statRow(hB, { calls: 5, tokens: 50, cost: 1 }),
      ],
      [{ name: 'g', apiKeyHashes: [hA] }]
    );

    expect(rows[0]).toMatchObject({
      id: 'g',
      requestCount: 3,
      estimatedCost: 1,
      estimatedCostCny: 7.2,
    });
    expect(rows[0].share).toBeCloseTo(2 / 3);
    expect(rows[1].estimatedCostCny).toBeUndefined();
  });

  it('falls back to token share when nothing is priced', () => {
    const rows = buildApiKeyGroupStatRows(
      [
        statRow(hA, { calls: 1, tokens: 30, cost: 0 }),
        statRow(hB, { calls: 1, tokens: 70, cost: 0 }),
      ],
      [{ name: 'g', apiKeyHashes: [hA] }]
    );

    expect(rows[0].share).toBeCloseTo(0.3);
  });
});
