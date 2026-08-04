// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Theme mosaic — one wall, one house, twenty-one charts.
 *
 * The demo wall answers "does this case work?", one tile at a time. This page
 * answers a different question: what does a *house* look like when you see all
 * of it at once. It is built to be screenshotted, which is why the switch is
 * the only chrome.
 *
 * The layout is a justified gallery, the same construction a photo wall uses:
 * every chart is laid out to a common height, the row takes as many charts as
 * fit, and the row is scaled so it fills the wall exactly. Nothing is cropped
 * to make it fit and nothing is left short — a chart that stops before the
 * edge leaves a hole, and a chart that runs past it loses an axis.
 *
 * The reason a chart *can* be laid out to a common height is that its height
 * responds to the size it is asked for almost exactly one-for-one: the title,
 * the axis and the legend are a fixed cost on top of the plot, so asking for
 * `target − overhead` lands on `target`. Width does not behave that way. A
 * legend or a column of category labels is as wide as its text no matter how
 * small the plot gets, so width is measured rather than chosen, and the row is
 * what absorbs the slack.
 *
 * Two walls of the same house are not expected to match tile for tile. The
 * charts are the same and the order is the same, but the houses set type at
 * different sizes and put their legends in different places, so the rows break
 * where that house's widths say they should.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { BACKENDS } from '../shared/supported-backends';
import { VegaLiteView } from '../components/VegaLiteView';
import { siteTheme } from '../shared/theme';
import { ThemePicker } from './ThemePicker';
import { PREVIEW_CASES, type PreviewCase } from './new-case-preview-data';

/**
 * The openers run at double height. A bubble scatter carries a palette, a size
 * key, a log axis and a type scale at once; the heatmap is the only place a
 * house's sequential ramp is shown as a field of colour rather than a line;
 * the band is where its fills and its rules are seen together. They are also
 * the only tiles with room for a deck, so they are where the full type scale —
 * headline against subhead — can actually be read.
 */
const FEATURE_IDS = ['gapminder-bubble', 'temp-heatmap', 'seattle-range'];

/**
 * Eighteen more, no two of them the same mark: line, connected scatter, band,
 * box, stem, slope, dumbbell, bar, stacked area, rank, radar, histogram,
 * strip, diverging bar, waterfall, violin, stream and wedge. A house that only
 * knows how to style a bar chart has nowhere to hide.
 *
 * Every one is a Vega-Lite case. A Plotly fallback ignores `theme_spec`, and
 * one tile that refused to change with the switch would say something false
 * about the house.
 */
const REST_IDS = [
    'keeling', 'driving', 'us-pyramid', 'penguins-box',
    'co2-lollipop', 'life-expectancy', 'lifeexp-dumbbell', 'big-mac', 'electricity-mix-area',
    'olympic-bump', 'nutrition-radar', 'faithful-hist', 'iris-strip', 'trust-likert',
    'population-waterfall', 'penguins-violin', 'population-stream', 'browser-pie',
];

const ALL_IDS = [...FEATURE_IDS, ...REST_IDS];

/** The hairline of the house's own paper between two tiles. */
const GAP = 4;

/** Where the wall stops growing, so a wide screen does not stretch the type. */
const MAX_WALL = 1600;

/** A row is about a seventh of the wall, which puts 4–5 charts in it. */
const ROW_RATIO = 210 / 1600;

/**
 * How far a row may be scaled to justify it. Type that is a fifth larger in
 * one row than the next reads as sloppiness rather than as a house, so the
 * band is narrow — and it is only ever reached by a chart that cannot be laid
 * out to the row height at all.
 */
const S_MIN = 0.85;
const S_MAX = 1.15;

/** How many measure-and-correct rounds to give the solver before settling. */
const MAX_PASSES = 5;

const CASE_BY_ID = new Map(PREVIEW_CASES.map((c) => [c.id, c]));

/**
 * A gallery title is written to be read on its own — "Life expectancy gap,
 * male vs female (2021)" — and at a tile's width that is three lines of
 * headline over a plot with no room left. But it is already two things: a
 * subject, and the qualification that pins it down. The houses that
 * distinguish a headline from a deck are exactly the ones this wall is for, so
 * the title is split where it already breaks — at the dash, or the first comma
 * — rather than a second set of short titles being invented alongside the real
 * ones.
 */
function headAndDeck(title: string): { title: string; subtitle?: string } {
    const split = title.match(/^(.*?)\s+—\s+(.*)$/) ?? title.match(/^([^,]{6,}?),\s+(.*)$/);
    return split ? { title: split[1], subtitle: split[2] } : { title };
}

function buildInput(c: PreviewCase, themeId: string | undefined, w: number, h: number, deck: boolean) {
    const { title, subtitle } = headAndDeck(c.title);
    return {
        data: { values: c.data },
        semantic_types: c.semantic_types,
        chart_spec: {
            chartType: c.chartType,
            encodings: c.encodings,
            baseSize: { width: Math.round(w), height: Math.round(h) },
            title,
            ...(deck && subtitle ? { subtitle } : {}),
            ...(c.chartProperties ? { chartProperties: c.chartProperties } : {}),
        },
        ...(themeId ? { theme_spec: themeId } : {}),
    } as any;
}

