import { useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { THEME_PRESETS } from 'flint-chart';
import { CodeBlock } from './CodeBlock';
import { ThemePresetIcon } from './ThemePresetList';
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
  const pickerRef = useRef<HTMLDetailsElement>(null);
  const preset = THEME_PRESETS[presetId];
  const previewCanvas =
    mode === 'custom'
      ? '#e7f1f8'
      : preset.spec.ink?.surface?.canvas ?? '#ffffff';

  const input = useMemo(
    () => exampleFor(mode, presetId, t),
    [mode, presetId, t],
  );
  const display = useMemo(
    () => displaySource(input),
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
          <div style={selectLabelStyle}>
            <span>{mode === 'inherit' ? t('docs.themeSpecPanel.base') : t('docs.themeSpecPanel.preset')}</span>
            <details ref={pickerRef} style={pickerStyle}>
              <summary className="theme-preset-summary" style={pickerSummaryStyle}>
                <ThemePresetIcon icon={preset.icon} size={15} />
                <span style={{ flex: 1 }}>{preset.label}</span>
                <code style={pickerIdStyle}>{preset.id}</code>
                <span aria-hidden="true" style={{ color: siteTheme.textMuted }}>▾</span>
              </summary>
              <div role="listbox" aria-label={t('docs.themeSpecPanel.preset')} style={pickerMenuStyle}>
                {Object.values(THEME_PRESETS).map((choice) => {
                  const selected = choice.id === presetId;
                  return (
                    <button
                      key={choice.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        setPresetId(choice.id);
                        pickerRef.current?.removeAttribute('open');
                      }}
                      style={{
                        ...pickerOptionStyle,
                        background: selected ? siteTheme.hover : 'transparent',
                        color: selected ? siteTheme.text : siteTheme.textMuted,
                      }}
                    >
                      <ThemePresetIcon icon={choice.icon} size={15} />
                      <span style={{ flex: 1, textAlign: 'left' }}>{choice.label}</span>
                      <code style={pickerIdStyle}>{choice.id}</code>
                    </button>
                  );
                })}
              </div>
            </details>
          </div>
        ) : null}
      </div>

      <div className="theme-spec-example-grid" style={exampleGridStyle}>
        <CodeBlock
          language="javascript"
          customStyle={codeStyle}
          highlightLines={display.highlightLines}
          variant="light"
        >
          {display.source}
        </CodeBlock>
        <div style={chartColumnStyle}>
          <div style={{ overflow: 'hidden', borderRadius: siteTheme.radius, background: previewCanvas }}>
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
          <p style={chartDescriptionStyle}>
            {mode === 'custom'
              ? t('docs.themeSpecPanel.customDescription')
              : mode === 'inherit'
                ? t('docs.themeSpecPanel.inheritDescription', { name: preset.label })
                : t(`themes.descriptions.${preset.id}`)}
          </p>
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
              surface: { canvas: '#e7f1f8', plot: '#e7f1f8' },
              text: { primary: '#202124', secondary: '#5f6368' },
              structure: { grid: '#bfd2df', axis: '#202124' },
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
function displaySource(input: Record<string, unknown>): { source: string; highlightLines: number[] } {
  const lines = [
    '{',
    '  "data": { ... },',
    '  "semantic_types": { ... },',
  ];
  appendProperty(lines, 'chart_spec', input.chart_spec, true);
  const themeStart = lines.length + 1;
  appendProperty(lines, 'theme_spec', input.theme_spec, false);
  const themeEnd = lines.length;
  lines.push('}');

  return {
    source: lines.join('\n'),
    highlightLines: Array.from(
      { length: themeEnd - themeStart + 1 },
      (_, index) => themeStart + index,
    ),
  };
}

function appendProperty(
  lines: string[],
  key: string,
  value: unknown,
  comma: boolean,
): void {
  const valueLines = JSON.stringify(value, null, 2).split('\n');
  if (valueLines.length === 1) {
    lines.push(`  "${key}": ${valueLines[0]}${comma ? ',' : ''}`);
    return;
  }
  lines.push(`  "${key}": ${valueLines[0]}`);
  lines.push(...valueLines.slice(1, -1).map((line) => `  ${line}`));
  lines.push(`  ${valueLines.at(-1)}${comma ? ',' : ''}`);
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

const pickerStyle: CSSProperties = {
  position: 'relative',
  minWidth: 190,
};

const pickerSummaryStyle: CSSProperties = {
  minHeight: 32,
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  padding: '4px 8px',
  border: `1px solid ${siteTheme.border}`,
  borderRadius: 6,
  background: siteTheme.surface,
  color: siteTheme.text,
  cursor: 'pointer',
  listStyle: 'none',
  fontSize: 12.5,
};

const pickerMenuStyle: CSSProperties = {
  position: 'absolute',
  zIndex: 5,
  top: 'calc(100% + 4px)',
  right: 0,
  width: 240,
  maxHeight: 310,
  overflowY: 'auto',
  boxSizing: 'border-box',
  padding: 4,
  border: `1px solid ${siteTheme.border}`,
  borderRadius: 7,
  background: siteTheme.surface,
  boxShadow: '0 8px 24px rgba(31, 35, 40, 0.16)',
};

const pickerOptionStyle: CSSProperties = {
  width: '100%',
  minHeight: 32,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '5px 7px',
  border: 0,
  borderRadius: 5,
  cursor: 'pointer',
  font: 'inherit',
  fontSize: 12.5,
};

const pickerIdStyle: CSSProperties = {
  color: siteTheme.textMuted,
  fontFamily: siteTheme.fontMono,
  fontSize: 10.5,
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

const chartColumnStyle: CSSProperties = {
  minWidth: 0,
  alignSelf: 'start',
};

const sourceStyle: CSSProperties = {
  marginTop: 4,
  color: siteTheme.textMuted,
  fontSize: 11,
  lineHeight: 1.4,
};

const chartDescriptionStyle: CSSProperties = {
  margin: '10px 0 0',
  color: siteTheme.textMuted,
  fontSize: 12.5,
  lineHeight: 1.5,
};

const errorStyle: CSSProperties = {
  maxWidth: 280,
  margin: 0,
  color: siteTheme.error,
  fontSize: 11,
  whiteSpace: 'pre-wrap',
};

const responsiveStyles = `
  .theme-preset-summary::-webkit-details-marker {
    display: none;
  }
  @media (max-width: 760px) {
    .theme-spec-example-grid {
      grid-template-columns: minmax(0, 1fr) !important;
    }
  }
`;
