/**
 * Shared design tokens — flat "paper" style ported from data-formulator's
 * design language: white surfaces separated by a single neutral hairline
 * (0.12) divider, no shadows, depth only from very subtle fills, and a
 * self-hosted Inter sans stack with a light, lightly-tracked wordmark.
 */
export const siteTheme = {
  bg: '#f7f7f8',
  surface: '#ffffff',
  border: 'rgba(0, 0, 0, 0.12)',
  borderMuted: 'rgba(0, 0, 0, 0.16)',
  text: '#1f2328',
  textMuted: '#4b525a',
  navInactive: '#6b7178',
  accent: '#0078d4',
  accentBg: 'rgba(0, 120, 212, 0.08)',
  hover: 'rgba(0, 0, 0, 0.04)',
  grid: 'rgba(0, 0, 0, 0.02)',
  error: '#cf222e',
  radius: 6,
  fontSans: "'Inter Variable', Inter, -apple-system, 'Segoe UI', system-ui, Roboto, 'Helvetica Neue', Arial, sans-serif",
  fontMono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
} as const;

/** Max width of the centered content column (nav, sidebar + main), Vega-Lite style. */
export const CONTENT_MAX_WIDTH = 1180;

export const GITHUB_REPO = 'https://github.com/microsoft/flint-chart';

/** Community Discord invite. */
export const DISCORD_INVITE = 'https://discord.gg/hnm4Y8YX8';

/** Landing-page section id for the WeChat QR block. */
export const WECHAT_SECTION_ID = 'wechat';

/** sessionStorage key used to scroll to a landing section after navigating home. */
export const LANDING_SCROLL_TO_KEY = 'flint-landing-scroll-to';
