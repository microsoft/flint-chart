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
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChartOption } from 'flint-chart';
import { siteTheme } from '../shared/theme';
import type { ControlSpec, PanelModel, ResolvedAction } from '../shared/chart-options';

/** Stable string key for an arbitrary option value (handles undefined/objects). */
function valueKey(value: unknown): string {
  return JSON.stringify(value ?? null);
}

const labelStyle: CSSProperties = {
  color: siteTheme.textMuted,
  fontSize: 12,
  minWidth: 0,
  maxWidth: 160,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const READOUT_WIDTH = 44;

// Best-effort sizing: measure each option by its label length + the intrinsic
// width of its widget, then snap to a small set of tiers. This keeps the strip
// looking grid-like (only a few distinct widths) while letting compact controls
// (toggles) stay narrow and roomy ones (sliders/selects) get the space they need.
const LABEL_CHAR_PX = 6.6;
const LABEL_MAX_PX = 132;
const LABEL_GAP = 8;
const WIDGET_PX: Record<string, number> = {
  continuous: 72 + 6 + READOUT_WIDTH, // slider track + gap + readout
  discrete: 128, // select
  binary: 30, // toggle
  pivot: 96, // stepper
};
const WIDTH_TIERS = [140, 168, 200, 232, 264, 296];

function optionWidth(label: string, kind: string): number {
  const labelPx = Math.min(LABEL_MAX_PX, Math.ceil(label.length * LABEL_CHAR_PX));
  const needed = labelPx + LABEL_GAP + (WIDGET_PX[kind] ?? 120);
  return WIDTH_TIERS.find((t) => t >= needed) ?? WIDTH_TIERS[WIDTH_TIERS.length - 1];
}

function optStyleFor(_width: number): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    margin: 0,
    minWidth: 0,
    // Each cell hugs its own label + widget and left-aligns (no fixed tier width):
    // the label sits immediately left of the control with a single gap, and the
    // flex-wrap strip flows cells left-to-right, wrapping when they overflow.
    flex: '0 0 auto',
  };
}

const controlInlineStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: `72px auto`,
  alignItems: 'center',
  gap: 6,
  minWidth: 0,
};

function ControlRow(props: {
  label: string;
  spec: ControlSpec;
  value: unknown;
  width: number;
  onChange: (value: unknown) => void;
}) {
  const { label, spec, value, width, onChange } = props;

  let control: React.ReactNode = null;
  if (spec.type === 'continuous') {
    const step = spec.step ?? ((spec.max - spec.min) / 100 || 1);
    const num = typeof value === 'number' ? value : spec.min;
    control = (
      <span style={controlInlineStyle}>
        <input
          type="range"
          min={spec.min}
          max={spec.max}
          step={step}
          value={num}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ width: '100%', minWidth: 0, accentColor: siteTheme.accent }}
        />
        <span style={{ ...labelStyle, fontVariantNumeric: 'tabular-nums', textAlign: 'left' }}>
          {Number(num).toLocaleString()}
        </span>
      </span>
    );
  } else if (spec.type === 'discrete') {
    const current = valueKey(value);
    const idx = spec.options.findIndex((o) => valueKey(o.value) === current);
    control = (
      <select
        value={idx < 0 ? '0' : String(idx)}
        onChange={(e) => onChange(spec.options[Number(e.target.value)]?.value)}
        style={{
          width: 128,
          minWidth: 0,
          padding: '3px 6px',
          border: `1px solid ${siteTheme.border}`,
          borderRadius: 4,
          background: siteTheme.surface,
          color: siteTheme.text,
          fontSize: 12,
          justifySelf: 'end',
        }}
      >
        {spec.options.map((o, i) => (
          <option key={i} value={String(i)}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else {
    const on = Boolean(value);
    control = (
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        style={{
          position: 'relative',
          width: 30,
          height: 16,
          padding: 0,
          border: 0,
          borderRadius: 999,
          cursor: 'pointer',
          background: on ? siteTheme.accent : 'rgba(0, 0, 0, 0.22)',
          transition: 'background 120ms ease',
          justifySelf: 'end',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 2,
            left: 2,
            width: 12,
            height: 12,
            borderRadius: 999,
            background: '#fff',
            transform: on ? 'translateX(14px)' : 'translateX(0)',
            transition: 'transform 120ms ease',
          }}
        />
      </button>
    );
  }

  return (
    <label style={optStyleFor(width)}>
      <span style={labelStyle} title={label}>{label}</span>
      {control}
    </label>
  );
}

function PivotControl(props: {
  pivot: NonNullable<PanelModel['pivot']>;
  width: number;
  onSelect: (id: string | undefined) => void;
}) {
  const { pivot, width, onSelect } = props;
  const { t } = useTranslation();
  const { ids, labels, index, length, label } = pivot;
  const go = (delta: number) => {
    const nextIndex = (index + delta + length) % length;
    // Identity (index 0) is the absent override — clear it so the chart returns
    // to the authored view rather than storing a redundant id.
    onSelect(nextIndex === 0 ? undefined : ids[nextIndex]);
  };
  const btnStyle: CSSProperties = {
    width: 22,
    height: 22,
    padding: 0,
    border: 'none',
    borderRadius: 6,
    background: 'transparent',
    color: siteTheme.text,
    cursor: 'pointer',
    fontSize: 14,
    lineHeight: 1,
  };
  const stepperStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 2,
    padding: 2,
    border: `1px solid ${siteTheme.border}`,
    borderRadius: 8,
    background: siteTheme.surface,
    minWidth: 0,
    width: 96,
    justifySelf: 'end',
  };
  return (
    <div role="group" aria-label={label} style={optStyleFor(width)}>
      <span style={labelStyle} title={label}>{label}</span>
      <div style={stepperStyle}>
        <button type="button" aria-label={t('options.prevView')} onClick={() => go(-1)} style={btnStyle}>
          ‹
        </button>
        <span
          style={{
            ...labelStyle,
            flex: '1 1 auto',
            minWidth: 36,
            textAlign: 'center',
            fontVariantNumeric: 'tabular-nums',
          }}
          title={labels[index]}
        >
          {index + 1} / {length}
        </span>
        <button type="button" aria-label={t('options.nextView')} onClick={() => go(1)} style={btnStyle}>
          ›
        </button>
      </div>
    </div>
  );
}

export function GalleryOptionsBar(props: {
  model: PanelModel;
  onChange: (key: string, value: unknown) => void;
  chartType: string;
  style?: CSSProperties;
}) {
  const { model, onChange, chartType, style } = props;

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
    <div
      role="toolbar"
      aria-label={`${chartType} options`}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '12px 28px',
        padding: '10px 14px',
        background: 'rgba(0, 0, 0, 0.035)',
        borderRadius: 10,
        color: siteTheme.textMuted,
        ...style,
      }}
    >
      {model.pivot && model.pivot.length > 1 && (
        <PivotControl
          pivot={model.pivot}
          width={optionWidth(model.pivot.label, 'pivot')}
          onSelect={(id) => onChange(model.pivot!.key, id)}
        />
      )}
      {controls.length === 0 ? (
        !(model.pivot && model.pivot.length > 1) && (
          <span style={{ ...labelStyle, fontStyle: 'italic' }}>
            No adjustable options for this chart.
          </span>
        )
      ) : (
        controls.map((control) => (
          <ControlRow
            key={control.key}
            label={control.label}
            spec={control.spec}
            value={control.value}
            width={optionWidth(control.label, control.spec.type)}
            onChange={(v) => onChange(control.key, v)}
          />
        ))
      )}
    </div>
  );
}