/**
 * A title longer than its own chart is cut off, because the chart is only as
 * wide as it was asked to be and the heading is drawn inside it. So the title
 * is measured in the house's own face and treated as a floor on the width.
 */
let textCanvas: CanvasRenderingContext2D | null = null;
function measureTitle(spec: any, text: string): number {
    if (!textCanvas) textCanvas = document.createElement('canvas').getContext('2d');
    const t = spec?.config?.title ?? {};
    const size = t.fontSize ?? 13;
    const family = t.font ?? spec?.config?.font ?? 'sans-serif';
    if (!textCanvas) return text.length * size * 0.55;
    textCanvas.font = `${t.fontWeight ?? 'bold'} ${size}px ${family}`;
    return textCanvas.measureText(text).width;
}

type Solved = { id: string; spec: any; w: number; h: number; scale: number };

/** Partition an ordered list into `rows` contiguous rows, keeping every row's scale near 1. */
function partition(items: Solved[], width: number, rows: number): { items: Solved[]; s: number }[] {
    const n = items.length;
    const w = items.map((it) => it.w * it.scale);
    const span = (i: number, j: number) => w.slice(i, j).reduce((a, b) => a + b, 0);
    const scaleOf = (i: number, j: number) => (width - GAP * (j - i - 1)) / span(i, j);
    const cost = (i: number, j: number) => {
        const s = scaleOf(i, j);
        // a row that cannot be justified inside the band is not merely worse, it is wrong
        return (s - 1) ** 2 * (s > S_MAX || s < S_MIN ? 40 : 1);
    };
    const dp = Array.from({ length: rows + 1 }, () => new Array(n + 1).fill(Infinity));
    const cut = Array.from({ length: rows + 1 }, () => new Array(n + 1).fill(-1));
    dp[0][0] = 0;
    for (let r = 1; r <= rows; r++) {
        for (let j = 1; j <= n; j++) {
            for (let i = r - 1; i < j; i++) {
                if (!Number.isFinite(dp[r - 1][i])) continue;
                const c = dp[r - 1][i] + cost(i, j);
                if (c < dp[r][j]) { dp[r][j] = c; cut[r][j] = i; }
            }
        }
    }
    const out: Solved[][] = [];
    let j = n;
    for (let r = rows; r >= 1; r--) { const i = cut[r][j]; out.unshift(items.slice(i, j)); j = i; }
    return out.map((row) => {
        const i0 = items.indexOf(row[0]);
        const s = scaleOf(i0, i0 + row.length);
        return { items: row, s: Math.max(S_MIN, Math.min(S_MAX, s)) };
    });
}

function rowCount(items: Solved[], width: number): number {
    const total = items.reduce((a, b) => a + b.w * b.scale, 0);
    return Math.max(1, Math.round(total / width));
}

/** One chart, drawn at the size the row settled on. */
function Tile({ item, s, rowH }: { item: Solved; s: number; rowH: number }) {
    const k = item.scale * s;
    const w = item.w * k;
    const h = item.h * k;
    return (
        <div style={{ width: w, height: Math.min(h, rowH), overflow: 'hidden', flex: '0 0 auto' }}>
            <div style={{ transform: `scale(${k})`, transformOrigin: 'top left', width: item.w, height: item.h }}>
                <VegaLiteView spec={item.spec} />
            </div>
        </div>
    );
}

