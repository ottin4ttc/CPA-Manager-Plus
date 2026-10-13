import { describe, expect, it } from 'vitest';
import { buildScopeFilteredRows } from './rowBuilders';
import type { MonitoringEventRow } from './types';

const h1 = '1'.repeat(64);
const h2 = '2'.repeat(64);

const rowFor = (apiKeyHash: string) => ({ id: apiKeyHash, apiKeyHash }) as MonitoringEventRow;

describe('reporting group local filter', () => {
  const rows = [rowFor(h1), rowFor(h2), rowFor('')];

  it('keeps only rows from group members', () => {
    expect(
      buildScopeFilteredRows(rows, { apiKeyGroupHashes: [h1.toUpperCase()] }).map((row) => row.id)
    ).toEqual([h1]);
  });

  it('drops every row for a group without members', () => {
    expect(buildScopeFilteredRows(rows, { apiKeyGroupHashes: [] })).toEqual([]);
  });

  it('does not filter when no group is selected', () => {
    expect(buildScopeFilteredRows(rows, {})).toHaveLength(3);
  });
});
