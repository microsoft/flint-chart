import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { THEME_PRESETS } from 'flint-chart';
import { CodeBlock } from './CodeBlock';
import { ScaleToFit } from './ScaleToFit';
import { VegaLiteView } from './VegaLiteView';
import { BACKENDS } from '../shared/supported-backends';
import { PREVIEW_CASES } from '../shared/preview-cases';
import { siteTheme } from '../shared/theme';

type Mode = 'preset' | 'custom' | 'inherit';

const MODES: Mode[] = ['preset', 'custom', 'inherit'];
const LIFE_EXPECTANCY = PREVIEW_CASES.find((item) => item.id === 'life-expectancy')!;

/**
 * The three legal shapes of `theme_spec`, shown inside a complete Flint input.
 *
 * This is deliberately generated rather than copied into three markdown code
 * fences. The preset selector has to update both the named form and the base
 * of the inherited form, or the control would teach one thing while showing
 * another.
 */
export function ThemeSpecPanel() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('preset');
  const [presetId, setPresetId] = useState('economist');
  const preset = THEME_PRESETS[presetId];
  const previewCanvas =
    mode === 'custom'
      ? '#fffaf2'
      : preset.spec.ink?.surface?.canvas ?? '#ffffff';

  const input = useMemo(
    () => exampleFor(mode, presetId, t),
    [mode, presetId, t],
  );
  const display = useMemo(
    () => displaySource(input.theme_spec),
    [input],
  );
  const compiled = useMemo(
    () => {
      try {
        return { ok: true as const, value: BACKENDS.vegalite.assemble(input as any) };
      } catch (error) {
        return { ok: false as const, error };
      }
    },
    [input],
  );

  return (
    <section style={panelStyle} aria-label={t('docs.themeSpecPanel.aria')}>
      <style>{responsiveStyles}</style>
      <div style={toolbarStyle}>
        <div role="tablist" aria-label={t('docs.themeSpecPanel.modeAria')} style={tabsStyle}>
          {MODES.map((item) => {
            const selected = item === mode;
            return (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setMode(item)}
                style={{
                  ...tabStyle,
                  color: selected ? siteTheme.text : siteTheme.textMuted,
                  background: selected ? siteTheme.surface : 'transparent',
                  borderColor: selected ? siteTheme.border : 'transparent',
                }}
              >
                {t(`docs.themeSpecPanel.modes.${item}`)}
              </button>
            );
          })}
        </div>

        {mode !== 'custom' ? (
          <label style={selectLabelStyle}>
            <span>{mode === 'inherit' ? t('docs.themeSpecPanel.base') : t('docs.themeSpecPanel.preset')}</span>
            <select
              value={presetId}
              onChange={(event) => setPresetId(event.currentTarget.value)}
              style={selectStyle}
            >
              {Object.values(THEME_PRESETS).map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.label} ({choice.id})
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <p style={descriptionStyle}>
        {mode === 'custom'
          ? t('docs.themeSpecPanel.customDescription')
          : mode === 'inherit'
            ? t('docs.themeSpecPanel.inheritDescription', { name: preset.label })
            : t(`themes.descriptions.${preset.id}`)}
      </p>

      <div className="theme-spec-example-grid" style={exampleGridStyle}>
        <CodeBlock
          language="javascript"
          customStyle={codeStyle}
          highlightLines={display.highlightLines}
          variant="light"
        >
          {display.source}
        </CodeBlock>
        <div style={previewStyle}>
          <div style={previewLabelStyle}>{t('docs.themeSpecPanel.preview')}</div>
          <div style={{ background: previewCanvas }}>
            <ScaleToFit height={410} padding={8}>
              {compiled.ok ? (
                <VegaLiteView spec={compiled.value} renderer="svg" />
              ) : (
                <pre style={errorStyle}>
                  {t('docs.themeSpecPanel.renderError')}{' '}
                  {String((compiled.error as Error)?.message ?? compiled.error)}
                </pre>
              )}
            </ScaleToFit>
          </div>
          <div style={sourceStyle}>
            {t('docs.themeSpecPanel.exampleSource', { source: LIFE_EXPECTANCY.source })}
          </div>
        </div>
      </div>
    </section>
  );
}

