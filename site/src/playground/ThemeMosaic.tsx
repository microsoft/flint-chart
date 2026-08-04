// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Theme mosaic — one wall, one house, twenty charts and a hero.
 *
 * The demo wall answers "does this case work?", one tile at a time. This page
 * answers a different question: what does a *house* look like when you see all
 * of it at once.
 *
 * That question is about style, not about any one chart, and the layout says
 * so. The tiles are packed to a hairline of the house's own paper, every chart
 * is laid out at exactly the size of its tile so the type is the same size in
 * all twenty, and whatever hangs off the tile is cropped rather than shrunk to
 * fit. A half-read legend is not a defect here: it is the wall showing a
 * typeface, a palette and a rule weight, which is what a reader is looking at.
 *
 * It is built to be screenshotted, which is why the switch is the only chrome.
 */

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BACKENDS } from '../shared/supported-backends';
import { VegaLiteView } from '../components/VegaLiteView';
import { ScaleToFit } from '../components/ScaleToFit';
import { siteTheme } from '../shared/theme';
import { ThemePicker } from './ThemePicker';
import { PREVIEW_CASES, type PreviewCase } from './new-case-preview-data';

/**
 * The hero is the chart a house has the most to say about: a bubble scatter
 * carries a palette, a size key, a log axis and a type scale all at once. It
 * is also the only tile with room for a deck, so it is where the house's full
 * type scale — headline against subhead — can actually be read.
 */
const HERO_ID = 'gapminder-bubble';

/**
 * Twenty cases, no two of them the same mark: line, connected scatter, band,
 * matrix, box, wedge, stem, slope, dumbbell, ribbon, bar, stacked area, rank,
 * radar, histogram, strip, diverging bar, waterfall, violin and stream. A
 * house that only knows how to style a bar chart has nowhere to hide.
 *
 * Every one is a Vega-Lite case. A Plotly fallback ignores `theme_spec`, and
 * one tile that refused to change with the switch would say something false
 * about the house.
 */
const RING_IDS = [
    'keeling', 'driving', 'us-pyramid', 'temp-heatmap', 'penguins-box', 'browser-pie',
    'co2-lollipop', 'life-expectancy', 'lifeexp-dumbbell', 'seattle-range',
    'big-mac', 'electricity-mix-area', 'olympic-bump', 'nutrition-radar',
    'faithful-hist', 'iris-strip', 'trust-likert', 'population-waterfall',
    'penguins-violin', 'population-stream',
];

const COLS = 6;
const ROWS = 4;

/**
 * Where each ring tile sits, with the middle four cells left for the hero. CSS
 * grid would flow them around it in a different order than they are listed, so
 * the positions are stated.
 */
const RING_CELLS: [row: number, col: number][] = [
    [1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6],
    [2, 1], [2, 2], [2, 5], [2, 6],
    [3, 1], [3, 2], [3, 5], [3, 6],
    [4, 1], [4, 2], [4, 3], [4, 4], [4, 5], [4, 6],
];

/** One cell is 3:2; the hero spans two of them each way, so it is 3:2 again. */
const TILE_ASPECT = 3 / 2;

/** The hairline of the house's own paper between two tiles. */
const GAP = 3;

/** Where the wall stops growing, so a wide screen does not stretch the type. */
const MAX_WALL = 1600;

/**
 * How far a chart may be scaled down to reduce what gets cropped. Type that
 * shrinks by a fifth on one tile and not on its neighbour reads as sloppiness
 * rather than as a house, so the range is narrow and the rest is cropping.
 */
const MIN_SCALE = 0.78;

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

function buildInput(
    c: PreviewCase,
    themeId: string | undefined,
    width: number,
    height: number,
    withDeck: boolean,
) {
    const { title, subtitle } = headAndDeck(c.title);
    return {
        data: { values: c.data },
        semantic_types: c.semantic_types,
        chart_spec: {
            chartType: c.chartType,
            encodings: c.encodings,
            baseSize: { width, height },
            title,
            ...(withDeck && subtitle ? { subtitle } : {}),
            ...(c.chartProperties ? { chartProperties: c.chartProperties } : {}),
        },
        ...(themeId ? { theme_spec: themeId } : {}),
    } as any;
}

