// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * A single (case × column) cell of the theme lab grid. It compiles its spec —
 * Flint's default, or one house's ThemeSpec on top of it — the first time it
 * scrolls into view, so a page of cases across every house pays only for the
 * panels a reader is actually looking at.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { THEME_PRESETS, assembleVegaLite, assemblePlotly, type ChartAssemblyInput } from 'flint-chart';
import { FlintView } from '../components/FlintView';
import { ScaleToFit } from '../components/ScaleToFit';
import { siteTheme } from '../shared/theme';

/** Which assembler a column is drawn with. Both read the same ThemeSpec. */
export type LabBackend = 'vegalite' | 'plotly';

export const LAB_COLUMNS = ['flint', ...Object.keys(THEME_PRESETS)] as const;
export type LabColumn = (typeof LAB_COLUMNS)[number];

/** Tile geometry — fixed so a chart is never flex-shrunk below legibility. */
const TILE_WIDTH = 320;
const TILE_HEIGHT = 320;

interface Compiled {
    input?: ChartAssemblyInput;
    background: string;
    error?: string;
    reportCount: number;
}

/** Compiled here only for the tile's paper colour and report count; the chart compiles itself. */
function compileCell(base: ChartAssemblyInput, column: LabColumn, backend: LabBackend): Compiled {
    try {
        const themeId = column === 'flint' ? null : column;
        const input = themeId
            ? { ...base, theme_spec: (THEME_PRESETS as any)[themeId].spec }
            : base;

        if (backend === 'plotly') {
            const figure = assemblePlotly(input as any) as any;
            const reportCount = figure._theme?.report?.length ?? 0;
            const background = typeof figure.layout?.paper_bgcolor === 'string'
                ? figure.layout.paper_bgcolor
                : '#ffffff';
            return { input, background, reportCount };
        }

        const spec = assembleVegaLite(input as any) as any;
        const reportCount = spec._theme?.report?.length ?? 0;
        const background = typeof spec.background === 'string' ? spec.background : '#ffffff';
        return { input, background, reportCount };
    } catch (err) {
        return { background: '#ffe8e8', error: (err as Error).message, reportCount: 0 };
    }
}

export function LabCell({
    input,
    column,
    backend = 'vegalite',
    onRef,
}: {
    /** The case's assembly input without a theme. */
    input: ChartAssemblyInput;
    column: LabColumn;
    backend?: LabBackend;
    /** Set when a hand-made redesign exists for this case and house: opens it. */
    onRef?: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setVisible(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '300px' },
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const built = useMemo(
        () => (visible ? compileCell(input, column, backend) : null),
        [visible, input, column, backend],
    );

    return (
        <div
            ref={ref}
            style={{
                width: TILE_WIDTH,
                flex: `0 0 ${TILE_WIDTH}px`,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
            }}
        >
            <div
                style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: siteTheme.textMuted,
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 6,
                }}
            >
                <span>
                    {column}
                    {onRef ? (
                        <button
                            type="button"
                            onClick={onRef}
                            title="Open the hand-made redesign"
                            style={{
                                marginLeft: 6,
                                padding: '0 6px',
                                fontSize: 10,
                                fontWeight: 600,
                                border: `1px solid ${siteTheme.accent}`,
                                borderRadius: 999,
                                background: siteTheme.accentBg,
                                color: siteTheme.accent,
                                cursor: 'pointer',
                            }}
                        >
                            ref
                        </button>
                    ) : null}
                </span>
                {built && !built.error ? (
                    <span style={{ fontWeight: 400, opacity: 0.6 }}>{built.reportCount} notes</span>
                ) : null}
            </div>
            <div
                style={{
                    position: 'relative',
                    height: TILE_HEIGHT,
                    background: built?.background ?? siteTheme.surface,
                    border: `1px solid ${siteTheme.border}`,
                    borderRadius: 6,
                    overflow: 'hidden',
                }}
            >
                {!built ? (
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: siteTheme.textMuted,
                            fontSize: 12,
                        }}
                    >
                        …
                    </div>
                ) : built.error ? (
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#b00020',
                            fontSize: 11,
                            padding: 8,
                            textAlign: 'center',
                        }}
                    >
                        {built.error}
                    </div>
                ) : (
                    <ScaleToFit fill padding={6} height={TILE_HEIGHT}>
                        <FlintView spec={built.input!} backend={backend} renderer="svg" compact />
                    </ScaleToFit>
                )}
            </div>
        </div>
    );
}
