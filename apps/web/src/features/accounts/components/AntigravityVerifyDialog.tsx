import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { IconCopy, IconExternalLink, IconRefreshCw } from '@/components/ui/icons';
import styles from '@/features/oauth/CodexReauthDialog.module.scss';
import { authFilesApi } from '@/services/api';
import type { ApiClientRequestScope } from '@/services/api/client';
import { useNotificationStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import { normalizeAuthIndex } from '@/utils/authIndex';
import { copyToClipboard } from '@/utils/clipboard';
import { probeAntigravityValidation } from '@/utils/quota/providerRequests';

type AntigravityVerifyStatus =
  | 'checking'
  | 'waiting'
  | 'unlocking'
  | 'success'
  | 'notRequired'
  | 'timeout'
  | 'error';

type AntigravityVerifyDialogProps = {
  open: boolean;
  file: AuthFileItem | null;
  account: string;
  requestScope?: ApiClientRequestScope;
  onClose: () => void;
  onUnlocked?: () => void;
};

const POLL_INTERVAL_MS = 10_000;
const MAX_POLLS = 60;

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : '';

/**
 * Checks an Antigravity account with a model call. When Google asks for
 * verification, shows the verification link and keeps checking until it
 * passes, then clears CPA's cooldown for the account.
 */
export function AntigravityVerifyDialog({
  open,
  file,
  account,
  requestScope,
  onClose,
  onUnlocked,
}: AntigravityVerifyDialogProps) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const [validationUrl, setValidationUrl] = useState('');
  const [status, setStatus] = useState<AntigravityVerifyStatus>('checking');
  const [error, setError] = useState('');
  const [copiedTarget, setCopiedTarget] = useState<'account' | 'link' | null>(null);
  const generationRef = useRef(0);
  const pollTimerRef = useRef<number | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);

  const fileKey = file
    ? `${file.name}\u0000${String(file['auth_index'] ?? file.authIndex ?? '')}`
    : '';

  const clearPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const unlock = useCallback(
    async (target: AuthFileItem, generation: number, doneStatus: 'success' | 'notRequired') => {
      setStatus('unlocking');
      try {
        const authIndex = normalizeAuthIndex(target['auth_index'] ?? target.authIndex);
        if (authIndex) await authFilesApi.resetQuota(authIndex, requestScope);
        if (generationRef.current !== generation) return;
        setStatus(doneStatus);
        showNotification(
          t(
            doneStatus === 'success'
              ? 'antigravity_verify.success_notice'
              : 'antigravity_verify.not_required_notice',
            { name: account }
          ),
          'success'
        );
        onUnlocked?.();
      } catch (err: unknown) {
        if (generationRef.current !== generation) return;
        setStatus('error');
        setError(getErrorMessage(err));
      }
    },
    [account, onUnlocked, requestScope, showNotification, t]
  );

  const startCheck = useCallback(async () => {
    if (!file) return;
    generationRef.current += 1;
    const generation = generationRef.current;
    clearPolling();
    setValidationUrl('');
    setError('');
    setStatus('checking');
    // Keeps probing until verification passes; a failed probe just waits for
    // the next round.
    function poll(target: AuthFileItem, attempt: number) {
      if (attempt >= MAX_POLLS) {
        setStatus('timeout');
        return;
      }
      pollTimerRef.current = window.setTimeout(async () => {
        pollTimerRef.current = null;
        const result = await probeAntigravityValidation(target, t, requestScope).catch(() => null);
        if (generationRef.current !== generation) return;
        if (result && !result.validationUrl) {
          await unlock(target, generation, 'success');
          return;
        }
        poll(target, attempt + 1);
      }, POLL_INTERVAL_MS);
    }
    try {
      const result = await probeAntigravityValidation(file, t, requestScope);
      if (generationRef.current !== generation) return;
      if (!result.validationUrl) {
        await unlock(file, generation, 'notRequired');
        return;
      }
      setValidationUrl(result.validationUrl);
      setStatus('waiting');
      poll(file, 0);
    } catch (err: unknown) {
      if (generationRef.current !== generation) return;
      setStatus('error');
      setError(getErrorMessage(err));
    }
  }, [clearPolling, file, requestScope, t, unlock]);
  const startCheckRef = useRef(startCheck);
  useLayoutEffect(() => {
    startCheckRef.current = startCheck;
  }, [startCheck]);

  useEffect(() => {
    if (!open || !fileKey) {
      generationRef.current += 1;
      clearPolling();
      return;
    }
    const timer = window.setTimeout(() => {
      void startCheckRef.current();
    }, 0);
    return () => {
      generationRef.current += 1;
      window.clearTimeout(timer);
      clearPolling();
    };
  }, [clearPolling, fileKey, open]);

  useEffect(
    () => () => {
      if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    },
    []
  );

  const copyText = useCallback(
    async (text: string, targetName: 'account' | 'link') => {
      if (!text) return;
      const copied = await copyToClipboard(text);
      if (copied) {
        if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
        setCopiedTarget(targetName);
        feedbackTimerRef.current = window.setTimeout(() => {
          setCopiedTarget(null);
          feedbackTimerRef.current = null;
        }, 1800);
      }
      showNotification(
        t(copied ? 'notification.link_copied' : 'notification.copy_failed'),
        copied ? 'success' : 'error'
      );
    },
    [showNotification, t]
  );

  const statusNode = (() => {
    switch (status) {
      case 'checking':
      case 'waiting':
      case 'unlocking':
        return (
          <div className={`${styles.status} ${styles.statusWaiting}`}>
            {t(`antigravity_verify.${status}`)}
          </div>
        );
      case 'success':
      case 'notRequired':
        return (
          <div className={`${styles.status} ${styles.statusSuccess}`}>
            {t(
              status === 'success'
                ? 'antigravity_verify.success'
                : 'antigravity_verify.not_required'
            )}
          </div>
        );
      case 'timeout':
        return (
          <div className={`${styles.status} ${styles.statusWarning}`}>
            {t('antigravity_verify.timeout')}
          </div>
        );
      case 'error':
        return (
          <div className={`${styles.status} ${styles.statusError}`}>
            {error ? `${t('antigravity_verify.error')}: ${error}` : t('antigravity_verify.error')}
          </div>
        );
      default:
        return null;
    }
  })();

  const busy = status === 'checking' || status === 'unlocking';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('antigravity_verify.title')}
      width={620}
      footer={
        <div className={styles.footer}>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      }
    >
      <div className={styles.dialogBody}>
        <p className={styles.hint}>{t('antigravity_verify.hint')}</p>

        <div className={styles.accountSummary}>
          <span className={styles.summaryLabel}>{t('antigravity_verify.account_label')}</span>
          <span className={styles.summaryValue}>{account || '-'}</span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => void copyText(account, 'account')}
            disabled={!account}
          >
            <IconCopy size={13} />
            {copiedTarget === 'account'
              ? t('antigravity_verify.copied')
              : t('antigravity_verify.copy_account')}
          </Button>
        </div>

        <div className={styles.oauthPanel}>
          <div className={styles.primaryActionRow}>
            <Button
              type="button"
              size="md"
              className={styles.primaryActionButton}
              onClick={() => window.open(validationUrl, '_blank', 'noopener,noreferrer')}
              disabled={!validationUrl || status !== 'waiting'}
            >
              <IconExternalLink size={16} />
              {t('antigravity_verify.open_link')}
            </Button>
            {statusNode}
          </div>

          <div className={styles.linkPreviewRow}>
            <span className={styles.oauthLabel}>{t('antigravity_verify.link_label')}</span>
            <span className={styles.linkPreview} title={validationUrl || undefined}>
              {validationUrl || '-'}
            </span>
          </div>

          <div className={styles.oauthActions}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void copyText(validationUrl, 'link')}
              disabled={!validationUrl}
            >
              <IconCopy size={14} />
              {copiedTarget === 'link'
                ? t('antigravity_verify.copied')
                : t('antigravity_verify.copy_link')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void startCheck()}
              disabled={busy}
              loading={busy}
            >
              {busy ? null : <IconRefreshCw size={14} />}
              {t('antigravity_verify.recheck')}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