function Tile({
    id,
    themeId,
    width,
    height,
    span = 1,
    cell,
}: {
    id: string;
    themeId: string | undefined;
    width: number;
    height: number;
    span?: number;
    cell?: [number, number];
}) {
    const compiled = useMemo(() => {
        const c = CASE_BY_ID.get(id);
        if (!c) return { ok: false as const, err: new Error(`no case "${id}"`) };
        try {
            return {
                ok: true as const,
                value: BACKENDS.vegalite.assemble(buildInput(c, themeId, width, height, span > 1)),
            };
        } catch (err) {
            return { ok: false as const, err };
        }
    }, [id, themeId, width, height, span]);

    return (
        <div
            style={{
                position: 'relative',
                minWidth: 0,
                aspectRatio: `${TILE_ASPECT}`,
                ...(cell
                    ? { gridRow: cell[0], gridColumn: cell[1] }
                    : {
                        gridRow: `${(ROWS - span) / 2 + 1} / span ${span}`,
                        gridColumn: `${(COLS - span) / 2 + 1} / span ${span}`,
                    }),
            }}
        >
            <ScaleToFit height={0} fill cover padding={0} minScale={MIN_SCALE}>
                {compiled.ok ? (
                    <VegaLiteView spec={compiled.value} />
                ) : (
                    <pre style={{ color: siteTheme.error, fontSize: 11, margin: 0, whiteSpace: 'pre-wrap' }}>
                        {String((compiled.err as Error)?.message ?? compiled.err)}
                    </pre>
                )}
            </ScaleToFit>
        </div>
    );
}

/**
 * The house paints its own canvas, so the paper between the tiles has to be
 * the same colour or every tile grows a visible rectangle. Reading it off an
 * assembled spec is more honest than keeping a second copy of the palette here.
 */
function useCanvasColour(themeId: string | undefined): string {
    return useMemo(() => {
        const c = CASE_BY_ID.get(HERO_ID);
        if (!c) return '#ffffff';
        try {
            const spec: any = BACKENDS.vegalite.assemble(buildInput(c, themeId, 300, 200, false));
            return spec?.config?.background ?? spec?.background ?? '#ffffff';
        } catch {
            return '#ffffff';
        }
    }, [themeId]);
}

/**
 * A tile laid out at 300px and then blown up to 380 has type a fifth larger
 * than its neighbour that happened to be laid out at 360. On a wall that reads
 * as sloppiness, so the cell width is measured and handed to the assembler,
 * and every chart is laid out at the size it will actually occupy.
 */
function useCellWidth(): [React.RefObject<HTMLDivElement>, number] {
    const ref = useRef<HTMLDivElement>(null);
    const [cell, setCell] = useState(260);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const measure = () => {
            const inner = el.clientWidth - GAP * 2 - GAP * (COLS - 1);
            const next = Math.max(160, Math.round(inner / COLS));
            setCell((prev) => (Math.abs(prev - next) > 2 ? next : prev));
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    return [ref, cell];
}

export function ThemeMosaic() {
    const [themeId, setThemeId] = useState<string | undefined>(undefined);
    const canvas = useCanvasColour(themeId);
    const [wallRef, cellW] = useCellWidth();
    const cellH = Math.round(cellW / TILE_ASPECT);

    return (
        <div className="dev-page" style={{ alignItems: 'stretch' }}>
            <div style={{ marginBottom: 12 }}>
                <ThemePicker themeId={themeId} onTheme={setThemeId} />
            </div>
            <div
                ref={wallRef}
                style={{
                    background: canvas,
                    padding: GAP,
                    display: 'grid',
                    gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))`,
                    gap: GAP,
                    width: `min(100%, ${MAX_WALL}px)`,
                }}
            >
                {RING_IDS.map((id, i) => (
                    <Tile
                        key={id}
                        id={id}
                        themeId={themeId}
                        width={cellW}
                        height={cellH}
                        cell={RING_CELLS[i]}
                    />
                ))}
                <Tile
                    id={HERO_ID}
                    themeId={themeId}
                    width={cellW * 2 + GAP}
                    height={cellH * 2 + GAP}
                    span={2}
                />
            </div>
        </div>
    );
}
