import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { IconChevronDown } from './icons';
import styles from './Select.module.scss';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  options: ReadonlyArray<SelectOption>;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  dropdownClassName?: string;
  disabled?: boolean;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  fullWidth?: boolean;
  id?: string;
  /** Adds a filter box above the options that matches option labels. */
  searchable?: boolean;
}

const VIEWPORT_MARGIN = 8;
const DROPDOWN_OFFSET = 6;
const DROPDOWN_MAX_HEIGHT = 240;
const DROPDOWN_MIN_HEIGHT = 96;
const DROPDOWN_Z_INDEX = 2010;
const SELECT_OPEN_EVENT = 'cpamp-select-open';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const resolveDropdownStyle = (element: HTMLElement): CSSProperties => {
  const rect = element.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(rect.width, Math.max(0, viewportWidth - VIEWPORT_MARGIN * 2));
  const left = clamp(
    rect.left,
    VIEWPORT_MARGIN,
    Math.max(VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN)
  );
  const spaceBelow = viewportHeight - rect.bottom - VIEWPORT_MARGIN - DROPDOWN_OFFSET;
  const spaceAbove = rect.top - VIEWPORT_MARGIN - DROPDOWN_OFFSET;
  const direction = spaceBelow >= DROPDOWN_MAX_HEIGHT || spaceBelow >= spaceAbove ? 'down' : 'up';
  const availableHeight = direction === 'down' ? spaceBelow : spaceAbove;
  const maxHeight = Math.max(DROPDOWN_MIN_HEIGHT, Math.min(DROPDOWN_MAX_HEIGHT, availableHeight));

  return direction === 'down'
    ? {
        position: 'fixed',
        top: rect.bottom + DROPDOWN_OFFSET,
        left,
        width,
        maxHeight,
        zIndex: DROPDOWN_Z_INDEX,
      }
    : {
        position: 'fixed',
        bottom: viewportHeight - rect.top + DROPDOWN_OFFSET,
        left,
        width,
        maxHeight,
        zIndex: DROPDOWN_Z_INDEX,
      };
};

