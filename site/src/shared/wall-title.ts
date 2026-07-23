import type { TestCase } from 'flint-chart/test-data';
import type { Locale } from '../i18n/locales';
import { localizeVariantTitle } from './gallery-labels';

/**
 * Derives short, human-readable, Vega-Lite-gallery-style captions for the
 * curated examples of a single chart type.
 *
 * The raw test titles are inconsistent: Vega-Lite cases are cryptic encoding
 * codes ("N(4)×Q +color(N,3) (12 pts)") while ECharts/Chart.js cases carry a
 * human dataset subtitle ("EC: Funnel — Sales Pipeline"). Instead of trusting
 * them, we describe what each chart *conveys* from its chart type + encoding
 * features — mirroring how the Vega-Lite gallery names examples ("Horizontal
 * Stacked Bar Chart", "Multi-Series Line Chart", "Bar Chart with Negative
 * Values", "… over Time"). Special data shapes (temporal axes, dense /
 * high-cardinality data) are called out explicitly.
 *
 * Within one chart type, colliding titles are disambiguated with descriptive
 * qualifiers (a human subtitle, a scale word, finally a single cardinality
 * count) — never a bare "(2)" unless two variants are truly identical.
 */

type Channel = string;
type DType = 'quantitative' | 'nominal' | 'ordinal' | 'temporal' | undefined;

const CIRCULAR = /pie|doughnut|donut|rose/;
const HIER = /tree|treemap|sunburst|sankey|network|funnel|gauge/;
const DASH = ' \u2014 ';

function fieldName(t: TestCase, id?: string): string | undefined {
  if (!id) return undefined;
  return t.fields.find((f) => f.id === id)?.name;
}

function meta(t: TestCase, ch: Channel) {
  const enc = t.encodingMap[ch as keyof typeof t.encodingMap];
  const name = fieldName(t, enc?.fieldID);
  return name ? t.metadata[name] : undefined;
}

function dtypeOf(t: TestCase, ch: Channel): DType {
  const enc = t.encodingMap[ch as keyof typeof t.encodingMap];
  if (!enc?.fieldID) return undefined;
  if (enc.dtype) return enc.dtype;
  const m = meta(t, ch);
  if (!m) return undefined;
  const ty = String(m.type);
  if (ty === 'number') return 'quantitative';
  if (ty === 'date' || ty === 'datetime' || ty === 'time') return 'temporal';
  return 'nominal';
}

function card(t: TestCase, ch: Channel): number | undefined {
  const n = meta(t, ch)?.levels?.length;
  return n && n > 0 ? n : undefined;
}

function has(t: TestCase, ch: Channel): boolean {
  return !!t.encodingMap[ch as keyof typeof t.encodingMap]?.fieldID;
}

function baseTitle(t: TestCase): string {
  let base = (t.chartType || 'Chart').replace(/\s*\*\s*$/, '').trim();
  const tags = new Set(t.tags ?? []);
  if (tags.has('doughnut') && /pie/i.test(base)) base = 'Doughnut Chart';
  const lower = base.toLowerCase();
  const circular = CIRCULAR.test(lower);
  const hier = HIER.test(lower);
  const xq = dtypeOf(t, 'x') === 'quantitative';
  const yq = dtypeOf(t, 'y') === 'quantitative';
  const temporal = !circular && !hier && (dtypeOf(t, 'x') === 'temporal' || dtypeOf(t, 'y') === 'temporal');
  const horizontal = !circular && !hier && xq && !yq && has(t, 'y') && !/pyramid|ranged/.test(lower);
  const colored = has(t, 'color');
  const colorByValue =
    colored &&
    (['quantitative', 'temporal'].includes(dtypeOf(t, 'color') as string) ||
      tags.has('numeric-color') ||
      tags.has('continuous-color'));
  const sized = has(t, 'size');
  const faceted = has(t, 'column') || has(t, 'row');
  const baseImpliesColor =
    /stacked|grouped|pie|doughnut|rose|heatmap|histogram/.test(lower) ||
    hier ||
    /bump|streamgraph|pyramid|parallel|radar|candlestick|boxplot|combo/.test(lower);

  const prefix: string[] = [];
  const suffix: string[] = [];
  if (faceted) prefix.push('Faceted');

  if (/scatter|point/.test(lower) && sized) {
    if (colored) suffix.push(colorByValue ? 'Colored by Value' : 'by Category');
    return finish(prefix, 'Bubble Plot', suffix, true);
  }

  if (horizontal) prefix.push('Horizontal');
  if (colored) {
    if (colorByValue && !circular && !/heatmap/.test(lower)) suffix.push('Colored by Value');
    else if (!baseImpliesColor) {
      if (/line|area/.test(lower)) prefix.push('Multi-Series');
      else prefix.push('Colored');
    }
  }
  if (tags.has('diverging')) suffix.push('with Negative Values');
  if (temporal) suffix.push('over Time');
  if (circular) {
    const n = card(t, 'color') ?? card(t, 'x');
    if (n) suffix.push(`(${n} slices)`);
  }
  return finish(prefix, base, suffix, baseImpliesColor || sized);
}

