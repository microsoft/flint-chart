import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { siteTheme } from '../shared/theme';

const HAIRLINE = 'rgba(0, 0, 0, 0.10)';

/**
 * A monospace block of text. With `copyable`, it is a prompt the reader pastes into their agent, with a
 * copy button over its top-right corner.
 */
export function PromptBlock({ children, copyable = false }: { children: string; copyable?: boolean }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className={copyable ? 'prompt-block prompt-block-copyable' : 'prompt-block'} style={wrapStyle}>
      {copyable ? (
        <button type="button" style={copyButtonStyle} onClick={copy}>
          <span aria-hidden="true" style={copyIconStyle}>{copied ? '✓' : '⧉'}</span>
          {copied ? t('mcp.copied') : t('mcp.copyPrompt')}
        </button>
      ) : null}
      <pre style={{ ...preStyle, ...(copyable ? preCopyableStyle : null) }}>{children}</pre>
    </div>
  );
}

const wrapStyle: CSSProperties = {
  margin: '4px 0 8px',
  border: `1px solid ${HAIRLINE}`,
  borderRadius: 8,
  background: 'rgba(0,0,0,0.025)',
  overflow: 'auto',
  position: 'relative',
};

const preStyle: CSSProperties = {
  margin: 0,
  padding: '14px 16px',
  fontFamily: siteTheme.fontMono,
  fontSize: 13,
  lineHeight: 1.6,
  color: siteTheme.text,
};

const preCopyableStyle: CSSProperties = {
  paddingRight: 128,
};

const copyButtonStyle: CSSProperties = {
  position: 'absolute',
  top: 8,
  right: 8,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  border: `1px solid rgba(0, 102, 204, 0.24)`,
  borderRadius: 7,
  background: 'rgba(0, 102, 204, 0.08)',
  color: siteTheme.accent,
  fontFamily: siteTheme.fontSans,
  fontSize: 12.5,
  fontWeight: 600,
  padding: '5px 10px',
  cursor: 'pointer',
};

const copyIconStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: 1,
};
