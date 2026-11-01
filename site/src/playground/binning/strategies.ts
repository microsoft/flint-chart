/**
 * Candidate ways to cut a continuous colour scale into stepped classes, each a pure function of the
 * data, an optional pivot (a diverging field's midpoint) and a target class count. The binning lab
 * draws every candidate beside what Flint does today and scores it on the same terms.
 */

/** Round steps of a power of ten, as Flint's ruler and `roundSample` use them. */
const NICE = [1, 2, 2.5, 5];
/** Talbot, Lin & Hanrahan (2010) order steps by simplicity: 1 is simplest, then 5, 2, 2.5. */
const SIMPLICITY_ORDER = [1, 5, 2, 2.5, 4, 3];

export type StrategyId = 'today' | 'symmetric-nice' | 'pivot-anchored' | 'open-ended' | 'round-bin-edges';

export interface Binning {
  /** Inner class boundaries, ascending: `k − 1` of them for `k` classes. */
  breaks: number[];
  /** The domain the outer classes close at; undefined ends are open ("< a", "> b"). */
  lo?: number;
  hi?: number;
  /** For a diverging field: how many classes lie below and above the pivot. */
  below?: number;
  above?: number;
  /** Whether one class is centred on the pivot (an odd symmetric count) rather than the pivot being a break. */
  neutral?: boolean;
  /** One line on how the breaks were chosen. */
  note: string;
}

export interface Strategy {
  id: StrategyId;
  label: string;
  summary: string;
  bin: (values: number[], options: { pivot?: number; classes: number }) => Binning | undefined;
}

const clean = (v: number) => Number(v.toPrecision(12));

/** Round steps between `lo` and `hi`, ascending. */
function niceSteps(lo: number, hi: number): number[] {
  if (!(lo > 0) || !(hi >= lo)) return [];
  const out: number[] = [];
  for (let e = Math.floor(Math.log10(lo)) - 1; e <= Math.ceil(Math.log10(hi)) + 1; e++) {
    for (const q of NICE) {
      const step = clean(q * 10 ** e);
      if (step >= lo * (1 - 1e-9) && step <= hi * (1 + 1e-9)) out.push(step);
    }
  }
  return out.sort((a, b) => a - b);
}

const extent = (values: number[]): [number, number] => [Math.min(...values), Math.max(...values)];
const range = (from: number, count: number, step: number) => Array.from({ length: count }, (_, i) => clean(from + i * step));
const diverging = (pivot: number | undefined, lo: number, hi: number): pivot is number => pivot !== undefined && lo < pivot && hi > pivot;

/** Flint before round classes: a diverging domain made symmetric about the pivot, cut into equal classes, nothing rounded. */
const today: Strategy = {
  id: 'today',
  label: 'Before: symmetric quantize',
  summary: 'What Flint did before round classes: symmetric about the pivot, then equal classes over the raw domain.',
  bin(values, { pivot, classes }) {
    let [lo, hi] = extent(values);
    const split = diverging(pivot, lo, hi);
    if (split) {
      const reach = Math.max(pivot - lo, hi - pivot);
      lo = pivot - reach;
      hi = pivot + reach;
    }
    const step = (hi - lo) / classes;
    return {
      breaks: range(lo + step, classes - 1, step), lo, hi,
      ...(split ? { below: Math.floor(classes / 2), above: Math.floor(classes / 2), neutral: classes % 2 === 1 } : {}),
      note: `step ${clean(step)}`,
    };
  },
};

/** Keep the symmetric domain and the class count, but raise the step to the next round value: the domain grows to fit. */
const symmetricNice: Strategy = {
  id: 'symmetric-nice',
  label: 'Symmetric, round step',
  summary: 'Same class count and symmetry; the step rounds up, so the domain widens to ±(k/2)·step.',
  bin(values, { pivot, classes }) {
    const [dmin, dmax] = extent(values);
    if (diverging(pivot, dmin, dmax)) {
      const reach = Math.max(pivot - dmin, dmax - pivot);
      const step = niceSteps((2 * reach) / classes, 8 * reach)[0];
      if (!step) return undefined;
      const lo = pivot - (classes / 2) * step;
      return {
        breaks: range(lo + step, classes - 1, step), lo: clean(lo), hi: clean(lo + classes * step),
        below: Math.floor(classes / 2), above: Math.floor(classes / 2), neutral: classes % 2 === 1, note: `step ${step}`,
      };
    }
    for (const step of niceSteps((dmax - dmin) / classes, (dmax - dmin) * 4)) {
      const lo = Math.floor(dmin / step) * step;
      if (lo + classes * step >= dmax) return { breaks: range(lo + step, classes - 1, step), lo: clean(lo), hi: clean(lo + classes * step), note: `step ${step}` };
    }
    return undefined;
  },
};

