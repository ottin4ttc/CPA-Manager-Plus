import type { ApiKeyDisplayInfo } from '@/features/monitoring/model/apiKeys';
import { formatApiKeyHashLabel } from '@/features/monitoring/model/base';
import type { ApiKeyGroup } from '@/services/api/apiKeyGroups';
import { ALL_API_KEY_GROUPS, UNGROUPED_API_KEY_GROUP } from './apiKeyGroupFilter';

/** Mirrors the manager server's limit (model.APIKeyGroupNameMaxRunes). */
export const API_KEY_GROUP_NAME_MAX_LENGTH = 64;

export type ApiKeyGroupNameError = 'empty' | 'too_long' | 'duplicate' | 'reserved';

export type ApiKeyGroupKeyEntry = {
  hash: string;
  label: string;
  /** The key is no longer in CPA's config; it may still have history. */
  deleted: boolean;
};

const normalizeHash = (value: string) => value.trim().toLowerCase();

/**
 * Lists every key a group can hold: configured keys and aliased keys from the
 * display map, plus hashes groups still reference after their key was removed.
 * A key without a copy value is no longer configured. Live keys sort first.
 */
export const buildApiKeyGroupKeyEntries = (
  apiKeyDisplayMap: ReadonlyMap<string, ApiKeyDisplayInfo>,
  groups: ApiKeyGroup[]
): ApiKeyGroupKeyEntry[] => {
  const entries = new Map<string, ApiKeyGroupKeyEntry>();
  apiKeyDisplayMap.forEach((info, rawHash) => {
    const hash = normalizeHash(rawHash);
    if (!hash) return;
    entries.set(hash, { hash, label: info.label, deleted: !info.copyValue });
  });
  groups.forEach((group) =>
    group.apiKeyHashes.forEach((rawHash) => {
      const hash = normalizeHash(rawHash);
      if (!hash || entries.has(hash)) return;
      entries.set(hash, { hash, label: formatApiKeyHashLabel(hash), deleted: true });
    })
  );
  return Array.from(entries.values()).sort(
    (left, right) =>
      Number(left.deleted) - Number(right.deleted) || left.label.localeCompare(right.label)
  );
};

/**
 * Applies the manager server's name rules (non-empty, at most 64 characters,
 * unique ignoring case) plus the filter's reserved select values.
 */
export const validateApiKeyGroupName = (
  name: string,
  otherNames: string[]
): ApiKeyGroupNameError | null => {
  const trimmed = name.trim();
  if (!trimmed) return 'empty';
  if (Array.from(trimmed).length > API_KEY_GROUP_NAME_MAX_LENGTH) return 'too_long';
  if (trimmed === ALL_API_KEY_GROUPS || trimmed === UNGROUPED_API_KEY_GROUP) return 'reserved';
  const key = trimmed.toLowerCase();
  return otherNames.some((other) => other.trim().toLowerCase() === key) ? 'duplicate' : null;
};
