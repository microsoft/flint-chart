import { useEffect, useMemo, useState } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import { useTranslation } from 'react-i18next';
import { SiteShell } from '../components/SiteShell';
import { JsonCodeMirror } from '../components/JsonCodeMirror';
import { ResizeSplit } from '../components/ResizeSplit';
import { VegaLiteView } from '../components/VegaLiteView';
import { EChartsView } from '../components/EChartsView';
import { ChartjsView } from '../components/ChartjsView';
import { EXAMPLES } from './editor-examples';
import { loadEditorPayload, readEditorCaseParam, readGalleryCaseParams } from '../shared/editor-payload';
import { testCaseToAssemblyInput } from '../shared/test-case-utils';
import {
  ALL_BACKENDS,
  BACKENDS,
  BACKEND_LABELS,
  getSupportedBackends,
  type PreviewBackend,
} from '../shared/supported-backends';
import { TEST_GENERATORS } from 'flint-chart/test-data';
import { siteTheme } from '../shared/theme';

type Backend = PreviewBackend;

type CompileResult<T> = { ok: true; value: T } | { ok: false; err: unknown };

function compile<T>(fn: () => T): CompileResult<T> {
  try {
    return { ok: true, value: fn() };
  } catch (err) {
    return { ok: false, err };
  }
}

/**
 * Lenient JSON parse: tolerates trailing commas and `//` / `/* *\/` comments
 * that a strict `JSON.parse` would reject, so hand-edited specs stay forgiving.
 */
function parseLenientJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const cleaned = text
      // strip block comments
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // strip line comments (not inside strings is approximated; safe for specs)
      .replace(/(^|[^:"'\\])\/\/[^\n\r]*/g, '$1')
      // drop trailing commas before } or ]
      .replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(cleaned);
  }
}

/**
 * Live editor — left: Flint input; right top: chart preview; right bottom:
 * compiled spec for the backend selected in Preview tabs.
 */
export function Editor() {
  const { t } = useTranslation();
  const [text, setText] = useState<string>(JSON.stringify(EXAMPLES[0].input, null, 2));
  const [backend, setBackend] = useState<Backend>('vegalite');
  const [loadedFromGallery, setLoadedFromGallery] = useState(false);
  const [inputFoldKey, setInputFoldKey] = useState(0);

  useEffect(() => {
    const galleryCase = readGalleryCaseParams();
    if (galleryCase) {
      const generatorName = galleryCase.generator;
      if (!(generatorName in TEST_GENERATORS)) return;
      const gen = TEST_GENERATORS[generatorName as keyof typeof TEST_GENERATORS];
      const testCase = gen?.()[galleryCase.index];
      if (testCase) {
        setText(JSON.stringify(testCaseToAssemblyInput(testCase), null, 2));
        setLoadedFromGallery(true);
        setInputFoldKey((k) => k + 1);
        return;
      }
    }

    const caseId = readEditorCaseParam();
    if (!caseId) return;
    const payload = loadEditorPayload(caseId);
    if (payload) {
      setText(JSON.stringify(payload, null, 2));
      setLoadedFromGallery(true);
      setInputFoldKey((k) => k + 1);
    }
  }, []);

  const parsed = useMemo(() => {
    try {
      return { ok: true as const, value: parseLenientJson(text) };
    } catch (err) {
      return { ok: false as const, err };
    }
  }, [text]);

  const chartType = parsed.ok
    ? (parsed.value as { chart_spec?: { chartType?: string } })?.chart_spec?.chartType
    : undefined;

  const supportedBackends = useMemo(
    () => (chartType ? getSupportedBackends(chartType) : ALL_BACKENDS),
    [chartType],
  );

  useEffect(() => {
    if (!supportedBackends.includes(backend)) {
      setBackend(supportedBackends[0] ?? 'vegalite');
    }
  }, [supportedBackends, backend]);

  const compiledByBackend = useMemo(() => {
    if (!parsed.ok) return { ok: false as const, err: parsed.err };
    const input = parsed.value as ChartAssemblyInput;
    const value = Object.fromEntries(
      ALL_BACKENDS.map((b) => [b, compile(() => BACKENDS[b].assemble(input))]),
    ) as Record<PreviewBackend, CompileResult<unknown>>;
    return { ok: true as const, value };
  }, [parsed]);

  const activeCompiled = compiledByBackend.ok ? compiledByBackend.value[backend] : null;

  const backendCodeText = useMemo(() => {
    if (!parsed.ok) {
      return `// JSON parse error:\n// ${String((parsed.err as Error).message)}`;
    }
    if (!compiledByBackend.ok) {
      return `// Compile error:\n// ${String((compiledByBackend.err as Error)?.message ?? compiledByBackend.err)}`;
    }
    const result = compiledByBackend.value[backend];
    if (!result.ok) {
      return `// ${BACKEND_LABELS[backend]} compile error:\n// ${String((result.err as Error)?.message ?? result.err)}`;
    }
    return JSON.stringify(result.value, null, 2);
  }, [parsed, compiledByBackend, backend]);

  const codeFoldKey = `${backend}:${backendCodeText}`;

  return (
    <SiteShell>
      <style>{editorResponsiveStyles}</style>
      <ResizeSplit
        className="editor-main-split"
        direction="horizontal"
        initialRatio={32}
        storageKey="flint-editor-split-h"
      >
        <section className="editor-code-pane" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
          <InputPane
            label={t('editor.flintSpec')}
            loadedFromGallery={loadedFromGallery}
            text={text}
            onChange={setText}
            parseError={!parsed.ok ? String((parsed.err as Error).message) : null}
            examples={EXAMPLES}
            onSelectExample={(input) => {
              setText(JSON.stringify(input, null, 2));
              setLoadedFromGallery(false);
              setInputFoldKey((k) => k + 1);
            }}
            foldKey={inputFoldKey}
          />
        </section>

        <ResizeSplit
          className="editor-preview-split"
          direction="vertical"
          initialRatio={52}
          storageKey="flint-editor-split-v"
        >
          <PreviewPane
            backend={backend}
            supportedBackends={supportedBackends}
            onBackendChange={setBackend}
            parsed={parsed}
            compiled={activeCompiled}
          />

          <OutputPane
            backend={backend}
            label={t('editor.output')}
            text={backendCodeText}
            foldKey={codeFoldKey}
            compiled={activeCompiled}
            compileError={
              activeCompiled && !activeCompiled.ok
                ? String((activeCompiled.err as Error)?.message ?? activeCompiled.err)
                : null
            }
          />
        </ResizeSplit>
      </ResizeSplit>
    </SiteShell>
  );
}

function InputPane({
  label,
  text,
  onChange,
  parseError,
  examples,
  onSelectExample,
  loadedFromGallery,
  foldKey,
}: {
  label: string;
  text: string;
  onChange: (v: string) => void;
  parseError: string | null;
  examples: typeof EXAMPLES;
  onSelectExample: (input: unknown) => void;
  loadedFromGallery: boolean;
  foldKey: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="editor-input-pane" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      <PaneHeader label={label}>
        {loadedFromGallery ? (
          <span style={galleryBadgeStyle}>{t('editor.loadedFromGallery')}</span>
        ) : (
          <>
            <span style={paneHintStyle}>{t('editor.example')}</span>
            <select
              style={exampleSelectStyle}
              onChange={(e) => {
                const ex = examples.find((x) => x.name === e.target.value);
                if (ex) onSelectExample(ex.input);
              }}
              defaultValue={examples[0].name}
            >
              {examples.map((ex) => (
                <option key={ex.name} value={ex.name}>
                  {ex.name}
                </option>
              ))}
            </select>
          </>
        )}
      </PaneHeader>
      <JsonCodeMirror value={text} onChange={onChange} foldKey={foldKey} foldKeys={[]} />
      {parseError && (
        <pre
          style={{
            color: siteTheme.error,
            margin: 0,
            padding: 8,
            borderTop: `1px solid ${siteTheme.border}`,
            fontSize: 11,
          }}
        >
          JSON error: {parseError}
        </pre>
      )}
    </div>
  );
}

function PreviewPane({
  backend,
  supportedBackends,
  onBackendChange,
  parsed,
  compiled,
}: {
  backend: Backend;
  supportedBackends: Backend[];
  onBackendChange: (b: Backend) => void;
  parsed: { ok: true; value: unknown } | { ok: false; err: unknown };
  compiled: CompileResult<unknown> | null;
}) {
  const { t } = useTranslation();
  return (
    <div className="editor-preview-pane" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      <header style={paneHeaderStyle}>
        <span style={paneTitleStyle}>{t('editor.preview')}</span>
        <div style={backendToggleStyle} role="tablist" aria-label={t('editor.backendAria')}>
          {supportedBackends.map((b) => (
            <button
              key={b}
              type="button"
              role="tab"
              aria-selected={backend === b}
              onClick={() => onBackendChange(b)}
              style={backendTabStyle(backend === b)}
            >
              {BACKEND_LABELS[b]}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
      </header>

      <div className="editor-preview-body" style={{ flex: 1, overflow: 'auto', padding: 16, background: siteTheme.surface }}>
        {!parsed.ok ? (
          <pre style={{ color: siteTheme.error, fontSize: 13, whiteSpace: 'pre-wrap', margin: 0 }}>
            JSON error: {String((parsed.err as Error).message)}
          </pre>
        ) : compiled?.ok ? (
          <>
            {backend === 'vegalite' && <VegaLiteView spec={compiled.value} />}
            {backend === 'echarts' && <EChartsView option={compiled.value} height={320} />}
            {backend === 'chartjs' && <ChartjsView config={compiled.value} height={320} />}
          </>
        ) : (
          <pre style={{ color: siteTheme.error, fontSize: 13, whiteSpace: 'pre-wrap', margin: 0 }}>
            Compile error: {String((compiled?.err as Error)?.message ?? compiled?.err ?? 'Unknown error')}
          </pre>
        )}
      </div>
    </div>
  );
}

const OUTPUT_LANG: Record<Backend, string> = {
  vegalite: 'Vega-Lite JSON',
  echarts: 'ECharts option',
  chartjs: 'Chart.js config',
};

/**
 * Hand the compiled spec to the backend's own online editor.
 * - Vega-Lite: real handshake — repeatedly postMessage the spec until the
 *   editor acks (same protocol vega-embed's "Open in Vega Editor" uses).
 * - ECharts: no spec-injection editor exists, so copy the option to the
 *   clipboard and open the playground for a quick paste.
 * - Chart.js: no official online editor.
 */
function openVegaEditor(spec: unknown, mode: 'vega' | 'vega-lite') {
  const url = 'https://vega.github.io/editor/';
  const editor = window.open(url);
  if (!editor) return;
  const message = { mode, spec: JSON.stringify(spec, null, 2), renderer: 'canvas' };
  let attempts = Math.floor(8000 / 250);
  const ack = (event: MessageEvent) => {
    if (event.source === editor) {
      attempts = 0;
      window.removeEventListener('message', ack);
    }
  };
  window.addEventListener('message', ack);
  const send = () => {
    if (attempts <= 0) return;
    editor.postMessage(message, '*');
    attempts -= 1;
    window.setTimeout(send, 250);
  };
  window.setTimeout(send, 250);
}

interface ExternalEditor {
  label: string;
  title: string;
  open: (spec: unknown, text: string) => void;
}

const EXTERNAL_EDITORS: Partial<Record<Backend, ExternalEditor>> = {
  vegalite: {
    label: 'Open in Vega Editor',
    title: 'Open this spec in the online Vega-Lite editor',
    open: (spec) => openVegaEditor(spec, 'vega-lite'),
  },
  echarts: {
    label: 'Open in ECharts Editor',
    title: 'Copies the option and opens the ECharts editor — paste it in to run',
    open: (_spec, text) => {
      void navigator.clipboard?.writeText(text);
      window.open('https://echarts.apache.org/examples/en/editor.html', '_blank', 'noopener');
    },
  },
};

function OutputActions({
  backend,
  spec,
  text,
}: {
  backend: Backend;
  spec: unknown;
  text: string;
}) {
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation();
  const editor = EXTERNAL_EDITORS[backend];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <button type="button" onClick={copy} style={outputBtnStyle}>
        {copied ? t('editor.copied') : t('editor.copy')}
      </button>
      {editor && (
        <button
          type="button"
          onClick={() => editor.open(spec, text)}
          style={outputBtnStyle}
          title={editor.title}
        >
          {editor.label} ↗
        </button>
      )}
    </div>
  );
}

function OutputPane({
  backend,
  label,
  text,
  compiled,
  compileError,
  foldKey,
}: {
  backend: Backend;
  label: string;
  text: string;
  compiled: CompileResult<unknown> | null;
  compileError: string | null;
  foldKey: string;
}) {
  const spec = compiled?.ok ? compiled.value : null;
  return (
    <div className="editor-output-pane" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      <PaneHeader label={label} hint={`${OUTPUT_LANG[backend]} · read-only`}>
        {spec != null && <OutputActions backend={backend} spec={spec} text={text} />}
        {compileError && (
          <span style={{ fontSize: 11, color: siteTheme.error }}>{compileError}</span>
        )}
      </PaneHeader>
      <JsonCodeMirror value={text} readOnly foldKey={foldKey} />
    </div>
  );
}

function PaneHeader({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <header style={paneHeaderStyle}>
      <span style={paneTitleStyle}>{label}</span>
      {hint && <span style={paneHintStyle}>· {hint}</span>}
      <div style={{ flex: 1 }} />
      {children}
    </header>
  );
}

const paneHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minHeight: 38,
  padding: '0 12px',
  borderBottom: `1px solid ${siteTheme.border}`,
  background: siteTheme.bg,
  flexShrink: 0,
};

const paneTitleStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: siteTheme.textMuted,
};

const paneHintStyle: React.CSSProperties = {
  fontSize: 11,
  color: siteTheme.textMuted,
  opacity: 0.85,
};

const galleryBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
  color: siteTheme.accent,
  background: siteTheme.accentBg,
  borderRadius: 999,
  padding: '2px 9px',
};

