import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AntigravityVerifyDialog } from './AntigravityVerifyDialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { mocks } = vi.hoisted(() => ({
  mocks: {
    probe: vi.fn(),
    resetQuota: vi.fn(),
    showNotification: vi.fn(),
    translate: vi.fn((key: string) => key),
    open: vi.fn(),
    pollCallback: null as null | (() => void | Promise<void>),
  },
}));

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: mocks.translate }),
}));

vi.mock('@/utils/quota/providerRequests', () => ({
  probeAntigravityValidation: mocks.probe,
}));

vi.mock('@/services/api', () => ({
  authFilesApi: { resetQuota: mocks.resetQuota },
}));

vi.mock('@/stores', () => ({
  useNotificationStore: (
    selector: (state: { showNotification: typeof mocks.showNotification }) => unknown
  ) => selector({ showNotification: mocks.showNotification }),
}));

vi.mock('@/components/ui/Modal', () => ({
  Modal: ({
    open,
    children,
    footer,
  }: {
    open: boolean;
    children?: ReactNode;
    footer?: ReactNode;
  }) =>
    open ? (
      <section>
        {children}
        <footer>{footer}</footer>
      </section>
    ) : null,
}));

vi.mock('@/components/ui/Button', () => ({
  Button: ({
    children,
    loading: _loading,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    loading?: boolean;
  }) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/icons', () => ({
  IconCopy: () => null,
  IconExternalLink: () => null,
  IconRefreshCw: () => null,
}));

vi.mock('@/utils/clipboard', () => ({
  copyToClipboard: vi.fn(async () => true),
}));

const FILE = { name: 'antigravity-a@gmail.com.json', type: 'antigravity', auth_index: 'ag-1' };
const REQUEST_SCOPE = { apiBase: 'http://cpamp.local:18317', managementKey: 'key' };
const VALIDATION_URL = 'https://accounts.google.com/signin/continue?plt=abc';

const flushEffects = async () => {
  await act(async () => {
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    await Promise.resolve();
  });
};

const textContent = (node: ReactTestInstance): string =>
  node.children.map((child) => (typeof child === 'string' ? child : textContent(child))).join('');

const findButton = (renderer: ReactTestRenderer, text: string) => {
  const button = renderer.root
    .findAllByType('button')
    .find((candidate) => textContent(candidate).includes(text));
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
};

const renderDialog = async (props: { onUnlocked?: () => void } = {}) => {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <AntigravityVerifyDialog
        open
        file={FILE}
        account="a@gmail.com"
        requestScope={REQUEST_SCOPE}
        onClose={vi.fn()}
        onUnlocked={props.onUnlocked}
      />
    );
  });
  await flushEffects();
  return renderer;
};

describe('AntigravityVerifyDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pollCallback = null;
    mocks.resetQuota.mockResolvedValue({ status: 'ok' });
    vi.stubGlobal('window', {
      setTimeout: (callback: () => void | Promise<void>, delay?: number) => {
        if (delay && delay > 0) {
          mocks.pollCallback = callback;
          return 99;
        }
        return globalThis.setTimeout(callback, delay) as unknown as number;
      },
      clearTimeout: (timer: number) => globalThis.clearTimeout(timer),
      open: mocks.open,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the verification link without opening it, then unlocks once verified', async () => {
    const onUnlocked = vi.fn();
    mocks.probe.mockResolvedValueOnce({ validationUrl: VALIDATION_URL });
    const renderer = await renderDialog({ onUnlocked });

    expect(mocks.probe).toHaveBeenCalledWith(FILE, mocks.translate, REQUEST_SCOPE);
    expect(textContent(renderer.root)).toContain(VALIDATION_URL);
    expect(textContent(renderer.root)).toContain('antigravity_verify.waiting');
    expect(mocks.open).not.toHaveBeenCalled();

    act(() => {
      findButton(renderer, 'antigravity_verify.open_link').props.onClick();
    });
    expect(mocks.open).toHaveBeenCalledWith(VALIDATION_URL, '_blank', 'noopener,noreferrer');

    mocks.probe.mockResolvedValueOnce({ validationUrl: null });
    await act(async () => {
      await mocks.pollCallback?.();
    });

    expect(mocks.resetQuota).toHaveBeenCalledWith('ag-1', REQUEST_SCOPE);
    expect(textContent(renderer.root)).toContain('antigravity_verify.success');
    expect(mocks.showNotification).toHaveBeenCalledWith(
      'antigravity_verify.success_notice',
      'success'
    );
    expect(onUnlocked).toHaveBeenCalledTimes(1);

    act(() => renderer.unmount());
  });

  it('clears the cooldown directly when no verification is needed', async () => {
    mocks.probe.mockResolvedValueOnce({ validationUrl: null });
    const renderer = await renderDialog();

    expect(mocks.resetQuota).toHaveBeenCalledWith('ag-1', REQUEST_SCOPE);
    expect(textContent(renderer.root)).toContain('antigravity_verify.not_required');
    expect(mocks.pollCallback).toBeNull();
    expect(mocks.open).not.toHaveBeenCalled();

    act(() => renderer.unmount());
  });

  it('stops polling after the dialog closes', async () => {
    mocks.probe.mockResolvedValueOnce({ validationUrl: VALIDATION_URL });
    const renderer = await renderDialog();
    const pendingPoll = mocks.pollCallback;
    expect(pendingPoll).not.toBeNull();

    await act(async () => {
      renderer.update(
        <AntigravityVerifyDialog
          open={false}
          file={FILE}
          account="a@gmail.com"
          requestScope={REQUEST_SCOPE}
          onClose={vi.fn()}
        />
      );
    });
    mocks.probe.mockResolvedValueOnce({ validationUrl: null });
    await act(async () => {
      await pendingPoll?.();
    });

    expect(mocks.resetQuota).not.toHaveBeenCalled();

    act(() => renderer.unmount());
  });
});
