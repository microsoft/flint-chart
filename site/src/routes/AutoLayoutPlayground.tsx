import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MarkdownView } from '../components/MarkdownView';
import { SiteShell } from '../components/SiteShell';
import { useLocale } from '../i18n/LocaleContext';
import { getDocMarkdown } from '../shared/load-docs';
import { CONTENT_MAX_WIDTH, siteTheme } from '../shared/theme';

const AUTO_LAYOUT_ENTRY = {
  slug: 'chart-sizing',
  title: 'Example: Auto Layout',
  description: 'See how Flint automatically resizes charts as data gets denser or layout slots get constrained.',
  file: '../../../docs/tutorials/chart-sizing.md',
};

export function AutoLayoutPlayground() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const scrollRef = useRef<HTMLElement>(null);
  const loaded = getDocMarkdown(AUTO_LAYOUT_ENTRY, locale);

  return (
    <SiteShell>
      <main
        ref={scrollRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          background: siteTheme.surface,
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: CONTENT_MAX_WIDTH,
            margin: '0 auto',
            padding: '28px 32px 72px',
            boxSizing: 'border-box',
          }}
        >
          {loaded?.usedFallback ? (
            <p
              style={{
                margin: '0 0 16px',
                padding: '10px 12px',
                borderRadius: 8,
                background: 'rgba(31, 35, 40, 0.06)',
                color: siteTheme.textMuted,
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              {t('docs.fallbackNote')}
            </p>
          ) : null}
          {loaded ? (
            <MarkdownView source={loaded.markdown} scrollContainerRef={scrollRef} />
          ) : (
            <p style={{ color: siteTheme.textMuted }}>{t('docs.notFound')}</p>
          )}
        </div>
      </main>
    </SiteShell>
  );
}