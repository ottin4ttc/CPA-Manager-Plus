import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import type { ApiKeyDisplayInfo } from '@/features/monitoring/model/apiKeys';
import type { ApiKeyGroup } from '@/services/api/apiKeyGroups';
import {
  API_KEY_GROUP_NAME_MAX_LENGTH,
  buildApiKeyGroupKeyEntries,
  validateApiKeyGroupName,
  type ApiKeyGroupNameError,
} from '../apiKeyGroupEditor';
import styles from './ApiKeyGroupManagerModal.module.scss';

type DraftGroup = { id: number; name: string; hashes: string[] };

const normalizeHash = (value: string) => value.trim().toLowerCase();

const validateName = (name: string, others: DraftGroup[]) =>
  validateApiKeyGroupName(
    name,
    others.map((group) => group.name)
  );

const serialize = (groups: Array<{ name: string; hashes: string[] }>) =>
  JSON.stringify(
    groups
      .map((group) => ({ name: group.name.trim(), hashes: [...group.hashes].sort() }))
      .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
  );

interface ApiKeyGroupManagerModalProps {
  groups: ApiKeyGroup[];
  apiKeyDisplayMap: ReadonlyMap<string, ApiKeyDisplayInfo>;
  /** Persists every group; reject to keep the dialog open with the error. */
  onSave: (groups: ApiKeyGroup[]) => Promise<unknown>;
  onClose: () => void;
}

/**
 * Edits reporting groups as a local draft and saves the whole list at once.
 * Mount it only while open so each opening starts from the stored groups.
 */
