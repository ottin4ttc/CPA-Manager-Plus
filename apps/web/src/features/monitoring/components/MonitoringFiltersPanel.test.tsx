import type { TFunction } from 'i18next';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import { Select } from '@/components/ui/Select';
import { MonitoringFiltersPanel } from './MonitoringFiltersPanel';

const t = ((key: string) => key) as unknown as TFunction;
const options = [{ value: 'all', label: 'all' }];
const noop = () => {};

const renderPanel = (showBucketFilter: boolean, showApiKeyGroupFilter = false) => {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <MonitoringFiltersPanel
        timeRange="today"
        autoRefreshMs="0"
        selectedAccount="all"
        selectedProvider="all"
        selectedModel="all"
        selectedChannel="all"
        selectedBucket="all"
        selectedApiKeyGroup="all"
        selectedApiKeyHash="all"
        selectedStatus="all"
        searchInput=""
        accountOptions={options}
        providerOptions={options}
        modelOptions={options}
        channelOptions={options}
        bucketOptions={options}
        apiKeyGroupOptions={options}
        apiKeyOptions={options}
        statusOptions={options}
        combinedError={null}
        usageStatisticsEnabled
        overallLoading={false}
        showBucketFilter={showBucketFilter}
        showApiKeyGroupFilter={showApiKeyGroupFilter}
        t={t}
        onTimeRangeChange={noop}
        onAutoRefreshChange={noop}
        onRefreshAll={noop}
        onAccountFilterChange={noop}
        onProviderChange={noop}
        onModelChange={noop}
        onChannelChange={noop}
        onBucketChange={noop}
        onApiKeyGroupChange={noop}
        onApiKeyChange={noop}
        onStatusChange={noop}
        onSearchChange={noop}
        onClearFilters={noop}
      />
    );
  });
  return renderer;
};

const hasBucketSelect = (renderer: ReactTestRenderer) =>
  renderer.root
    .findAllByType(Select)
    .some((node) => node.props.ariaLabel === 'monitoring.filter_bucket');

const selectLabels = (renderer: ReactTestRenderer) =>
  renderer.root.findAllByType(Select).map((node) => node.props.ariaLabel as string);

describe('MonitoringFiltersPanel reporting group filter', () => {
  it('is omitted unless showApiKeyGroupFilter is set', () => {
    expect(selectLabels(renderPanel(false))).not.toContain('api_key_groups.filter_label');
  });

  it('sits right before the API key filter', () => {
    const labels = selectLabels(renderPanel(false, true));
    expect(labels.indexOf('api_key_groups.filter_label')).toBe(
      labels.indexOf('monitoring.filter_api_key') - 1
    );
  });

  it('makes every filter select searchable except status and auto refresh', () => {
    const searchable = Object.fromEntries(
      renderPanel(true, true)
        .root.findAllByType(Select)
        .map((node) => [node.props.ariaLabel as string, Boolean(node.props.searchable)])
    );
    expect(searchable).toEqual({
      'monitoring.auto_refresh': false,
      'monitoring.filter_account': true,
      'monitoring.filter_provider': true,
      'monitoring.filter_model': true,
      'monitoring.filter_channel': true,
      'monitoring.filter_bucket': true,
      'api_key_groups.filter_label': true,
      'monitoring.filter_api_key': true,
      'monitoring.filter_status': false,
    });
  });
});

describe('MonitoringFiltersPanel bucket filter', () => {
  it('is omitted unless showBucketFilter is set', () => {
    expect(hasBucketSelect(renderPanel(false))).toBe(false);
  });

  it('is rendered when showBucketFilter is set', () => {
    expect(hasBucketSelect(renderPanel(true))).toBe(true);
  });
});
