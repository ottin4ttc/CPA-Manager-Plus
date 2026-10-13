import { useId, useState, type CSSProperties, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconArrowDownToLine,
  IconArrowUpFromLine,
  IconBinary,
  IconCheck,
  IconCopy,
  IconDatabaseZap,
  IconDollarSign,
  IconFileText,
  IconInbox,
  IconKey,
  IconModelCluster,
  IconShield,
  IconTimer,
  IconTrendingUp,
  IconX,
  type IconProps,
} from '@/components/ui/icons';
import type {
  UsageSummaryCard,
  UsageSummaryCardAccent,
  UsageSummaryCardIcon,
} from '../usageAnalyticsPresentation';
import { copyToClipboard } from '@/utils/clipboard';
import { stripNumberGrouping } from '@/utils/format';
import styles from '../UsageAnalyticsPage.module.scss';

type UsageSummaryDensity = 'default' | 'compact';

const summaryIconMap: Record<UsageSummaryCardIcon, ComponentType<IconProps>> = {
  anomaly: IconShield,
  cache: IconDatabaseZap,
  calls: IconInbox,
  cost: IconDollarSign,
  credential: IconFileText,
  failure: IconX,
  input: IconArrowDownToLine,
  key: IconKey,
  latency: IconTimer,
  model: IconModelCluster,
  output: IconArrowUpFromLine,
  success: IconCheck,
  tokens: IconBinary,
  trend: IconTrendingUp,
};

const summaryAccentClassMap: Record<UsageSummaryCardAccent, string> = {
  amber: styles.summaryAccentAmber,
  blue: styles.summaryAccentBlue,
  cyan: styles.summaryAccentCyan,
  green: styles.summaryAccentGreen,
  red: styles.summaryAccentRed,
  teal: styles.summaryAccentTeal,
};

function UsageSummaryCardView({
  accent = 'blue',
  dataAttributes,
  density = 'default',
  fullLabel,
  icon,
  label,
  meta,
  tone,
  value,
  valueTitle,
  variant = 'primary',
}: UsageSummaryCard & { density?: UsageSummaryDensity }) {
  const { t } = useTranslation();
  const Icon = icon ? summaryIconMap[icon] : null;
  const tooltipId = useId();
  const [copied, setCopied] = useState(false);
  const resolvedLabel = fullLabel ?? label;
  const tooltipValue = valueTitle ?? value;
  const isCompact = density === 'compact';
  const hasValueTooltip = !isCompact && tooltipValue !== value;

  const copyValue = async () => {
    const ok = await copyToClipboard(stripNumberGrouping(tooltipValue));
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  const cardClassName = [
    styles.usageSummaryCard,
    variant === 'secondary' ? styles.usageSummaryCardSecondary : styles.usageSummaryCardPrimary,
    isCompact ? styles.usageSummaryCardCompact : '',
    summaryAccentClassMap[accent],
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cardClassName} {...dataAttributes}>
      <div className={styles.usageSummaryCardHeader}>
        {Icon ? (
          <span className={styles.usageSummaryIcon}>
            <Icon size={20} />
          </span>
        ) : null}
        <span className={styles.usageSummaryLabel} title={resolvedLabel}>
          {label}
        </span>
      </div>
      <div className={styles.usageSummaryCardBody}>
        <span className={styles.usageSummaryValueWrap}>
          <strong
            className={`${styles.usageSummaryValue} ${tone ? styles[`tone${tone}`] : ''}`}
            tabIndex={hasValueTooltip ? 0 : undefined}
            aria-describedby={hasValueTooltip ? tooltipId : undefined}
            title={isCompact ? valueTitle : undefined}
          >
            {value}
          </strong>
          {hasValueTooltip ? (
            <span id={tooltipId} className={styles.usageSummaryValueTooltip} role="tooltip">
              <span className={styles.usageSummaryValueTooltipLabel}>{resolvedLabel}</span>
              <span className={styles.usageSummaryValueTooltipRow}>
                <span className={styles.usageSummaryValueTooltipValue}>{tooltipValue}</span>
                <button
                  type="button"
                  className={styles.usageSummaryValueTooltipCopy}
                  onClick={() => void copyValue()}
                  title={t('common.copy')}
                  aria-label={t('common.copy')}
                >
                  {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
                </button>
              </span>
            </span>
          ) : null}
        </span>
        {!isCompact ? (
          <span data-usage-summary-meta="true" className={styles.usageSummaryMeta} title={meta}>
            {meta}
          </span>
        ) : null}
      </div>
      {!isCompact ? (
        <div
          data-usage-summary-chart="true"
          className={styles.usageSummaryCardChart}
          aria-hidden="true"
        >
          <svg viewBox="0 0 100 30" preserveAspectRatio="none">
            <path d="M0,25 Q15,5 30,20 T60,10 T100,25" />
          </svg>
        </div>
      ) : null}
    </div>
  );
}

export function UsageSummaryGrid({
  cards,
  density = 'default',
}: {
  cards: UsageSummaryCard[];
  density?: UsageSummaryDensity;
}) {
  const isCompact = density === 'compact';

  return (
    <div
      className={[styles.usageSummaryGrid, isCompact ? styles.usageSummaryGridCompact : '']
        .filter(Boolean)
        .join(' ')}
      data-usage-summary-density={density}
      style={{ '--usage-summary-columns': Math.min(cards.length, 8) } as CSSProperties}
    >
      {cards.map((card) => (
        <UsageSummaryCardView key={`${card.label}-${card.value}`} {...card} density={density} />
      ))}
    </div>
  );
}

export function UsageSummarySection({ cards }: { cards: UsageSummaryCard[] }) {
  return (
    <section className={styles.usageSummarySection}>
      <UsageSummaryGrid cards={cards} />
    </section>
  );
}
