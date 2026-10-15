import { useEffect } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useMonitoringAnalytics,
  type UseMonitoringAnalyticsParams,
  type UseMonitoringAnalyticsReturn,
} from '@/features/monitoring/hooks/useMonitoringAnalytics';
import { useUsageAnalytics } from './useUsageAnalytics';

vi.mock('@/features/monitoring/hooks/useMonitoringAnalytics', () => ({
  useMonitoringAnalytics: vi.fn(),
}));

vi.mock('@/features/monitoring/hooks/useUsageData', () => ({
  useUsageData: () => ({ apiKeyAliases: [], loadApiKeyAliases: vi.fn() }),
}));

vi.mock('@/features/monitoring/services/monitoringMetaService', () => ({
  loadMonitoringMetaPayload: () => Promise.resolve({ authFiles: [], channels: [] }),
}));

const apiKeyGroupsState = vi.hoisted(() => ({
  groups: [] as Array<{ name: string; apiKeyHashes: string[] }>,
}));

vi.mock('@/features/apiKeyGroups/hooks/useApiKeyGroups', () => ({
  useApiKeyGroups: () => ({
    available: apiKeyGroupsState.groups.length > 0,
    loading: false,
    groups: apiKeyGroupsState.groups,
    error: '',
    save: vi.fn(),
    reload: vi.fn(),
  }),
}));

vi.mock('@/stores', () => ({
  useConfigStore: (selector: (state: { config: null }) => unknown) => selector({ config: null }),
}));

const useMonitoringAnalyticsMock = vi.mocked(useMonitoringAnalytics);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const emptyAnalyticsResponse = {
  generated_at_ms: 1,
  granularity: 'hour',
};

