import { useMemo } from 'react';
import { VegaLiteView } from './VegaLiteView';
import { EChartsView } from './EChartsView';
import { ChartjsView } from './ChartjsView';
import { siteTheme } from '../shared/theme';

/**
 * FEASIBILITY PROTOTYPE (dev-playground only, raw hand-built specs — NOT the
 * flint engine). Tests whether "local dodge" is achievable in all three
 * backends for a *spiky* sparse case: most bands have one value, one band has
 * two. Global-lane dodge reserves `global` lanes everywhere (catastrophic:
 * 7 thin lanes here); local dodge only needs `maxPerBand` (2).
 *
 * Techniques demonstrated:
 *   - VL global  — xOffset by the color field → domain = 7 global colors.
 *   - VL local   — xOffset by a precomputed per-band `laneIdx` → domain = 2.
 *   - VL layered — single-value bands full-width (no offset) + multi-value
 *                  bands dodged: the "true" local dodge (full-width singles).
 *   - ECharts    — one series per lane (maxPerBand series), per-bar color.
 *   - Chart.js   — one dataset per lane, per-bar color.
 */

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Spiky: every band has ONE type except Thu which has TWO. Types are distinct
// per band → global distinct = 7, maxPerBand = 2.
const BANDS: Record<string, string[]> = {
  Mon: ['Alpha'], Tue: ['Bravo'], Wed: ['Charlie'], Thu: ['Delta', 'Echo'], Fri: ['Foxtrot'], Sat: ['Golf'],
};
const TYPE_COLOR: Record<string, string> = {
  Alpha: '#4c78a8', Bravo: '#f58518', Charlie: '#e45756', Delta: '#72b7b2',
  Echo: '#54a24b', Foxtrot: '#eeca3b', Golf: '#b279a2',
};
const TYPES = Object.keys(TYPE_COLOR);
const MAX_PER_BAND = Math.max(...Object.values(BANDS).map((t) => t.length)); // 2

interface Row { day: string; type: string; value: number; laneIdx: number; localCount: number }

function buildRows(): Row[] {
  const rows: Row[] = [];
  for (const day of DAYS) {
    const types = BANDS[day];
    types.forEach((type, i) => {
      rows.push({ day, type, value: 30 + (type.charCodeAt(0) % 15) * 4 + i * 8, laneIdx: i, localCount: types.length });
    });
  }
  return rows;
}

const STEP = 34; // same band width everywhere so lane-count differences are visible.

const vlX = {
  field: 'day', type: 'nominal', sort: DAYS,
  axis: { labelAngle: 0, title: null },
} as const;

function vlBase(rows: Row[]) {
  return {
    data: { values: rows },
    // `for: 'position'` pins the step to the DAY band; without it VL multiplies
    // the step by the offset-lane count → the plot balloons to ~lanes× wide and
    // clips. This is exactly why global dodge (7 lanes) must not blow up width.
    width: { step: STEP, for: 'position' },
    height: 190,
    config: { view: { stroke: null }, axis: { grid: false } },
  };
}
const vlColor = {
  field: 'type', type: 'nominal',
  scale: { domain: TYPES, range: TYPES.map((t) => TYPE_COLOR[t]) },
  legend: null,
} as const;

function vlGlobalSpec(rows: Row[]) {
  return {
    ...vlBase(rows),
    mark: 'bar',
    encoding: {
      x: vlX,
      xOffset: { field: 'type', type: 'nominal' }, // 7 global lanes
      y: { field: 'value', type: 'quantitative', axis: { title: null } },
      color: vlColor,
    },
  };
}
function vlLayeredSpec(rows: Row[]) {
  const enc = (dodge: boolean) => ({
    x: vlX,
    ...(dodge ? { xOffset: { field: 'laneIdx', type: 'nominal' } } : {}),
    y: { field: 'value', type: 'quantitative', axis: { title: null } },
    color: vlColor,
  });
  return {
    ...vlBase(rows),
    resolve: { scale: { xOffset: 'shared' } },
    layer: [
      { transform: [{ filter: 'datum.localCount === 1' }], mark: 'bar', encoding: enc(false) }, // full-width singles
      { transform: [{ filter: 'datum.localCount > 1' }], mark: 'bar', encoding: enc(true) },     // dodged multis
    ],
  };
}