/**
 * The pivot is a break and every class is one round step wide; each side takes only the classes its
 * data reaches, so a lopsided field keeps its ramp's light end on the short side rather than empty
 * dark classes. Equal distances from the pivot still read as equal colour steps.
 */
const pivotAnchored: Strategy = {
  id: 'pivot-anchored',
  label: 'Pivot-anchored, round step',
  summary: 'Breaks at pivot ± i·step on a round step; each side takes only the classes its data reaches. Flint now does this (roundColorClasses), choosing the step by Talbot et al.\'s score.',
  bin(values, { pivot, classes }) {
    const [dmin, dmax] = extent(values);
    const split = diverging(pivot, dmin, dmax);
    const anchor = split ? pivot : 0;
    const most = Math.max(classes + 1, 4);
    let best: { binning: Binning; miss: number } | undefined;
    for (const step of niceSteps((dmax - dmin) / (most + 1), dmax - dmin)) {
      const lo = anchor + Math.floor((dmin - anchor) / step + 1e-9) * step;
      const hi = anchor + Math.ceil((dmax - anchor) / step - 1e-9) * step;
      const k = Math.round((hi - lo) / step);
      if (k < 3 || k > most) continue;
      const below = Math.max(0, Math.round((anchor - lo) / step));
      const binning: Binning = {
        breaks: range(lo + step, k - 1, step), lo: clean(lo), hi: clean(hi),
        ...(split ? { below, above: k - below, neutral: false } : {}),
        note: `step ${step}${split ? `, ${below} below / ${k - below} above` : ''}`,
      };
      const miss = Math.abs(k - classes);
      if (!best || miss < best.miss) best = { binning, miss };
    }
    return best?.binning;
  },
};

/** Round thresholds inside the data, the two end classes open: the domain never grows. */
const openEnded: Strategy = {
  id: 'open-ended',
  label: 'Open ends, round breaks',
  summary: 'Round thresholds inside the data; the end classes read "< a" and "> b", so nothing widens.',
  bin(values, { pivot, classes }) {
    const [dmin, dmax] = extent(values);
    const split = diverging(pivot, dmin, dmax);
    const anchor = split ? pivot : 0;
    let best: { binning: Binning; miss: number } | undefined;
    for (const step of niceSteps((dmax - dmin) / (classes + 3), dmax - dmin)) {
      const first = anchor + Math.ceil((dmin - anchor) / step + 1e-9) * step;
      const breaks: number[] = [];
      for (let b = first; b < dmax - 1e-9 * step; b += step) if (b > dmin + 1e-9 * step) breaks.push(clean(b));
      if (breaks.length < 2) continue;
      const k = breaks.length + 1;
      const below = split ? breaks.filter((b) => b <= anchor).length : undefined;
      const binning: Binning = {
        breaks,
        ...(below !== undefined ? { below, above: k - below, neutral: false } : {}),
        note: `step ${step}, ends open`,
      };
      const miss = Math.abs(k - classes);
      if (!best || miss < best.miss) best = { binning, miss };
    }
    return best?.binning;
  },
};

