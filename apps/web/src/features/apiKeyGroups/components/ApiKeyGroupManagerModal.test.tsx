import type { ReactNode } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { ApiKeyGroupManagerModal } from './ApiKeyGroupManagerModal';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/components/ui/Modal', () => ({
  Modal: ({
    children,
    footer,
    onClose,
  }: {
    children: ReactNode;
    footer?: ReactNode;
    onClose: () => void;
  }) => (
    <div data-testid="modal" data-onclose={onClose}>
      {children}
      <div data-testid="footer">{footer}</div>
    </div>
  ),
}));

vi.mock('./ApiKeyGroupManagerModal.module.scss', () => ({
  default: new Proxy({}, { get: (_target, key) => (typeof key === 'string' ? key : '') }),
}));

const hA = 'a'.repeat(64);
const hB = 'b'.repeat(64);
const hDeleted = 'd'.repeat(64);

const displayMap = new Map([
  [hA, { label: 'key-a', masked: 'sk-***a', copyValue: 'sk-a' }],
  [hB, { label: 'key-b', masked: 'sk-***b', copyValue: 'sk-b' }],
]);

let renderer: ReactTestRenderer | null = null;

afterEach(() => {
  if (renderer) {
    act(() => renderer?.unmount());
    renderer = null;
  }
});

const renderModal = (
  groups = [
    { name: '业务线/小麦', apiKeyHashes: [hA] },
    { name: '研发/线上', apiKeyHashes: [hA, hDeleted] },
  ]
) => {
  const onSave = vi.fn(() => Promise.resolve());
  const onClose = vi.fn();
  act(() => {
    renderer = create(
      <ApiKeyGroupManagerModal
        groups={groups}
        apiKeyDisplayMap={displayMap}
        onSave={onSave}
        onClose={onClose}
      />
    );
  });
  return { root: renderer!.root, onSave, onClose };
};

const textOf = (node: ReactTestInstance): string =>
  node.children.map((child) => (typeof child === 'string' ? child : textOf(child))).join('');

const buttonByText = (root: ReactTestInstance, text: string) =>
  root.findAllByType(Button).find((node) => textOf(node) === text)!;

const checkboxFor = (root: ReactTestInstance, label: string) =>
  root.findAllByType(SelectionCheckbox).find((node) => node.props.label === label)!;

const save = async (root: ReactTestInstance) => {
  await act(async () => {
    buttonByText(root, 'api_key_groups.save').props.onClick();
  });
};

describe('ApiKeyGroupManagerModal', () => {
  it('saves membership changes for the selected group', async () => {
    const { root, onSave, onClose } = renderModal();
    expect(buttonByText(root, 'api_key_groups.save').props.disabled).toBe(true);

    act(() => checkboxFor(root, 'key-b').props.onChange(true));
    await save(root);

    expect(onSave).toHaveBeenCalledWith([
      { name: '业务线/小麦', apiKeyHashes: [hA, hB] },
      { name: '研发/线上', apiKeyHashes: [hA, hDeleted] },
    ]);
    expect(onClose).toHaveBeenCalled();
  });

  it('lists a removed key that a group still holds and shows its other groups', () => {
    const { root } = renderModal();
    const labels = root.findAllByType(SelectionCheckbox).map((node) => node.props.label);
    expect(labels).toEqual(['key-a', 'key-b', `sha256:${hDeleted.slice(0, 12)}`]);

    const keyARow = checkboxFor(root, 'key-a').parent!;
    expect(textOf(keyARow)).toContain('研发/线上');
    const deletedRow = checkboxFor(root, `sha256:${hDeleted.slice(0, 12)}`).parent!;
    expect(textOf(deletedRow)).toContain('api_key_groups.key_deleted');
  });

  it('adds, renames and deletes groups before one save', async () => {
    const { root, onSave } = renderModal();
    const [newNameInput] = root
      .findAllByType(Input)
      .filter((node) => node.props.placeholder === 'api_key_groups.name_placeholder');

    act(() => newNameInput.props.onChange({ target: { value: '业务线/clawd' } }));
    act(() => buttonByText(root, 'api_key_groups.add').props.onClick());
    act(() => checkboxFor(root, 'key-b').props.onChange(true));

    const nameInput = root
      .findAllByType(Input)
      .find((node) => node.props['aria-label'] === 'api_key_groups.name_label')!;
    act(() => nameInput.props.onChange({ target: { value: '业务线/clawd-新' } }));

    act(() =>
      root
        .findAll((node) => node.type === 'button' && textOf(node).startsWith('研发/线上'))[0]
        .props.onClick()
    );
    act(() => buttonByText(root, 'api_key_groups.delete').props.onClick());
    act(() => buttonByText(root, 'api_key_groups.delete').props.onClick());

    await save(root);
    expect(onSave).toHaveBeenCalledWith([
      { name: '业务线/小麦', apiKeyHashes: [hA] },
      { name: '业务线/clawd-新', apiKeyHashes: [hB] },
    ]);
  });

  it('blocks a duplicate name that differs only in case', () => {
    const { root } = renderModal();
    const nameInput = root
      .findAllByType(Input)
      .find((node) => node.props['aria-label'] === 'api_key_groups.name_label')!;
    act(() => nameInput.props.onChange({ target: { value: '研发/线上'.toUpperCase() } }));
    act(() => nameInput.props.onChange({ target: { value: '研发/线上' } }));

    expect(
      root
        .findAllByType(Input)
        .find((node) => node.props['aria-label'] === 'api_key_groups.name_label')!.props.error
    ).toBe('api_key_groups.error_name_duplicate');
    expect(buttonByText(root, 'api_key_groups.save').props.disabled).toBe(true);
  });

  it('asks before discarding unsaved changes', () => {
    const { root, onClose } = renderModal();
    act(() => checkboxFor(root, 'key-b').props.onChange(true));
    act(() => buttonByText(root, 'common.cancel').props.onClick());

    expect(onClose).not.toHaveBeenCalled();
    act(() => buttonByText(root, 'api_key_groups.discard_changes').props.onClick());
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the dialog open with the server error when saving fails', async () => {
    const { root, onSave, onClose } = renderModal();
    onSave.mockImplementationOnce(() => Promise.reject(new Error('boom')));
    act(() => checkboxFor(root, 'key-b').props.onChange(true));
    await save(root);

    expect(onClose).not.toHaveBeenCalled();
    expect(textOf(root)).toContain('api_key_groups.save_failed');
  });
});