function finish(prefix: string[], base: string, suffix: string[], impliesColor: boolean): string {
  if (prefix.length === 0 && suffix.length === 0 && !impliesColor) prefix.push('Simple');
  return [...prefix, base, ...suffix].join(' ').replace(/\s+/g, ' ').trim();
}

// ---- disambiguation qualifiers --------------------------------------------

function pluralize(n: number, unit: string): string {
  if (n !== 1) return `${n} ${unit}`;
  const sing =
    unit === 'categories' ? 'category' : unit === 'series' ? 'series' : unit.replace(/s$/, '');
  return `1 ${sing}`;
}

function pointUnit(lower: string): string {
  if (/sankey|network|tree|treemap|sunburst/.test(lower)) return 'nodes';
  if (/funnel/.test(lower)) return 'stages';
  if (/calendar/.test(lower)) return 'days';
  return 'points';
}

function groupUnit(lower: string): string {
  return /line|area|stream|bump/.test(lower) ? 'series' : 'groups';
}

const CHART_WORDS =
  /\b(chart|plot|diagram|graph|pyramid|rose|funnel|sankey|treemap|sunburst|tree|gauge|heatmap|map|histogram|regression|scatter|bar|line|area|bubble|density|strip|lollipop|waterfall|candlestick|radar|network|stream|streamgraph|calendar|parallel|coordinates|combo|dot|ranged)\b/gi;
const GENERIC = new Set(['basic', 'simple', 'default', 'standard', 'demo']);
const SMALL_WORDS = new Set(['by', 'of', 'the', 'a', 'an', 'and', 'or', 'to', 'in', 'on', 'vs', 'per', 'with', 'for']);

function titleCase(s: string): string {
  return s
    .split(' ')
    .map((w, i) => {
      if (i > 0 && SMALL_WORDS.has(w.toLowerCase())) return w.toLowerCase();
      return w && /[a-z]/.test(w[0]) ? w[0].toUpperCase() + w.slice(1) : w;
    })
    .join(' ');
}

