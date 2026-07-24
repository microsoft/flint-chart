import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { SiteNavBar, MicrosoftDisclosures } from '../components/SiteShell';
import { LocaleLink } from '../i18n/LocaleLink';
import { GITHUB_REPO, siteTheme } from '../shared/theme';
import chartPreview from '../assets/mcp-chart-preview.svg';

const HOSTED_MCP_URL = 'https://flint.data-formulator.ai/mcp';

const SURFACE_ITEMS = [
  { tagKey: 'toolPreferred', name: 'create_chart_view', descKey: 'create_chart_view', highlight: true },
  { tagKey: 'tool', name: 'render_chart', descKey: 'render_chart' },
  { tagKey: 'tool', name: 'compile_chart', descKey: 'compile_chart' },
  { tagKey: 'tool', name: 'validate_chart', descKey: 'validate_chart' },
  { tagKey: 'tool', name: 'list_chart_types', descKey: 'list_chart_types' },
  { tagKey: 'resource', name: 'flint://agent-skill', descKey: 'agentSkill' },
  { tagKey: 'resource', name: 'flint://chart-types', descKey: 'chartTypes' },
  { tagKey: 'prompt', name: 'author_flint_chart', descKey: 'authorPrompt' },
] as const;

/** Dedicated page for the Flint MCP server, matching the landing page canvas. */
export function McpServer() {
  const { t } = useTranslation();

  function scrollToInstallConfig() {
    document.getElementById('install-config')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div style={pageStyle}>
      <style>{interactiveStyles}</style>
      <SiteNavBar flush />

      <main style={mainStyle}>
        {/* ---- Hero -------------------------------------------------- */}
        <header style={heroSectionStyle}>
          <h1 style={heroTitleStyle}>{t('mcp.heroTitle')}</h1>
          <p style={leadStyle}>
            <Trans i18nKey="mcp.leadBefore" components={{ code: <code style={codeInlineStyle} /> }} />{' '}
            <a href="https://modelcontextprotocol.io" className="mcp-link" style={linkStyle} target="_blank" rel="noreferrer">
              {t('mcp.leadMcpLink')}
            </a>{' '}
            {t('mcp.leadAfter')}
          </p>

          <p style={setupLeadStyle}>
            <span style={setupLabelStyle}>
              <span aria-hidden="true" style={setupLabelIconStyle}>⚡</span>
              {t('mcp.quickStart')}
            </span>{' '}
            {t('mcp.quickStartBody')}{' '}
            <button type="button" className="mcp-link" style={setupInlineButtonStyle} onClick={scrollToInstallConfig}>
              {t('mcp.installConfigure')}
            </button>{' '}
            {t('mcp.orThe')}{' '}
            <a href={`${GITHUB_REPO}/tree/main/packages/flint-mcp`} className="mcp-link" style={setupInlineLinkStyle} target="_blank" rel="noreferrer">
              {t('mcp.githubReadme')}
            </a>
            .
          </p>

          <div className="mcp-setup-grid" style={setupGridStyle}>
            <div style={setupOptionStyle}>
              <div className="mcp-setup-option-header" style={setupOptionHeaderStyle}>
                <strong style={setupOptionTitleStyle}>{t('mcp.localSetupTitle')}</strong>
                <span className="mcp-setup-option-desc" style={setupOptionDescStyle}>
                  <span aria-hidden="true" style={recommendedStarStyle}>★</span>{' '}
                  {t('mcp.localSetupBody')}
                </span>
              </div>
              <CodeBlock copyable>{setupPrompt}</CodeBlock>
            </div>
            <div style={setupOptionStyle}>
              <div className="mcp-setup-option-header" style={setupOptionHeaderStyle}>
                <strong style={setupOptionTitleStyle}>{t('mcp.remoteSetupTitle')}</strong>
                <span className="mcp-setup-option-desc" style={setupOptionDescStyle}>{t('mcp.remoteSetupBody')}</span>
              </div>
              <CodeBlock copyable>{remoteSetupPrompt}</CodeBlock>
            </div>
          </div>

          <p style={skillNoteStyle}>
            <Trans
              i18nKey="mcp.skillNote"
              components={{
                skillLink: (
                  <a
                    href="https://skills.sh/microsoft/flint-chart/flint-chart-author"
                    className="mcp-link"
                    style={setupInlineLinkStyle}
                    target="_blank"
                    rel="noreferrer"
                  />
                ),
              }}
            />
          </p>
        </header>

        {/* ---- Article body ----------------------------------------- */}
        <article style={articleStyle}>
          {/* ---- The experience --------------------------------------- */}
          <Prose>
            <h2 style={firstH2Style}>{t('mcp.experience')}</h2>
            <p style={pStyle}>{t('mcp.experienceBody')}</p>
          </Prose>

          <ChatMockup />

          <Prose>
            <ol style={stepListStyle}>
              <li style={stepItemStyle}>
                <strong>{t('mcp.step1Title')}</strong> {t('mcp.step1Body')}
              </li>
              <li style={stepItemStyle}>
                <strong>{t('mcp.step2Title')}</strong> {t('mcp.step2Body')}
              </li>
              <li style={stepItemStyle}>
                <strong>{t('mcp.step3Title')}</strong> {t('mcp.step3Body')}
              </li>
            </ol>
          </Prose>

          {/* ---- What it provides ------------------------------------- */}
          <Prose>
            <h2 style={h2Style}>{t('mcp.provides')}</h2>
            <p style={pStyle}>{t('mcp.providesBody')}</p>
          </Prose>

          <div style={cardGridStyle}>
            {SURFACE_ITEMS.map((item) => (
              <SurfaceCard
                key={item.name}
                tag={t(`mcp.tags.${item.tagKey}`)}
                name={item.name}
                desc={t(`mcp.tools.${item.descKey}`)}
                highlight={'highlight' in item ? item.highlight : undefined}
              />
            ))}
          </div>

          {/* ---- Install ---------------------------------------------- */}
          <Prose>
            <h2 id="install-config" style={h2Style}>{t('mcp.installTitle')}</h2>
            <p style={pStyle}>
              <Trans
                i18nKey="mcp.installBody"
                components={{
                  strong: <strong />,
                  code: <code style={codeInlineStyle} />,
                }}
              />
            </p>
          </Prose>

          <CodeBlock>{clientConfig}</CodeBlock>

          <Prose>
            <p style={pStyle}>
              <Trans
                i18nKey="mcp.dataBody"
                components={{ code: <code style={codeInlineStyle} /> }}
              />
            </p>
          </Prose>

          <CodeBlock>{disableFileReferenceConfig}</CodeBlock>

          {/* ---- Next ------------------------------------------------- */}
          <Prose>
            <h2 style={h2Style}>{t('mcp.reference')}</h2>
            <p style={pStyle}>{t('mcp.referenceBody')}</p>
          </Prose>

          <div style={nextRowStyle}>
            <LocaleLink to="/documentation/setup-flint-mcp" style={primaryBtn}>
              {t('mcp.readSetupDocs')}
            </LocaleLink>
            <a href={`${GITHUB_REPO}/tree/main/packages/flint-mcp`} style={secondaryBtn} target="_blank" rel="noreferrer">
              {t('mcp.githubReadme')}
            </a>
          </div>
        </article>
      </main>

      <MicrosoftDisclosures />
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function ChatMockup() {
  const { t } = useTranslation();

  return (
    <div style={chatFrameStyle}>
      <div style={chatTitleBarStyle}>
        <span style={{ ...trafficDot, background: '#ec6a5e' }} />
        <span style={{ ...trafficDot, background: '#f4bf4f' }} />
        <span style={{ ...trafficDot, background: '#61c554' }} />
        <span style={chatTitleTextStyle}>{t('mcp.chatTitle')}</span>
      </div>

      <div style={chatBodyStyle}>
        {/* user turn */}
        <div style={userRowStyle}>
          <div style={userBubbleStyle}>
            Show me quarterly revenue by region as a grouped bar chart.
          </div>
        </div>

        {/* assistant turn */}
        <div style={assistantRowStyle}>
          <div style={avatarStyle}>AI</div>
          <div style={assistantColStyle}>
            <div style={assistantTextStyle}>
              Here's an interactive Flint chart view — tweak it and send the spec
              back when it looks right.
            </div>

            <div style={toolPillStyle}>
              <span style={toolDotStyle} /> called{' '}
              <code style={toolPillCodeStyle}>create_chart_view</code>
            </div>

            {/* embedded MCP App card */}
            <div style={appCardStyle}>
              <div style={appBarStyle}>
                <span style={appBarTitleStyle}>Flint Chart</span>
                <span style={appBarTagStyle}>{t('mcp.appTag')}</span>
              </div>

              <div style={appBodyStyle}>
                <div style={chartBoxStyle}>
                  <img src={chartPreview} alt="Grouped bar chart: quarterly revenue by region" style={chartImgStyle} />
                </div>

                <div style={optionsBarStyle}>
                  <div style={mockOptionsGridStyle}>
                    <MockSlider label="Corner radius" fill={0.25} readout="2" />
                    <MockSelect label="Sort" value="None" />
                    <MockToggle label="Show values" on={false} />
                  </div>
                  <span style={copyBtnStyle}>{t('mcp.copySpec')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MockSlider({ label, fill, readout }: { label: string; fill: number; readout: string }) {
  return (
    <span style={optStyleFor(label, 'continuous')}>
      <span style={optLabelStyle}>{label}</span>
      <span style={sliderTrackStyle}>
        <span style={{ ...sliderFillStyle, width: `${Math.round(fill * 100)}%` }} />
        <span style={{ ...sliderKnobStyle, left: `calc(${Math.round(fill * 100)}% - 6px)` }} />
      </span>
      <span style={readoutStyle}>{readout}</span>
    </span>
  );
}

function MockSelect({ label, value }: { label: string; value: string }) {
  return (
    <span style={optStyleFor(label, 'discrete')}>
      <span style={optLabelStyle}>{label}</span>
      <span style={selectBoxStyle}>
        {value} <span style={caretStyle}>▾</span>
      </span>
    </span>
  );
}

function MockToggle({ label, on }: { label: string; on: boolean }) {
  return (
    <span style={optStyleFor(label, 'binary')}>
      <span style={optLabelStyle}>{label}</span>
      <span style={{ ...toggleTrackStyle, background: on ? siteTheme.text : 'rgba(0,0,0,0.18)' }}>
        <span style={{ ...toggleThumbStyle, transform: on ? 'translateX(14px)' : 'none' }} />
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Small presentational helpers.                                      */
/* ------------------------------------------------------------------ */

function Prose({ children }: { children: ReactNode }) {
  return <div style={proseStyle}>{children}</div>;
}

function SurfaceCard(props: { tag: string; name: string; desc: string; highlight?: boolean }) {
  const { tag, name, desc, highlight } = props;
  return (
    <div style={{ ...cardStyle, ...(highlight ? cardHighlightStyle : null) }}>
      <div style={{ ...cardTagStyle, ...(highlight ? cardTagHighlightStyle : null) }}>{tag}</div>
      <code style={cardNameStyle}>{name}</code>
      <p style={cardDescStyle}>{desc}</p>
    </div>
  );
}

function CodeBlock({ children, copyable = false }: { children: string; copyable?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div style={codeBlockWrapStyle}>
      {copyable ? (
        <button type="button" style={copyButtonStyle} onClick={copyCode}>
          <span aria-hidden="true" style={copyIconStyle}>{copied ? '✓' : '⧉'}</span>
          {copied ? 'Copied' : 'Copy prompt'}
        </button>
      ) : null}
      <pre style={{ ...codeBlockStyle, ...(copyable ? codeBlockCopyableStyle : null) }}>{children}</pre>
    </div>
  );
}

const setupPrompt = `Help me set up Flint as an MCP server!

1. Add a stdio MCP server named "flint" to my client config that runs:
     npx -y flint-chart-mcp
2. Verify the setup by asking the server to list the available Flint chart types.`;

const remoteSetupPrompt = `Help me connect to the hosted Flint MCP server!

1. Add a remote HTTP MCP server named "flint" with this URL:
  ${HOSTED_MCP_URL}
2. Verify the connection by asking the server to list the available Flint chart types.`;

const clientConfig = `{
  "mcpServers": {
    "flint": {
      "command": "npx",
      "args": ["-y", "flint-chart-mcp"]
    }
  }
}`;

const disableFileReferenceConfig = `{
  "mcpServers": {
    "flint": {
      "command": "npx",
      "args": ["-y", "flint-chart-mcp", "--disable-file-reference"]
    }
  }
}`;

/* ------------------------------------------------------------------ */
/* Styles — flat "paper" tokens, matching the landing page.           */
/* ------------------------------------------------------------------ */

const PAPER = '#ffffff';
const HAIRLINE = 'rgba(0, 0, 0, 0.10)';
const GRID_LINE = 'rgba(0, 0, 0, 0.02)';

const setupGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: 22,
};

const setupOptionStyle: CSSProperties = {
  minWidth: 0,
};

const setupOptionHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 12,
  marginBottom: 8,
};

const setupOptionTitleStyle: CSSProperties = {
  color: siteTheme.text,
  fontSize: 14,
  fontWeight: 650,
};

const setupOptionDescStyle: CSSProperties = {
  color: siteTheme.textMuted,
  fontSize: 12,
  textAlign: 'right',
};

const recommendedStarStyle: CSSProperties = {
  color: '#b26a00',
  fontSize: 10,
};
const READING_WIDTH = 880;

const interactiveStyles = `
  @media (max-width: 520px) {
    .mcp-setup-option-header {
      flex-direction: column;
      align-items: flex-start !important;
      gap: 2px !important;
    }

    .mcp-setup-option-desc {
      text-align: left !important;
    }
  }
`;

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: siteTheme.fontSans,
  color: siteTheme.text,
  background: PAPER,
};

const mainStyle: CSSProperties = {
  flex: 1,
  width: '100%',
  backgroundImage: `
    linear-gradient(90deg, ${GRID_LINE} 1px, transparent 1px),
    linear-gradient(0deg, ${GRID_LINE} 1px, transparent 1px)
  `,
  backgroundSize: '24px 24px',
};

const heroSectionStyle: CSSProperties = {
  maxWidth: READING_WIDTH,
  margin: '0 auto',
  padding: '62px 24px 0',
  width: '100%',
  boxSizing: 'border-box',
};

const heroTitleStyle: CSSProperties = {
  fontSize: 36,
  lineHeight: 1.2,
  margin: '0 0 34px',
  fontWeight: 700,
  letterSpacing: 0,
};

const leadStyle: CSSProperties = {
  fontSize: 16.5,
  color: siteTheme.text,
  lineHeight: 1.65,
  margin: 0,
  fontWeight: 400,
};

const setupLeadStyle: CSSProperties = {
  ...leadStyle,
  marginTop: 24,
  marginBottom: 16,
};

const skillNoteStyle: CSSProperties = {
  ...leadStyle,
  fontSize: 15.5,
  marginTop: 18,
  marginBottom: 0,
};

const setupLabelStyle: CSSProperties = {
  color: siteTheme.text,
  fontWeight: 700,
};

const setupLabelIconStyle: CSSProperties = {
  marginRight: 6,
};

const setupInlineLinkStyle: CSSProperties = {
  color: siteTheme.accent,
  textDecoration: 'none',
  fontWeight: 500,
};

const setupInlineButtonStyle: CSSProperties = {
  color: siteTheme.accent,
  background: 'none',
  border: 0,
  padding: 0,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 'inherit',
  fontWeight: 500,
  lineHeight: 'inherit',
};

const articleStyle: CSSProperties = {
  maxWidth: READING_WIDTH,
  margin: '0 auto',
  padding: '12px 24px 72px',
  width: '100%',
  boxSizing: 'border-box',
};

const proseStyle: CSSProperties = {
  margin: '0 auto',
};

const h2Style: CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: 0,
  margin: '52px 0 18px',
};

const firstH2Style: CSSProperties = {
  ...h2Style,
  marginTop: 40,
};

const pStyle: CSSProperties = {
  fontSize: 16,
  lineHeight: 1.75,
  color: siteTheme.text,
  margin: '0 0 20px',
};

const captionStyle: CSSProperties = {
  fontSize: 13.5,
  lineHeight: 1.6,
  color: siteTheme.textMuted,
  margin: '14px 0 0',
};

const stepListStyle: CSSProperties = {
  margin: '32px 0 0',
  padding: '0 0 0 22px',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

const stepItemStyle: CSSProperties = {
  fontSize: 16,
  lineHeight: 1.65,
  color: siteTheme.text,
};

const codeInlineStyle: CSSProperties = {
  fontFamily: siteTheme.fontMono,
  fontSize: '0.88em',
  background: 'rgba(0,0,0,0.05)',
  borderRadius: 4,
  padding: '1px 5px',
};

const linkStyle: CSSProperties = {
  color: siteTheme.accent,
  textDecoration: 'none',
  fontWeight: 500,
};

/* ---- chat mockup ---- */

const chatFrameStyle: CSSProperties = {
  margin: '32px 0 0',
  border: `1px solid ${HAIRLINE}`,
  borderRadius: 12,
  overflow: 'hidden',
  background: PAPER,
};

const chatTitleBarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  padding: '10px 14px',
  borderBottom: `1px solid ${HAIRLINE}`,
  background: 'rgba(0,0,0,0.02)',
};

const trafficDot: CSSProperties = {
  width: 11,
  height: 11,
  borderRadius: '50%',
  display: 'inline-block',
};

const chatTitleTextStyle: CSSProperties = {
  marginLeft: 8,
  fontSize: 12,
  fontWeight: 500,
  color: siteTheme.textMuted,
  letterSpacing: '0.02em',
};

const chatBodyStyle: CSSProperties = {
  padding: '18px 18px 22px',
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
  background: 'rgba(0,0,0,0.012)',
};

const userRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
};

const userBubbleStyle: CSSProperties = {
  maxWidth: '78%',
  background: siteTheme.accent,
  color: '#fff',
  fontSize: 14.5,
  lineHeight: 1.5,
  padding: '10px 14px',
  borderRadius: '14px 14px 4px 14px',
};

const assistantRowStyle: CSSProperties = {
  display: 'flex',
  gap: 12,
  alignItems: 'flex-start',
};

const avatarStyle: CSSProperties = {
  flex: '0 0 auto',
  width: 30,
  height: 30,
  borderRadius: '50%',
  background: '#1f2328',
  color: '#fff',
  fontSize: 11,
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  letterSpacing: '0.02em',
};

const assistantColStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

const assistantTextStyle: CSSProperties = {
  fontSize: 14.5,
  lineHeight: 1.55,
  color: siteTheme.text,
};

const toolPillStyle: CSSProperties = {
  alignSelf: 'flex-start',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  fontSize: 12,
  color: siteTheme.textMuted,
  background: 'rgba(0,0,0,0.04)',
  border: `1px solid ${HAIRLINE}`,
  borderRadius: 999,
  padding: '3px 10px',
};

const toolDotStyle: CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: '50%',
  background: '#61c554',
};

const toolPillCodeStyle: CSSProperties = {
  fontFamily: siteTheme.fontMono,
  fontSize: 11.5,
  color: siteTheme.text,
};

/* ---- embedded app card ---- */

const appCardStyle: CSSProperties = {
  border: `1px solid ${HAIRLINE}`,
  borderRadius: 10,
  overflow: 'hidden',
  background: PAPER,
  maxWidth: 520,
};

const appBarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 12px',
  borderBottom: `1px solid ${HAIRLINE}`,
};

