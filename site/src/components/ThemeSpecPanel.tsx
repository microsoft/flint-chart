import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { THEME_PRESETS } from 'flint-chart';
import { CodeBlock } from './CodeBlock';
import { siteTheme } from '../shared/theme';

type Mode = 'preset' | 'custom' | 'inherit';

const MODES: Mode[] = ['preset', 'custom', 'inherit'];

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

  const source = useMemo(
    () => JSON.stringify(exampleFor(mode, presetId), null, 2),
    [mode, presetId],
  );

  return (
    <section style={panelStyle} aria-label={t('docs.themeSpecPanel.aria')}>
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

      <CodeBlock language="json" customStyle={codeStyle}>{source}</CodeBlock>
    </section>
  );
}

function exampleFor(mode: Mode, presetId: string): Record<string, unknown> {
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
                categorical: ['#6b3fa0', '#c4558c', '#e48b5d', '#3f8f8b'],
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
    data: {
      values: [
        { category: 'A', value: 42 },
        { category: 'B', value: 31 },
        { category: 'C', value: 18 },
      ],
    },
    semantic_types: {
      category: 'Category',
      value: { semanticType: 'Quantity', unit: 'USD' },
    },
    chart_spec: {
      chartType: 'Bar Chart',
      encodings: { x: 'category', y: 'value' },
      title: 'Revenue by category',
    },
    theme_spec: themeSpec,
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
  maxHeight: 500,
  overflow: 'auto',
  margin: '10px 0 0',
};
