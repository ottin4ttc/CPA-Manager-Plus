import { describe, expect, it } from 'vitest';
import {
  buildBucketEditOptions,
  collectObservedBucketNames,
  parseConfiguredBucketNames,
  providerSupportsBuckets,
  scopeBucketFilterToProvider,
  UNTAGGED_BUCKET_FILTER,
} from './bucketOptions';

describe('parseConfiguredBucketNames', () => {
  it('reads buckets keys', () => {
    const yaml = ['buckets:', '  anon:', '    api-keys:', '      - sk-1', '  team:', '    api-keys: []'].join('\n');
    expect(parseConfiguredBucketNames(yaml)).toEqual(['anon', 'team']);
  });

  it('ignores the old codex-buckets spelling', () => {
    const yaml = ['codex-buckets:', '  anon:', '    api-keys:', '      - sk-1'].join('\n');
    expect(parseConfiguredBucketNames(yaml)).toEqual([]);
  });

  it('returns empty when the block is absent', () => {
    expect(parseConfiguredBucketNames('port: 8317')).toEqual([]);
  });

  it('returns empty on malformed yaml instead of throwing', () => {
    expect(parseConfiguredBucketNames('buckets: [unclosed')).toEqual([]);
  });
});

describe('collectObservedBucketNames', () => {
  it('dedupes, trims, drops empties, and sorts', () => {
    expect(
      collectObservedBucketNames([
        { bucket: 'team' },
        { bucket: '  anon ' },
        { bucket: 'anon' },
        { bucket: '   ' },
        {},
      ])
    ).toEqual(['anon', 'team']);
  });

  it('only counts accounts of the given provider', () => {
    const files = [
      { type: 'codex', bucket: 'anon' },
      { provider: 'codex', bucket: 'team' },
      { type: 'claude', bucket: 'david' },
      { type: 'Claude', bucket: 'shared' },
    ];
    expect(collectObservedBucketNames(files, 'claude')).toEqual(['david', 'shared']);
    expect(collectObservedBucketNames(files, 'codex')).toEqual(['anon', 'team']);
  });
});

describe('buildBucketEditOptions', () => {
  it('unions configured and observed names', () => {
    expect(buildBucketEditOptions(['anon'], ['legacy', 'anon'])).toEqual(['anon', 'legacy']);
  });
});

describe('UNTAGGED_BUCKET_FILTER', () => {
  it('is the reserved sentinel', () => {
    expect(UNTAGGED_BUCKET_FILTER).toBe('__untagged__');
  });
});

describe('providerSupportsBuckets', () => {
  it('is true only for codex and claude, regardless of case', () => {
    expect(providerSupportsBuckets('codex')).toBe(true);
    expect(providerSupportsBuckets('Codex')).toBe(true);
    expect(providerSupportsBuckets('claude')).toBe(true);
    expect(providerSupportsBuckets('Claude')).toBe(true);
    expect(providerSupportsBuckets('all')).toBe(false);
    expect(providerSupportsBuckets('gemini')).toBe(false);
    expect(providerSupportsBuckets('')).toBe(false);
  });
});

describe('scopeBucketFilterToProvider', () => {
  it('keeps the bucket when the provider is codex or claude', () => {
    const filters = { provider: 'codex', bucket: 'team-a', model: 'gpt-5' };
    expect(scopeBucketFilterToProvider(filters)).toBe(filters);
    const claudeFilters = { provider: 'claude', bucket: 'team-a', model: 'claude-opus-4-7' };
    expect(scopeBucketFilterToProvider(claudeFilters)).toBe(claudeFilters);
  });

  it('resets the bucket to all for any other provider', () => {
    expect(scopeBucketFilterToProvider({ provider: 'all', bucket: 'team-a' })).toEqual({
      provider: 'all',
      bucket: 'all',
    });
    expect(
      scopeBucketFilterToProvider({ provider: 'gemini', bucket: UNTAGGED_BUCKET_FILTER })
    ).toEqual({ provider: 'gemini', bucket: 'all' });
  });
});
