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
 * The wall is a justified gallery, the construction a photo wall uses: each
 * chart is a picture with a shape of its own, a row takes as many pictures as
 * fit, and the row is set to the height that makes them meet both edges.
 * Nothing is cropped and nothing stops short of the edge.
 *
 * Two things follow from treating a chart as a picture. It is never reshaped —
 * a chart is made bigger or smaller, never taller without also being wider,
 * because a heatmap stretched to twice its height is a different chart. And
 * the sizing is done by changing the size the chart is *asked* for and letting
 * it lay itself out again, not by scaling a finished picture: a chart asked
 * for less room drops a gridline and tightens its ticks, where a shrunk
 * picture just has smaller type. Scaling is left to do what it is good for —
 * the last few percent that squares a row against the edge.
 *
 * Two walls of the same charts are not expected to match row for row. Houses
 * set type at different sizes and put their legends in different places, so
 * the rows break where that house's own shapes say they should, which is
 * itself something the wall is showing.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { BACKENDS } from '../shared/supported-backends';
import { VegaLiteView } from '../components/VegaLiteView';
import { siteTheme } from '../shared/theme';
import { ThemePicker } from './ThemePicker';
import { PREVIEW_CASES, type PreviewCase } from './new-case-preview-data';

/**
 * Twenty-one cases, no two of them the same mark: line, connected scatter,
 * band, matrix, box, wedge, stem, slope, dumbbell, ribbon, bar, stacked area,
 * rank, radar, histogram, strip, diverging bar, waterfall, violin, stream and
 * bubble. A house that only knows how to style a bar chart has nowhere to hide.
 *
 * Every one is a Vega-Lite case. A Plotly fallback ignores `theme_spec`, and
 * one tile that refused to change with the switch would say something false
 * about the house.
 */
const IDS = [
    'keeling', 'driving', 'us-pyramid', 'temp-heatmap', 'penguins-box',
    'browser-pie', 'co2-lollipop', 'life-expectancy', 'lifeexp-dumbbell', 'seattle-range',
    'big-mac', 'electricity-mix-area', 'olympic-bump', 'nutrition-radar', 'faithful-hist',
    'iris-strip', 'trust-likert', 'population-waterfall', 'penguins-violin', 'population-stream',
    'gapminder-bubble',
];

/** The hairline of the house's own paper between two tiles. */
const GAP = 4;

/** Where the wall stops growing, so a wide screen does not stretch the type. */
const MAX_WALL = 1600;

/** A row is about a seventh of the wall, which puts four or five charts in it. */
const ROW_RATIO = 230 / 1600;

/** The shape a chart is asked for before it is sized; it answers with its own. */
const ASK_W = 320;
const ASK_H = 210;

/**
 * How far a row may be scaled off the nominal height to justify it. This is
 * the last few percent only — the sizing proper is done by asking the chart
 * for a different size, not by scaling the result.
 */
const S_MIN = 0.82;
const S_MAX = 1.18;

/** Rounds of ask-and-measure before a chart is taken as settled. */
const MAX_PASSES = 6;

const CASE_BY_ID = new Map(PREVIEW_CASES.map((c) => [c.id, c]));

/**
 * A gallery title is written to be read on its own — "Life expectancy gap,
 * male vs female (2021)" — and at a tile's width that is three lines of
 * headline over a plot with no room left. But it is already two things: a
 * subject, and the qualification that pins it down, so the title is cut where
 * it already breaks rather than a second set of short titles being invented
 * alongside the real ones.
 */
function shortTitle(title: string): string {
    const split = title.match(/^(.*?)\s+—\s+(.*)$/) ?? title.match(/^([^,]{6,}?),\s+(.*)$/);
    return split ? split[1] : title;
}

function buildInput(c: PreviewCase, themeId: string | undefined, w: number, h: number) {
    return {
        data: { values: c.data },
        semantic_types: c.semantic_types,
        chart_spec: {
            chartType: c.chartType,
            encodings: c.encodings,
            baseSize: { width: Math.round(w), height: Math.round(h) },
            title: shortTitle(c.title),
            ...(c.chartProperties ? { chartProperties: c.chartProperties } : {}),
        },
        ...(themeId ? { theme_spec: themeId } : {}),
    } as any;
}

