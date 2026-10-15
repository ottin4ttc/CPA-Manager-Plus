import { act } from 'react';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { ErrorInsightPage } from './ErrorInsightPage';
import type { ErrorInsightStatus } from './hooks/useErrorInsight';
import { buildErrorInsightView, type ErrorInsightView } from './model/errorInsightModel';
import {
  getDefaultErrorInsightFilters,
  type ErrorInsightFiltersState,
} from './model/errorInsightUiState';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    filters: null as ErrorInsightFiltersState | null,
    status: 'idle' as ErrorInsightStatus,
    view: null as ErrorInsightView | null,
  },
}));

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (key: string) => key,
  }),
}));

vi.mock('@/stores', () => ({
  useAuthStore: (selector: (state: { managementKey: string }) => unknown) =>
    selector({ managementKey: 'manager-key' }),
  useThemeStore: (selector: (state: { resolvedTheme: string }) => unknown) =>
    selector({ resolvedTheme: 'light' }),
}));

vi.mock('@/hooks/useRequestMonitoringAvailability', () => ({
  useRequestMonitoringAvailability: () => ({
    checking: false,
    available: true,
    managerServiceAvailable: true,
    modelPricesAvailable: true,
    serviceBase: 'http://manager.local:8318',
    reason: '',
  }),
}));

vi.mock('./hooks/useErrorInsight', () => ({
  useErrorInsight: () => ({
    status: mocks.status,
    view: mocks.view,
    filters: mocks.filters,
    setFilters: vi.fn(),
    clearFilters: vi.fn(),
    refresh: vi.fn(),
    options: {
      models: [],
      providers: ['codex', 'gemini'],
      apiKeys: [],
      authFiles: [],
      buckets: [{ value: 'team-a', label: 'team-a' }],
    },
    apiKeyDisplayMap: new Map(),
  }),
}));

const renderPage = () => {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<ErrorInsightPage />);
  });
  return renderer;
};

const getText = (node: ReactTestInstance): string =>
  node.children.map((child) => (typeof child === 'string' ? child : getText(child))).join('');

const emptyView = () =>
  buildErrorInsightView(
    {
      classes: [],
      timeline: [],
      recent: [],
      by_provider: [],
      by_model: [],
      by_api_key: [],
      by_account: [],
    },
    { fromMs: 0, toMs: 0 }
  );

const findBucketSelect = (renderer: ReactTestRenderer) =>
  renderer.root
    .findAllByType(Select)
    .find((node) => node.props.ariaLabel === 'error_insight.filter_bucket');

describe('ErrorInsightPage bucket filter', () => {
  it('is hidden unless the provider filter is codex', () => {
    mocks.filters = getDefaultErrorInsightFilters();
    expect(findBucketSelect(renderPage())).toBeUndefined();
  });

  it('is shown while the provider filter is codex', () => {
    mocks.filters = { ...getDefaultErrorInsightFilters(), provider: 'codex' };
    expect(findBucketSelect(renderPage())).toBeDefined();
  });
});

describe('ErrorInsightPage loading states', () => {
  it('shows a loading panel before the first result arrives', () => {
    mocks.filters = getDefaultErrorInsightFilters();
    mocks.status = 'loading';
    mocks.view = null;
    const renderer = renderPage();
    const refreshButton = renderer.root
      .findAllByType(Button)
      .find((node) => getText(node).includes('error_insight.refresh'));

    expect(getText(renderer.root)).toContain('error_insight.loading');
    expect(getText(renderer.root)).not.toContain('error_insight.kpi_total');
    expect(refreshButton?.props.loading).toBe(true);
  });

  it('keeps the previous result mounted while a refetch is in flight', () => {
    mocks.filters = getDefaultErrorInsightFilters();
    mocks.status = 'loading';
    mocks.view = emptyView();
    const renderer = renderPage();

    expect(renderer.root.findByProps({ 'aria-busy': true }).type).toBe('div');
    expect(getText(renderer.root)).toContain('error_insight.kpi_total');
    expect(getText(renderer.root)).not.toContain('error_insight.loading');
  });
});
