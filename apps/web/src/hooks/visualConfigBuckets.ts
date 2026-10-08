import { isMap, type parseDocument } from 'yaml';
import type { BucketEntry } from '@/types/visualConfig';

type YamlDocument = ReturnType<typeof parseDocument>;

export type BucketNameError = 'empty' | 'duplicate' | 'reserved';

const BUCKETS_PATH = ['buckets'];
const API_KEY_LIMITS_PATH = ['api-key-limits'];
const EXEMPT_BUCKETS_PATH = ['api-key-limits', 'exempt-buckets'];

/** CPA's `bucket-model-routes` reads `default` as "unbucketed keys", so no real bucket may use it. */
const RESERVED_BUCKET_NAMES = new Set(['default']);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => String(item ?? '').trim()).filter(Boolean);
}

function areStringListsEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

/** Reads CPA's `buckets` map (`name -> { api-keys: [...] }`), keeping config order. */
export function parseBuckets(raw: unknown): BucketEntry[] {
  const record = asRecord(raw);
  if (!record) return [];
  return Object.entries(record)
    .filter(([name]) => name.trim() !== '')
    .map(([name, value]) => ({
      name,
      apiKeys: parseStringList(asRecord(value)?.['api-keys']),
    }));
}

export function parseExemptBuckets(apiKeyLimits: unknown): string[] {
  return parseStringList(asRecord(apiKeyLimits)?.['exempt-buckets']);
}

export function areBucketsEqual(left: BucketEntry[], right: BucketEntry[]): boolean {
  return (
    left.length === right.length &&
    left.every((bucket, index) => {
      const other = right[index];
      return (
        Boolean(other) &&
        bucket.name === other.name &&
        areStringListsEqual(bucket.apiKeys, other.apiKeys)
      );
    })
  );
}

/**
 * Syncs the YAML `buckets` map to `buckets`, rewriting only buckets whose keys
 * changed. CPA refuses a config whose `api-key-limits.exempt-buckets` names a
 * missing bucket, so deleted buckets are dropped from that list as well.
 */
export function writeBucketsToDoc(doc: YamlDocument, buckets: BucketEntry[]): void {
  const current = asRecord(doc.toJS());
  const existing = parseBuckets(current?.buckets);
  const names = new Set(buckets.map((bucket) => bucket.name));

  existing.forEach((bucket) => {
    if (!names.has(bucket.name)) doc.deleteIn([...BUCKETS_PATH, bucket.name]);
  });

  if (buckets.length === 0) {
    if (doc.hasIn(BUCKETS_PATH)) doc.deleteIn(BUCKETS_PATH);
  } else {
    if (!isMap(doc.getIn(BUCKETS_PATH, true))) doc.setIn(BUCKETS_PATH, doc.createNode({}));
    const existingKeys = new Map(existing.map((bucket) => [bucket.name, bucket.apiKeys]));
    buckets.forEach((bucket) => {
      const currentKeys = existingKeys.get(bucket.name);
      if (currentKeys && areStringListsEqual(currentKeys, bucket.apiKeys)) return;
      const bucketPath = [...BUCKETS_PATH, bucket.name];
      if (!isMap(doc.getIn(bucketPath, true))) doc.setIn(bucketPath, doc.createNode({}));
      doc.setIn([...bucketPath, 'api-keys'], bucket.apiKeys);
    });
  }

  const exempt = parseExemptBuckets(current?.['api-key-limits']);
  const keptExempt = exempt.filter((name) => names.has(name));
  if (keptExempt.length === exempt.length) return;
  if (keptExempt.length > 0) {
    doc.setIn(EXEMPT_BUCKETS_PATH, keptExempt);
    return;
  }
  doc.deleteIn(EXEMPT_BUCKETS_PATH);
  const apiKeyLimits = doc.getIn(API_KEY_LIMITS_PATH, true);
  if (isMap(apiKeyLimits) && apiKeyLimits.items.length === 0) doc.deleteIn(API_KEY_LIMITS_PATH);
}

export function getBucketNameError(
  name: string,
  buckets: BucketEntry[]
): BucketNameError | undefined {
  const trimmed = name.trim();
  if (!trimmed) return 'empty';
  if (RESERVED_BUCKET_NAMES.has(trimmed)) return 'reserved';
  if (buckets.some((bucket) => bucket.name === trimmed)) return 'duplicate';
  return undefined;
}

/** Bucket the API key is mapped to, or '' when it is unbucketed. */
export function findBucketForApiKey(buckets: BucketEntry[], apiKey: string): string {
  return buckets.find((bucket) => bucket.apiKeys.includes(apiKey))?.name ?? '';
}

/** Moves the API key into `bucketName` (or out of every bucket when it is ''). */
export function assignApiKeyToBucket(
  buckets: BucketEntry[],
  apiKey: string,
  bucketName: string
): BucketEntry[] {
  return buckets.map((bucket) => {
    const hasKey = bucket.apiKeys.includes(apiKey);
    if (bucket.name === bucketName) {
      return hasKey ? bucket : { ...bucket, apiKeys: [...bucket.apiKeys, apiKey] };
    }
    return hasKey ? { ...bucket, apiKeys: bucket.apiKeys.filter((key) => key !== apiKey) } : bucket;
  });
}

export function removeApiKeyFromBuckets(buckets: BucketEntry[], apiKey: string): BucketEntry[] {
  return assignApiKeyToBucket(buckets, apiKey, '');
}
