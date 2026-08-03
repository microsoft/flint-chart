import type { TestCase } from 'flint-chart/test-data';

/** Keys that, when present, mean an encoding carries more than a bare field. */
const ENCODING_OVERRIDE_KEYS = ['type', 'aggregate', 'sortOrder', 'sortBy', 'scheme'] as const;

function hasEncodingOverrides(e: Record<string, unknown>): boolean {
  return ENCODING_OVERRIDE_KEYS.some((key) => e[key] != null && e[key] !== '');
}

/**
 * Collapse a field-only encoding to the Flint `channel: "field"` shorthand so
 * the gallery specs read as concisely as possible. Encodings that carry any
 * override (type, aggregate, sort, scheme) keep their `{ field, … }` object
 * form. The assemblers normalise the shorthand back to `{ field }`, so the
 * compiled output is identical either way.
 */
function collapseEncoding(e: Record<string, unknown>): unknown {
  if (e.field == null) return e;
  return hasEncodingOverrides(e) ? e : e.field;
}

function buildEncodingsFromTestCase(t: TestCase): Record<string, Record<string, unknown>> {
  const idToName = new Map(t.fields.map((f) => [f.id, f.name]));
  const encodings: Record<string, Record<string, unknown>> = {};
  for (const [channel, e] of Object.entries(t.encodingMap)) {
    if (!e?.fieldID) continue;
    const field = idToName.get(e.fieldID) ?? e.fieldID;
    encodings[channel] = {
      field,
      type: e.dtype,
      aggregate: e.aggregate,
      sortOrder: e.sortOrder,
      sortBy: e.sortBy,
      scheme: e.scheme,
    };
  }
  return encodings;
}

/** Encodings with field-only entries collapsed to the `"field"` shorthand. */
function buildShorthandEncodings(t: TestCase): Record<string, unknown> {
  const raw = buildEncodingsFromTestCase(t);
  const out: Record<string, unknown> = {};
  for (const [channel, e] of Object.entries(raw)) out[channel] = collapseEncoding(e);
  return out;
}

/** semantic_types + chart_spec (chartType, encodings) — no data payload. */
export function testCaseToFlintSummary(t: TestCase) {
  const semantic_types: Record<string, string> = {};
  for (const [k, m] of Object.entries(t.metadata)) semantic_types[k] = m.semanticType;

  const rawEncodings = buildEncodingsFromTestCase(t);
  const encodings: Record<string, unknown> = {};
  for (const [channel, e] of Object.entries(rawEncodings)) {
    const slim: Record<string, unknown> = { field: e.field };
    for (const key of ['aggregate', 'sortOrder', 'sortBy', 'scheme'] as const) {
      if (e[key] != null && e[key] !== '') slim[key] = e[key];
    }
    encodings[channel] = collapseEncoding(slim);
  }

  return {
    semantic_types,
    chart_spec: {
      chartType: t.chartType,
      encodings,
      ...(t.chartProperties && Object.keys(t.chartProperties).length
        ? { chartProperties: t.chartProperties }
        : {}),
    },
  };
}

export interface CanvasSize {
  width: number;
  height: number;
}

const DEFAULT_CANVAS: CanvasSize = { width: 480, height: 320 };

/** True when a test case is faceted (small multiples) via a column/row encoding. */
export function isFacetedTestCase(t: TestCase): boolean {
  return !!(t.encodingMap?.column?.fieldID || t.encodingMap?.row?.fieldID);
}

/** Convert a gallery TestCase into a flat ChartAssemblyInput for the editor. */
export function testCaseToAssemblyInput(t: TestCase, canvasSize: CanvasSize = DEFAULT_CANVAS) {
  const encodings = buildShorthandEncodings(t);
  const semantic_types: Record<string, string> = {};
  for (const [k, m] of Object.entries(t.metadata)) semantic_types[k] = m.semanticType;

  return {
    semantic_types,
    chart_spec: {
      chartType: t.chartType,
      encodings,
      baseSize: canvasSize,
      chartProperties: t.chartProperties,
    },
    options: t.assembleOptions,
    semantic_annotations: t.semanticAnnotations,
    // Data goes last so the compact, frequently-edited spec stays at the top of
    // the editor and the bulky values array sits at the bottom.
    data: { values: t.data },
  } as any;
}

