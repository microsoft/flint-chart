// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { App, McpUiHostContext } from '@modelcontextprotocol/ext-apps';
import { useApp } from '@modelcontextprotocol/ext-apps/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChartAssemblyInput, ChartOption, ChartWarning } from 'flint-chart';

import {
  buildPanelModel,
  dataColumns,
  setBaseSize,
  setCompatibleChartType,
  setProperty,
  type PanelModel,
  type ResolvedAction,
} from './options';
import {
  renderFlintSvg,
  validateFlintChart,
  type FlintRenderResult,
  type FlintValidationResult,
} from './render';

declare const __FLINT_MCP_VERSION__: string;

type ViewMode = 'preview' | 'vega-lite';

type ControlSpec =
  | { type: 'continuous'; min: number; max: number; step?: number }
  | { type: 'discrete'; options: { value: unknown; label: string }[] }
  | { type: 'binary' };

function valueKey(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function CopyPngButton({ svg }: { svg?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');

  const copy = useCallback(async () => {
    if (!svg) return;
    try {
      const blob = await svgToPng(svg);
      if (!navigator.clipboard?.write || !('ClipboardItem' in window)) {
        throw new Error('This MCP App host does not support image clipboard access.');
      }
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      setState('copied');
    } catch {
      setState('error');
    }
  }, [svg]);

  return (
    <button
      className="toolbar-button"
      disabled={!svg}
      onClick={copy}
      title={state === 'error' ? 'Image clipboard is unavailable in this host' : 'Copy PNG'}
      type="button"
    >
      {state === 'copied' ? 'Copied PNG' : 'Copy PNG'}
    </button>
  );
}

function svgToPng(svg: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const source = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth || 720;
      canvas.height = image.naturalHeight || 480;
      const context = canvas.getContext('2d');
      if (!context) {
        URL.revokeObjectURL(source);
        reject(new Error('Canvas rendering is unavailable.'));
        return;
      }
      context.fillStyle = '#0d1117';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(source);
        if (blob) resolve(blob);
        else reject(new Error('Could not create a PNG.'));
      }, 'image/png');
    };
    image.onerror = () => {
      URL.revokeObjectURL(source);
      reject(new Error('Could not read the chart SVG.'));
    };
    image.src = source;
  });
}

function ChartSelector(props: {
  input: ChartAssemblyInput;
  model: PanelModel;
  onInput: (input: ChartAssemblyInput) => void;
}) {
  const { input, model, onInput } = props;
  const pivot = model.pivot;
  const value = pivot ? String(pivot.index) : 'current';

  return (
    <label className="toolbar-control">
      <span>Chart</span>
      <select
        aria-label="Chart view"
        disabled={!pivot || pivot.length < 2}
        onChange={(event) => {
          if (!pivot) return;
          const index = Number(event.target.value);
          onInput(setProperty(input, pivot.key, index === 0 ? undefined : pivot.ids[index]));
        }}
        value={value}
      >
        {pivot && pivot.length > 1 ? (
          pivot.labels.map((label, index) => (
            <option key={pivot.ids[index] ?? index} value={String(index)}>
              {label}
            </option>
          ))
        ) : (
          <option value="current">Custom chart</option>
        )}
      </select>
    </label>
  );
}

function ChartTypeSelector(props: {
  input: ChartAssemblyInput;
  model: PanelModel;
  onInput: (input: ChartAssemblyInput) => void;
}) {
  const { input, model, onInput } = props;
  return (
    <label className="toolbar-control">
      <span>Chart type</span>
      <select
        aria-label="Chart type"
        onChange={(event) => onInput(setCompatibleChartType(input, event.target.value))}
        value={input.chart_spec.chartType}
      >
        {model.chartTypes.map((chartType) => (
          <option key={chartType} value={chartType}>
            {chartType}
          </option>
        ))}
      </select>
    </label>
  );
}

function DimensionsControl(props: {
  input: ChartAssemblyInput;
  onInput: (input: ChartAssemblyInput) => void;
}) {
  const { input, onInput } = props;
  const size = input.chart_spec.baseSize ?? { width: 360, height: 240 };

  function change(dimension: 'width' | 'height', rawValue: string) {
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < 1 || value > 4000) return;
    onInput(setBaseSize(input, dimension, Math.round(value)));
  }

  return (
    <span className="toolbar-control dimensions">
      <input
        aria-label="Chart width"
        inputMode="numeric"
        min="1"
        onChange={(event) => change('width', event.target.value)}
        type="number"
        value={size.width}
      />
      <span aria-hidden="true">x</span>
      <input
        aria-label="Chart height"
        inputMode="numeric"
        min="1"
        onChange={(event) => change('height', event.target.value)}
        type="number"
        value={size.height}
      />
      <span aria-hidden="true">px</span>
    </span>
  );
}

