import axios from 'axios';
import { isDemoMode } from '@/features/demo/demoMode';
import { normalizeUsageServiceBase } from './usageService';

/**
 * A reporting group: a named set of client API keys used only to slice usage
 * statistics. Stored by the manager server; CPA never sees it.
 */
export interface ApiKeyGroup {
  name: string;
  apiKeyHashes: string[];
  updatedAtMs?: number;
}

const API_KEY_GROUPS_PATH = '/v0/management/api-key-groups';
const API_KEY_GROUPS_TIMEOUT_MS = 30 * 1000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readGroups = (raw: unknown): ApiKeyGroup[] => {
  const items = isRecord(raw) && Array.isArray(raw.items) ? raw.items : [];
  return items.flatMap((item): ApiKeyGroup[] => {
    if (!isRecord(item) || typeof item.name !== 'string') return [];
    const hashes = Array.isArray(item.apiKeyHashes)
      ? item.apiKeyHashes.filter((hash): hash is string => typeof hash === 'string')
      : [];
    const group: ApiKeyGroup = { name: item.name, apiKeyHashes: hashes };
    if (typeof item.updatedAtMs === 'number') group.updatedAtMs = item.updatedAtMs;
    return [group];
  });
};

// Surfaces the manager server's validation message (e.g. a duplicate name)
// instead of axios's generic status text.
const toApiKeyGroupsError = (error: unknown): Error => {
  if (axios.isAxiosError(error)) {
    const data: unknown = error.response?.data;
    if (isRecord(data) && typeof data.error === 'string' && data.error) {
      return new Error(data.error);
    }
    return new Error(error.message);
  }
  return error instanceof Error ? error : new Error(String(error));
};

const buildEndpoint = (base: string) =>
  `${normalizeUsageServiceBase(base).replace(/\/+$/, '')}${API_KEY_GROUPS_PATH}`;

const buildHeaders = (managementKey?: string) =>
  managementKey ? { Authorization: `Bearer ${managementKey}` } : undefined;

export const apiKeyGroupsApi = {
  list: async (base: string, managementKey?: string): Promise<ApiKeyGroup[]> => {
    if (__DEMO_SITE__ && isDemoMode()) return [];
    try {
      const response = await axios.get<unknown>(buildEndpoint(base), {
        timeout: API_KEY_GROUPS_TIMEOUT_MS,
        headers: buildHeaders(managementKey),
      });
      return readGroups(response.data);
    } catch (error) {
      throw toApiKeyGroupsError(error);
    }
  },

  /** Replaces every group; the response is the stored, normalized list. */
  save: async (
    base: string,
    items: ApiKeyGroup[],
    managementKey?: string
  ): Promise<ApiKeyGroup[]> => {
    if (__DEMO_SITE__ && isDemoMode()) return items;
    try {
      const response = await axios.put<unknown>(
        buildEndpoint(base),
        { items: items.map(({ name, apiKeyHashes }) => ({ name, apiKeyHashes })) },
        { timeout: API_KEY_GROUPS_TIMEOUT_MS, headers: buildHeaders(managementKey) }
      );
      return readGroups(response.data);
    } catch (error) {
      throw toApiKeyGroupsError(error);
    }
  },
};