const appBarTitleStyle: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  color: siteTheme.text,
};

const appBarTagStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: siteTheme.textMuted,
  border: `1px solid ${HAIRLINE}`,
  borderRadius: 4,
  padding: '1px 6px',
};

const appBodyStyle: CSSProperties = {
  padding: 14,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const chartBoxStyle: CSSProperties = {
  border: `1px solid ${HAIRLINE}`,
  background: PAPER,
  padding: 8,
  display: 'flex',
  justifyContent: 'center',
};

const chartImgStyle: CSSProperties = {
  maxWidth: '100%',
  height: 'auto',
};

const optionsBarStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  alignItems: 'start',
  gap: '10px 14px',
  padding: '10px 14px',
  background: 'rgba(0,0,0,0.035)',
  borderRadius: 10,
  color: siteTheme.textMuted,
};

const mockOptionsGridStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '12px 28px',
  minWidth: 0,
};

// Best-effort sizing shared with the live options bars: measure by label
// length + widget type, snap to tiers, keep label + widget adjacent.
const MOCK_WIDGET_PX: Record<string, number> = {
  continuous: 72 + 6 + 24,
  discrete: 96,
  binary: 30,
};
const MOCK_WIDTH_TIERS = [140, 168, 200, 232, 264, 296];

