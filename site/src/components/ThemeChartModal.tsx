import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ThemeSpec } from 'flint-chart';
import type { PreviewCase } from '../shared/preview-cases';
import { BACKENDS } from '../shared/supported-backends';
import { siteTheme } from '../shared/theme';
import { ScaleToFit } from './ScaleToFit';
import { VegaLiteView } from './VegaLiteView';

export function ThemeChartModal({
  previewCase,
  theme,
  onClose,
}: {
  previewCase: PreviewCase;
  theme: string | ThemeSpec | undefined;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const title = t(`themes.cases.${previewCase.id}.title`, previewCase.title);
  const blurb = t(`themes.cases.${previewCase.id}.blurb`, previewCase.blurb);
  const input = useMemo(
    () => ({
      data: { values: previewCase.data },
      semantic_types: previewCase.semantic_types,
      chart_spec: {
        chartType: previewCase.chartType,
        encodings: previewCase.encodings,
        baseSize: { width: 720, height: 520 },
        title,
        ...(previewCase.chartProperties ? { chartProperties: previewCase.chartProperties } : {}),
      },
      ...(theme ? { theme_spec: theme } : {}),
    }),
    [previewCase, theme, title],
  );
  const compiled = useMemo(() => {
    try {
      return { ok: true as const, value: BACKENDS.vegalite.assemble(input as any) };
    } catch (error) {
      return { ok: false as const, error };
    }
  }, [input]);
  const specText = useMemo(
    () => JSON.stringify({ ...input, data: '__FLINT_DATA__' }, null, 2).replace('"__FLINT_DATA__"', '{...}'),
    [input],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div className="theme-chart-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="theme-chart-modal-title" onClick={onClose}>
      <style>{modalStyles}</style>
      <div className="theme-chart-modal" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <h2 id="theme-chart-modal-title">{title}</h2>
            <p>{blurb}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('themeLab.close')} title={t('themeLab.close')} autoFocus>×</button>
        </header>
        <div className="theme-chart-modal-body">
          <section className="theme-chart-modal-preview">
            <div>
              <ScaleToFit fill height={650} padding={24} maxScale={0.86}>
                {compiled.ok ? (
                  <VegaLiteView spec={compiled.value} />
                ) : (
                  <pre>{String((compiled.error as Error)?.message ?? compiled.error)}</pre>
                )}
              </ScaleToFit>
            </div>
            <small>{previewCase.source} · {previewCase.license} · {t('themeLab.rows', { count: previewCase.data.length })}</small>
          </section>
          <section className="theme-chart-modal-spec">
            <strong>{t('themeLab.flintSpec')}</strong>
            <pre>{specText}</pre>
          </section>
        </div>
      </div>
    </div>
  );
}

const modalStyles = `
  .theme-chart-modal-backdrop { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; box-sizing: border-box; padding: 24px; background: rgba(0, 0, 0, 0.42); }
  .theme-chart-modal { width: min(1320px, calc(100vw - 48px)); height: min(820px, calc(100vh - 48px)); display: flex; flex-direction: column; overflow: hidden; border: 1px solid ${siteTheme.border}; border-radius: 10px; background: ${siteTheme.surface}; box-shadow: 0 20px 60px rgba(31, 35, 40, 0.24); }
  .theme-chart-modal > header { display: flex; align-items: center; gap: 12px; flex: 0 0 auto; padding: 12px 16px; border-bottom: 1px solid ${siteTheme.border}; background: ${siteTheme.surface}; }
  .theme-chart-modal > header > div { min-width: 0; }
  .theme-chart-modal h2 { margin: 0; font-size: 17px; line-height: 1.3; font-weight: 600; }
  .theme-chart-modal header p { margin: 2px 0 0; color: ${siteTheme.textMuted}; font-size: 12.5px; }
  .theme-chart-modal header button { width: 32px; height: 32px; flex: 0 0 auto; margin-left: auto; border: 0; border-radius: 6px; background: transparent; color: ${siteTheme.text}; font-size: 22px; line-height: 1; cursor: pointer; }
  .theme-chart-modal header button:hover, .theme-chart-modal header button:focus-visible { background: ${siteTheme.hover}; outline: none; }
  .theme-chart-modal-body { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.8fr); flex: 1; min-height: 0; overflow: hidden; }
  .theme-chart-modal-preview { min-width: 0; min-height: 0; overflow: hidden; padding: 20px; display: flex; flex-direction: column; }
  .theme-chart-modal-preview > div { position: relative; flex: 1; min-height: 0; }
  .theme-chart-modal-preview small { padding-top: 10px; color: ${siteTheme.textMuted}; font-size: 11.5px; }
  .theme-chart-modal-preview pre { color: ${siteTheme.error}; white-space: pre-wrap; }
  .theme-chart-modal-spec { min-width: 0; min-height: 0; overflow: hidden; display: flex; flex-direction: column; border-left: 1px solid ${siteTheme.border}; background: ${siteTheme.surface}; }
  .theme-chart-modal-spec > strong { padding: 10px 14px; border-bottom: 1px solid ${siteTheme.border}; color: ${siteTheme.textMuted}; font-size: 12px; }
  .theme-chart-modal-spec pre { flex: 1; margin: 0; padding: 16px; overflow: auto; color: ${siteTheme.text}; font-family: ${siteTheme.fontMono}; font-size: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
  @media (max-width: 900px) { .theme-chart-modal { height: min(900px, 94vh); } .theme-chart-modal-body { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(300px, 1.15fr) minmax(240px, 0.85fr); overflow: auto; } .theme-chart-modal-spec { border-left: 0; border-top: 1px solid ${siteTheme.border}; } }
`;