/** What Flint's ECharts backend does for an author's `bins` (core `roundBinEdges`): `k − 1` round edges over the data's middle, ends open. */
const roundBinEdges: Strategy = {
  id: 'round-bin-edges',
  label: 'roundBinEdges (ECharts today)',
  summary: 'k − 1 round edges centred on the data\'s middle, ends open — ECharts\' bins; it does not know the pivot.',
  bin(values, { classes }) {
    const [min, max] = extent(values);
    if (classes < 2 || !(max > min)) return undefined;
    const raw = (max - min) / classes;
    let best: { edges: number[]; cost: number } | undefined;
    for (let exp = Math.floor(Math.log10(raw)) - 1; exp <= Math.floor(Math.log10(raw)) + 1; exp++) {
      for (const unit of NICE) {
        const step = unit * 10 ** exp;
        const first = Math.round(((min + max) / 2 - (step * (classes - 2)) / 2) / step) * step;
        const edges = range(first, classes - 1, step);
        if (edges[0] <= min || edges[edges.length - 1] >= max) continue;
        const cost = Math.abs(edges[0] - min - step) / step + Math.abs(max - edges[edges.length - 1] - step) / step;
        if (!best || cost < best.cost) best = { edges, cost };
      }
    }
    return best ? { breaks: best.edges, note: `step ${clean(best.edges[1] - best.edges[0])}, ends open` } : undefined;
  },
};

export const STRATEGIES: Strategy[] = [today, symmetricNice, pivotAnchored, openEnded, roundBinEdges];

export interface Score {
  classes: number;
  counts: number[];
  empty: number;
  /** Class membership entropy over log(k): 1 when the data fills every class evenly. */
  evenness: number;
  /** Domain span over data span; undefined where the ends are open. */
  inflation?: number;
  /** Talbot et al.'s coverage: 1 at an exact fit, falling quadratically as the domain overreaches the data. */
  coverage?: number;
  /** Most significant digits any break label needs. */
  digits: number;
  /** Talbot et al.'s simplicity of the step (1 best), where the breaks share one round step. */
  simplicity?: number;
  /** Whether the pivot is a break or centres a class, where the field diverges. */
  pivotRespected?: boolean;
}

const significant = (v: number) => (v === 0 ? 1 : clean(Math.abs(v)).toExponential().split('e')[0].replace('.', '').length);

export function score(values: number[], binning: Binning, pivot?: number): Score {
  const { breaks, lo, hi } = binning;
  const counts = new Array(breaks.length + 1).fill(0);
  for (const v of values) {
    let i = 0;
    while (i < breaks.length && v >= breaks[i]) i++;
    counts[i]++;
  }
  const n = values.length;
  const k = counts.length;
  const evenness = k > 1 ? -counts.filter(Boolean).reduce((s, c) => s + (c / n) * Math.log(c / n), 0) / Math.log(k) : 1;
  const [dmin, dmax] = extent(values);
  const closed = lo !== undefined && hi !== undefined;
  const steps = breaks.slice(1).map((b, i) => clean(b - breaks[i]));
  const step = steps.length && steps.every((s) => Math.abs(s - steps[0]) <= 1e-9 * Math.abs(steps[0])) ? steps[0] : undefined;
  const mantissa = step ? clean(step / 10 ** Math.floor(Math.log10(step))) : undefined;
  const at = mantissa !== undefined ? SIMPLICITY_ORDER.indexOf(mantissa) : -1;
  return {
    classes: k,
    counts,
    empty: counts.filter((c) => c === 0).length,
    evenness: Number(evenness.toFixed(2)),
    ...(closed ? {
      inflation: Number(((hi! - lo!) / (dmax - dmin)).toFixed(2)),
      coverage: Number((1 - 0.5 * (((dmax - hi!) ** 2 + (dmin - lo!) ** 2) / ((0.1 * (dmax - dmin)) ** 2))).toFixed(2)),
    } : {}),
    digits: Math.max(...breaks.map(significant)),
    ...(at >= 0 ? { simplicity: Number((1 - at / (SIMPLICITY_ORDER.length - 1)).toFixed(2)) } : {}),
    ...(pivot !== undefined && dmin < pivot && dmax > pivot ? {
      pivotRespected: breaks.some((b) => Math.abs(b - pivot) < 1e-9)
        || breaks.some((b, i) => i > 0 && Math.abs((breaks[i - 1] + b) / 2 - pivot) < 1e-9),
    } : {}),
  };
}

/** The decimals a break needs to print exactly. */
export function decimalsOf(v: number): number {
  const match = /^-?\d+(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(String(clean(v)));
  return match ? Math.max(0, (match[1]?.length ?? 0) - Number(match[2] ?? 0)) : 0;
}