/** A concise, human dataset name pulled from the raw test title, if present. */
function humanSubtitle(t: TestCase, baseLabel: string): string | null {
  let s = t.title ?? '';
  s = s.replace(/^(EC|CJS):\s*[^\u2014-]*[\u2014-]\s*/, '').replace(/\s*\*\s*$/, '').trim();
  if (/[\u00d7]|\b[NOQT]\(\d/.test(s)) return null; // cryptic Vega-Lite encoding code
  s = s.replace(/\s*\(.*$/, '').trim(); // drop parentheticals / extra measures
  s = s.replace(CHART_WORDS, '').trim();
  s = s
    .replace(/^[\s+&,\u2013\u2014\-]+/, '')
    .replace(/[\s+&,\u2013\u2014\-]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!s || s.length < 2 || s.length > 22) return null;
  if (/^(\+?\s*)?colou?r(ed)?$/i.test(s)) return null; // color already in primary descriptor
  if (GENERIC.has(s.toLowerCase())) return null;
  const baseWords = new Set(baseLabel.toLowerCase().split(/\s+/));
  if (s.toLowerCase().split(/\s+/).every((w) => baseWords.has(w))) return null; // restates base
  return titleCase(s);
}

/** A descriptive word for notably dense / sparse / high-cardinality variants. */
function isCatAxis(t: TestCase, ch: Channel): boolean {
  const dt = dtypeOf(t, ch);
  return dt === 'nominal' || dt === 'ordinal';
}

const STRETCH_TAGS = [
  'scaling',
  'large',
  'very-large',
  'overstretch',
  'stretch-test',
  'high-cardinality',
  'dense',
  'many-categories',
  'many-stages',
];

function isStretchDemo(t: TestCase): boolean {
  const tags = new Set(t.tags ?? []);
  return STRETCH_TAGS.some((g) => tags.has(g));
}

/**
 * A concrete count of what an example actually puts on screen, with a unit
 * chosen to reflect the encoding — so the *kind* of data is legible too:
 * "5 categories" (categorical axis) vs "20 points" (continuous axis) vs
 * "10 series" (colour split) vs "8 slices" (pie) vs "12×6" (heatmap grid).
 * This is how high-cardinality "stretch" examples and different data-type
 * combinations get named specifically rather than generically.
 */
function featureNote(t: TestCase): string | null {
  const lower = (t.chartType ?? '').toLowerCase();
  const circular = CIRCULAR.test(lower);
  const colorN = has(t, 'color') ? card(t, 'color') : undefined;
  const xN = isCatAxis(t, 'x') ? card(t, 'x') : undefined;
  const yN = isCatAxis(t, 'y') ? card(t, 'y') : undefined;
  const axisN = Math.max(xN ?? 0, yN ?? 0) || undefined;
  const rows = (t.data ?? []).length || undefined;
  const sparse = (t.tags ?? []).includes('sparse');
  const withSparse = (note: string | null): string | null =>
    sparse ? (note ? `${note}, sparse` : 'sparse') : note;

  if (circular) {
    const n = card(t, 'color') ?? card(t, 'x');
    return withSparse(n ? pluralize(n, 'slices') : null);
  }
  if (/heatmap/.test(lower)) {
    if (xN && yN) return withSparse(`${xN}\u00d7${yN}`);
    return withSparse(rows ? pluralize(rows, 'cells') : null);
  }
  if (colorN && colorN >= 2 && /line|area|stream|bump/.test(lower)) {
    return withSparse(pluralize(colorN, 'series'));
  }
  if (axisN) {
    const unit = /box/.test(lower)
      ? 'groups'
      : /funnel/.test(lower)
        ? 'stages'
        : /pyramid/.test(lower)
          ? 'levels'
          : 'categories';
    return withSparse(pluralize(axisN, unit));
  }
  if (HIER.test(lower) && rows) return withSparse(pluralize(rows, pointUnit(lower)));
  if (rows) {
    const unit = /hist|density/.test(lower) ? 'values' : pointUnit(lower);
    return withSparse(pluralize(rows, unit));
  }
  return withSparse(null);
}

type CardKey = 'color' | 'x' | 'y' | 'pts';

function cardVal(t: TestCase, key: CardKey): number | undefined {
  if (key === 'color') return has(t, 'color') ? card(t, 'color') : undefined;
  if (key === 'x') return card(t, 'x');
  if (key === 'y') return card(t, 'y');
  const n = (t.data ?? []).length;
  return n || undefined;
}

function cardLabel(t: TestCase, key: CardKey): string | null {
  const lower = (t.chartType ?? '').toLowerCase();
  const n = cardVal(t, key);
  if (!n) return null;
  if (key === 'color') return `(${pluralize(n, groupUnit(lower))})`;
  if (key === 'x' || key === 'y') return `(${pluralize(n, 'categories')})`;
  return `(${pluralize(n, pointUnit(lower))})`;
}

/** Pick the single cardinality dimension that best separates a group of tiles. */
function cardQualifierKey(variants: TestCase[], idxs: number[]): CardKey {
  const keys: CardKey[] = ['color', 'x', 'y', 'pts'];
  for (const key of keys) {
    const vals = idxs.map((i) => cardVal(variants[i], key));
    if (vals.every((v) => v != null) && new Set(vals).size === idxs.length) return key;
  }
  if (idxs.map((i) => cardVal(variants[i], 'pts')).every((v) => v != null)) return 'pts';
  let best: CardKey = 'pts';
  let bd = 0;
  for (const key of keys) {
    const d = new Set(idxs.map((i) => cardVal(variants[i], key)).filter((v) => v != null)).size;
    if (d > bd) {
      bd = d;
      best = key;
    }
  }
  return best;
}

/**
 * Human-readable captions for a chart type's curated variant set, made unique
 * within the set.
 *
 * Built in passes that each re-group by the current titles and only touch
 * still-colliding groups: a human dataset subtitle, then the concrete
 * encoding count ("12 categories", "10 series", "500 points"…), then a
 * fallback cardinality dimension, then a bare ordinal as a last resort. In
 * addition, examples that exist to demonstrate stretching / high cardinality
 * are *always* annotated with that concrete count, collision or not.
 */
export function humanizeVariants(variants: TestCase[], locale: Locale = 'en'): string[] {
  // Real-world cases carry a descriptive, scenario-based title authored for the
  // gallery (e.g. "Palmer Penguins — flipper length vs body mass"). Use it
  // directly (dropping a trailing parenthetical qualifier for brevity) rather
  // than the derived encoding caption. Their titles are unique, so the
  // disambiguation passes below leave them untouched.
  const realCaption = (t: TestCase): string => {
    const raw = (localizeVariantTitle(t.title, locale) || t.title || '').trim();
    return raw.replace(/\s*\([^)]*\)\s*$/, '').trim() || raw;
  };
  const out = variants.map((t) => ((t.tags ?? []).includes('real') ? realCaption(t) : baseTitle(t)));
  const hasParen = (s: string) => s.includes('(');

  const groupsOf = (): number[][] => {
    const g: Record<string, number[]> = {};
    out.forEach((label, i) => (g[label] ??= []).push(i));
    return Object.values(g);
  };

  // Pass: append a per-variant qualifier to every still-colliding group where
  // the qualifier actually distinguishes the members.
  const disambiguate = (
    val: (i: number) => string | null,
    join: (base: string, v: string) => string,
  ) => {
    for (const group of groupsOf()) {
      if (group.length < 2) continue;
      const vals = group.map(val);
      if (new Set(vals.map((v) => v ?? '\u2205')).size <= 1) continue;
      group.forEach((i, k) => {
        const v = vals[k];
        if (v != null && !out[i].includes(v)) out[i] = join(out[i], v);
      });
    }
  };

  // 1. Human dataset name pulled from the raw title ("Sales Pipeline").
  disambiguate(
    (i) => humanSubtitle(variants[i], out[i]),
    (b, v) => `${b}${DASH}${v}`,
  );

  // 2. Proactively name what stretch / high-cardinality demos put on screen,
  //    unless the title already shows that count (avoid "30 Bars (30 …)").
  variants.forEach((t, i) => {
    if (!isStretchDemo(t)) return;
    const note = featureNote(t);
    if (!note || hasParen(out[i])) return;
    const n = note.match(/\d+/)?.[0];
    if (n && out[i].includes(n)) return;
    out[i] = `${out[i]} (${note})`;
  });

  // 3. Concrete encoding count, with a unit that reflects the data type.
  disambiguate(
    (i) => (hasParen(out[i]) ? null : featureNote(variants[i])),
    (b, v) => `${b} (${v})`,
  );

  // 4. Fallback: best-separating cardinality dimension.
  for (const group of groupsOf()) {
    if (group.length < 2) continue;
    const key = cardQualifierKey(variants, group);
    for (const i of group) {
      const label = cardLabel(variants[i], key);
      if (label && !out[i].includes(label.slice(1, -1))) out[i] = `${out[i]} ${label}`;
    }
  }

  // 5. Last resort: a bare ordinal so titles are never identical.
  for (const group of groupsOf()) {
    if (group.length < 2) continue;
    group.forEach((i, k) => {
      if (k > 0) out[i] = `${out[i]} (${k + 1})`;
    });
  }

  if (locale !== 'zh-CN') return out;

  const localized = out.map((title) => localizeVariantTitle(title, locale));
  const seen = new Map<string, number>();
  return localized.map((title) => {
    const count = (seen.get(title) ?? 0) + 1;
    seen.set(title, count);
    return count === 1 ? title : `${title}（${count}）`;
  });
}