function echartsLocalOption(rows: Row[]) {
  // Native category axis (labels auto-center under each band) + custom rects
  // centered WITHIN each band across maxPerBand lanes. Avoids fragile manual
  // label positioning; same centering math as VL.
  const items: { di: number; value: number; laneIdx: number; localCount: number; color: string }[] = [];
  DAYS.forEach((day, di) => {
    const dayRows = rows.filter((r) => r.day === day).sort((a, b) => a.laneIdx - b.laneIdx);
    dayRows.forEach((r, i) => items.push({ di, value: r.value, laneIdx: i, localCount: dayRows.length, color: TYPE_COLOR[r.type] }));
  });
  const colors = items.map((it) => it.color);
  return {
    _width: 300, _height: 220,
    grid: { left: 34, right: 8, top: 12, bottom: 26 },
    xAxis: { type: 'category', data: DAYS, axisTick: { alignWithLabel: true } },
    yAxis: { type: 'value' },
    series: [{
      type: 'custom',
      renderItem: (params: any, api: any) => {
        const di = api.value(0);
        const val = api.value(1);
        const laneIdx = api.value(2);
        const localCount = api.value(3);
        const base = api.coord([di, 0]);
        const top = api.coord([di, val]);
        const bandW = api.size([1, 0])[0];
        const lanePitch = bandW / MAX_PER_BAND;
        const cx = base[0] + (laneIdx - (localCount - 1) / 2) * lanePitch;
        const barW = lanePitch * 0.8;
        return {
          type: 'rect',
          shape: { x: cx - barW / 2, y: top[1], width: barW, height: base[1] - top[1] },
          style: { fill: colors[params.dataIndex] },
        };
      },
      encode: { x: 0, y: 1 },
      data: items.map((it) => [it.di, it.value, it.laneIdx, it.localCount]),
    }],
  };
}