function optStyleFor(label: string, kind: string): CSSProperties {
  const labelPx = Math.min(132, Math.ceil(label.length * 6.6));
  const needed = labelPx + 8 + (MOCK_WIDGET_PX[kind] ?? 120);
  const width = MOCK_WIDTH_TIERS.find((t) => t >= needed) ?? MOCK_WIDTH_TIERS[MOCK_WIDTH_TIERS.length - 1];
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    width,
  };
}

const optLabelStyle: CSSProperties = {
  fontSize: 12,
  color: siteTheme.textMuted,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const sliderTrackStyle: CSSProperties = {
  position: 'relative',
  display: 'inline-block',
  width: 72,
  height: 4,
  borderRadius: 999,
  background: 'rgba(0,0,0,0.18)',
  justifySelf: 'end',
};

const sliderFillStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  height: '100%',
  borderRadius: 999,
  background: siteTheme.text,
};

const sliderKnobStyle: CSSProperties = {
  position: 'absolute',
  top: '50%',
  width: 12,
  height: 12,
  borderRadius: '50%',
  background: siteTheme.text,
  transform: 'translateY(-50%)',
};

const readoutStyle: CSSProperties = {
  fontSize: 12,
  color: siteTheme.textMuted,
  fontVariantNumeric: 'tabular-nums',
  textAlign: 'right',
};