export function ApiKeyGroupManagerModal({
  groups,
  apiKeyDisplayMap,
  onSave,
  onClose,
}: ApiKeyGroupManagerModalProps) {
  const { t } = useTranslation();
  const [initialSnapshot] = useState(() =>
    serialize(groups.map((group) => ({ name: group.name, hashes: group.apiKeyHashes })))
  );
  const [draft, setDraft] = useState<DraftGroup[]>(() =>
    groups.map((group, index) => ({
      id: index + 1,
      name: group.name,
      hashes: group.apiKeyHashes.map(normalizeHash),
    }))
  );
  const [nextId, setNextId] = useState(groups.length + 1);
  const [selectedId, setSelectedId] = useState<number | null>(draft[0]?.id ?? null);
  const [newName, setNewName] = useState('');
  const [newNameError, setNewNameError] = useState<ApiKeyGroupNameError | null>(null);
  const [keySearch, setKeySearch] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const keyEntries = useMemo(
    () => buildApiKeyGroupKeyEntries(apiKeyDisplayMap, groups),
    [apiKeyDisplayMap, groups]
  );
  const visibleKeyEntries = useMemo(() => {
    const query = keySearch.trim().toLowerCase();
    return query
      ? keyEntries.filter((entry) => entry.label.toLowerCase().includes(query))
      : keyEntries;
  }, [keyEntries, keySearch]);
  const selected = draft.find((group) => group.id === selectedId) ?? null;
  const nameErrors = useMemo(
    () =>
      new Map(
        draft.map((group) => [
          group.id,
          validateName(
            group.name,
            draft.filter((other) => other.id !== group.id)
          ),
        ])
      ),
    [draft]
  );
  const hasNameError = Array.from(nameErrors.values()).some(Boolean);
  const dirty = serialize(draft) !== initialSnapshot;

  const nameErrorText = (error: ApiKeyGroupNameError | null | undefined) =>
    error
      ? t(`api_key_groups.error_name_${error}`, { max: API_KEY_GROUP_NAME_MAX_LENGTH })
      : undefined;

  const updateSelected = (patch: Partial<DraftGroup>) => {
    if (!selected) return;
    setDraft((current) =>
      current.map((group) => (group.id === selected.id ? { ...group, ...patch } : group))
    );
    setSaveError('');
  };

  const toggleKey = (hash: string, checked: boolean) => {
    if (!selected) return;
    const hashes = checked
      ? Array.from(new Set([...selected.hashes, hash]))
      : selected.hashes.filter((value) => value !== hash);
    updateSelected({ hashes });
  };

  const addGroup = () => {
    const error = validateName(newName, draft);
    setNewNameError(error);
    if (error) return;
    const group = { id: nextId, name: newName.trim(), hashes: [] };
    setDraft((current) => [...current, group]);
    setNextId((value) => value + 1);
    setSelectedId(group.id);
    setNewName('');
    setPendingDeleteId(null);
    setSaveError('');
  };

  const deleteGroup = (id: number) => {
    const remaining = draft.filter((group) => group.id !== id);
    setDraft(remaining);
    setSelectedId(remaining[0]?.id ?? null);
    setPendingDeleteId(null);
    setSaveError('');
  };

  const requestClose = () => {
    if (saving) return;
    if (dirty) {
      setConfirmingClose(true);
      return;
    }
    onClose();
  };

  const save = async () => {
    if (hasNameError || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      await onSave(draft.map((group) => ({ name: group.name.trim(), apiKeyHashes: group.hashes })));
      onClose();
    } catch (error) {
      setSaveError(
        t('api_key_groups.save_failed', {
          message: error instanceof Error ? error.message : String(error),
        })
      );
      setSaving(false);
    }
  };

  const otherGroupsByHash = useMemo(() => {
    const membership = new Map<string, string[]>();
    draft
      .filter((group) => group.id !== selectedId)
      .forEach((group) =>
        group.hashes.forEach((hash) => {
          const names = membership.get(hash) ?? [];
          names.push(group.name.trim());
          membership.set(hash, names);
        })
      );
    return membership;
  }, [draft, selectedId]);

  const footer = confirmingClose ? (
    <div className={styles.confirmBar}>
      <span>{t('api_key_groups.unsaved_confirm')}</span>
      <Button variant="secondary" size="sm" onClick={() => setConfirmingClose(false)}>
        {t('api_key_groups.keep_editing')}
      </Button>
      <Button variant="danger" size="sm" onClick={onClose}>
        {t('api_key_groups.discard_changes')}
      </Button>
    </div>
  ) : (
    <>
      <Button variant="secondary" onClick={requestClose} disabled={saving}>
        {t('common.cancel')}
      </Button>
      <Button onClick={() => void save()} loading={saving} disabled={!dirty || hasNameError}>
        {t('api_key_groups.save')}
      </Button>
    </>
  );

  return (
    <Modal
      open
      title={t('api_key_groups.modal_title')}
      onClose={requestClose}
      footer={footer}
      width={880}
      closeDisabled={saving}
    >
      <p className={styles.hint}>{t('api_key_groups.modal_hint')}</p>
      <div className={styles.layout}>
        <aside className={styles.groupList} aria-label={t('api_key_groups.card_title')}>
          {draft.length === 0 ? (
            <p className={styles.muted}>{t('api_key_groups.no_groups')}</p>
          ) : (
            draft.map((group) => (
              <button
                key={group.id}
                type="button"
                className={[
                  styles.groupItem,
                  group.id === selectedId ? styles.groupItemActive : '',
                  nameErrors.get(group.id) ? styles.groupItemInvalid : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  setSelectedId(group.id);
                  setPendingDeleteId(null);
                }}
              >
                <span className={styles.groupName}>{group.name.trim() || '—'}</span>
                <span className={styles.groupCount}>{group.hashes.length}</span>
              </button>
            ))
          )}
          <div className={styles.newGroup}>
            <Input
              value={newName}
              placeholder={t('api_key_groups.name_placeholder')}
              aria-label={t('api_key_groups.add')}
              error={nameErrorText(newNameError)}
              onChange={(event) => {
                setNewName(event.target.value);
                setNewNameError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addGroup();
                }
              }}
            />
            <Button variant="secondary" size="sm" onClick={addGroup}>
              {t('api_key_groups.add')}
            </Button>
          </div>
        </aside>

        <section className={styles.editor}>
          {selected ? (
            <>
              <div className={styles.editorHeader}>
                <Input
                  value={selected.name}
                  aria-label={t('api_key_groups.name_label')}
                  error={nameErrorText(nameErrors.get(selected.id))}
                  onChange={(event) => updateSelected({ name: event.target.value })}
                />
                {pendingDeleteId === selected.id ? (
                  <div className={styles.confirmBar}>
                    <span>{t('api_key_groups.delete_confirm')}</span>
                    <Button variant="secondary" size="sm" onClick={() => setPendingDeleteId(null)}>
                      {t('common.cancel')}
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => deleteGroup(selected.id)}>
                      {t('api_key_groups.delete')}
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPendingDeleteId(selected.id)}
                  >
                    {t('api_key_groups.delete')}
                  </Button>
                )}
              </div>
              <Input
                value={keySearch}
                placeholder={t('api_key_groups.key_search_placeholder')}
                aria-label={t('api_key_groups.key_search_placeholder')}
                onChange={(event) => setKeySearch(event.target.value)}
              />
              <div className={styles.keyList}>
                {visibleKeyEntries.length === 0 ? (
                  <p className={styles.muted}>{t('api_key_groups.no_keys')}</p>
                ) : (
                  visibleKeyEntries.map((entry) => {
                    const otherGroups = otherGroupsByHash.get(entry.hash) ?? [];
                    return (
                      <div key={entry.hash} className={styles.keyRow}>
                        <SelectionCheckbox
                          checked={selected.hashes.includes(entry.hash)}
                          onChange={(checked) => toggleKey(entry.hash, checked)}
                          label={entry.label}
                          ariaLabel={entry.label}
                        />
                        {entry.deleted ? (
                          <span className={styles.deletedTag}>
                            {t('api_key_groups.key_deleted')}
                          </span>
                        ) : null}
                        {otherGroups.map((name) => (
                          <span key={name} className={styles.groupChip}>
                            {name}
                          </span>
                        ))}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <p className={styles.muted}>{t('api_key_groups.select_or_add')}</p>
          )}
        </section>
      </div>
      {saveError ? <p className={styles.error}>{saveError}</p> : null}
    </Modal>
  );
}
