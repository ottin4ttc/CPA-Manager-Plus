import { useCallback, useEffect, useState } from 'react';
import { usePanelFeatureAvailability } from '@/hooks/usePanelFeatureAvailability';
import { apiKeyGroupsApi, type ApiKeyGroup } from '@/services/api/apiKeyGroups';
import { useAuthStore } from '@/stores';

export interface UseApiKeyGroupsResult {
  /** False when no manager server is reachable; pages then hide group UI. */
  available: boolean;
  /**
   * True until the first list for the current server settles. Pages must not
   * expand a selected group while loading, or it reads as an empty group.
   */
  loading: boolean;
  groups: ApiKeyGroup[];
  error: string;
  /** Replaces every group and adopts the stored list. Throws on failure. */
  save: (groups: ApiKeyGroup[]) => Promise<ApiKeyGroup[]>;
  reload: () => void;
}

const EMPTY_GROUPS: ApiKeyGroup[] = [];

type LoadedGroups = { base: string; groups: ApiKeyGroup[]; error: string };

export function useApiKeyGroups(): UseApiKeyGroupsResult {
  const managementKey = useAuthStore((state) => state.managementKey);
  const { checking, managerServiceAvailable, managerServiceBase } = usePanelFeatureAvailability();
  const base = managerServiceAvailable ? managerServiceBase : '';
  const [loaded, setLoaded] = useState<LoadedGroups | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (checking || !base) return;
    let cancelled = false;
    apiKeyGroupsApi.list(base, managementKey).then(
      (groups) => {
        if (!cancelled) setLoaded({ base, groups, error: '' });
      },
      (error: unknown) => {
        if (cancelled) return;
        setLoaded({
          base,
          groups: EMPTY_GROUPS,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [base, checking, managementKey, revision]);

  const reload = useCallback(() => setRevision((value) => value + 1), []);

  const save = useCallback(
    async (groups: ApiKeyGroup[]) => {
      if (!base) throw new Error('manager server unavailable');
      const saved = await apiKeyGroupsApi.save(base, groups, managementKey);
      setLoaded({ base, groups: saved, error: '' });
      return saved;
    },
    [base, managementKey]
  );

  const current = Boolean(base) && loaded?.base === base ? loaded : null;
  return {
    available: Boolean(base),
    loading: checking || (Boolean(base) && current === null),
    groups: current?.groups ?? EMPTY_GROUPS,
    error: current?.error ?? '',
    save,
    reload,
  };
}
