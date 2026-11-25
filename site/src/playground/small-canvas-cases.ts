import type { ChartAssemblyInput } from 'flint-chart';
import { PREVIEW_CASES } from '../shared/preview-cases';

/**
 * The charts the small-canvas key and gap rules reach: each drawn at its house's own size (where
 * nothing should change) and at the squeezed sizes hosts ask for — board cells, thumbnails, tiles.
 * The Small canvases page draws each live, beside a local snapshot of it from before those rules.
 */

export type Size = { width: number; height: number };
type Row = Record<string, unknown>;

export interface SmallCanvasCase {
  id: string;
  label: string;
  /** What the case is there to show. */
  note: string;
  /** Sizes to draw at; `null` asks for no size, the agent's default. */
  sizes: Array<Size | null>;
  input: (size: Size | null) => ChartAssemblyInput;
}

const preview = (id: string) => {
  const found = PREVIEW_CASES.find((c) => c.id === id);
  if (!found) throw new Error(`No preview case "${id}"`);
  return found;
};

const sized = (size: Size | null) => (size ? { baseSize: size, canvasSize: size } : {});

function fromPreview(id: string, theme: string, title: string, extra: { relabel?: (row: Row) => Row; semantic_types?: Record<string, string>; encodings?: Record<string, unknown> } = {}) {
  const c = preview(id);
  const values = extra.relabel ? c.data.map(extra.relabel) : c.data;
  return (size: Size | null) => ({
    data: { values }, theme_spec: theme,
    semantic_types: { ...c.semantic_types, ...extra.semantic_types },
    chart_spec: {
      chartType: c.chartType, title, encodings: { ...c.encodings, ...extra.encodings },
      ...(c.chartProperties ? { chartProperties: c.chartProperties } : {}), ...sized(size),
    },
  }) as ChartAssemblyInput;
}

/** Each price against the US price, the Big Mac index's own reading. */
const vsUs = (row: Row) => ({ ...row, 'vs US price': Math.round(((row['Price (USD)'] as number) / 5.7 - 1) * 100) / 100 });

export const SMALL_CANVAS_CASES: SmallCanvasCase[] = [
  {
    id: 'stepped', label: 'Stepped key · Datawrapper',
    note: 'A threshold key above bars: one bar, its title beside it; key text at the axis labels\' size; the ramp slims below 420×340.',
    sizes: [null, { width: 420, height: 340 }, { width: 360, height: 240 }, { width: 260, height: 180 }],
    input: fromPreview('big-mac', 'datawrapper', 'The Big Mac index, 2023', { relabel: vsUs, semantic_types: { 'vs US price': 'PercentageChange' }, encodings: { color: 'vs US price' } }),
  },
  {
    id: 'ramp', label: 'Continuous ramp · Swiss',
    note: 'A heatmap\'s gradient key: 16 px at Swiss\'s 420×320, thinner below; header gaps come in with the canvas.',
    sizes: [{ width: 420, height: 320 }, { width: 360, height: 240 }, { width: 260, height: 180 }],
    input: fromPreview('temp-heatmap', 'swiss', 'Monthly temperature by city'),
  },
  {
    id: 'map', label: 'Choropleth ramp · BBC',
    note: 'A map\'s gradient key at BBC\'s 480×340 and in a small tile.',
    sizes: [{ width: 480, height: 340 }, { width: 300, height: 200 }],
    input: fromPreview('state-unemployment', 'bbc', 'Unemployment by state, 2023'),
  },
  {
    id: 'category', label: 'Category key · Economist',
    note: 'Swatches above a stacked bar: key text no larger than the axis labels; gaps between keys and to the plot scaled together.',
    sizes: [{ width: 460, height: 300 }, { width: 360, height: 240 }, { width: 260, height: 180 }],
    input: fromPreview('electricity-stacked', 'economist', 'How countries make electricity'),
  },
  {
    id: 'series', label: 'Series named at their ends · NYT',
    note: 'Lines labelled at their ends rather than in a key: only the title\'s gap should move.',
    sizes: [{ width: 380, height: 340 }, { width: 300, height: 220 }],
    input: fromPreview('ev-share', 'nyt', 'The electric-car takeover'),
  },
  {
    id: 'plain', label: 'No key · Datawrapper',
    note: 'A plain bar chart: the title\'s gap to the plot is the one thing that changes, and only below 420×340.',
    sizes: [{ width: 420, height: 340 }, { width: 260, height: 180 }],
    input: fromPreview('big-mac', 'datawrapper', 'The Big Mac index, 2023'),
  },
  {
    id: 'board', label: 'MCP board cells · Material',
    note: 'A standard cell (390×280) and a compact one (390×130), as a board sizes its charts.',
    sizes: [{ width: 390, height: 280 }, { width: 390, height: 130 }],
    input: fromPreview('medals-grouped', 'material', 'Paris 2024 medals'),
  },
];

/** The file a case's "before" snapshot is saved to, under `site/public/eval/small-canvas-before/`. */
export const snapshotName = (id: string, size: Size | null) => `${id}-${size ? `${size.width}x${size.height}` : 'default'}.svg`;
