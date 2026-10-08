import { parse as parseYaml } from 'yaml';
import { normalizeProviderKey } from '@/features/authFiles/constants';

/** Reserved filter value selecting accounts that carry no bucket tag. */
export const UNTAGGED_BUCKET_FILTER = '__untagged__';

const BUCKET_PROVIDERS = new Set(['codex', 'claude']);

/**
 * CPA partitions only Codex and Claude credentials by bucket; the pools are
 * declared under `buckets` in config.yaml for both providers.
 */
export const providerSupportsBuckets = (provider: string): boolean =>
  BUCKET_PROVIDERS.has(normalizeProviderKey(provider));

/**
 * A bucket filter only makes sense while the provider filter is a bucket provider; any other
 * provider (including 'all') drops it back to 'all' so the hidden selector can
 * never keep narrowing the results.
 */
export const scopeBucketFilterToProvider = <T extends { provider: string; bucket: string }>(
  filters: T
): T =>
  filters.bucket === 'all' || providerSupportsBuckets(filters.provider)
    ? filters
    : { ...filters, bucket: 'all' };

const sortedUnique = (values: string[]): string[] =>
  Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));

/**
 * Bucket names declared in CPA's config.yaml under `buckets`.
 * Returns [] rather than throwing when the config is absent or unparseable —
 * the dropdown degrades to observed values instead of breaking the page.
 */
export const parseConfiguredBucketNames = (configYaml: string): string[] => {
  try {
    const parsed = parseYaml(configYaml);
    if (!parsed || typeof parsed !== 'object') return [];
    const buckets = (parsed as Record<string, unknown>)['buckets'];
    if (!buckets || typeof buckets !== 'object' || Array.isArray(buckets)) return [];
    return sortedUnique(
      Object.keys(buckets as Record<string, unknown>)
        .map((key) => key.trim())
        .filter((key) => key !== '')
    );
  } catch {
    return [];
  }
};

/**
 * Bucket values actually present on accounts. With a provider, only that
 * provider's accounts count, so a filter never offers a bucket that holds none
 * of the listed accounts (e.g. a Codex-only bucket on the Claude tab).
 */
export const collectObservedBucketNames = (
  files: Array<{ bucket?: string; type?: string; provider?: string }>,
  provider?: string
): string[] => {
  const providerKey = provider ? normalizeProviderKey(provider) : '';
  return sortedUnique(
    files
      .filter(
        (file) =>
          !providerKey || normalizeProviderKey(String(file.provider || file.type || '')) === providerKey
      )
      .map((file) => (typeof file.bucket === 'string' ? file.bucket.trim() : ''))
      .filter((bucket) => bucket !== '')
  );
};

/**
 * Options for the edit dropdown: declared names plus anything already applied
 * out-of-band, so a hand-written tag is never silently dropped on save.
 */
export const buildBucketEditOptions = (configured: string[], observed: string[]): string[] =>
  sortedUnique([...configured, ...observed]);
