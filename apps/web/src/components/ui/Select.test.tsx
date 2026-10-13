import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Select, type SelectOption } from './Select';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom');
  return {
    ...actual,
    createPortal: (children: unknown) => children,
  };
});

vi.mock('./Select.module.scss', () => ({
  default: {
    wrap: 'wrap',
    wrapFullWidth: 'wrapFullWidth',
    trigger: 'trigger',
    triggerText: 'triggerText',
    placeholder: 'placeholder',
    triggerIcon: 'triggerIcon',
    dropdown: 'dropdown',
    dropdownSearchable: 'dropdownSearchable',
    option: 'option',
    optionActive: 'optionActive',
    optionHighlighted: 'optionHighlighted',
    searchInput: 'searchInput',
    searchOptions: 'searchOptions',
    searchEmpty: 'searchEmpty',
  },
}));

const OPTIONS: SelectOption[] = [
  { value: 'all', label: 'All models' },
  { value: 'gpt-6-sol', label: 'gpt-6-sol' },
  { value: 'gpt-6-luna', label: 'gpt-6-luna' },
  { value: 'account-provider:codex', label: 'alice@example.com' },
  { value: 'claude-opus-5-5', label: 'claude-opus-5-5' },
];

let renderer: ReactTestRenderer | null = null;

beforeEach(() => {
  vi.stubGlobal('window', {
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    requestAnimationFrame: vi.fn(() => 1),
    cancelAnimationFrame: vi.fn(),
  });
  vi.stubGlobal('document', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    getElementById: vi.fn(() => null),
  });
});

afterEach(() => {
  if (renderer) {
    act(() => renderer?.unmount());
    renderer = null;
  }
  vi.unstubAllGlobals();
});

const nodeMock = () => ({
  getBoundingClientRect: () => ({
    left: 0,
    top: 0,
    right: 200,
    bottom: 40,
    width: 200,
    height: 40,
  }),
  contains: () => false,
  focus: vi.fn(),
});

const renderSelect = (props: { searchable?: boolean; onChange?: (value: string) => void }) => {
  act(() => {
    renderer = create(
      <Select
        value="all"
        options={OPTIONS}
        onChange={props.onChange ?? (() => {})}
        searchable={props.searchable}
      />,
      { createNodeMock: nodeMock }
    );
  });
  return renderer!;
};

const trigger = (root: ReactTestInstance) =>
  root.find((node) => node.type === 'button' && node.props['aria-haspopup'] === 'listbox');

const open = (root: ReactTestInstance) => {
  act(() => trigger(root).props.onClick());
};

const optionLabels = (root: ReactTestInstance) =>
  root
    .findAll((node) => node.type === 'button' && node.props.role === 'option')
    .map((node) => node.children.join(''));

const searchInput = (root: ReactTestInstance) => root.findByType('input');

const typeQuery = (root: ReactTestInstance, value: string) => {
  act(() => searchInput(root).props.onChange({ target: { value } }));
};

const pressInSearch = (root: ReactTestInstance, key: string) => {
  const event = { key, preventDefault: vi.fn() };
  act(() => searchInput(root).props.onKeyDown(event));
  return event;
};

describe('Select search', () => {
  it('renders no search box unless searchable', () => {
    const { root } = renderSelect({});
    open(root);

    expect(root.findAllByType('input')).toHaveLength(0);
    expect(optionLabels(root)).toHaveLength(OPTIONS.length);
  });

  it('filters options by label, ignoring case', () => {
    const { root } = renderSelect({ searchable: true });
    open(root);
    typeQuery(root, 'SOL');

    expect(optionLabels(root)).toEqual(['gpt-6-sol']);
  });

  it('matches labels only, never option values', () => {
    const { root } = renderSelect({ searchable: true });
    open(root);
    typeQuery(root, 'provider');

    expect(optionLabels(root)).toEqual([]);
    expect(root.findAll((node) => node.props.className === 'searchEmpty')).toHaveLength(1);
  });

  it('navigates the filtered list from the search box and commits with Enter', () => {
    const onChange = vi.fn();
    const { root } = renderSelect({ searchable: true, onChange });
    open(root);
    typeQuery(root, 'gpt');

    expect(optionLabels(root)).toEqual(['gpt-6-sol', 'gpt-6-luna']);
    pressInSearch(root, 'ArrowDown');
    pressInSearch(root, 'Enter');

    expect(onChange).toHaveBeenCalledWith('gpt-6-luna');
    expect(root.findAllByType('input')).toHaveLength(0);
  });

  it('commits the first match after typing without moving', () => {
    const onChange = vi.fn();
    const { root } = renderSelect({ searchable: true, onChange });
    open(root);
    typeQuery(root, 'claude');
    pressInSearch(root, 'Enter');

    expect(onChange).toHaveBeenCalledWith('claude-opus-5-5');
  });

  it('ignores Enter when nothing matches', () => {
    const onChange = vi.fn();
    const { root } = renderSelect({ searchable: true, onChange });
    open(root);
    typeQuery(root, 'zzz');
    pressInSearch(root, 'Enter');

    expect(onChange).not.toHaveBeenCalled();
    expect(root.findAllByType('input')).toHaveLength(1);
  });

  it('leaves Space to the search box', () => {
    const { root } = renderSelect({ searchable: true });
    open(root);
    const event = pressInSearch(root, ' ');

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(root.findAllByType('input')).toHaveLength(1);
  });

  it('clears the query when reopened', () => {
    const { root } = renderSelect({ searchable: true });
    open(root);
    typeQuery(root, 'sol');
    pressInSearch(root, 'Escape');

    expect(root.findAllByType('input')).toHaveLength(0);
    open(root);
    expect(searchInput(root).props.value).toBe('');
    expect(optionLabels(root)).toHaveLength(OPTIONS.length);
  });
});
