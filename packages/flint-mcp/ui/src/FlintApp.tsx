// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Flint chart MCP App.
 *
 * Renders a Flint chart spec live (client-side Flint -> Vega-Lite -> SVG) and
 * offers a data-driven customization panel built entirely from Flint's own
 * option model (chart type, channel bindings, chart properties, encoding
 * actions). Mirrors Data Formulator's encoding-shelf idea, restricted to Flint
 * options, with no server round-trips.
 */
import type { App, McpUiHostContext } from '@modelcontextprotocol/ext-apps';
import { useApp } from '@modelcontextprotocol/ext-apps/react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ChartAssemblyInput, ChartOption } from 'flint-chart';
import { THEME_PRESETS, DEFAULT_THEME_ICON } from 'flint-chart';

import { renderFlintSvg, type FlintRenderResult } from './render';
import { chartIconFor } from './chart-icons';
import {
  buildPanelModel,
  setProperty,
  valueKey,
  withTheme,
  type PanelModel,
  type ResolvedAction,
} from './options';

declare const __FLINT_MCP_VERSION__: string;

/** Control descriptor shared by chart properties and encoding actions. */
type ControlSpec =
  | { type: 'continuous'; min: number; max: number; step?: number }
  | { type: 'discrete'; options: { value: unknown; label: string }[] }
  | { type: 'binary' };

type ToolbarControl = { key: string; label: string; spec: ControlSpec; value: unknown };

function compactSelectLabel(label: string): string {
  const withoutHint = label.replace(/\s*\([^)]*\)\s*$/u, '').trim();
  if (withoutHint.length <= 16) return withoutHint;
  return `${withoutHint.slice(0, 13).trimEnd()}...`;
}