/**
 * A heading is drawn inside the chart, so a chart narrower than its own title
 * loses the end of it. The title is measured in the house's own face and used
 * as a floor on how narrow the chart may be.
 */
let textCtx: CanvasRenderingContext2D | null | undefined;
function titleWidth(spec: any, text: string): number {
    if (textCtx === undefined) textCtx = document.createElement('canvas').getContext('2d');
    const t = spec?.config?.title ?? {};
    const size = t.fontSize ?? 13;
    if (!textCtx) return text.length * size * 0.55;
    textCtx.font = `${t.fontWeight ?? 'bold'} ${size}px ${t.font ?? spec?.config?.font ?? 'sans-serif'}`;
    return textCtx.measureText(text).width;
}

type Ask = { t: number; extra: number };
type Shot = { id: string; spec: any; w: number; h: number };

/** A row of pictures, and the height at which they meet both edges. */
type Band = { items: Shot[]; h: number };

/**
 * Cut the pictures into `rows` rows, choosing the cuts so that no row has to be
 * set far off the nominal height and no picture in it has to be scaled far off
 * its own size.
 *
 * A row of pictures at a common height `H` is `H × Σaspect` wide, so the height
 * that justifies a row follows from which pictures are in it. That is the whole
 * layout: pick the cuts, and the heights fall out.
 */
