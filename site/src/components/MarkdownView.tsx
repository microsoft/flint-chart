import type { CSSProperties, ReactNode, RefObject } from 'react';
import React, { Children, isValidElement } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Link, useLocation } from 'react-router-dom';
import { CodeBlock, PlainTextBlock, resolveCodeLanguage } from './CodeBlock';
import { SizingPlayground } from './SizingPlayground';
import { DocChart } from './DocChart';
import { ThemeSpecPanel } from './ThemeSpecPanel';
import { ThemePresetList } from './ThemePresetList';
import { useLocale } from '../i18n/LocaleContext';
import { resolveMarkdownHref, resolveMarkdownImageSrc } from '../shared/load-docs';
import { DOC_SCROLL_TO_KEY, scrollToHeading } from '../shared/scroll-to-heading';
import { siteTheme } from '../shared/theme';

function getTextContent(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') return String(child);
      if (isValidElement(child)) return getTextContent(child.props.children as ReactNode);
      return '';
    })
    .join('');
}

function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    // Keep letters/numbers across scripts (incl. CJK) so Chinese headings get stable ids.
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function headingProps(children: ReactNode, style: CSSProperties) {
  const id = slugifyHeading(getTextContent(children));
  return { id, style: { ...style, scrollMarginTop: 24 } };
}

