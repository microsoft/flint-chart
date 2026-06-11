import { useEffect, useMemo, useState } from 'react';
import { assembleVegaLite, assembleECharts, assembleChartjs } from 'flint-chart';
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
 * Live editor — left: Flint input; right top: chart preview; right bottom:
 * compiled spec for the backend selected in Preview tabs.
 */
export function Editor() {
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
      return { ok: true as const, value: JSON.parse(text) };
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
    const input = parsed.value;
    return {
      ok: true as const,
      value: {
        vegalite: compile(() => assembleVegaLite(input)),
        echarts: compile(() => assembleECharts(input)),
        chartjs: compile(() => assembleChartjs(input)),
      },
    };
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
      <ResizeSplit
        direction="horizontal"
        initialRatio={42}
        storageKey="flint-editor-split-h"
      >
        <section style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
          <InputPane
            label="Flint input"
            hint="data · semantic_types · chart_spec"
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
            label={`${BACKEND_LABELS[backend]} output (generated by Flint)`}
            text={backendCodeText}
            foldKey={codeFoldKey}
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
  hint,
  text,
  onChange,
  parseError,
  examples,
  onSelectExample,
  loadedFromGallery,
  foldKey,
}: {
  label: string;
  hint: string;
  text: string;
  onChange: (v: string) => void;
  parseError: string | null;
  examples: typeof EXAMPLES;
  onSelectExample: (input: unknown) => void;
  loadedFromGallery: boolean;
  foldKey: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      <PaneHeader label={label} hint={hint}>
        {loadedFromGallery ? (
          <span style={{ fontSize: 11, color: siteTheme.accent }}>loaded from Gallery</span>
        ) : (
          <>
            <span style={{ color: siteTheme.textMuted, fontSize: 12 }}>example:</span>
            <select
              style={{ fontSize: 12 }}
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
      <JsonCodeMirror value={text} onChange={onChange} foldKey={foldKey} />
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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      <header
        style={{
          padding: '8px 12px',
          borderBottom: `1px solid ${siteTheme.border}`,
          background: siteTheme.surface,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 12, color: siteTheme.textMuted, marginRight: 4 }}>Preview</span>
        {supportedBackends.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => onBackendChange(b)}
            style={{
              padding: '4px 10px',
              border: `1px solid ${siteTheme.borderMuted}`,
              borderRadius: 4,
              background: backend === b ? siteTheme.accent : siteTheme.surface,
              color: backend === b ? '#fff' : siteTheme.text,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            {BACKEND_LABELS[b]}
          </button>
        ))}
      </header>

      <div style={{ flex: 1, overflow: 'auto', padding: 16, background: siteTheme.surface }}>
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

function OutputPane({
  label,
  text,
  compileError,
  foldKey,
}: {
  label: string;
  text: string;
  compileError: string | null;
  foldKey: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      <PaneHeader label={label} hint="read-only · follows Preview tab">
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
  hint: string;
  children?: React.ReactNode;
}) {
  return (
    <header
      style={{
        padding: '8px 12px',
        borderBottom: `1px solid ${siteTheme.border}`,
        background: siteTheme.surface,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 11, color: siteTheme.textMuted }}>{hint}</div>
      </div>
      {children}
    </header>
  );
}
