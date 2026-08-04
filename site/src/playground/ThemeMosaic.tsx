// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Theme mosaic — one wall, one house, twelve charts and a hero.
 *
 * The demo wall answers "does this case work?", one tile at a time. This page
 * answers a different question: what does a *house* look like when you see all
 * of it at once. So the tiles carry no titles and no captions — the point is
 * the ink, and a caption under every tile would make the wall a list. The
 * cases are real ones from the demo wall, chosen so no two tiles share a mark
 * family, and the wall takes the house's own canvas colour so it reads as a
 * single printed page rather than twelve cards.
 *
 * It is built to be screenshotted, which is why the switch is the only chrome.
 */

import { useMemo, useState } from 'react';
import { BACKENDS } from '../shared/supported-backends';
import { VegaLiteView } from '../components/VegaLiteView';
import { ScaleToFit } from '../components/ScaleToFit';
import { siteTheme } from '../shared/theme';
import { ThemePicker } from './ThemePicker';
import { PREVIEW_CASES, type PreviewCase } from './new-case-preview-data';

/**
 * The hero is the chart a house has the most to say about: a bubble scatter
 * carries a palette, a size key, a log axis and a type scale all at once.
 */
const HERO_ID = 'gapminder-bubble';

/**
 * Twelve cases, no two of them the same mark. Read left to right and top to
 * bottom around the hero, the ring runs line, band, matrix, box, wedge, stem,
 * dumbbell, ribbon, bar, stacked area, rank and radar — so a house that only
 * knows how to style a bar chart has nowhere to hide.
 *
 * Every one of these is a Vega-Lite case. A Plotly fallback ignores
 * `theme_spec`, and one tile that refused to change with the switch would say
 * something false about the house.
 */
const RING_IDS = [
    'keeling',
    'us-pyramid',
    'temp-heatmap',
    'penguins-box',
    'browser-pie',
    'co2-lollipop',
    'lifeexp-dumbbell',
    'seattle-range',
    'big-mac',
    'electricity-mix-area',
    'olympic-bump',
    'nutrition-radar',
];

/**
 * Where each ring tile sits in a 4x4 grid whose middle four cells are the
 * hero. CSS grid auto-placement would flow them around the hero in a different
 * order than they are listed, so the positions are stated.
 */
const RING_CELLS: [row: number, col: number][] = [
    [1, 1], [1, 2], [1, 3], [1, 4],
    [2, 1], [2, 4],
    [3, 1], [3, 4],
    [4, 1], [4, 2], [4, 3], [4, 4],
];

const CASE_BY_ID = new Map(PREVIEW_CASES.map((c) => [c.id, c]));

function buildInput(c: PreviewCase, themeId: string | undefined, width: number, height: number) {
    return {
        data: { values: c.data },
        semantic_types: c.semantic_types,
        chart_spec: {
            chartType: c.chartType,
            encodings: c.encodings,
            baseSize: { width, height },
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
    box,
    cell,
}: {
    id: string;
    themeId: string | undefined;
    width: number;
    height: number;
    box: number;
    cell?: [number, number];
}) {
    const compiled = useMemo(() => {
        const c = CASE_BY_ID.get(id);
        if (!c) return { ok: false as const, err: new Error(`no case "${id}"`) };
        try {
            return { ok: true as const, value: BACKENDS.vegalite.assemble(buildInput(c, themeId, width, height)) };
        } catch (err) {
            return { ok: false as const, err };
        }
    }, [id, themeId, width, height]);

    return (
        <div
            style={{
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                ...(cell ? { gridRow: cell[0], gridColumn: cell[1] } : { gridRow: '2 / 4', gridColumn: '2 / 4' }),
            }}
        >
            <ScaleToFit height={box} padding={4}>
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
 * The house paints its own canvas, so the wall behind the tiles has to be the
 * same colour or every tile grows a visible rectangle. Reading it off an
 * assembled spec is more honest than keeping a second copy of the palette here.
 */
function useCanvasColour(themeId: string | undefined): string {
    return useMemo(() => {
        const c = CASE_BY_ID.get(HERO_ID);
        if (!c) return '#ffffff';
        try {
            const spec: any = BACKENDS.vegalite.assemble(buildInput(c, themeId, 300, 200));
            return spec?.config?.background ?? spec?.background ?? '#ffffff';
        } catch {
            return '#ffffff';
        }
    }, [themeId]);
}

export function ThemeMosaic() {
    const [themeId, setThemeId] = useState<string | undefined>(undefined);
    const canvas = useCanvasColour(themeId);

    return (
        <div className="dev-page" style={{ alignItems: 'stretch' }}>
            <div style={{ marginBottom: 12 }}>
                <ThemePicker themeId={themeId} onTheme={setThemeId} />
            </div>
            <div
                style={{
                    background: canvas,
                    padding: 24,
                    borderRadius: 12,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                    gridTemplateRows: 'repeat(4, auto)',
                    gap: 16,
                    width: 'min(100%, 1600px)',
                    alignItems: 'center',
                }}
            >
                {RING_IDS.map((id, i) => (
                    <Tile
                        key={id}
                        id={id}
                        themeId={themeId}
                        width={300}
                        height={200}
                        box={190}
                        cell={RING_CELLS[i]}
                    />
                ))}
                <Tile id={HERO_ID} themeId={themeId} width={620} height={420} box={396} />
            </div>
        </div>
    );
}