function ControlRow(props: {
  label: string;
  spec: ControlSpec;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const { label, spec, value, onChange } = props;
  if (spec.type === 'continuous') {
    const numberValue = typeof value === 'number' ? value : spec.min;
    return (
      <label className="option-control">
        <span>{label}</span>
        <input
          max={spec.max}
          min={spec.min}
          onChange={(event) => onChange(Number(event.target.value))}
          step={spec.step ?? ((spec.max - spec.min) / 100 || 1)}
          type="range"
          value={numberValue}
        />
        <output>{numberValue}</output>
      </label>
    );
  }
  if (spec.type === 'discrete') {
    const selected = spec.options.findIndex((option) => valueKey(option.value) === valueKey(value));
    return (
      <label className="option-control">
        <span>{label}</span>
        <select
          onChange={(event) => onChange(spec.options[Number(event.target.value)]?.value)}
          value={String(Math.max(0, selected))}
        >
          {spec.options.map((option, index) => (
            <option key={valueKey(option.value)} value={String(index)}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <label className="option-control">
      <span>{label}</span>
      <input checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
    </label>
  );
}

function Editor(props: {
  input: ChartAssemblyInput;
  model: PanelModel;
  onInput: (input: ChartAssemblyInput) => void;
}) {
  const { input, model, onInput } = props;
  const controls: { key: string; label: string; spec: ControlSpec; value: unknown }[] = [
    ...model.properties.map((option: ChartOption) => ({
      key: option.key,
      label: option.label,
      spec: option as ControlSpec,
      value: option.value,
    })),
    ...model.actions.map((action: ResolvedAction) => ({
      key: action.key,
      label: action.label,
      spec: action.control as ControlSpec,
      value: action.value,
    })),
  ];

  return (
    <section className="editor" aria-label="Edit chart">
      <div className="editor-heading">
        <strong>Edit chart</strong>
        <span>Flint options</span>
      </div>
      <div className="bindings">
        {model.channels.map((channel) => (
          <label className="option-control" key={channel}>
            <span>{channel}</span>
            <select
              onChange={(event) => {
                const next = { ...input, chart_spec: { ...input.chart_spec, encodings: { ...input.chart_spec.encodings } } };
                const field = event.target.value;
                if (field) next.chart_spec.encodings[channel] = { field };
                else delete next.chart_spec.encodings[channel];
                onInput(next);
              }}
              value={model.bindings[channel] ?? ''}
            >
              <option value="">Unbound</option>
              {dataColumns(input.data.values ?? []).map((field) => (
                <option key={field} value={field}>{field}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {controls.length > 0 && (
        <div className="options">
          {controls.map((control) => (
            <ControlRow
              key={control.key}
              label={control.label}
              onChange={(value) => onInput(setProperty(input, control.key, value))}
              spec={control.spec}
              value={control.value}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ValidationFeedback({ validation }: { validation: FlintValidationResult }) {
  const issues = validation.valid ? validation.warnings : validation.errors;
  if (issues.length === 0) return null;
  return (
    <ul className={validation.valid ? 'warnings' : 'errors'}>
      {issues.map((issue: ChartWarning, index) => (
        <li key={`${issue.code}-${index}`}>
          <strong>{issue.severity}</strong> {issue.message}
        </li>
      ))}
    </ul>
  );
}

export function FlintAppInner(props: {
  app: App;
  input: ChartAssemblyInput;
  hostContext?: McpUiHostContext;
}) {
  const { app, input, hostContext } = props;
  const [current, setCurrent] = useState<ChartAssemblyInput>(input);
  const [render, setRender] = useState<FlintRenderResult | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [view, setView] = useState<ViewMode>('preview');
  const [sendError, setSendError] = useState<string | null>(null);
  const renderSequence = useRef(0);
  const model = useMemo(() => buildPanelModel(current), [current]);
  const validation = useMemo(() => validateFlintChart(current), [current]);

  useEffect(() => setCurrent(input), [input]);

  useEffect(() => {
    const sequence = ++renderSequence.current;
    if (!validation.valid) {
      setRender(null);
      setRenderError(null);
      return;
    }
    const timer = window.setTimeout(() => {
      renderFlintSvg(current)
        .then((next) => {
          if (sequence === renderSequence.current) {
            setRender(next);
            setRenderError(null);
          }
        })
        .catch((error) => {
          if (sequence === renderSequence.current) {
            setRenderError(error instanceof Error ? error.message : String(error));
          }
        });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [current, validation.valid]);

  const sendEditedChart = useCallback(async () => {
    const text = `Updated Flint chart spec from the chart view:\n\n\`\`\`json\n${JSON.stringify({
      chart_spec: current.chart_spec,
      ...(current.semantic_types ? { semantic_types: current.semantic_types } : {}),
    }, null, 2)}\n\`\`\``;
    try {
      await app.sendMessage({ role: 'user', content: [{ type: 'text', text }] });
      setSendError(null);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'The host could not send the edited chart.');
    }
  }, [app, current]);

  return (
    <main
      className="app"
      style={{
        paddingTop: hostContext?.safeAreaInsets?.top,
        paddingRight: hostContext?.safeAreaInsets?.right,
        paddingBottom: hostContext?.safeAreaInsets?.bottom,
        paddingLeft: hostContext?.safeAreaInsets?.left,
      }}
    >
      <header className="workspace-heading">
        <div>
          <p>Flint</p>
          <h1>Interactive chart workspace</h1>
        </div>
        <span>Inline data only</span>
      </header>

      <section className="workspace">
        <section className="preview-pane" aria-labelledby="preview-heading">
          <header className="preview-toolbar" role="toolbar" aria-label="Flint chart controls">
            <h2 id="preview-heading">Preview</h2>
            <button
              aria-pressed={view === 'vega-lite'}
              className="view-mode"
              onClick={() => setView((mode) => mode === 'preview' ? 'vega-lite' : 'preview')}
              type="button"
            >
              Vega-Lite
            </button>
            <ChartSelector input={current} model={model} onInput={setCurrent} />
            <ChartTypeSelector input={current} model={model} onInput={setCurrent} />
            <DimensionsControl input={current} onInput={setCurrent} />
            <div className="toolbar-actions">
              <CopyPngButton svg={render?.svg} />
              <button
                aria-expanded={isEditing}
                className="toolbar-button"
                onClick={() => setIsEditing((visible) => !visible)}
                type="button"
              >
                {isEditing ? 'Hide editor' : 'Edit chart'}
              </button>
            </div>
          </header>

          <div className="preview">
            {renderError ? (
              <div className="error"><strong>Could not render chart</strong><pre>{renderError}</pre></div>
            ) : view === 'vega-lite' ? (
              <pre className="preview-output">
                {JSON.stringify(render?.vlSpec ?? (validation.valid ? {} : validation), null, 2)}
              </pre>
            ) : render ? (
              <div className="chart-frame">
                <div className="chart" dangerouslySetInnerHTML={{ __html: render.svg }} />
              </div>
            ) : (
              <div className="placeholder">{validation.valid ? 'Rendering chart...' : 'Fix the chart specification to preview it.'}</div>
            )}
          </div>
          <ValidationFeedback validation={validation} />
        </section>

        {isEditing && <Editor input={current} model={model} onInput={setCurrent} />}

        <section className="output-pane" aria-labelledby="output-heading">
          <header>
            <h2 id="output-heading">Output</h2>
            <span>Vega-Lite JSON · read-only</span>
          </header>
          <pre className="output">
            {JSON.stringify(render?.vlSpec ?? (validation.valid ? {} : validation), null, 2)}
          </pre>
        </section>
      </section>

      <button className="send-chart" onClick={() => void sendEditedChart()} type="button">
        Send edited chart to chat
      </button>
      {sendError && <p className="send-error" role="alert">{sendError}</p>}
    </main>
  );
}

export function FlintApp() {
  const [input, setInput] = useState<ChartAssemblyInput | null>(null);
  const [hostContext, setHostContext] = useState<McpUiHostContext | undefined>();
  const { app, error } = useApp({
    appInfo: { name: 'Flint Chart', version: __FLINT_MCP_VERSION__ },
    capabilities: {},
    autoResize: true,
    onAppCreated: (createdApp) => {
      createdApp.onteardown = async () => ({});
      createdApp.onerror = (appError) => console.error(appError);
      createdApp.onhostcontextchanged = (params) => setHostContext((previous) => ({ ...previous, ...params }));
      createdApp.ontoolinput = (params) => {
        const args = params?.arguments as ChartAssemblyInput | undefined;
        if (args?.chart_spec && Array.isArray(args.data?.values)) setInput(args);
      };
      createdApp.ontoolresult = (result) => {
        const structured = (result as { structuredContent?: { input?: ChartAssemblyInput } }).structuredContent;
        if (structured?.input?.chart_spec && Array.isArray(structured.input.data?.values)) {
          setInput(structured.input);
        }
      };
    },
  });

  useEffect(() => {
    if (app) setHostContext(app.getHostContext());
  }, [app]);

  if (error) return <div className="status"><strong>App error:</strong> {error.message}</div>;
  if (!app) return <div className="status">Connecting...</div>;
  if (!input) return <div className="status">Waiting for inline chart data...</div>;
  return <FlintAppInner app={app} input={input} hostContext={hostContext} />;
}