/**
 * Bar/column-family charts size their plot from a per-category band step, so a
 * handful of discrete categories renders as a tall, narrow plot whose aspect is
 * far from the gallery tile's. For these low-cardinality cases we hand the
 * assembler a wider, shorter canvas so its own layout produces a more natural,
 * closer-to-4:3 plot. High-cardinality / overflowing bars (the intentional
 * "stretching" demos) are left on the default canvas and simply overflow the
 * tile horizontally.
 */
const BAND_FAMILY_TYPES = new Set([
  'Bar Chart',
  'Stacked Bar Chart',
  'Grouped Bar Chart',
  'Lollipop Chart',
  'Waterfall Chart',
  'Pyramid Chart',
  'Combo Chart',
  'Boxplot',
]);
const LOW_CARDINALITY_MAX = 10;
const THUMBNAIL_WIDE_CANVAS: CanvasSize = { width: 560, height: 280 };

/**
 * Faceted (small-multiples) charts lay their panels out in a row, so they need a
 * wider designed canvas than a single plot for each panel to stay legible. The
 * wall thumbnail then contain-fits the whole grid into the tile (scaled down a
 * little), so the viewer sees it's a multi-panel chart they can open — rather
 * than one cropped subplot.
 */
const THUMBNAIL_FACET_CANVAS: CanvasSize = { width: 720, height: 300 };

/** Distinct values on the primary (category) axis — the bar count. */
function categoryAxisCardinality(t: TestCase): number {
  const enc = t.encodingMap?.x ?? t.encodingMap?.y;
  const field = enc?.fieldID ? t.fields.find((f) => f.id === enc.fieldID) : undefined;
  if (!field) return 0;
  const seen = new Set<unknown>();
  for (const row of t.data as Array<Record<string, unknown>>) seen.add(row[field.name]);
  return seen.size;
}

/**
 * Canvas to assemble a wall *thumbnail* at. Defaults to the editor canvas, but
 * widens few-category band charts toward the gallery's aspect ratio.
 */
export function thumbnailCanvasSize(t: TestCase): CanvasSize {
  if (isFacetedTestCase(t)) return THUMBNAIL_FACET_CANVAS;
  if (!BAND_FAMILY_TYPES.has(t.chartType)) return DEFAULT_CANVAS;
  const cardinality = categoryAxisCardinality(t);
  if (cardinality === 0 || cardinality > LOW_CARDINALITY_MAX) return DEFAULT_CANVAS;
  return THUMBNAIL_WIDE_CANVAS;
}

/**
 * How far a themed chart may stretch when the house's own footprint drives it.
 * Square and generous, so a house that wants to run wide (a long category
 * ruler) or tall (a stack of small multiples) can, without the ceiling
 * dictating the shape it starts from.
 */
const THEMED_CANVAS_CEILING: CanvasSize = { width: 720, height: 720 };

/**
 * Name a house on an assembly input, and stand the gallery's own sizing down.
 *
 * A house states the footprint its style was measured against — the
 * Economist's wide print column, Nature's narrow single-column figure — and
 * its type scale is read off that footprint. The gallery's per-chart-type
 * canvas is a tile-shaping convenience, not a decision anyone made about this
 * chart, so when a house is chosen it steps aside and becomes a ceiling
 * instead. That is exactly what the Theme Lab does, which is why the two agree.
 */
export function withHouse<T extends { chart_spec: Record<string, unknown> }>(
  input: T,
  themeId: string | undefined,
): T {
  if (!themeId) return input;
  return {
    ...input,
    chart_spec: { ...input.chart_spec, baseSize: undefined, canvasSize: THEMED_CANVAS_CEILING },
    theme_spec: themeId,
  } as T;
}