export function MarkdownView({
  source,
  scrollContainerRef,
}: {
  source: string;
  scrollContainerRef?: RefObject<HTMLElement | null>;
}) {
  const location = useLocation();
  const { locale, lp } = useLocale();
  const scrollRoot = () => scrollContainerRef?.current ?? null;

  const components: Components = {
    a: ({ href, children }) => {
      // Same-page anchors — HashRouter uses the URL hash for routing, so we scroll via JS.
      if (href?.startsWith('#') && href.length > 1) {
        const id = decodeURIComponent(href.slice(1));
        return (
          <a
            href={href}
            style={linkStyle}
            onClick={(e) => {
              e.preventDefault();
              scrollToHeading(id, scrollRoot());
            }}
          >
            {children}
          </a>
        );
      }

      const internal = href ? resolveMarkdownHref(href, locale) : null;
      if (internal) {
        const [to, hash = ''] = internal.split('#');
        return (
          <Link
            to={hash ? `${to}#${hash}` : to}
            style={linkStyle}
            onClick={(e) => {
              if (!hash) return;
              if (location.pathname === to) {
                e.preventDefault();
                scrollToHeading(hash, scrollRoot());
              } else {
                sessionStorage.setItem(DOC_SCROLL_TO_KEY, hash);
              }
            }}
          >
            {children}
          </Link>
        );
      }
      if (href?.startsWith('/') && !href.startsWith('//')) {
        const [pathPart, hash = ''] = href.split('#');
        const to = lp(pathPart);
        return (
          <Link to={hash ? `${to}#${hash}` : to} style={linkStyle}>
            {children}
          </Link>
        );
      }
      const external = href?.startsWith('http') || href?.startsWith('//');
      return (
        <a
          href={href}
          style={linkStyle}
          {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
        >
          {children}
        </a>
      );
    },
    h1: ({ children }) => <h1 {...headingProps(children, h1Style)}>{children}</h1>,
    h2: ({ children }) => <h2 {...headingProps(children, h2Style)}>{children}</h2>,
    h3: ({ children }) => <h3 {...headingProps(children, h3Style)}>{children}</h3>,
    h4: ({ children }) => <h4 {...headingProps(children, h4Style)}>{children}</h4>,
    p: ({ children }) => <p style={pStyle}>{children}</p>,
    ul: ({ children }) => <ul style={ulStyle}>{children}</ul>,
    ol: ({ children }) => <ol style={olStyle}>{children}</ol>,
    li: ({ children }) => <li style={liStyle}>{children}</li>,
    blockquote: ({ children }) => <blockquote style={quoteStyle}>{children}</blockquote>,
    hr: () => <hr style={hrStyle} />,
    table: ({ children }) => (
      <div style={{ overflowX: 'auto', margin: '16px 0' }}>
        <table style={tableStyle}>{children}</table>
      </div>
    ),
    th: ({ children }) => <th style={thStyle}>{children}</th>,
    td: ({ children }) => <td style={tdStyle}>{children}</td>,
    code: ({ className, children }) => {
      const text = String(children).replace(/\n$/, '');
      const isBlock = Boolean(className?.startsWith('language-')) || text.includes('\n');

      if (!isBlock) {
        return <code style={inlineCodeStyle}>{children}</code>;
      }

      // Interactive doc widget: ```flint-playground discrete|continuous|circumference|area```
      if (className?.includes('language-flint-playground')) {
        const raw = text.trim().toLowerCase();
        const mode =
          raw === 'continuous' ? 'continuous'
          : raw === 'circumference' ? 'circumference'
          : raw === 'area' ? 'area'
          : 'discrete';
        return <SizingPlayground mode={mode} />;
      }

      // Rendered example chart from a raw ChartAssemblyInput: ```flint-chart [echarts|chartjs]```
      if (className?.includes('language-flint-chart')) {
        const newlineAt = text.indexOf('\n');
        const firstLine = (newlineAt === -1 ? text : text.slice(0, newlineAt)).trim().toLowerCase();
        const backend =
          firstLine === 'echarts' ? 'echarts'
          : firstLine === 'chartjs' ? 'chartjs'
          : firstLine === 'vegalite' ? 'vegalite'
          : null;
        const json = backend ? text.slice(newlineAt + 1) : text;
        return <DocChart source={json} backend={backend ?? 'vegalite'} />;
      }

      // Interactive ThemeSpec forms: preset id, custom object, and inherited
      // preset with overrides. The fence content is intentionally empty; the
      // panel owns complete, valid examples and keeps its selector in sync.
      if (className?.includes('language-flint-theme-spec')) {
        return <ThemeSpecPanel />;
      }

      // The live catalogue includes each preset's own SVG icon and reads the
      // same metadata as the pickers, so adding a house cannot leave a stale
      // hand-written table in the guide.
      if (className?.includes('language-flint-theme-presets')) {
        return <ThemePresetList />;
      }

      const language = resolveCodeLanguage(className);
      if (language && language !== 'text' && language !== 'plaintext') {
        return <CodeBlock language={language}>{text}</CodeBlock>;
      }

      return <PlainTextBlock>{text}</PlainTextBlock>;
    },
    pre: ({ children }) => <>{children}</>,
    img: ({ src, alt }) => {
      const resolved = src ? resolveMarkdownImageSrc(src) : null;
      const isIcon = typeof src === 'string' && src.includes('chart-icon');
      if (isIcon) {
        return (
          <img
            src={resolved ?? src}
            alt={alt ?? ''}
            style={{
              display: 'inline-block',
              width: 22,
              height: 22,
              verticalAlign: 'text-bottom',
              marginRight: 8,
            }}
          />
        );
      }
      return (
        <img
          src={resolved ?? src}
          alt={alt ?? ''}
          style={{
            display: 'block',
            maxWidth: '100%',
            height: 'auto',
            margin: '16px 0',
            borderRadius: siteTheme.radius,
            border: `1px solid ${siteTheme.border}`,
          }}
        />
      );
    },
  };

  return (
    <article className="doc-markdown" style={articleStyle}>
      <style>{katexBlockStyle}</style>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </article>
  );
}

const articleStyle: CSSProperties = {
  maxWidth: 820,
  lineHeight: 1.65,
  fontSize: 15,
  color: siteTheme.text,
};

// KaTeX display math: centered block with vertical rhythm (class applied by rehype-katex).
const katexBlockStyle = `
  .doc-markdown .katex-display {
    margin: 16px 0;
    overflow-x: auto;
    overflow-y: hidden;
  }
`;

const linkStyle: CSSProperties = { color: siteTheme.accent, textDecoration: 'none' };
const h1Style: CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  margin: '0 0 16px',
  letterSpacing: '-0.02em',
};
const h2Style: CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  margin: '32px 0 12px',
  paddingBottom: 6,
  borderBottom: `1px solid ${siteTheme.border}`,
};
const h3Style: CSSProperties = { fontSize: 16, fontWeight: 600, margin: '24px 0 8px' };
const h4Style: CSSProperties = { fontSize: 14, fontWeight: 600, margin: '20px 0 6px' };
const pStyle: CSSProperties = { margin: '0 0 12px' };
const ulStyle: CSSProperties = { margin: '0 0 12px', paddingLeft: 24 };
const olStyle: CSSProperties = { margin: '0 0 12px', paddingLeft: 24 };
const liStyle: CSSProperties = { marginBottom: 4 };
const quoteStyle: CSSProperties = {
  margin: '12px 0',
  padding: '8px 16px',
  borderLeft: `3px solid ${siteTheme.borderMuted}`,
  color: siteTheme.textMuted,
};
const hrStyle: CSSProperties = {
  border: 0,
  borderTop: `1px solid ${siteTheme.border}`,
  margin: '24px 0',
};
const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
};
const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  borderBottom: `1px solid ${siteTheme.borderMuted}`,
};
const tdStyle: CSSProperties = {
  padding: '8px 10px',
  borderBottom: `1px solid ${siteTheme.border}`,
  verticalAlign: 'top',
};
const inlineCodeStyle: CSSProperties = {
  fontFamily: siteTheme.fontMono,
  fontSize: '0.9em',
  background: siteTheme.hover,
  padding: '2px 5px',
  borderRadius: 4,
};
