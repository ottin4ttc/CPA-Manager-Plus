import { describe, expect, it } from 'vitest';
import { parse as parseYaml, parseDocument } from 'yaml';
import {
  assignApiKeyToBucket,
  findBucketForApiKey,
  getBucketNameError,
  parseBuckets,
  removeApiKeyFromBuckets,
  writeBucketsToDoc,
} from './visualConfigBuckets';

const writeBuckets = (yaml: string, buckets: Parameters<typeof writeBucketsToDoc>[1]) => {
  const doc = parseDocument(yaml);
  writeBucketsToDoc(doc, buckets);
  return doc.toString();
};

describe('visualConfigBuckets', () => {
  it('parses buckets in config order and treats a bare bucket as keyless', () => {
    const parsed = parseYaml(
      ['buckets:', '  team-b:', '    api-keys: [sk-b]', '  team-a:', ''].join('\n')
    ) as { buckets: unknown };

    expect(parseBuckets(parsed.buckets)).toEqual([
      { name: 'team-b', apiKeys: ['sk-b'] },
      { name: 'team-a', apiKeys: [] },
    ]);
  });

  it('rewrites only changed buckets and keeps comments on untouched ones', () => {
    const yaml = [
      'buckets:',
      '  team-a:',
      '    # owners: ops',
      '    api-keys:',
      '      - sk-a',
      '  team-b:',
      '    api-keys:',
      '      - sk-b',
      '',
    ].join('\n');

    const next = writeBuckets(yaml, [
      { name: 'team-a', apiKeys: ['sk-a'] },
      { name: 'team-b', apiKeys: ['sk-b', 'sk-c'] },
      { name: 'team-c', apiKeys: [] },
    ]);

    expect(next).toContain('# owners: ops');
    expect(parseYaml(next)).toEqual({
      buckets: {
        'team-a': { 'api-keys': ['sk-a'] },
        'team-b': { 'api-keys': ['sk-b', 'sk-c'] },
        'team-c': { 'api-keys': [] },
      },
    });
  });

  it('drops deleted buckets from api-key-limits.exempt-buckets', () => {
    const yaml = [
      'buckets:',
      '  anon:',
      '    api-keys: [sk-anon]',
      '  team-a:',
      '    api-keys: [sk-a]',
      'api-key-limits:',
      '  default-rpm: 40',
      '  exempt-buckets: [anon, team-a]',
      '',
    ].join('\n');

    expect(parseYaml(writeBuckets(yaml, [{ name: 'team-a', apiKeys: ['sk-a'] }]))).toEqual({
      buckets: { 'team-a': { 'api-keys': ['sk-a'] } },
      'api-key-limits': { 'default-rpm': 40, 'exempt-buckets': ['team-a'] },
    });
    expect(parseYaml(writeBuckets(yaml, []))).toEqual({
      'api-key-limits': { 'default-rpm': 40 },
    });
  });

  it('removes an api-key-limits block left empty by the pruning', () => {
    const yaml = [
      'buckets:',
      '  anon:',
      '    api-keys: [sk-anon]',
      'api-key-limits:',
      '  exempt-buckets: [anon]',
      'debug: false',
      '',
    ].join('\n');

    expect(parseYaml(writeBuckets(yaml, []))).toEqual({ debug: false });
  });

  it('moves an api key between buckets and out of every bucket', () => {
    const buckets = [
      { name: 'team-a', apiKeys: ['sk-1', 'sk-2'] },
      { name: 'team-b', apiKeys: [] },
    ];

    const moved = assignApiKeyToBucket(buckets, 'sk-1', 'team-b');
    expect(moved).toEqual([
      { name: 'team-a', apiKeys: ['sk-2'] },
      { name: 'team-b', apiKeys: ['sk-1'] },
    ]);
    expect(findBucketForApiKey(moved, 'sk-1')).toBe('team-b');
    expect(assignApiKeyToBucket(buckets, 'sk-1', 'team-a')).toEqual(buckets);
    expect(removeApiKeyFromBuckets(moved, 'sk-1')).toEqual([
      { name: 'team-a', apiKeys: ['sk-2'] },
      { name: 'team-b', apiKeys: [] },
    ]);
    expect(findBucketForApiKey(buckets, 'sk-3')).toBe('');
  });

  it('rejects empty, duplicate and reserved bucket names', () => {
    const buckets = [{ name: 'team-a', apiKeys: [] }];

    expect(getBucketNameError('  ', buckets)).toBe('empty');
    expect(getBucketNameError(' team-a ', buckets)).toBe('duplicate');
    expect(getBucketNameError('default', buckets)).toBe('reserved');
    expect(getBucketNameError('Team-A', buckets)).toBeUndefined();
  });
});