function DiscreteControl(props: {
  label: string;
  options: { value: unknown; label: string }[];
  selectedIndex: number;
  width: number;
  onChange: (value: unknown) => void;
}) {
  const { label, options, selectedIndex, width, onChange } = props;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="opt opt-discrete"
      style={{ '--opt-width': `${width}px` } as React.CSSProperties}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        className="select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${selected?.label ?? ''}`}
        title={selected?.label}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="opt-label" title={label}>{label}</span>
        <span className="select-value">{compactSelectLabel(selected?.label ?? '')}</span>
        <svg className="select-chev" width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2.5 4 5 6.5 7.5 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul className="select-menu select-menu-top" role="listbox" aria-label={label}>
          {options.map((option, index) => {
            const isSelected = index === selectedIndex;
            return (
              <li key={index} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  className={isSelected ? 'select-option select-option-selected' : 'select-option'}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Best-effort sizing: measure each option by its label length + the intrinsic
// width of its widget, then snap to a small set of tiers. Keeps the strip
// grid-like (few distinct widths) while letting toggles stay compact and
// sliders/selects get the room they need.
const LABEL_CHAR_PX = 6;
const LABEL_MAX_PX = 96;
const LABEL_GAP = 6;
// Small safety margin so short labels (e.g. "Gap") aren't starved by the
// fixed-width widget and snap up to the next tier when the fit is tight.
const FIT_BUFFER = 10;
const WIDGET_PX: Record<string, number> = {
  continuous: 56 + 4 + 32, // slider track + gap + readout
  discrete: 104, // select
  binary: 24, // toggle
  pivot: 78, // stepper
};
const WIDTH_TIERS = [96, 116, 136, 156, 180, 204];

function optionWidth(label: string, kind: string): number {
  const labelPx = Math.min(LABEL_MAX_PX, Math.ceil(label.length * LABEL_CHAR_PX));
  const needed = labelPx + LABEL_GAP + (WIDGET_PX[kind] ?? 120) + FIT_BUFFER;
  return WIDTH_TIERS.find((t) => t >= needed) ?? WIDTH_TIERS[WIDTH_TIERS.length - 1];
}

function ControlRow(props: {
  label: string;
  spec: ControlSpec;
  value: unknown;
  width: number;
  onChange: (value: unknown) => void;
}) {
  const { label, spec, value, width, onChange } = props;

  if (spec.type === 'discrete') {
    const current = valueKey(value);
    const index = spec.options.findIndex((option) => valueKey(option.value) === current);
    return (
      <DiscreteControl
        label={label}
        options={spec.options}
        selectedIndex={index < 0 ? 0 : index}
        width={width}
        onChange={onChange}
      />
    );
  }

  let control: React.ReactNode = null;
  if (spec.type === 'continuous') {
    const step = spec.step ?? ((spec.max - spec.min) / 100 || 1);
    const num = typeof value === 'number' ? value : spec.min;
    const pct = spec.max > spec.min ? ((num - spec.min) / (spec.max - spec.min)) * 100 : 0;
    // Reserve exactly enough room for the widest value this slider can actually
    // show, so the readout sits immediately after the track yet never reflows
    // the chip while dragging. Scan the real on-grid values (snapped to step) so
    // we don't over-reserve for off-grid fractions like 0.55 on a 0.1 step.
    const fmt = (n: number) => Number(n).toLocaleString();
    const decimals = (String(step).split('.')[1] ?? '').length;
    const snap = (n: number) => Number(n.toFixed(decimals));
    const stepN = step > 0 ? step : (spec.max - spec.min) || 1;
    const count = Math.min(200, Math.max(1, Math.floor((spec.max - spec.min) / stepN)));
    let readoutCh = 1;
    for (let i = 0; i <= count; i++) {
      const v = snap(spec.min + i * stepN);
      if (v > spec.max + 1e-9) break;
      readoutCh = Math.max(readoutCh, fmt(v).length);
    }
    control = (
      <span className="control-inline">
        <input
          type="range"
          min={spec.min}
          max={spec.max}
          step={step}
          value={num}
          style={{ '--pct': `${pct}%` } as React.CSSProperties}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="control-readout" style={{ minWidth: `${readoutCh}ch` }}>
          {fmt(num)}
        </span>
      </span>
    );
  } else {
    control = (
      <span className="switch">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="switch-track" aria-hidden="true">
          <span className="switch-thumb" />
        </span>
      </span>
    );
  }

  return (
    <label className="opt" style={{ '--opt-width': `${width}px` } as React.CSSProperties}>
      <span className="opt-label" title={label}>{label}</span>
      {control}
    </label>
  );
}

/**
 * Combined transform control: the chart-type switch (an icon dropdown listing
 * sibling chart types) and the arrange cycle button (name ›) fused into ONE compact
 * pill. When a chart has no sibling types the chart-type part is a static,
 * non-clickable chip; when it has no arrangements the arrange part is omitted.
 */
function TransformControl(props: {
  chartType?: PanelModel['pivot'];
  arrange?: PanelModel['pivot'];
  onChartType: (id: string | undefined) => void;
  onArrange: (id: string | undefined) => void;
}) {
  const { chartType, arrange, onChartType, onArrange } = props;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const canSwitchType = !!chartType && chartType.length > 1;
  const hasArrange = !!arrange && arrange.length > 1;
  const curName = chartType ? chartType.labels[chartType.index] : undefined;
  const curIcon = curName ? chartIconFor(curName) : undefined;
  const arrangeLabel = hasArrange ? arrange!.labels[arrange!.index] : '';

  const goArrange = (delta: number) => {
    if (!arrange) return;
    const n = (arrange.index + delta + arrange.length) % arrange.length;
    onArrange(n === 0 ? undefined : arrange.ids[n]);
  };

  return (
    <div className="transform-control" ref={rootRef}>
      {chartType &&
        (canSwitchType ? (
          <button
            type="button"
            className="tc-type tc-type-chart"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={`${chartType.label}: ${curName ?? ''}`}
            title={curName}
            onClick={() => setOpen((o) => !o)}
          >
            {curIcon && <img className="tc-icon" src={curIcon} alt="" />}
            <svg className="tc-caret" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 4.5 L6 7.5 L9 4.5" />
            </svg>
          </button>
        ) : (
          <span className="tc-type tc-type-static" title={curName}>
            {curIcon && <img className="tc-icon" src={curIcon} alt="" />}
          </span>
        ))}

      {chartType && hasArrange && <span className="tc-divider" />}

      {hasArrange && (
        <div className="tc-arrange" role="group" aria-label={arrange!.label}>
          <button
            type="button"
            className="tc-arrange-next"
            aria-label={`Next view; current: ${arrangeLabel}`}
            title={arrangeLabel}
            onClick={() => goArrange(1)}
          >
            <span className="arrange-state">
              {arrangeLabel}
            </span>
            <span className="tc-arrange-arrow" aria-hidden="true">›</span>
          </button>
        </div>
      )}

      {open && canSwitchType && chartType && (
        <ul className="tc-menu" role="listbox" aria-label={chartType.label}>
          {chartType.labels.map((lbl, i) => {
            const ic = chartIconFor(lbl);
            const selected = i === chartType.index;
            return (
              <li
                key={i}
                role="option"
                aria-selected={selected}
                className={selected ? 'tc-opt tc-opt-selected' : 'tc-opt'}
                onClick={() => {
                  onChartType(i === 0 ? undefined : chartType.ids[i]);
                  setOpen(false);
                }}
              >
                {ic && <img className="tc-opt-icon" src={ic} alt="" />}
                <span>{lbl}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** A theme preset's icon as an `<img>`-ready URL. */
function themeIconUrl(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const THEME_CHOICES: { id: string | undefined; label: string; icon: string; description: string }[] = [
  {
    id: undefined,
    label: 'Flint default',
    icon: DEFAULT_THEME_ICON,
    description: "Flint's own defaults \u2014 no house applied.",
  },
  ...Object.values(THEME_PRESETS).map((preset) => ({
    id: preset.id,
    label: preset.label,
    icon: preset.icon,
    description: preset.description,
  })),
];

/**
 * The house switch, first in the bar. A theme is the outermost decision on the
 * chart — it settles the surface, the ink and the type that everything the
 * other controls touch is then drawn in — so it reads left of them.
 *
 * It borrows the chart-type switch's chrome rather than growing its own: the
 * two are the same gesture (a small picture of the result, a caret, a list),
 * and giving them different shapes would suggest they are different kinds of
 * control.
 */
function ThemeControl(props: { themeId: string | undefined; onTheme: (id: string | undefined) => void }) {
  const { themeId, onTheme } = props;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = THEME_CHOICES.find((choice) => choice.id === themeId) ?? THEME_CHOICES[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="transform-control tc-theme" ref={rootRef}>
      <button
        type="button"
        className="tc-type tc-type-theme"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Theme: ${current.label}`}
        title={`Theme: ${current.label}`}
        onClick={() => setOpen((o) => !o)}
      >
        <img className="tc-icon" src={themeIconUrl(current.icon)} alt="" />
        <svg className="tc-caret" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 4.5 L6 7.5 L9 4.5" />
        </svg>
      </button>

      {open && (
        <ul className="tc-menu" role="listbox" aria-label="Theme">
          {THEME_CHOICES.map((choice) => {
            const selected = choice.id === current.id;
            return (
              <li
                key={choice.id ?? 'default'}
                role="option"
                aria-selected={selected}
                title={choice.description}
                className={selected ? 'tc-opt tc-opt-selected' : 'tc-opt'}
                onClick={() => {
                  onTheme(choice.id);
                  setOpen(false);
                }}
              >
                <img className="tc-opt-icon" src={themeIconUrl(choice.icon)} alt="" />
                <span>{choice.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ActionButton(props: {
  label: string;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const { label, className = '', disabled = false, onClick, children } = props;
  const [showTip, setShowTip] = useState(false);
  const [tipPosition, setTipPosition] = useState({ left: 0, top: 0 });
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (!showTip || !anchorRef.current || !tipRef.current) return;
    const anchor = anchorRef.current.getBoundingClientRect();
    const tip = tipRef.current.getBoundingClientRect();
    const gutter = 6;
    const left = Math.min(
      window.innerWidth - tip.width - gutter,
      Math.max(gutter, anchor.left + (anchor.width - tip.width) / 2),
    );
    const above = anchor.top - tip.height - gutter;
    const top = above >= gutter ? above : anchor.bottom + gutter;
    setTipPosition({ left, top });
  }, [label, showTip]);

  useEffect(() => {
    if (!showTip) return;
    const hide = () => setShowTip(false);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [showTip]);

  return (
    <span
      ref={anchorRef}
      className="action-tip-anchor"
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
      onFocus={() => setShowTip(true)}
      onBlur={() => setShowTip(false)}
    >
      <button
        type="button"
        className={`bar-link ${className}`.trim()}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
      >
        {children}
      </button>
      {showTip && createPortal(
        <span
          ref={tipRef}
          className="action-tooltip"
          role="tooltip"
          style={{ left: tipPosition.left, top: tipPosition.top }}
        >
          {label}
        </span>,
        document.body,
      )}
    </span>
  );
}

function OptionsBar(props: {
  input: ChartAssemblyInput;
  model: PanelModel;
  onInput: (next: ChartAssemblyInput) => void;
  onReset: () => void;
  canReset: boolean;
  onCopyPng: () => void;
  copyStatus: 'idle' | 'copying' | 'copied' | 'downloaded' | 'error';
  copyError: string | null;
}) {
  const { input, model, onInput, onReset, canReset, onCopyPng, copyStatus, copyError } = props;
  const gridRef = useRef<HTMLDivElement>(null);
  const themeRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLSpanElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreRootRef = useRef<HTMLDivElement>(null);
  const controlRefs = useRef(new Map<string, HTMLDivElement>());
  const [visibleControlCount, setVisibleControlCount] = useState(Number.MAX_SAFE_INTEGER);
  const [moreOpen, setMoreOpen] = useState(false);
  const copyFeedback = {
    idle: 'Copy PNG',
    copying: 'Copying PNG…',
    copied: 'PNG copied',
    downloaded: 'PNG downloaded',
    error: copyError ? `Copy failed: ${copyError}` : 'Could not copy PNG',
  }[copyStatus];

  // Lean bar: surface only Flint's dynamic low-level options — visual chart
  // properties plus encoding actions (sort, …) — inline below the chart,
  // mirroring Data Formulator's quick-config strip. Deliberately no chart-type
  // switch or field→channel binding; the agent owns those, the bar fine-tunes.
  const controls: ToolbarControl[] = [
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
  const hasTransform = Boolean(
    (model.chartType && model.chartType.length > 1) ||
    (model.arrange && model.arrange.length > 1),
  );
  const layoutKey = controls.map((control) => `${control.key}:${control.label}:${control.spec.type}`).join('|');

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const measure = () => {
      const controlWidths = controls.map((control) => controlRefs.current.get(control.key)?.getBoundingClientRect().width ?? 0);
      if (controlWidths.some((width) => width === 0)) return;

      const pinned = [themeRef.current, hasTransform ? transformRef.current : null, actionsRef.current]
        .filter((element): element is HTMLElement => Boolean(element));
      const pinnedWidth = pinned.reduce((sum, element) => sum + element.getBoundingClientRect().width, 0);
      const moreWidth = moreRef.current?.getBoundingClientRect().width ?? 0;
      const gap = 8;
      let nextVisible = controls.length;

      for (let count = controls.length; count >= 0; count -= 1) {
        const needsMore = count < controls.length;
        const itemCount = pinned.length + count + (needsMore ? 1 : 0);
        const total = pinnedWidth + controlWidths.slice(0, count).reduce((sum, width) => sum + width, 0)
          + (needsMore ? moreWidth : 0) + Math.max(0, itemCount - 1) * gap;
        if (total <= grid.clientWidth) {
          nextVisible = count;
          break;
        }
      }

      setVisibleControlCount(nextVisible);
      if (nextVisible === controls.length) setMoreOpen(false);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [hasTransform, layoutKey]);

  useEffect(() => {
    if (!moreOpen) return;
    const close = (event: MouseEvent) => {
      if (moreRootRef.current && !moreRootRef.current.contains(event.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [moreOpen]);

  const renderControl = (control: ToolbarControl) => (
    <ControlRow
      label={control.label}
      spec={control.spec}
      value={control.value}
      width={optionWidth(control.label, control.spec.type)}
      onChange={(value) => onInput(setProperty(input, control.key, value))}
    />
  );
  const hiddenControls = controls.slice(Math.min(visibleControlCount, controls.length));

  return (
    <div className="optionsbar" role="toolbar" aria-label={`${input.chart_spec.chartType} options`}>
      <div className="optionsbar-grid" ref={gridRef}>
        <div className="optionsbar-pinned" ref={themeRef}>
          <ThemeControl
            themeId={typeof input.theme_spec === 'string' ? input.theme_spec : undefined}
            onTheme={(id) => onInput(withTheme(input, id))}
          />
        </div>
        {hasTransform && (
          <div className="optionsbar-pinned" ref={transformRef}>
            <TransformControl
              chartType={model.chartType}
              arrange={model.arrange}
              onChartType={(id) => onInput(setProperty(input, model.chartType!.key, id))}
              onArrange={(id) => onInput(setProperty(input, model.arrange!.key, id))}
            />
          </div>
        )}
        {controls.length === 0 ? (
          !hasTransform && (
            <span className="opt-empty">No adjustable options for this chart.</span>
          )
        ) : (
          controls.map((control, index) => (
            <div
              key={control.key}
              ref={(element) => {
                if (element) controlRefs.current.set(control.key, element);
                else controlRefs.current.delete(control.key);
              }}
              className={index < visibleControlCount ? 'optionsbar-control' : 'optionsbar-control optionsbar-control-measure'}
              aria-hidden={index >= visibleControlCount || undefined}
            >
              {renderControl(control)}
            </div>
          ))
        )}
        <div
          className={hiddenControls.length > 0 ? 'optionsbar-more' : 'optionsbar-more optionsbar-more-measure'}
          ref={moreRef}
        >
          <div ref={moreRootRef}>
            <button
              type="button"
              className="bar-link optionsbar-more-trigger"
              aria-label={`More options (${hiddenControls.length})`}
              title="More options"
              aria-haspopup="true"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((open) => !open)}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="3" cy="8" r="1.2" fill="currentColor" />
                <circle cx="8" cy="8" r="1.2" fill="currentColor" />
                <circle cx="13" cy="8" r="1.2" fill="currentColor" />
              </svg>
            </button>
            {moreOpen && hiddenControls.length > 0 && (
              <div className="optionsbar-more-menu" role="group" aria-label="More chart options">
                {hiddenControls.map((control) => (
                  <div className="optionsbar-more-control" key={control.key}>
                    {renderControl(control)}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <span className="bar-actions" ref={actionsRef}>
          <ActionButton
            className="bar-reset"
            onClick={onReset}
            disabled={!canReset}
            label="Reset chart"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 5.5H1.5V3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 5.5A6 6 0 1 1 2.8 11" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </ActionButton>
          <ActionButton
            onClick={onCopyPng}
            disabled={copyStatus === 'copying'}
            label={copyFeedback}
          >
            {copyStatus === 'copied' || copyStatus === 'downloaded' ? (
              <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
                <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
                <path d="M3.5 10.5 A1.5 1.5 0 0 1 2.5 9.5 V3 A1.5 1.5 0 0 1 4 1.5 H10.5 A1.5 1.5 0 0 1 11.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            )}
          </ActionButton>
        </span>
      </div>
    </div>
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
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'copied' | 'downloaded' | 'error'>('idle');
  const [copyError, setCopyError] = useState<string | null>(null);
  const renderSeq = useRef(0);
  // The width the chart actually has. Rendering into the real width means the
  // finished SVG is shown at 1:1 rather than being scaled down to fit, which
  // is what otherwise shrinks every label below the app's own chrome. Height
  // is deliberately not measured: the frame grows to the chart.
  const [chartWidth, setChartWidth] = useState<number | null>(null);
  const chartBoxObserver = useRef<ResizeObserver | null>(null);

  // Measure the chart frame, quantised so a scrollbar appearing and vanishing
  // cannot start an oscillation between two neighbouring sizes.
  const measureChartBox = useCallback((node: HTMLDivElement | null) => {
    chartBoxObserver.current?.disconnect();
    chartBoxObserver.current = null;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const read = () => {
      const style = window.getComputedStyle(node);
      // `clientWidth` already excludes any scrollbar, so the reading does not
      // shrink in response to the chart it is measuring.
      const width = node.clientWidth
        - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0');
      if (!(width > 0)) return;
      const next = Math.max(0, Math.floor(width / 8) * 8);
      setChartWidth((prev) => (prev === next ? prev : next));
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(node);
    chartBoxObserver.current = observer;
  }, []);
  useEffect(() => () => chartBoxObserver.current?.disconnect(), []);

  // Re-seed when a new tool input arrives from the host.
  useEffect(() => setCurrent(input), [input]);

  // Clear export feedback after a couple of seconds.
  useEffect(() => {
    if (copyStatus === 'idle' || copyStatus === 'copying') return;
    const handle = window.setTimeout(() => setCopyStatus('idle'), 2500);
    return () => window.clearTimeout(handle);
  }, [copyStatus]);

  // Live render (debounced) whenever the working spec changes.
  useEffect(() => {
    const seq = ++renderSeq.current;
    setCopyStatus('idle');
    const handle = setTimeout(() => {
      renderFlintSvg(current, undefined, chartWidth ? { width: chartWidth } : undefined)
        .then((result) => {
          if (seq === renderSeq.current) {
            setRender(result);
            setError(null);
          }
        })
        .catch((err) => {
          if (seq === renderSeq.current) {
            setError(err instanceof Error ? err.message : String(err));
          }
        });
    }, 100);
    return () => clearTimeout(handle);
  }, [current, chartWidth]);

  const model = useMemo(() => buildPanelModel(current), [current]);

  // The frame the chart sits in takes the chart's own paper.
  //
  // A house that paints a canvas — Swiss's cream, PowerBI's near black — puts
  // that colour inside the SVG, and the SVG is only as big as the graphic. The
  // frame is not: it holds a floor height and centres what it is given, so the
  // painted rectangle ends up floating in a white surround with a hard edge
  // around it, looking like a picture pasted onto the page rather than the
  // surface the chart is drawn on.
  //
  // Reading the colour back off the assembled spec rather than the house is
  // deliberate. `background` is where the theme records its resolved surface,
  // so this follows houses that defer the decision to their host as well as
  // ones that make it themselves, and it needs no list of which is which.
  const surface = typeof render?.vlSpec?.background === 'string'
    ? render.vlSpec.background
    : undefined;

  const canReset = useMemo(
    () =>
      JSON.stringify(current.chart_spec) !== JSON.stringify(input.chart_spec) ||
      JSON.stringify(current.theme_spec ?? null) !== JSON.stringify(input.theme_spec ?? null),
    [current.chart_spec, input.chart_spec, current.theme_spec, input.theme_spec],
  );

  const handleCopyPng = useCallback(async () => {
    if (!render?.png) return;
    setCopyStatus('copying');
    setCopyError(null);
    const png = render.png;
    let clipboardError: unknown;
    try {
      if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
        setCopyStatus('copied');
        return;
      }
    } catch (err) {
      clipboardError = err;
      // Fall through to a host-mediated download when clipboard images are denied.
    }
    if (!app.getHostCapabilities()?.downloadFile) {
      const message = clipboardError instanceof Error
        ? clipboardError.message
        : 'Image clipboard access is unavailable in this host';
      setCopyError(message);
      setCopyStatus('error');
      return;
    }
    try {
      const bytes = new Uint8Array(await png.arrayBuffer());
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      const result = await app.downloadFile({
        contents: [{
          type: 'resource',
          resource: {
            uri: 'file:///flint-chart.png',
            mimeType: 'image/png',
            blob: btoa(binary),
          },
        }],
      });
      if (result.isError) {
        setCopyError('The host declined the PNG download');
        setCopyStatus('error');
      } else {
        setCopyStatus('downloaded');
      }
    } catch (err) {
      setCopyError(err instanceof Error ? err.message : 'PNG export failed');
      setCopyStatus('error');
    }
  }, [app, render]);

  const warnings = render?.warnings ?? [];

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
      <div className="preview">
        {error ? (
          <div className="error">
            <strong>Could not render chart</strong>
            <pre>{error}</pre>
          </div>
        ) : (
          // The frame is always mounted, so its size is known before the first
          // render and the chart can be assembled to fit it straight away.
          <div
            className="chart"
            ref={measureChartBox}
            style={surface ? { background: surface } : undefined}
          >
            {render
              ? <div className="chart-svg" dangerouslySetInnerHTML={{ __html: render.svg }} />
              : <span className="chart-pending">Rendering…</span>}
          </div>
        )}

        {warnings.length > 0 && (
          <ul className="warnings">
            {warnings.map((w, i) => (
              <li key={i}>
                <span className="warn-sev">{w.severity}</span> {w.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      <OptionsBar
        input={current}
        model={model}
        onInput={setCurrent}
        onReset={() => setCurrent(input)}
        canReset={canReset}
        onCopyPng={handleCopyPng}
        copyStatus={copyStatus}
        copyError={copyError}
      />
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
    onAppCreated: (app) => {
      app.onteardown = async () => ({});
      app.onerror = (err) => console.error(err);
      app.onhostcontextchanged = (params) =>
        setHostContext((prev) => ({ ...prev, ...params }));
      app.ontoolinput = (params) => {
        const args = params?.arguments as ChartAssemblyInput | undefined;
        // Only accept raw tool args that already carry inline rows. A
        // local `data.url` cannot be read in the browser, so for those we
        // wait for the server-resolved input delivered via ontoolresult.
        if (args?.chart_spec && Array.isArray(args.data?.values)) setInput(args);
      };
      app.ontoolresult = (result) => {
        const structured = (result as { structuredContent?: { input?: ChartAssemblyInput } })
          .structuredContent;
        // The server pre-resolves data (local data.url → inline values), so
        // structuredContent.input is authoritative. Prefer it whenever it
        // carries rows the current input lacks.
        if (structured?.input?.chart_spec && Array.isArray(structured.input.data?.values)) {
          setInput((prev) =>
            Array.isArray(prev?.data?.values) && prev!.data.values.length > 0
              ? prev
              : structured.input!,
          );
        }
      };
    },
  });

  useEffect(() => {
    if (app) setHostContext(app.getHostContext());
  }, [app]);

  if (error) {
    return (
      <div className="status">
        <strong>App error:</strong> {error.message}
      </div>
    );
  }
  if (!app) return <div className="status">Connecting…</div>;
  if (!input) return <div className="status">Waiting for chart data…</div>;

  return <FlintAppInner app={app} input={input} hostContext={hostContext} />;
}