const selectBoxStyle: CSSProperties = {
  fontSize: 12,
  color: siteTheme.text,
  background: PAPER,
  border: `1px solid ${HAIRLINE}`,
  borderRadius: 4,
  padding: '3px 8px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 6,
  width: 96,
  justifySelf: 'end',
};

const caretStyle: CSSProperties = {
  fontSize: 9,
  color: siteTheme.textMuted,
};

const toggleTrackStyle: CSSProperties = {
  position: 'relative',
  width: 30,
  height: 16,
  borderRadius: 999,
  display: 'inline-flex',
  alignItems: 'center',
  padding: 2,
  justifySelf: 'end',
};

const toggleThumbStyle: CSSProperties = {
  width: 12,
  height: 12,
  borderRadius: '50%',
  background: PAPER,
  transition: 'transform 120ms ease',
};

const copyBtnStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: siteTheme.accent,
  whiteSpace: 'nowrap',
  alignSelf: 'center',
};

/* ---- surface cards ---- */

const cardGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  gap: 12,
  margin: '20px 0 0',
};

const cardStyle: CSSProperties = {
  border: `1px solid ${HAIRLINE}`,
  borderRadius: 8,
  padding: '14px 16px',
  background: PAPER,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const cardHighlightStyle: CSSProperties = {
  borderColor: 'rgba(0, 120, 212, 0.40)',
  background: 'rgba(0, 120, 212, 0.04)',
};

const cardTagStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: siteTheme.textMuted,
};