describe('useUsageAnalytics request orchestration', () => {
  let renderer: ReactTestRenderer | null = null;
  let latestResult: ReturnType<typeof useUsageAnalytics> | null = null;
  let selectorError = '';
  let selectorPending = false;
  let credentialTimelineError = '';
  let credentialTimelineLoading = false;
  let mainLoading = false;
  let mainStale = false;
  let mainError = '';
  const mainRefresh = vi.fn();
  const selectorRefresh = vi.fn();
  const auxiliaryRefresh = vi.fn();

  const resultFor = (params: UseMonitoringAnalyticsParams): UseMonitoringAnalyticsReturn => {
    const selectors = Boolean(params.include?.filter_selectors);
    const main = Boolean(params.include?.summary);
    const credentialTimeline = Boolean(params.include?.credential_timeline);
    const apiKeyTimeline = Boolean(params.include?.api_key_timeline);
    const mainData = params.include?.credential_stats
      ? {
          ...emptyAnalyticsResponse,
          credential_stats: [
            {
              id: 'credential-a.json',
              auth_file_snapshot: 'credential-a.json',
              calls: 10,
              success_calls: 9,
              failure_calls: 1,
              success_rate: 0.9,
              input_tokens: 100,
              output_tokens: 50,
              cached_tokens: 0,
              cache_read_tokens: 0,
              cache_creation_tokens: 0,
              total_tokens: 150,
              cost: 1,
              average_latency_ms: 100,
              last_seen_ms: 1,
            },
          ],
        }
      : params.include?.api_key_stats
        ? {
            ...emptyAnalyticsResponse,
            timeline: [
              {
                bucket_ms: 1,
                label: '00:00',
                calls: 5,
                tokens: 500,
                success: 5,
                failure: 0,
              },
              {
                bucket_ms: 3_600_001,
                label: '01:00',
                calls: 5,
                tokens: 500,
                success: 5,
                failure: 0,
              },
            ],
            api_key_stats: [
              {
                id: 'key-a',
                api_key_hash: 'key-a',
                calls: 6,
                success_calls: 6,
                failure_calls: 0,
                success_rate: 1,
                input_tokens: 600,
                output_tokens: 0,
                cached_tokens: 0,
                cache_read_tokens: 0,
                cache_creation_tokens: 0,
                total_tokens: 600,
                cost: 0.6,
                average_latency_ms: null,
                last_seen_ms: 1,
              },
            ],
          }
        : emptyAnalyticsResponse;
    return {
      enabled: Boolean(params.fromMs && params.toMs),
      loading: credentialTimeline ? credentialTimelineLoading : main ? mainLoading : false,
      error: selectors
        ? selectorError
        : credentialTimeline
          ? credentialTimelineError
          : main
            ? mainError
            : '',
      data: selectors
        ? selectorError || selectorPending
          ? null
          : {
              ...emptyAnalyticsResponse,
              filter_options: {
                models: ['gpt-a'],
                api_key_hashes: ['key-a'],
                providers: ['codex'],
                auth_files: ['account.json'],
              },
            }
        : main
          ? mainData
          : apiKeyTimeline
            ? {
                ...emptyAnalyticsResponse,
                api_key_timeline: [
                  {
                    api_key_hash: 'key-a',
                    bucket_ms: 1,
                    calls: 2,
                    tokens: 200,
                    success: 2,
                    failure: 0,
                  },
                  {
                    api_key_hash: 'key-a',
                    bucket_ms: 3_600_001,
                    calls: 4,
                    tokens: 400,
                    success: 4,
                    failure: 0,
                  },
                ],
              }
            : credentialTimeline && !credentialTimelineError && !credentialTimelineLoading
              ? {
                  ...emptyAnalyticsResponse,
                  credential_timeline: [
                    {
                      id: 'credential-a.json',
                      auth_file_snapshot: 'credential-a.json',
                      bucket_ms: 1,
                      calls: 10,
                      tokens: 150,
                      success: 9,
                      failure: 1,
                    },
                  ],
                }
              : null,
      dataStale: main ? mainStale : false,
      lastRefreshedAt: null,
      serviceBase: 'http://manager.local',
      unavailableReason: '',
      refresh: selectors ? selectorRefresh : main ? mainRefresh : auxiliaryRefresh,
    };
  };

  const lastParams = (predicate: (params: UseMonitoringAnalyticsParams) => boolean) => {
    const calls = useMonitoringAnalyticsMock.mock.calls.map(([params]) => params).filter(predicate);
    return calls[calls.length - 1];
  };

  function Harness() {
    const result = useUsageAnalytics();
    useEffect(() => {
      latestResult = result;
    }, [result]);
    return null;
  }

  beforeEach(() => {
    selectorError = '';
    selectorPending = false;
    apiKeyGroupsState.groups = [];
    credentialTimelineError = '';
    credentialTimelineLoading = false;
    mainLoading = false;
    mainStale = false;
    mainError = '';
    latestResult = null;
    mainRefresh.mockReset();
    selectorRefresh.mockReset();
    auxiliaryRefresh.mockReset();
    useMonitoringAnalyticsMock.mockReset();
    useMonitoringAnalyticsMock.mockImplementation(resultFor);
  });

  afterEach(() => {
    renderer?.unmount();
    renderer = null;
  });

  const renderHook = async (entry = '/usage-analytics') => {
    await act(async () => {
      renderer = create(
        <MemoryRouter initialEntries={[entry]}>
          <Harness />
        </MemoryRouter>
      );
      await Promise.resolve();
    });
  };

  it('expands "ungrouped" into the range keys that no group contains', async () => {
    apiKeyGroupsState.groups = [{ name: 'g', apiKeyHashes: ['key-b'] }];
    await renderHook('/usage-analytics?api_key_group=__ungrouped__');

    const main = lastParams((params) => Boolean(params.include?.summary));
    expect(main?.fromMs).toBeDefined();
    expect(main?.filters?.api_key_hashes).toEqual(['key-a']);
  });

  it('holds the main request for "ungrouped" until the range keys arrive', async () => {
    apiKeyGroupsState.groups = [{ name: 'g', apiKeyHashes: ['key-b'] }];
    selectorPending = true;
    await renderHook('/usage-analytics?api_key_group=__ungrouped__');

    expect(lastParams((params) => Boolean(params.include?.summary))?.fromMs).toBeUndefined();
    expect(latestResult?.loading).toBe(true);
  });

  it('matches nothing for "ungrouped" when the range key list fails to load', async () => {
    apiKeyGroupsState.groups = [{ name: 'g', apiKeyHashes: ['key-b'] }];
    selectorError = 'boom';
    await renderHook('/usage-analytics?api_key_group=__ungrouped__');

    const main = lastParams((params) => Boolean(params.include?.summary));
    expect(main?.fromMs).toBeDefined();
    expect(main?.filters?.api_key_hashes).toEqual(['__no_matching_api_key_hash__']);
  });

  it('uses a tab-scoped main request and a tab-independent selector request', async () => {
    await renderHook();

    const overview = lastParams((params) => Boolean(params.include?.summary));
    const selectors = lastParams((params) => Boolean(params.include?.filter_selectors));
    expect(overview?.include).toEqual({
      summary: true,
      summary_profile: 'compact',
      summary_percentiles: true,
      summary_comparison: true,
      timeline: true,
      business_outcome: true,
      model_stats: true,
      channel_share: true,
      api_key_stats: true,
      anomaly_points: true,
      granularity: 'hour',
    });
    expect(JSON.parse(overview?.dataScopeKey ?? '{}')).toMatchObject({ activeTab: 'overview' });
    expect(selectors?.include).toEqual({ filter_options: true, filter_selectors: true });
    expect(JSON.parse(selectors?.dataScopeKey ?? '{}')).not.toHaveProperty('activeTab');
    expect(latestResult?.filterOptions).toMatchObject({
      models: ['gpt-a'],
      api_key_hashes: ['key-a'],
    });

    const selectorScope = selectors?.dataScopeKey;
    await act(async () => {
      latestResult?.setActiveTab('heatmap');
    });

    const heatmap = lastParams((params) => Boolean(params.include?.summary));
    const selectorsAfterTab = lastParams((params) => Boolean(params.include?.filter_selectors));
    expect(heatmap?.include).toEqual({
      summary: true,
      summary_profile: 'compact',
      heatmap: true,
      granularity: 'hour',
    });
    expect(JSON.parse(heatmap?.dataScopeKey ?? '{}')).toMatchObject({ activeTab: 'heatmap' });
    expect(selectorsAfterTab?.dataScopeKey).toBe(selectorScope);
  });

  it('loads exact timeline buckets for the visible client keys on overview and trends', async () => {
    await renderHook();

    const apiKeyTimeline = lastParams((params) => Boolean(params.include?.api_key_timeline));
    expect(apiKeyTimeline?.include).toEqual({ granularity: 'hour', api_key_timeline: true });
    expect(apiKeyTimeline?.filters).toMatchObject({ api_key_hashes: ['key-a'] });
    expect(JSON.parse(apiKeyTimeline?.dataScopeKey ?? '{}')).toMatchObject({
      activeTab: 'overview',
      apiKeyHashes: ['key-a'],
    });
    expect(latestResult?.apiKeyTrendSeries[0].points.map((point) => point.value)).toEqual([2, 4]);

    await act(async () => {
      latestResult?.setActiveTab('trends');
      await Promise.resolve();
    });

    const trendsTimeline = lastParams((params) => Boolean(params.include?.api_key_timeline));
    expect(JSON.parse(trendsTimeline?.dataScopeKey ?? '{}')).toMatchObject({
      activeTab: 'trends',
      apiKeyHashes: ['key-a'],
    });
  });

  it('does not couple selector failures to the main page error and refreshes both requests', async () => {
    selectorError = 'selector failed';
    await renderHook();

    expect(latestResult?.error).toBe('');
    expect(latestResult?.filterOptions).toBeUndefined();

    act(() => {
      latestResult?.refresh();
    });
    expect(mainRefresh).toHaveBeenCalledTimes(1);
    expect(selectorRefresh).toHaveBeenCalledTimes(1);
  });

  it('loads only the selected credential timeline after the credential ranking', async () => {
    await renderHook();

    await act(async () => {
      latestResult?.setActiveTab('credentials');
      await Promise.resolve();
    });

    const credentials = lastParams((params) => Boolean(params.include?.credential_stats));
    expect(credentials?.include).toEqual({
      summary: true,
      summary_profile: 'compact',
      credential_stats: true,
      granularity: 'hour',
    });

    const timeline = lastParams((params) => Boolean(params.include?.credential_timeline));
    expect(timeline?.include).toEqual({ granularity: 'hour', credential_timeline: true });
    expect(timeline?.filters).toMatchObject({ credential_ids: ['credential-a.json'] });
    expect(JSON.parse(timeline?.dataScopeKey ?? '{}')).toMatchObject({
      activeTab: 'credentials',
      selectedCredentialID: 'credential-a.json',
    });
    expect(latestResult?.credentialTrendSeries).toHaveLength(1);
  });

  it('exposes selected credential timeline loading and error states', async () => {
    credentialTimelineLoading = true;
    await renderHook();

    await act(async () => {
      latestResult?.setActiveTab('credentials');
      await Promise.resolve();
    });
    expect(latestResult?.credentialTrendLoading).toBe(true);
    expect(latestResult?.credentialTrendError).toBe('');

    credentialTimelineLoading = false;
    credentialTimelineError = 'timeline failed';
    await act(async () => {
      renderer?.update(
        <MemoryRouter initialEntries={['/usage-analytics']}>
          <Harness />
        </MemoryRouter>
      );
      await Promise.resolve();
    });
    expect(latestResult?.credentialTrendLoading).toBe(false);
    expect(latestResult?.credentialTrendError).toBe('timeline failed');
    expect(latestResult?.credentialRows).toHaveLength(1);
  });

  it('keeps the current tab data while the same tab refetches a new scope', async () => {
    await renderHook();
    expect(latestResult?.loading).toBe(false);
    expect(latestResult?.hasData).toBe(true);

    mainStale = true;
    await act(async () => {
      latestResult?.refresh();
    });

    expect(latestResult?.loading).toBe(true);
    expect(latestResult?.hasData).toBe(true);
    expect(latestResult?.timeline).toHaveLength(2);
    expect(latestResult?.apiKeyRows.map((row) => row.id)).toEqual(['key-a']);
  });

  it('drops data loaded for another tab while the new tab loads', async () => {
    await renderHook();
    mainStale = true;
    mainLoading = true;

    await act(async () => {
      latestResult?.setActiveTab('heatmap');
    });

    expect(latestResult?.loading).toBe(true);
    expect(latestResult?.hasData).toBe(false);
    expect(latestResult?.timeline).toEqual([]);
  });

  it('drops stale data once the new scope fails', async () => {
    await renderHook();
    mainStale = true;
    mainError = 'boom';

    await act(async () => {
      latestResult?.refresh();
    });

    expect(latestResult?.loading).toBe(false);
    expect(latestResult?.hasData).toBe(false);
    expect(latestResult?.error).toBe('boom');
  });

  it('drops the bucket filter once the provider filter leaves codex', async () => {
    await renderHook();

    await act(async () => {
      latestResult?.setFilters({ provider: 'codex', bucket: 'team-a' });
    });
    expect(latestResult?.filters.bucket).toBe('team-a');

    await act(async () => {
      latestResult?.setFilters({ provider: 'gemini' });
    });
    expect(latestResult?.filters.provider).toBe('gemini');
    expect(latestResult?.filters.bucket).toBe('all');

    await act(async () => {
      latestResult?.setFilters({ provider: 'codex', bucket: 'team-a' });
    });
    await act(async () => {
      latestResult?.clearFilter('provider');
    });
    expect(latestResult?.filters.bucket).toBe('all');
  });
});
