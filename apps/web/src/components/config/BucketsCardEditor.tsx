import { memo, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useNotificationStore } from '@/stores';
import { getBucketNameError } from '@/hooks/visualConfigBuckets';
import type { BucketEntry } from '@/types/visualConfig';
import styles from './VisualConfigEditor.module.scss';

export const BucketsCardEditor = memo(function BucketsCardEditor({
  value,
  exemptBuckets,
  disabled,
  onChange,
}: {
  value: BucketEntry[];
  exemptBuckets: string[];
  disabled?: boolean;
  onChange: (nextValue: BucketEntry[]) => void;
}) {
  const { t } = useTranslation();
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const nameInputId = useId();
  const nameHintId = `${nameInputId}-hint`;
  const nameErrorId = `${nameInputId}-error`;
  const [modalOpen, setModalOpen] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [formError, setFormError] = useState('');

  const openAddModal = () => {
    setNameValue('');
    setFormError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setNameValue('');
    setFormError('');
  };

  const handleAdd = () => {
    const error = getBucketNameError(nameValue, value);
    if (error) {
      setFormError(t(`config_management.visual.buckets.error_${error}`));
      return;
    }
    onChange([...value, { name: nameValue.trim(), apiKeys: [] }]);
    closeModal();
  };

  const handleDelete = (name: string) => {
    showConfirmation({
      title: t('config_management.visual.buckets.delete_title'),
      message: (
        <>
          <p style={{ margin: 0 }}>
            {t('config_management.visual.buckets.delete_confirm', { name })}
          </p>
          {exemptBuckets.includes(name) ? (
            <p style={{ margin: '0.75rem 0 0' }}>
              {t('config_management.visual.buckets.delete_exempt', { name })}
            </p>
          ) : null}
        </>
      ),
      confirmText: t('config_management.visual.common.delete'),
      variant: 'danger',
      onConfirm: () => onChange(value.filter((bucket) => bucket.name !== name)),
    });
  };

  return (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <div className={styles.blockHeaderRow}>
        <label style={{ margin: 0 }}>{t('config_management.visual.buckets.label')}</label>
        <Button size="sm" onClick={openAddModal} disabled={disabled}>
          {t('config_management.visual.buckets.add')}
        </Button>
      </div>

      {value.length === 0 ? (
        <div className={styles.emptyState}>{t('config_management.visual.buckets.empty')}</div>
      ) : (
        <div className="item-list" style={{ marginTop: 4 }}>
          {value.map((bucket) => (
            <div key={bucket.name} className="item-row">
              <div className="item-meta">
                <div className="item-title">{bucket.name}</div>
                <div className="item-subtitle">
                  {t('config_management.visual.buckets.key_count', {
                    count: bucket.apiKeys.length,
                  })}
                </div>
              </div>
              <div className="item-actions">
                <Button
                  variant="danger"
                  size="xs"
                  onClick={() => handleDelete(bucket.name)}
                  disabled={disabled}
                >
                  {t('config_management.visual.common.delete')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="hint">{t('config_management.visual.buckets.hint')}</div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={t('config_management.visual.buckets.add_title')}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={disabled}>
              {t('config_management.visual.common.cancel')}
            </Button>
            <Button onClick={handleAdd} disabled={disabled}>
              {t('config_management.visual.common.add')}
            </Button>
          </>
        }
      >
        <div className="form-group">
          <label htmlFor={nameInputId}>{t('config_management.visual.buckets.name_label')}</label>
          <input
            id={nameInputId}
            className="input"
            placeholder={t('config_management.visual.buckets.name_placeholder')}
            value={nameValue}
            onChange={(e) => {
              setNameValue(e.target.value);
              setFormError('');
            }}
            disabled={disabled}
            aria-describedby={formError ? `${nameErrorId} ${nameHintId}` : nameHintId}
            aria-invalid={Boolean(formError)}
          />
          <div id={nameHintId} className="hint">
            {t('config_management.visual.buckets.name_hint')}
          </div>
          {formError && (
            <div id={nameErrorId} className="error-box">
              {formError}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
});