function chartjsLocalConfig(rows: Row[]) {
  // Uniform + centered via a LINEAR x-axis: place each bar at its slot centre
  // with a constant barThickness; a small plugin draws the centered group
  // labels (Chart.js' category axis can't center singles either).
  const { bars, labels, total } = uniformCenteredLayout(rows);
  return {
    _width: 300, _height: 220,
    type: 'bar',
    data: {
      datasets: [{
        data: bars.map((b) => ({ x: (b.x0 + b.x1) / 2, y: b.value })),
        backgroundColor: bars.map((b) => TYPE_COLOR[b.type]),
        barThickness: Math.round(SLOT_PX * 0.82),
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { bottom: 14 } },
      plugins: { legend: { display: false } },
      scales: {
        x: { type: 'linear', min: 0, max: total, offset: false, ticks: { display: false }, grid: { display: false } },
        y: { beginAtZero: true },
      },
    },
    plugins: [{
      id: 'groupLabels',
      afterDraw(chart: any) {
        const { ctx, scales: { x }, chartArea } = chart;
        ctx.save();
        ctx.fillStyle = '#333';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (const l of labels) ctx.fillText(l.day, x.getPixelForValue(l.center), chartArea.bottom + 4);
        ctx.restore();
      },
    }],
  };
}

const SLOT_PX = 22; // per-item slot width for the computed-position layouts.

// Uniform + centered layout (the chosen resolution): EVERY band is the SAME
// width = maxPerBand slots (sized to the busiest band), each band's items are
// CENTERED within it, and every bar is one slot wide (constant). Single-item
// bands get half-slot padding on each side → the bar sits centered under the
// (uniform, evenly-spaced) group tick.
function uniformCenteredLayout(rows: Row[]) {
  const bars: (Row & { x0: number; x1: number })[] = [];
  const labels: { day: string; center: number; boundary: number }[] = [];
  DAYS.forEach((day, ci) => {
    const items = rows.filter((r) => r.day === day).sort((a, b) => a.laneIdx - b.laneIdx);
    const bandStart = ci * MAX_PER_BAND;
    const pad = (MAX_PER_BAND - items.length) / 2; // center the cluster in the band
    items.forEach((r, i) => {
      const slot = bandStart + pad + i;
      bars.push({ ...r, x0: slot + 0.1, x1: slot + 0.9 });
    });
    labels.push({ day, center: bandStart + MAX_PER_BAND / 2, boundary: bandStart + MAX_PER_BAND });
  });
  return { bars, labels, total: DAYS.length * MAX_PER_BAND };
}

function vlComputedSpec(layout: { bars: (Row & { x0: number; x1: number })[]; labels: { day: string; center: number; boundary: number }[]; total: number }) {
  const { bars, labels, total } = layout;
  const xScale = { domain: [0, total], nice: false } as const;
  return {
    width: total * SLOT_PX,
    height: 190,
    config: { view: { stroke: null }, axis: { grid: false } },
    layer: [
      {
        data: { values: bars },
        mark: 'bar',
        encoding: {
          x: {
            field: 'x0', type: 'quantitative', scale: xScale,
            // Keep the axis BASELINE (domain line) for grounding, but no numeric
            // ticks/labels — the group names come from the centered text layer.
            axis: { domain: true, ticks: false, labels: false, grid: false, title: null },
          },
          x2: { field: 'x1' },
          // A bar with x+x2 is a rect → it needs an explicit vertical extent,
          // otherwise it collapses to a zero-height segment at y=value.
          y: { field: 'value', type: 'quantitative', axis: { title: null } },
          y2: { datum: 0 },
          color: vlColor,
        },
      },
      {
        data: { values: labels.slice(0, -1).map((l) => ({ b: l.boundary })) },
        mark: { type: 'rule', color: 'rgba(0,0,0,0.12)', strokeDash: [2, 2] },
        encoding: { x: { field: 'b', type: 'quantitative', scale: xScale, axis: null } },
      },
      {
        data: { values: labels },
        mark: { type: 'text', baseline: 'top', dy: 6, fontSize: 11 },
        encoding: {
          x: { field: 'center', type: 'quantitative', scale: xScale, axis: null },
          y: { datum: 0 },
          text: { field: 'day' },
        },
      },
    ],
  };
}

// Proportional layout: each ITEM gets a fixed-width slot, so a band with k items
// occupies k slots (k× width), bars stay a constant width, and the group label is
// centered under its cluster. Sidesteps both the global-lane gaps and the
// left-anchor/centering problem — at the cost of unequal band widths.
function proportionalLayout(rows: Row[]) {
  const ordered = [...rows].sort(
    (a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.laneIdx - b.laneIdx,
  );
  const bars: (Row & { x0: number; x1: number })[] = [];
  const labels: { day: string; center: number; boundary: number }[] = [];
  let slot = 0;
  let curDay: string | null = null;
  let dayStart = 0;
  for (const r of ordered) {
    if (r.day !== curDay) {
      if (curDay !== null) labels.push({ day: curDay, center: (dayStart + slot) / 2, boundary: slot });
      curDay = r.day;
      dayStart = slot;
    }
    bars.push({ ...r, x0: slot + 0.08, x1: slot + 0.92 });
    slot += 1;
  }
  if (curDay !== null) labels.push({ day: curDay, center: (dayStart + slot) / 2, boundary: slot });
  return { bars, labels, total: slot };
}

interface Cell { key: string; label: string; note: string; render: () => JSX.Element }

export function LocalDodgeFigure() {
  const rows = useMemo(buildRows, []);
  const cells: Cell[] = [
    { key: 'vl-global', label: 'VL · global dodge', note: '7 lanes everywhere → 1⁄7 bars (the problem)', render: () => <VegaLiteView spec={vlGlobalSpec(rows)} /> },
    { key: 'vl-uniform', label: 'VL · uniform + centered ★', note: 'every band = maxPerBand wide; items centered; constant bar width', render: () => <VegaLiteView spec={vlComputedSpec(uniformCenteredLayout(rows))} /> },
    { key: 'vl-layered', label: 'VL · local (layered)', note: 'singles full-width + Thu split (variable width)', render: () => <VegaLiteView spec={vlLayeredSpec(rows)} /> },
    { key: 'vl-prop', label: 'VL · proportional width', note: 'Thu gets 2× space; band width ∝ item count', render: () => <VegaLiteView spec={vlComputedSpec(proportionalLayout(rows))} /> },
    { key: 'ec-local', label: 'ECharts · uniform + centered', note: 'native category axis + custom rects centered per band', render: () => <EChartsView option={echartsLocalOption(rows)} constrain={false} /> },
    { key: 'cj-local', label: 'Chart.js · uniform + centered', note: 'linear x + barThickness + label plugin', render: () => <ChartjsView config={chartjsLocalConfig(rows)} constrain={false} /> },
  ];

  return (
    <section style={wrapStyle}>
      <div>
        <h3 style={titleStyle}>Local dodge — feasibility (spiky sparse: 1,1,1,2,1,1)</h3>
        <p style={subtitleStyle}>
          Prototype specs (not the engine). Global dodge reserves <code>global</code> = 7 lanes in
          every band; local dodge only needs <code>maxPerBand</code> = 2. Same band width across all
          tiles so the lane-count difference is visible.
        </p>
      </div>
      <div style={gridStyle}>
        {cells.map((c) => (
          <figure key={c.key} style={cardStyle}>
            <figcaption style={capStyle}>
              <span style={capTitle}>{c.label}</span>
              <span style={capNote}>{c.note}</span>
            </figcaption>
            <div style={{ overflow: 'hidden' }}>{c.render()}</div>
          </figure>
        ))}
      </div>
    </section>
  );
}

const wrapStyle: React.CSSProperties = {
  width: 960, boxSizing: 'border-box', background: '#fff',
  border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: 20,
  fontFamily: siteTheme.fontSans, color: siteTheme.text,
};
const titleStyle: React.CSSProperties = { margin: '0 0 4px', fontSize: 16, fontWeight: 600 };
const subtitleStyle: React.CSSProperties = { margin: '0 0 16px', fontSize: 12.5, lineHeight: 1.5, color: 'rgba(0,0,0,0.6)', maxWidth: 640 };
const gridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 };
const cardStyle: React.CSSProperties = { margin: 0, border: '1px solid rgba(0,0,0,0.06)', borderRadius: 8, padding: 10, background: '#fcfcfd', minWidth: 0 };
const capStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 6 };
const capTitle: React.CSSProperties = { fontSize: 12.5, fontWeight: 600 };
const capNote: React.CSSProperties = { fontSize: 11, color: 'rgba(0,0,0,0.5)' };
