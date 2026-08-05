// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Dynamic options bar for the gallery chart modal.
 *
 * Mirrors the MCP App UI's options strip (`packages/flint-mcp/ui`), restricted
 * to Flint's chart properties + encoding actions, in the same muted style. In
 * the gallery the edits are DISPLAY ONLY — they update the shown Flint spec
 * JSON but never change any underlying state. There is no "Copy spec to chat"
 * button.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChartOption } from 'flint-chart';
import { THEME_PRESETS, DEFAULT_THEME_ICON } from 'flint-chart';
import { siteTheme } from '../shared/theme';
import { chartIconFor } from '../shared/chart-categories';
import { valueKey } from '../shared/chart-options';
import type { ControlSpec, PanelModel, ResolvedAction } from '../shared/chart-options';
import './gallery-options-bar.css';

/** Trim a trailing "(hint)" and clip long labels for the compact select. */
function compactSelectLabel(label: string): string {
  const withoutHint = label.replace(/\s*\([^)]*\)\s*$/u, '').trim();
  if (withoutHint.length <= 16) return withoutHint;
  return `${withoutHint.slice(0, 13).trimEnd()}...`;
}

function DiscreteControl(props: {
  label: string;
  options: { value: unknown; label: string }[];
  selectedIndex: number;
  onChange: (value: unknown) => void;
}) {
  const { label, options, selectedIndex, onChange } = props;
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
      className="gopt gopt-discrete"
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
        className="gopt-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${selected?.label ?? ''}`}
        title={selected?.label}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="gopt-label" title={label}>{label}</span>
        <span className="gopt-select-value">{compactSelectLabel(selected?.label ?? '')}</span>
        <svg className="gopt-select-chev" width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2.5 4 5 6.5 7.5 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul className="gopt-select-menu gopt-select-menu-top" role="listbox" aria-label={label}>
          {options.map((option, index) => {
            const isSelected = index === selectedIndex;
            return (
              <li key={index} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  className={isSelected ? 'gopt-select-option gopt-select-option-selected' : 'gopt-select-option'}
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

/** A theme preset's icon as an `<img>`-ready URL. */
function iconUrl(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

interface ThemeChoice {
  id: string | undefined;
  label: string;
  icon: string;
  description: string;
}

const THEME_CHOICES: ThemeChoice[] = [
  {
    id: undefined,
    label: 'Flint default',
    icon: DEFAULT_THEME_ICON,
    description: "Flint's own defaults — no house applied.",
  },
  ...Object.values(THEME_PRESETS).map((preset) => ({
    id: preset.id,
    label: preset.label,
    icon: preset.icon,
    description: preset.description,
  })),
];

/**
 * The house switch. First in the bar, because a theme is the outermost
 * decision on the chart: it settles the surface, the ink and the type that
 * everything the other controls touch is then drawn in.
 *
 * It is the one control in the bar that names itself rather than going by icon
 * alone. The others switch a property whose name is already on the chart — a
 * stack, a sort, a chart type you can see — but a house is read off the drawing
 * as a whole, and two houses can look alike at 15px. Spelling it out is also
 * what makes the control legible as a *list of houses* rather than a mystery
 * glyph the reader has to open to understand.
 *
 * Only Vega-Lite reads `theme_spec`, so on the other backends the control is
 * absent rather than inert — a switch that does nothing reads as a bug in the
 * theme, which is exactly what themes must never look like.
 */
export function ThemeControl(props: {
  themeId: string | undefined;
  onTheme: (id: string | undefined) => void;
  onPreview?: (id: string | undefined) => void;
  onPreviewEnd?: () => void;
  placement?: 'top' | 'bottom';
  prominent?: boolean;
}) {
  const {
    themeId,
    onTheme,
    onPreview,
    onPreviewEnd,
    placement = 'top',
    prominent = false,
  } = props;
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const choices = THEME_CHOICES;
  const current = choices.find((choice) => choice.id === themeId) ?? choices[0];

  const closeMenu = () => {
    setOpen(false);
    onPreviewEnd?.();
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) closeMenu();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, onPreviewEnd]);

  return (
    <div
      ref={rootRef}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: prominent ? 6 : 0,
        margin: prominent ? '6px 0 0 10px' : 0,
        border: 'none',
        borderRadius: 8,
        background: prominent ? 'transparent' : 'rgba(0, 0, 0, 0.05)',
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          event.stopPropagation();
          closeMenu();
        }
      }}
    >
      {prominent && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
          <span aria-hidden="true" style={{ color: '#b26a00', fontSize: 12, lineHeight: 1 }}>★</span>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Theme:</span>
        </span>
      )}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Theme: ${current.label}`}
        title={`Theme: ${current.label}`}
        onClick={() => {
          if (open) closeMenu();
          else setOpen(true);
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '5px 8px',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          outline: 'none',
          color: siteTheme.text,
          background: open || hover
            ? 'rgba(0, 0, 0, 0.07)'
            : prominent ? 'rgba(0, 0, 0, 0.05)' : 'transparent',
        }}
      >
        <img src={iconUrl(current.icon)} alt="" style={{ width: 15, height: 15, display: 'block', flex: '0 0 auto' }} />
        <span
          style={{
            fontSize: 12,
            fontFamily: siteTheme.fontSans,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 110,
          }}
        >
          {current.label}
        </span>
        <Chevron color={siteTheme.textMuted} />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Theme"
          onMouseLeave={onPreviewEnd}
          style={{
            position: 'absolute',
            ...(placement === 'top'
              ? { bottom: 'calc(100% + 5px)' }
              : { top: 'calc(100% + 5px)' }),
            left: prominent ? 57 : 0,
            zIndex: 60,
            margin: 0,
            padding: 4,
            listStyle: 'none',
            minWidth: 190,
            maxHeight: 320,
            overflowY: 'auto',
            border: `1px solid ${siteTheme.border}`,
            borderRadius: 10,
            background: siteTheme.surface,
            boxShadow: '0 -8px 24px rgba(0,0,0,0.14)',
          }}
        >
          {choices.map((choice) => {
            const selected = choice.id === current.id;
            return (
              <li
                key={choice.id ?? 'default'}
                role="option"
                aria-selected={selected}
                title={choice.description}
                onClick={() => {
                  onTheme(choice.id);
                  closeMenu();
                }}
                onFocus={() => onPreview?.(choice.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  borderRadius: 7,
                  cursor: 'pointer',
                  fontSize: 12,
                  color: siteTheme.text,
                  background: selected ? 'rgba(0,0,0,0.06)' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  onPreview?.(choice.id);
                  if (!selected) (e.currentTarget as HTMLLIElement).style.background = 'rgba(0,0,0,0.04)';
                }}
                onMouseLeave={(e) => {
                  if (!selected) (e.currentTarget as HTMLLIElement).style.background = 'transparent';
                }}
              >
                <img src={iconUrl(choice.icon)} alt="" style={{ width: 16, height: 16, display: 'block', flex: '0 0 auto' }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{choice.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ControlRow(props: {
  label: string;
  spec: ControlSpec;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const { label, spec, value, onChange } = props;

  if (spec.type === 'discrete') {
    const current = valueKey(value);
    const index = spec.options.findIndex((option) => valueKey(option.value) === current);
    return (
      <DiscreteControl
        label={label}
        options={spec.options}
        selectedIndex={index < 0 ? 0 : index}
        onChange={onChange}
      />
    );
  }

  let control: React.ReactNode = null;
  if (spec.type === 'continuous') {
    const step = spec.step ?? ((spec.max - spec.min) / 100 || 1);
    const num = typeof value === 'number' ? value : spec.min;
    const pct = spec.max > spec.min ? ((num - spec.min) / (spec.max - spec.min)) * 100 : 0;
    // Reserve enough width for the widest value the slider can show so the
    // readout never clips (e.g. "50") or reflows as digits change.
    const readoutCh = Math.max(
      2,
      spec.min.toLocaleString().length,
      spec.max.toLocaleString().length,
    );
    control = (
      <span className="gopt-inline">
        <input
          type="range"
          className="site-range"
          min={spec.min}
          max={spec.max}
          step={step}
          value={num}
          style={{ ['--pct' as string]: `${pct}%` } as CSSProperties}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="gopt-readout" style={{ minWidth: `${readoutCh}ch` }}>
          {Number(num).toLocaleString()}
        </span>
      </span>
    );
  } else {
    control = (
      <span className="gopt-switch">
        <input
          type="checkbox"
          aria-label={label}
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="gopt-switch-track" aria-hidden="true">
          <span className="gopt-switch-thumb" />
        </span>
      </span>
    );
  }

  return (
    <label className="gopt">
      <span className="gopt-label" title={label}>{label}</span>
      {control}
    </label>
  );
}

function Chevron({ color }: { color: string }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      stroke={color}
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 4.5 L6 7.5 L9 4.5" />
    </svg>
  );
}

/**
 * Combined transform control: the chart-type switch (an icon dropdown listing
 * sibling chart types) and the arrange cycle button (name ›) fused into ONE compact
 * pill. When a chart has no sibling types the chart-type part is a static,
 * non-clickable chip; when it has no arrangements the arrange part is omitted.
 */
function TransformControl(props: {
  chartType?: PanelModel['chartType'];
  arrange?: PanelModel['arrange'];
  onChartType: (id: string | undefined) => void;
  onArrange: (id: string | undefined) => void;
}) {
  const { chartType, arrange, onChartType, onArrange } = props;
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [hoverType, setHoverType] = useState(false);
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

  const iconStyle: CSSProperties = { width: 15, height: 15, display: 'block', flex: '0 0 auto' };
  const segStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '5px 8px',
    border: 'none',
    color: siteTheme.text,
  };
  const goArrange = (delta: number) => {
    if (!arrange) return;
    const n = (arrange.index + delta + arrange.length) % arrange.length;
    onArrange(n === 0 ? undefined : arrange.ids[n]);
  };

  return (
    <div
      ref={rootRef}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'stretch',
        gap: 0,
        borderRadius: 8,
        background: 'rgba(0, 0, 0, 0.05)',
        overflow: 'visible',
      }}
    >
      {chartType &&
        (canSwitchType ? (
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={`${chartType.label}: ${curName}`}
            title={curName}
            onClick={() => setOpen((o) => !o)}
            onMouseEnter={() => setHoverType(true)}
            onMouseLeave={() => setHoverType(false)}
            style={{
              ...segStyle,
              cursor: 'pointer',
              outline: 'none',
              borderRadius: hasArrange ? '8px 0 0 8px' : 8,
              background: open || hoverType ? 'rgba(0, 0, 0, 0.07)' : 'transparent',
            }}
          >
            {curIcon && <img src={curIcon} alt="" style={iconStyle} />}
            <Chevron color={siteTheme.textMuted} />
          </button>
        ) : (
          <span
            style={{ ...segStyle, borderRadius: hasArrange ? '8px 0 0 8px' : 8, background: 'transparent' }}
            title={curName}
          >
            {curIcon && <img src={curIcon} alt="" style={iconStyle} />}
          </span>
        ))}

      {chartType && hasArrange && (
        <span style={{ width: 1, alignSelf: 'stretch', margin: '5px 0', background: siteTheme.border }} />
      )}

      {hasArrange && (
        <div className="gopt-transform-arrange" role="group" aria-label={arrange!.label}>
          <button
            type="button"
            className="gopt-transform-next"
            aria-label={`${t('options.nextView')}; ${arrangeLabel}`}
            title={arrangeLabel}
            onClick={() => goArrange(1)}
          >
            <span className="gopt-transform-state">
              {arrangeLabel}
            </span>
            <span className="gopt-transform-arrow" aria-hidden="true">›</span>
          </button>
        </div>
      )}

      {open && canSwitchType && chartType && (
        <ul
          role="listbox"
          aria-label={chartType.label}
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 5px)',
            left: 0,
            zIndex: 60,
            margin: 0,
            padding: 4,
            listStyle: 'none',
            minWidth: 190,
            maxHeight: 320,
            overflowY: 'auto',
            border: `1px solid ${siteTheme.border}`,
            borderRadius: 10,
            background: siteTheme.surface,
            boxShadow: '0 -8px 24px rgba(0,0,0,0.14)',
          }}
        >
          {chartType.labels.map((lbl, i) => {
            const ic = chartIconFor(lbl);
            const selected = i === chartType.index;
            return (
              <li
                key={i}
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChartType(i === 0 ? undefined : chartType.ids[i]);
                  setOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  borderRadius: 7,
                  cursor: 'pointer',
                  fontSize: 12,
                  color: siteTheme.text,
                  background: selected ? 'rgba(0,0,0,0.06)' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (!selected) (e.currentTarget as HTMLLIElement).style.background = 'rgba(0,0,0,0.04)';
                }}
                onMouseLeave={(e) => {
                  if (!selected) (e.currentTarget as HTMLLIElement).style.background = 'transparent';
                }}
              >
                {ic && <img src={ic} alt="" style={{ width: 16, height: 16, display: 'block', flex: '0 0 auto' }} />}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lbl}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}


export function GalleryOptionsBar(props: {
  model: PanelModel;
  onChange: (key: string, value: unknown) => void;
  onReset: () => void;
  canReset: boolean;
  chartType: string;
  /** Current house, or undefined for flint's own defaults. Omit to hide the switch. */
  themeId?: string;
  onTheme?: (id: string | undefined) => void;
  style?: CSSProperties;
}) {
  const { model, onChange, onReset, canReset, chartType, themeId, onTheme, style } = props;

  const controls: { key: string; label: string; spec: ControlSpec; value: unknown }[] = [
    ...model.properties.map((option: ChartOption) => ({
      key: option.key,
      label: option.label,
      spec: option as unknown as ControlSpec,
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
    <div role="toolbar" aria-label={`${chartType} options`} className="gopt-bar" style={style}>
      {onTheme && <ThemeControl themeId={themeId} onTheme={onTheme} />}
      {((model.chartType && model.chartType.length > 1) ||
        (model.arrange && model.arrange.length > 1)) && (
        <TransformControl
          chartType={model.chartType}
          arrange={model.arrange}
          onChartType={(id) => onChange(model.chartType!.key, id)}
          onArrange={(id) => onChange(model.arrange!.key, id)}
        />
      )}
      {controls.length === 0 ? (
        !(
          (model.chartType && model.chartType.length > 1) ||
          (model.arrange && model.arrange.length > 1)
        ) && <span className="gopt-empty">No adjustable options for this chart.</span>
      ) : (
        controls.map((control) => (
          <ControlRow
            key={control.key}
            label={control.label}
            spec={control.spec}
            value={control.value}
            onChange={(v) => onChange(control.key, v)}
          />
        ))
      )}
      <button
        type="button"
        className="gopt-reset"
        onClick={onReset}
        disabled={!canReset}
        title="Reset chart"
        aria-label="Reset chart"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 5.5H1.5V3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M2 5.5A6 6 0 1 1 2.8 11" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
