import type { SelectOption } from '@/components/ui/Select';
import type { ApiKeyGroup } from '@/services/api/apiKeyGroups';

/** The select value that means "no reporting group filter". */
export const ALL_API_KEY_GROUPS = 'all';

// Sentinel the backend can never match. It keeps an active filter whose
// expansion is empty from degrading into "no filter".
export const NO_MATCHING_API_KEY_HASH = '__no_matching_api_key_hash__';

const normalizeHash = (value: string | null | undefined) =>
  String(value ?? '')
    .trim()
    .toLowerCase();

const isActiveValue = (value: string | null | undefined) => {
  const trimmed = String(value ?? '').trim();
  return trimmed !== '' && trimmed !== ALL_API_KEY_GROUPS;
};

const compareGroupNames = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

/**
 * Expands the selected group into member hashes. null means no group is
 * selected; [] means the selected group is unknown or has no members, which
 * callers must treat as "match nothing".
 */
export const resolveApiKeyGroupHashes = (
  groups: ApiKeyGroup[],
  selected: string | null | undefined
): string[] | null => {
  if (!isActiveValue(selected)) return null;
  const name = String(selected).trim();
  const group = groups.find((item) => item.name === name);
  return group ? group.apiKeyHashes.map(normalizeHash).filter(Boolean) : [];
};

/**
 * Builds the api_key_hashes request filter from the single API key selection
 * and the group expansion. Returns undefined when neither is active.
 */
export const buildApiKeyHashFilter = (
  apiKeyHash: string | null | undefined,
  groupHashes: string[] | null
): string[] | undefined => {
  const single = isActiveValue(apiKeyHash) ? normalizeHash(apiKeyHash) : '';
  if (groupHashes === null) return single ? [single] : undefined;
  const members = new Set(groupHashes.map(normalizeHash).filter(Boolean));
  if (single) return members.has(single) ? [single] : [NO_MATCHING_API_KEY_HASH];
  return members.size > 0 ? Array.from(members).sort() : [NO_MATCHING_API_KEY_HASH];
};

/** Options for the group filter: "all" first, then groups by name. */
export const buildApiKeyGroupOptions = (
  groups: ApiKeyGroup[],
  selected: string,
  allLabel: string
): SelectOption[] => {
  const names = groups.map((group) => group.name).sort(compareGroupNames);
  const options: SelectOption[] = [
    { value: ALL_API_KEY_GROUPS, label: allLabel },
    ...names.map((name) => ({ value: name, label: name })),
  ];
  // Keep a selection whose group was deleted visible, like the bucket filter.
  const trimmed = String(selected ?? '').trim();
  if (isActiveValue(trimmed) && !names.includes(trimmed)) {
    options.push({ value: trimmed, label: trimmed });
  }
  return options;
};

/**
 * Narrows API key options to the selected group's members, keeping the "all"
 * option and the current selection.
 */
export const filterApiKeyOptionsByGroup = (
  options: SelectOption[],
  groupHashes: string[] | null,
  selectedApiKeyHash: string
): SelectOption[] => {
  if (groupHashes === null) return options;
  const members = new Set(groupHashes.map(normalizeHash));
  const selected = normalizeHash(selectedApiKeyHash);
  return options.filter((option) => {
    const value = normalizeHash(option.value);
    return value === ALL_API_KEY_GROUPS || value === selected || members.has(value);
  });
};

/** Maps each member hash to the names of the groups that contain it. */
export const buildApiKeyGroupMembership = (groups: ApiKeyGroup[]): Map<string, string[]> => {
  const membership = new Map<string, string[]>();
  [...groups]
    .sort((left, right) => compareGroupNames(left.name, right.name))
    .forEach((group) => {
      group.apiKeyHashes.forEach((rawHash) => {
        const hash = normalizeHash(rawHash);
        if (!hash) return;
        const names = membership.get(hash) ?? [];
        if (!names.includes(group.name)) names.push(group.name);
        membership.set(hash, names);
      });
    });
  return membership;
};