const cardTagHighlightStyle: CSSProperties = {
  color: siteTheme.accent,
};

const cardNameStyle: CSSProperties = {
  fontFamily: siteTheme.fontMono,
  fontSize: 13.5,
  fontWeight: 600,
  color: siteTheme.text,
};

const cardDescStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.55,
  color: siteTheme.textMuted,
  margin: 0,
};

/* ---- code blocks ---- */

const codeBlockWrapStyle: CSSProperties = {
  margin: '4px 0 8px',
  border: `1px solid ${HAIRLINE}`,
  borderRadius: 8,
  background: 'rgba(0,0,0,0.025)',
  overflow: 'auto',
  position: 'relative',
};

const codeBlockStyle: CSSProperties = {
  margin: 0,
  padding: '14px 16px',
  fontFamily: siteTheme.fontMono,
  fontSize: 13,
  lineHeight: 1.6,
  color: siteTheme.text,
};

const codeBlockCopyableStyle: CSSProperties = {
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

/* ---- next actions ---- */

const nextRowStyle: CSSProperties = {
  display: 'flex',
  gap: 12,
  margin: '20px 0 0',
  flexWrap: 'wrap',
};

const primaryBtn: CSSProperties = {
  display: 'inline-block',
  padding: '10px 18px',
  background: siteTheme.accent,
  color: '#fff',
  borderRadius: siteTheme.radius,
  textDecoration: 'none',
  fontWeight: 500,
  fontSize: 14,
};

const secondaryBtn: CSSProperties = {
  display: 'inline-block',
  padding: '10px 18px',
  background: PAPER,
  color: siteTheme.text,
  border: `1px solid ${HAIRLINE}`,
  borderRadius: siteTheme.radius,
  textDecoration: 'none',
  fontWeight: 500,
  fontSize: 14,
};
