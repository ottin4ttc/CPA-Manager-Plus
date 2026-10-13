import { describe, expect, it } from 'vitest';
import {
  buildApiKeyGroupMembership,
  buildApiKeyGroupOptions,
  buildApiKeyHashFilter,
  filterApiKeyOptionsByGroup,
  NO_MATCHING_API_KEY_HASH,
  resolveApiKeyGroupHashes,
} from './apiKeyGroupFilter';

const h1 = '1'.repeat(64);
const h2 = '2'.repeat(64);
const h3 = '3'.repeat(64);

const groups = [
  { name: '业务线/小麦', apiKeyHashes: [h1, h2] },
  { name: '研发/线上', apiKeyHashes: [h2, h3] },
  { name: '空组', apiKeyHashes: [] },
];

describe('resolveApiKeyGroupHashes', () => {
  it('returns null when no group is selected', () => {
    expect(resolveApiKeyGroupHashes(groups, 'all')).toBeNull();
    expect(resolveApiKeyGroupHashes(groups, '')).toBeNull();
    expect(resolveApiKeyGroupHashes(groups, undefined)).toBeNull();
  });

  it('expands a group into lowercase member hashes', () => {
    expect(
      resolveApiKeyGroupHashes([{ name: 'g', apiKeyHashes: [h1.toUpperCase()] }], ' g ')
    ).toEqual([h1]);
  });

  it('returns an empty list for an empty or unknown group', () => {
    expect(resolveApiKeyGroupHashes(groups, '空组')).toEqual([]);
    expect(resolveApiKeyGroupHashes(groups, 'deleted')).toEqual([]);
  });
});

describe('buildApiKeyHashFilter', () => {
  it.each([
    ['all', null, undefined],
    [h1, null, [h1]],
    ['all', [h2, h1], [h1, h2]],
    ['all', [], [NO_MATCHING_API_KEY_HASH]],
    [h1, [h1, h2], [h1]],
    [h3, [h1, h2], [NO_MATCHING_API_KEY_HASH]],
  ] as const)('apiKeyHash=%s groupHashes=%j -> %j', (apiKeyHash, groupHashes, expected) => {
    expect(
      buildApiKeyHashFilter(apiKeyHash, groupHashes === null ? null : [...groupHashes])
    ).toEqual(expected);
  });

  it('compares hashes case-insensitively', () => {
    expect(buildApiKeyHashFilter(h1.toUpperCase(), [h1])).toEqual([h1]);
  });
});

describe('buildApiKeyGroupOptions', () => {
  it('lists all first, then groups by name', () => {
    expect(buildApiKeyGroupOptions(groups, 'all', 'All').map((option) => option.value)).toEqual([
      'all',
      '业务线/小麦',
      '研发/线上',
      '空组',
    ]);
  });

  it('keeps a selected group that no longer exists', () => {
    const options = buildApiKeyGroupOptions(groups, 'gone', 'All');
    expect(options[options.length - 1]).toEqual({ value: 'gone', label: 'gone' });
  });
});

describe('filterApiKeyOptionsByGroup', () => {
  const options = [
    { value: 'all', label: 'All keys' },
    { value: h1, label: 'A' },
    { value: h2, label: 'B' },
    { value: h3, label: 'C' },
  ];

  it('returns options unchanged without a group', () => {
    expect(filterApiKeyOptionsByGroup(options, null, 'all')).toBe(options);
  });

  it('keeps all, group members and the current selection', () => {
    expect(filterApiKeyOptionsByGroup(options, [h1], h3).map((option) => option.label)).toEqual([
      'All keys',
      'A',
      'C',
    ]);
  });
});

describe('buildApiKeyGroupMembership', () => {
  it('maps each hash to its groups in name order', () => {
    const membership = buildApiKeyGroupMembership(groups);
    expect(membership.get(h2)).toEqual(['业务线/小麦', '研发/线上']);
    expect(membership.get(h3)).toEqual(['研发/线上']);
    expect(membership.has('missing')).toBe(false);
  });
});