function useWallWidth(): [React.RefObject<HTMLDivElement>, number] {
    const ref = useRef<HTMLDivElement>(null);
    const [w, setW] = useState(MAX_WALL);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const measure = () => {
            const next = Math.min(MAX_WALL, Math.round(el.clientWidth - GAP * 2));
            setW((prev) => (Math.abs(prev - next) > 4 ? next : prev));
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    return [ref, w];
}

export function ThemeMosaic() {
    const [themeId, setThemeId] = useState<string | undefined>(undefined);
    const [hostRef, wallW] = useWallWidth();
    const rowH = Math.max(150, Math.min(240, Math.round(wallW * ROW_RATIO)));

    return (
        <div className="dev-page" style={{ alignItems: 'stretch' }}>
            <div style={{ marginBottom: 12 }}>
                <ThemePicker themeId={themeId} onTheme={setThemeId} />
            </div>
            <div ref={hostRef} style={{ width: '100%' }}>
                <Wall key={`${themeId ?? 'default'}:${rowH}`} themeId={themeId} wallW={wallW} rowH={rowH} />
            </div>
        </div>
    );
}

/**
 * Remounted per house so the solve starts clean: the previous house's widths
 * are the wrong starting point, and a half-corrected request would show as a
 * row that does not reach the edge.
 */
function Wall({ themeId, wallW, rowH }: { themeId: string | undefined; wallW: number; rowH: number }) {
    const featH = rowH * 2 + GAP;
    const [req, setReq] = useState<Record<string, { w: number; h: number }>>(() => {
        const r: Record<string, { w: number; h: number }> = {};
        for (const id of ALL_IDS) r[id] = { w: 320, h: (FEATURE_IDS.includes(id) ? featH : rowH) - 80 };
        return r;
    });
    const [passes, setPasses] = useState<Record<string, number>>({});
    const [solved, setSolved] = useState<Record<string, Solved>>({});

    const specs = useMemo(() => {
        const out: Record<string, any> = {};
        for (const id of ALL_IDS) {
            if (solved[id]) continue;
            const c = CASE_BY_ID.get(id);
            if (!c) continue;
            try {
                out[id] = BACKENDS.vegalite.assemble(buildInput(c, themeId, req[id].w, req[id].h, FEATURE_IDS.includes(id)));
            } catch { /* a case that will not assemble simply does not join the wall */ }
        }
        return out;
    }, [themeId, req, solved]);

    const onMeasured = (id: string, w: number, h: number) => {
        const spec = specs[id];
        if (!spec || solved[id]) return;
        const c = CASE_BY_ID.get(id)!;
        const feature = FEATURE_IDS.includes(id);
        const target = feature ? featH : rowH;
        const maxW = feature ? 760 : 560;
        const need = Math.ceil(measureTitle(spec, headAndDeck(c.title).title)) + 12;
        const dh = target - h;
        const dw = Math.max(0, Math.min(need, maxW) - w);
        const pass = passes[id] ?? 0;
        if ((Math.abs(dh) <= 2 && dw <= 0) || pass >= MAX_PASSES) {
            const scale = Math.max(S_MIN, Math.min(S_MAX, target / h));
            setSolved((p) => ({ ...p, [id]: { id, spec, w, h, scale } }));
            return;
        }
        setPasses((p) => ({ ...p, [id]: pass + 1 }));
        setReq((p) => ({ ...p, [id]: { w: Math.min(maxW, p[id].w + dw * 1.6), h: Math.max(40, p[id].h + dh) } }));
    };

    const ready = ALL_IDS.every((id) => solved[id] || !specs[id]);
    const canvas = (solved[FEATURE_IDS[0]]?.spec ?? Object.values(specs)[0])?.config?.background ?? '#ffffff';

    const bands = useMemo(() => {
        if (!ready) return null;
        const feat = FEATURE_IDS.map((id) => solved[id]).filter(Boolean);
        const rest = REST_IDS.map((id) => solved[id]).filter(Boolean);
        const featRows = partition(feat, wallW, rowCount(feat, wallW));
        const restRows = partition(rest, wallW, rowCount(rest, wallW));
        const mid = Math.ceil(restRows.length / 2);
        // the openers sit in the middle, the way a spread carries its opener
        return [
            ...restRows.slice(0, mid).map((r) => ({ r, h: rowH * r.s })),
            ...featRows.map((r) => ({ r, h: featH * r.s })),
            ...restRows.slice(mid).map((r) => ({ r, h: rowH * r.s })),
        ];
    }, [ready, solved, wallW, rowH, featH]);

    return (
        <>
            {/* offscreen, where each chart is laid out until it lands on the row height */}
            <div style={{ position: 'fixed', left: -20000, top: 0, visibility: 'hidden' }} aria-hidden>
                {ALL_IDS.filter((id) => specs[id]).map((id) => (
                    <Measure key={`${id}:${passes[id] ?? 0}`} id={id} spec={specs[id]} onMeasured={onMeasured} />
                ))}
            </div>
            {!bands ? (
                <div style={{ color: siteTheme.textMuted, fontSize: 13, padding: '24px 0' }}>
                    Laying out {ALL_IDS.length - Object.keys(solved).length} more charts…
                </div>
            ) : (
                <div style={{ background: canvas, padding: GAP, display: 'flex', flexDirection: 'column', gap: GAP, width: wallW + GAP * 2 }}>
                    {bands.map((b, i) => (
                        <div key={i} style={{ display: 'flex', gap: GAP, height: b.h }}>
                            {b.r.items.map((it) => (
                                <Tile key={it.id} item={it} s={b.r.s} rowH={b.h} />
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </>
    );
}

/** Renders a chart offscreen and reports the size it came out at. */
function Measure({ id, spec, onMeasured }: { id: string; spec: any; onMeasured: (id: string, w: number, h: number) => void }) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        let done = false;
        let timer: number | undefined;
        let last = '';
        // vega renders asynchronously and the host grows in more than one step,
        // so a size is only believed once it has stopped changing.
        const check = () => {
            if (done) return;
            const w = el.offsetWidth;
            const h = el.offsetHeight;
            if (w <= 0 || h <= 0) return;
            const seen = `${w}x${h}`;
            window.clearTimeout(timer);
            timer = window.setTimeout(() => {
                if (done || `${el.offsetWidth}x${el.offsetHeight}` !== seen) return;
                done = true;
                onMeasured(id, w, h);
            }, 120);
            last = seen;
        };
        const ro = new ResizeObserver(check);
        ro.observe(el);
        check();
        return () => { ro.disconnect(); window.clearTimeout(timer); void last; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, spec]);
    return (
        <div ref={ref} style={{ display: 'inline-block' }}>
            <VegaLiteView spec={spec} />
        </div>
    );
}
