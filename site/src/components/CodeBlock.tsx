import type { CSSProperties } from 'react';
import React from 'react';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import oneDark from 'react-syntax-highlighter/dist/esm/styles/prism/one-dark';
import oneLight from 'react-syntax-highlighter/dist/esm/styles/prism/one-light';
import { siteTheme } from '../shared/theme';

SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('html', markup);

const LANG_ALIASES: Record<string, string> = {
  ts: 'typescript',
  js: 'javascript',
  sh: 'bash',
  shell: 'bash',
  jsonc: 'json',
  json5: 'json',
};

export function resolveCodeLanguage(className?: string): string | null {
  const match = /language-(\w+)/.exec(className ?? '');
  if (!match) return null;
  const raw = match[1];
  return LANG_ALIASES[raw] ?? raw;
}

const defaultBlockStyle: CSSProperties = {
  margin: '12px 0',
  padding: 14,
  borderRadius: siteTheme.radius,
  fontSize: 13,
  lineHeight: 1.5,
};

const plainPreStyle: CSSProperties = {
  margin: '12px 0',
  padding: 14,
  background: '#0d1117',
  color: '#e6edf3',
  borderRadius: siteTheme.radius,
  overflow: 'auto',
  fontSize: 13,
  lineHeight: 1.5,
};

const plainCodeStyle: CSSProperties = {
  fontFamily: siteTheme.fontMono,
  whiteSpace: 'pre',
};

/** Fenced block without syntax highlighting (diagrams, plain text). */
export function PlainTextBlock({
  children,
  customStyle,
}: {
  children: string;
  customStyle?: CSSProperties;
}) {
  return (
    <pre style={{ ...plainPreStyle, ...customStyle }}>
      <code style={plainCodeStyle}>{children}</code>
    </pre>
  );
}

export function CodeBlock({
  language = 'typescript',
  children,
  customStyle,
  highlightLines,
  variant = 'dark',
}: {
  language?: string;
  children: string;
  customStyle?: CSSProperties;
  highlightLines?: readonly number[];
  variant?: 'dark' | 'light';
}) {
  const Highlighter = SyntaxHighlighter as unknown as React.ElementType;
  const highlighted = new Set(highlightLines);
  return (
    <Highlighter
      style={variant === 'light' ? oneLight : oneDark}
      language={language}
      PreTag="div"
      customStyle={{ ...defaultBlockStyle, ...customStyle }}
      wrapLines={highlighted.size > 0}
      lineProps={(lineNumber: number) =>
        highlighted.has(lineNumber)
          ? {
              style: {
                display: 'block',
                margin: '0 -14px',
                padding: '0 11px',
                borderLeft: `3px solid ${siteTheme.accent}`,
                background: variant === 'light'
                  ? 'rgba(9, 105, 218, 0.08)'
                  : 'rgba(88, 166, 255, 0.12)',
              },
            }
          : {}
      }
      codeTagProps={{
        style: { fontFamily: siteTheme.fontMono },
      }}
    >
      {children}
    </Highlighter>
  );
}