export function Select({
  value,
  options,
  onChange,
  placeholder,
  className,
  triggerClassName,
  dropdownClassName,
  disabled = false,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  fullWidth = true,
  id,
  searchable = false,
}: SelectProps) {
  const { t } = useTranslation();
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const listboxId = `${selectId}-listbox`;
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties | null>(null);
  const selectedIndex = useMemo(
    () => options.findIndex((option) => option.value === value),
    [options, value]
  );
  const normalizedQuery = searchable ? query.trim().toLowerCase() : '';
  // Highlight, keyboard and option ids all index into the visible list, which
  // is the full list unless a search query narrows it.
  const visibleOptions = useMemo(
    () =>
      normalizedQuery
        ? options.filter((option) => option.label.toLowerCase().includes(normalizedQuery))
        : options,
    [normalizedQuery, options]
  );
  const visibleSelectedIndex = useMemo(
    () => visibleOptions.findIndex((option) => option.value === value),
    [visibleOptions, value]
  );
  const isOpen = open && !disabled;

  const openSelect = useCallback(() => {
    if (disabled) return;
    if (typeof document !== 'undefined') {
      document.dispatchEvent(new CustomEvent(SELECT_OPEN_EVENT, { detail: selectId }));
    }
    setOpen(true);
    setQuery('');
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [disabled, selectId, selectedIndex]);

  // A searchable dropdown owns focus while open, so closing it hands focus back
  // to the trigger instead of dropping it on the body.
  const closeSelect = useCallback(() => {
    setOpen(false);
    if (searchable) triggerRef.current?.focus();
  }, [searchable]);

  const toggleOpen = useCallback(() => {
    if (disabled) return;
    if (isOpen) {
      setOpen(false);
      return;
    }
    openSelect();
  }, [disabled, isOpen, openSelect]);

  useEffect(() => {
    if (!open || disabled) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [disabled, open]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handlePeerOpen = (event: Event) => {
      const nextSelectId = (event as CustomEvent<string>).detail;
      if (nextSelectId !== selectId) {
        setOpen(false);
      }
    };
    document.addEventListener(SELECT_OPEN_EVENT, handlePeerOpen);
    return () => document.removeEventListener(SELECT_OPEN_EVENT, handlePeerOpen);
  }, [selectId]);

  const updateDropdownStyle = useCallback(() => {
    if (!wrapRef.current) return;
    setDropdownStyle(resolveDropdownStyle(wrapRef.current));
  }, []);

  const scheduleDropdownStyleUpdate = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      updateDropdownStyle();
    });
  }, [updateDropdownStyle]);

  useLayoutEffect(() => {
    if (!isOpen) {
      if (rafRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    updateDropdownStyle();

    const handleViewportChange = () => {
      scheduleDropdownStyleUpdate();
    };

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' && wrapRef.current
        ? new ResizeObserver(() => {
            scheduleDropdownStyleUpdate();
          })
        : null;

    if (resizeObserver && wrapRef.current) {
      resizeObserver.observe(wrapRef.current);
    }

    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
      resizeObserver?.disconnect();
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isOpen, scheduleDropdownStyleUpdate, updateDropdownStyle]);

  const resolvedHighlightedIndex =
    highlightedIndex >= 0 && highlightedIndex < visibleOptions.length
      ? highlightedIndex
      : visibleSelectedIndex >= 0
        ? visibleSelectedIndex
        : visibleOptions.length > 0
          ? 0
          : -1;
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const displayText = selected?.label ?? placeholder ?? '';
  const isPlaceholder = !selected && placeholder;

  const commitSelection = useCallback(
    (nextIndex: number) => {
      const nextOption = visibleOptions[nextIndex];
      if (!nextOption) return;
      onChange(nextOption.value);
      closeSelect();
      setHighlightedIndex(options.indexOf(nextOption));
    },
    [closeSelect, onChange, options, visibleOptions]
  );

  const moveHighlight = useCallback(
    (direction: 1 | -1) => {
      if (visibleOptions.length === 0) return;
      const nextIndex =
        (resolvedHighlightedIndex + direction + visibleOptions.length) % visibleOptions.length;
      setHighlightedIndex(nextIndex);
    },
    [resolvedHighlightedIndex, visibleOptions.length]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          if (!isOpen) {
            openSelect();
            return;
          }
          moveHighlight(1);
          return;
        case 'ArrowUp':
          event.preventDefault();
          if (!isOpen) {
            openSelect();
            return;
          }
          moveHighlight(-1);
          return;
        case 'Home':
          if (!isOpen || visibleOptions.length === 0) return;
          event.preventDefault();
          setHighlightedIndex(0);
          return;
        case 'End':
          if (!isOpen || visibleOptions.length === 0) return;
          event.preventDefault();
          setHighlightedIndex(visibleOptions.length - 1);
          return;
        case 'Enter':
        case ' ': {
          event.preventDefault();
          if (!isOpen) {
            openSelect();
            return;
          }
          if (resolvedHighlightedIndex >= 0) {
            commitSelection(resolvedHighlightedIndex);
          }
          return;
        }
        case 'Escape':
          if (!isOpen) return;
          event.preventDefault();
          closeSelect();
          return;
        case 'Tab':
          if (isOpen) setOpen(false);
          return;
        default:
          return;
      }
    },
    [
      closeSelect,
      commitSelection,
      disabled,
      isOpen,
      moveHighlight,
      openSelect,
      resolvedHighlightedIndex,
      visibleOptions.length,
    ]
  );

  // The search box keeps Space, Home and End for text editing; only list
  // navigation and closing keys drive the dropdown.
  const handleSearchKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          moveHighlight(1);
          return;
        case 'ArrowUp':
          event.preventDefault();
          moveHighlight(-1);
          return;
        case 'Enter':
          event.preventDefault();
          if (resolvedHighlightedIndex >= 0) commitSelection(resolvedHighlightedIndex);
          return;
        case 'Escape':
          event.preventDefault();
          closeSelect();
          return;
        case 'Tab':
          setOpen(false);
          return;
        default:
          return;
      }
    },
    [closeSelect, commitSelection, moveHighlight, resolvedHighlightedIndex]
  );

  const dropdownReady = isOpen && dropdownStyle !== null;
  useEffect(() => {
    if (!searchable || !dropdownReady) return;
    searchInputRef.current?.focus({ preventScroll: true });
  }, [dropdownReady, searchable]);

  useEffect(() => {
    if (!isOpen || resolvedHighlightedIndex < 0) return;
    const highlightedOption = document.getElementById(
      `${selectId}-option-${resolvedHighlightedIndex}`
    );
    highlightedOption?.scrollIntoView({ block: 'nearest' });
  }, [isOpen, resolvedHighlightedIndex, selectId]);

  const renderedOptions = visibleOptions.map((opt, index) => {
    const active = opt.value === value;
    const highlighted = index === resolvedHighlightedIndex;
    return (
      <button
        key={opt.value}
        id={`${selectId}-option-${index}`}
        type="button"
        role="option"
        aria-selected={active}
        className={`${styles.option} ${active ? styles.optionActive : ''} ${highlighted ? styles.optionHighlighted : ''}`.trim()}
        onMouseEnter={() => setHighlightedIndex(index)}
        onKeyDown={handleKeyDown}
        onClick={() => commitSelection(index)}
      >
        {opt.label}
      </button>
    );
  });

  const dropdown =
    isOpen && dropdownStyle ? (
      searchable ? (
        <div
          ref={dropdownRef}
          className={[styles.dropdown, styles.dropdownSearchable, dropdownClassName]
            .filter(Boolean)
            .join(' ')}
          style={dropdownStyle}
        >
          <input
            ref={searchInputRef}
            type="text"
            className={styles.searchInput}
            value={query}
            placeholder={t('common.select_search_placeholder')}
            aria-label={t('common.select_search_placeholder')}
            aria-controls={listboxId}
            aria-activedescendant={
              resolvedHighlightedIndex >= 0
                ? `${selectId}-option-${resolvedHighlightedIndex}`
                : undefined
            }
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setQuery(event.target.value);
              setHighlightedIndex(0);
            }}
            onKeyDown={handleSearchKeyDown}
          />
          <div
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            className={styles.searchOptions}
          >
            {renderedOptions.length > 0 ? (
              renderedOptions
            ) : (
              <div className={styles.searchEmpty}>{t('common.select_no_match')}</div>
            )}
          </div>
        </div>
      ) : (
        <div
          ref={dropdownRef}
          className={[styles.dropdown, dropdownClassName].filter(Boolean).join(' ')}
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          style={dropdownStyle}
        >
          {renderedOptions}
        </div>
      )
    ) : null;

  return (
    <>
      <div
        className={`${styles.wrap} ${fullWidth ? styles.wrapFullWidth : ''} ${className ?? ''}`}
        ref={wrapRef}
      >
        <button
          ref={triggerRef}
          id={selectId}
          type="button"
          className={[styles.trigger, triggerClassName].filter(Boolean).join(' ')}
          onClick={disabled ? undefined : toggleOpen}
          onKeyDown={handleKeyDown}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listboxId : undefined}
          aria-activedescendant={
            isOpen && resolvedHighlightedIndex >= 0
              ? `${selectId}-option-${resolvedHighlightedIndex}`
              : undefined
          }
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          disabled={disabled}
        >
          <span className={`${styles.triggerText} ${isPlaceholder ? styles.placeholder : ''}`}>
            {displayText}
          </span>
          <span className={styles.triggerIcon} aria-hidden="true">
            <IconChevronDown size={14} />
          </span>
        </button>
      </div>
      {dropdown &&
        (typeof document === 'undefined' ? dropdown : createPortal(dropdown, document.body))}
    </>
  );
}