function partition(items: Shot[], width: number, rows: number, nominal: number): Band[] {
    const n = items.length;
    const aspect = items.map((it) => it.w / it.h);
    const heightOf = (i: number, j: number) =>
        (width - GAP * (j - i - 1)) / aspect.slice(i, j).reduce((a, b) => a + b, 0);
    const cost = (i: number, j: number) => {
        const h = heightOf(i, j);
        let worst = 1;
        for (let k = i; k < j; k++) worst = Math.max(worst, Math.max(h / items[k].h, items[k].h / h));
        const off = h / nominal;
        // a row that cannot be justified without over-scaling a picture is not
        // merely worse than its neighbours, it is wrong
        return (off - 1) ** 2 + (worst - 1) ** 2 * (worst > S_MAX ? 60 : 1);
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
    const out: Shot[][] = [];
    let j = n;
    for (let r = rows; r >= 1; r--) { const i = cut[r][j]; out.unshift(items.slice(i, j)); j = i; }
    return out.map((row) => {
        const i0 = items.indexOf(row[0]);
        return { items: row, h: heightOf(i0, i0 + row.length) };
    });
}

function useWallWidth(): [React.RefObject<HTMLDivElement>, number] {
    const ref = useRef<HTMLDivElement>(null);
    const [w, setW] = useState(MAX_WALL);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const measure = () => {
            const next = Math.min(MAX_WALL, Math.round(el.clientWidth - GAP * 2));
            setW((prev) => (Math.abs(prev - next) > 8 ? next : prev));
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
    const rowH = Math.max(160, Math.min(260, Math.round(wallW * ROW_RATIO)));

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
 * Remounted per house, because the previous house's sizes are the wrong place
 * to start and a half-corrected ask would show as a row that misses the edge.
 */
function Wall({ themeId, wallW, rowH }: { themeId: string | undefined; wallW: number; rowH: number }) {
    const [ask, setAsk] = useState<Record<string, Ask>>(() =>
        Object.fromEntries(IDS.map((id) => [id, { t: 1, extra: 0 }])));
    const [pass, setPass] = useState<Record<string, number>>({});
    const [shot, setShot] = useState<Record<string, Shot>>({});

    const specs = useMemo(() => {
        const out: Record<string, any> = {};
        for (const id of IDS) {
            if (shot[id]) continue;
            const c = CASE_BY_ID.get(id);
            if (!c) continue;
            const a = ask[id];
            try {
                out[id] = BACKENDS.vegalite.assemble(buildInput(c, themeId, ASK_W * a.t + a.extra, ASK_H * a.t));
            } catch { /* a case that will not assemble simply does not join the wall */ }
        }
        return out;
    }, [themeId, ask, shot]);

    const onMeasured = (id: string, w: number, h: number) => {
        const spec = specs[id];
        if (!spec || shot[id]) return;
        const c = CASE_BY_ID.get(id)!;
        const a = ask[id];
        const n = pass[id] ?? 0;
        const factor = rowH / h;
        const need = Math.ceil(titleWidth(spec, shortTitle(c.title))) + 12;
        const short = Math.max(0, need - w);
        if ((Math.abs(1 - factor) < 0.02 && short === 0) || n >= MAX_PASSES) {
            setShot((p) => ({ ...p, [id]: { id, spec, w, h } }));
            return;
        }
        setPass((p) => ({ ...p, [id]: n + 1 }));
        setAsk((p) => ({
            ...p,
            // the chart is asked to be bigger or smaller, never taller alone;
            // the one thing given back on its own is width the title needs
            [id]: Math.abs(1 - factor) >= 0.02
                ? { t: Math.max(0.25, Math.min(4, p[id].t * factor)), extra: p[id].extra }
                : { t: p[id].t, extra: p[id].extra + short * 1.6 },
        }));
    };

    const ready = IDS.every((id) => shot[id] || !specs[id]);
    const canvas = (Object.values(shot)[0]?.spec ?? Object.values(specs)[0])?.config?.background ?? '#ffffff';

    const bands = useMemo(() => {
        if (!ready) return null;
        const items = IDS.map((id) => shot[id]).filter(Boolean);
        if (!items.length) return [];
        const rows = Math.max(1, Math.round(items.reduce((a, b) => a + b.w, 0) / wallW));
        return partition(items, wallW, rows, rowH);
    }, [ready, shot, wallW, rowH]);

    return (
        <>
            {/* offscreen, where each chart is asked for a size until it answers with the right one */}
            <div style={{ position: 'fixed', left: -20000, top: 0, visibility: 'hidden' }} aria-hidden>
                {IDS.filter((id) => specs[id]).map((id) => (
                    <Measure key={`${id}:${pass[id] ?? 0}`} id={id} spec={specs[id]} onMeasured={onMeasured} />
                ))}
            </div>
            {!bands ? (
                <div style={{ color: siteTheme.textMuted, fontSize: 13, padding: '24px 0' }}>
                    Sizing {IDS.length - Object.keys(shot).length} more charts…
                </div>
            ) : (
                <div style={{ background: canvas, padding: GAP, display: 'flex', flexDirection: 'column', gap: GAP, width: wallW + GAP * 2 }}>
                    {bands.map((b, i) => (
                        <div key={i} style={{ display: 'flex', gap: GAP, height: b.h }}>
                            {b.items.map((it) => (
                                <Tile key={it.id} item={it} k={Math.max(S_MIN, Math.min(S_MAX, b.h / it.h))} />
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </>
    );
}

/** One chart, set to the height its row settled on. The scale is uniform: a picture keeps its shape. */
function Tile({ item, k }: { item: Shot; k: number }) {
    return (
        <div style={{ width: item.w * k, height: item.h * k, flex: '0 0 auto', overflow: 'hidden' }}>
            <div style={{ transform: `scale(${k})`, transformOrigin: 'top left', width: item.w, height: item.h }}>
                <VegaLiteView spec={item.spec} />
            </div>
        </div>
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
        // vega renders asynchronously and the host grows in more than one step,
        // so a size is only believed once it has stopped changing
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
        };
        const ro = new ResizeObserver(check);
        ro.observe(el);
        check();
        return () => { ro.disconnect(); window.clearTimeout(timer); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, spec]);
    return (
        <div ref={ref} style={{ display: 'inline-block' }}>
            <VegaLiteView spec={spec} />
        </div>
    );
}