function exampleFor(
  mode: Mode,
  presetId: string,
  t: ReturnType<typeof useTranslation>['t'],
): Record<string, unknown> {
  const themeSpec =
    mode === 'preset'
      ? presetId
      : mode === 'inherit'
        ? {
            extends: presetId,
            id: `our-${presetId}`,
            label: `Our ${THEME_PRESETS[presetId].label}`,
            ink: {
              series: {
                single: '#6b3fa0',
                categorical: ['#6b3fa0', '#c4558c', '#e48b5d', '#3f8f8b'],
                categoricalExtended: [
                  '#6b3fa0', '#c4558c', '#e48b5d', '#3f8f8b',
                  '#8d6cab', '#d06f61', '#d5aa3d', '#4f7899',
                ],
              },
            },
            type: {
              headline: { family: 'Aptos Display', weight: 'bold' },
            },
            layout: {
              density: 'compact',
            },
          }
        : {
            id: 'our-brand',
            label: 'Our brand',
            ink: {
              surface: { canvas: '#fffaf2', plot: '#fffaf2' },
              text: { primary: '#202124', secondary: '#5f6368' },
              structure: { grid: '#ded8ce', axis: '#202124' },
              series: {
                single: '#6b3fa0',
                categorical: ['#6b3fa0', '#c4558c', '#e48b5d', '#3f8f8b', '#d5aa3d', '#4f7899'],
              },
              accent: '#6b3fa0',
            },
            type: {
              headline: { family: 'Aptos Display', size: 'text.hero900', weight: 'bold' },
              axisLabel: { family: 'Aptos', size: 'text.300' },
              valueLabel: { family: 'Aptos', weight: 'semibold' },
            },
            structure: {
              axis: {
                categorical: { line: 'full', ticks: 'omit' },
                measure: { line: 'omit', ticks: 'omit' },
              },
              grid: { measure: 'hairline', category: 'omit' },
            },
            marks: {
              bandFraction: 0.72,
              strokeWeight: 2,
              cornerRadius: 3,
            },
            legend: {
              placement: ['top', 'right'],
              title: 'whenAmbiguous',
            },
            layout: {
              density: 'normal',
              titleBlock: { gap: 'normal' },
            },
          };

  return {
    // Six countries keep the input compact enough to read while still
    // exercising series colour, direct labels, axes, and legend policy.
    data: { values: LIFE_EXPECTANCY.data.slice(0, 12) },
    semantic_types: LIFE_EXPECTANCY.semantic_types,
    chart_spec: {
      chartType: LIFE_EXPECTANCY.chartType,
      encodings: LIFE_EXPECTANCY.encodings,
      title: t('docs.themeSpecPanel.exampleTitle'),
      subtitle: t('docs.themeSpecPanel.exampleSubtitle'),
      baseSize: { width: 380, height: 300 },
    },
    theme_spec: themeSpec,
  };
}

/**
 * Keep the whole Flint-input shape visible without letting a real dataset bury
 * the subject of this lesson. This is display-only; the preview compiles the
 * complete input above.
 */
function displaySource(themeSpec: unknown): { source: string; highlightLines: number[] } {
  const themeLines = JSON.stringify(themeSpec, null, 2).split('\n');
  const lines = [
    '{',
    '  "semantic_types": { ... },',
    '  "chart_spec": { ... },',
  ];

  if (themeLines.length === 1) {
    lines.push(`  "theme_spec": ${themeLines[0]}`);
  } else {
    lines.push(`  "theme_spec": ${themeLines[0]}`);
    lines.push(...themeLines.slice(1, -1).map((line) => `  ${line}`));
    lines.push(`  ${themeLines.at(-1)}`);
  }
  lines.push('}');

  return {
    source: lines.join('\n'),
    // One-based line numbers; the root object's final brace is not part of
    // theme_spec and therefore stays unhighlighted.
    highlightLines: Array.from({ length: lines.length - 4 }, (_, index) => index + 4),
  };
}

const panelStyle: CSSProperties = {
  margin: '16px 0 22px',
  padding: 12,
  border: `1px solid ${siteTheme.border}`,
  borderRadius: siteTheme.radius,
  background: siteTheme.surface,
};

const toolbarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap',
};

const tabsStyle: CSSProperties = {
  display: 'inline-flex',
  gap: 3,
  padding: 3,
  borderRadius: 8,
  background: 'rgba(31, 35, 40, 0.06)',
};

const tabStyle: CSSProperties = {
  minHeight: 30,
  padding: '0 11px',
  border: '1px solid transparent',
  borderRadius: 6,
  cursor: 'pointer',
  font: 'inherit',
  fontSize: 12.5,
};

const selectLabelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  color: siteTheme.textMuted,
  fontSize: 12.5,
};

const selectStyle: CSSProperties = {
  minHeight: 32,
  padding: '4px 28px 4px 9px',
  border: `1px solid ${siteTheme.border}`,
  borderRadius: 6,
  background: siteTheme.surface,
  color: siteTheme.text,
  font: 'inherit',
  fontSize: 12.5,
};

const descriptionStyle: CSSProperties = {
  margin: '10px 2px 0',
  color: siteTheme.textMuted,
  fontSize: 13,
  lineHeight: 1.5,
};

const codeStyle: CSSProperties = {
  height: 470,
  overflow: 'auto',
  margin: 0,
  border: `1px solid ${siteTheme.border}`,
  background: '#f6f8fa',
  fontSize: 11.5,
  lineHeight: 1.45,
};

const exampleGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(300px, 0.95fr)',
  gap: 12,
  alignItems: 'stretch',
  marginTop: 10,
};

const previewStyle: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  border: `1px solid ${siteTheme.border}`,
  borderRadius: siteTheme.radius,
  background: '#ffffff',
};

const previewLabelStyle: CSSProperties = {
  padding: '8px 10px',
  borderBottom: `1px solid ${siteTheme.border}`,
  color: siteTheme.textMuted,
  fontSize: 11.5,
  fontWeight: 700,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
};

const sourceStyle: CSSProperties = {
  padding: '7px 10px 9px',
  borderTop: `1px solid ${siteTheme.border}`,
  color: siteTheme.textMuted,
  fontSize: 11,
  lineHeight: 1.4,
};

const errorStyle: CSSProperties = {
  maxWidth: 280,
  margin: 0,
  color: siteTheme.error,
  fontSize: 11,
  whiteSpace: 'pre-wrap',
};

const responsiveStyles = `
  @media (max-width: 760px) {
    .theme-spec-example-grid {
      grid-template-columns: minmax(0, 1fr) !important;
    }
  }
`;
