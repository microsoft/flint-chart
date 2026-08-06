import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { THEME_PRESETS } from 'flint-chart';
import { siteTheme } from '../shared/theme';

export const themeIconUrl = (svg: string) =>
  `data:image/svg+xml,${encodeURIComponent(svg)}`;

export function ThemePresetIcon({
  icon,
  size = 18,
}: {
  icon: string;
  size?: number;
}) {
  return (
    <img
      src={themeIconUrl(icon)}
      alt=""
      style={{ display: 'block', width: size, height: size, flex: '0 0 auto' }}
    />
  );
}

/** Live preset catalogue, so docs cannot drift from the themes Flint ships. */
export function ThemePresetList() {
  const { t } = useTranslation();
  return (
    <div className="theme-preset-list" style={listStyle}>
      <style>{responsiveStyles}</style>
      {Object.values(THEME_PRESETS).map((preset) => (
        <div key={preset.id} style={itemStyle}>
          <ThemePresetIcon icon={preset.icon} size={20} />
          <div style={{ minWidth: 0 }}>
            <div style={nameRowStyle}>
              <strong>{preset.label}</strong>
              <code style={idStyle}>{preset.id}</code>
            </div>
            <div style={descriptionStyle}>{t(`themes.descriptions.${preset.id}`)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

const listStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 8,
  margin: '12px 0 16px',
};

const itemStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '20px minmax(0, 1fr)',
  gap: 9,
  alignItems: 'start',
  padding: 10,
  border: `1px solid ${siteTheme.border}`,
  borderRadius: 8,
  background: siteTheme.surface,
};

const nameRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 7,
  flexWrap: 'wrap',
  color: siteTheme.text,
  fontSize: 13,
};

const idStyle: CSSProperties = {
  padding: '1px 5px',
  borderRadius: 4,
  background: 'rgba(31, 35, 40, 0.06)',
  color: siteTheme.textMuted,
  fontFamily: siteTheme.fontMono,
  fontSize: 10.5,
};

const descriptionStyle: CSSProperties = {
  marginTop: 3,
  color: siteTheme.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
};

const responsiveStyles = `
  @media (max-width: 640px) {
    .theme-preset-list {
      grid-template-columns: minmax(0, 1fr) !important;
    }
  }
`;