const backendToggleStyle: React.CSSProperties = {
  display: 'inline-flex',
  gap: 2,
  padding: 2,
  border: `1px solid ${siteTheme.border}`,
  borderRadius: siteTheme.radius,
  background: siteTheme.surface,
};

function backendTabStyle(active: boolean): React.CSSProperties {
  return {
    padding: '3px 10px',
    border: 0,
    borderRadius: 4,
    background: active ? siteTheme.accent : 'transparent',
    color: active ? '#fff' : siteTheme.text,
    fontSize: 12,
    fontWeight: active ? 600 : 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };
}

const exampleSelectStyle: React.CSSProperties = {
  fontSize: 12,
  fontFamily: 'inherit',
  color: siteTheme.text,
  background: siteTheme.surface,
  border: `1px solid ${siteTheme.borderMuted}`,
  borderRadius: siteTheme.radius,
  padding: '3px 8px',
  cursor: 'pointer',
};

const outputBtnStyle: React.CSSProperties = {
  fontSize: 11,
  fontFamily: 'inherit',
  color: siteTheme.text,
  background: siteTheme.surface,
  border: `1px solid ${siteTheme.borderMuted}`,
  borderRadius: siteTheme.radius,
  padding: '3px 9px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const editorResponsiveStyles = `
  @media (max-width: 640px) {
    .editor-main-split {
      flex-direction: column !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
    }

    .editor-main-split > [role="separator"],
    .editor-preview-split > [role="separator"] {
      display: none !important;
    }

    .editor-main-split > div:not([role="separator"]),
    .editor-preview-split > div:not([role="separator"]) {
      flex: 0 0 auto !important;
      min-height: 0 !important;
    }

    .editor-main-split > div:not([role="separator"]):first-child {
      flex-basis: 430px !important;
      height: 430px !important;
      overflow: hidden !important;
    }

    .editor-code-pane,
    .editor-input-pane {
      height: 430px !important;
      min-height: 0 !important;
      overflow: hidden !important;
    }

    .editor-preview-split {
      display: block !important;
      flex: 0 0 auto !important;
      min-height: 360px !important;
      overflow: visible !important;
    }

    .editor-preview-pane {
      min-height: 360px !important;
      border-top: 1px solid ${siteTheme.border};
    }

    .editor-preview-body {
      min-height: 320px;
      padding: 12px !important;
    }

    .editor-output-pane {
      display: none !important;
    }

    .editor-input-pane header,
    .editor-preview-pane header {
      flex-wrap: wrap;
      align-items: center !important;
      min-height: 42px !important;
      gap: 6px !important;
    }

    .editor-preview-pane [role="tablist"] {
      max-width: 100%;
      overflow-x: auto;
      scrollbar-width: none;
    }

    .editor-preview-pane [role="tablist"]::-webkit-scrollbar {
      display: none;
    }
  }
`;
