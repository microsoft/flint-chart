// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * A single (real-dataset case × column) cell of the real-data theme grid. Same
 * lazy-compile discipline as `ThemeLabR2Cell`: it assembles its spec — Flint's
 * default, or one house's ThemeSpec on top — only the first time it scrolls
 * into view, so a page of real-world cases across eight columns pays only for
 * the panels a reader is actually looking at.
 *
 * The input mirrors `scripts/theme-real.ts` `inputFor` (and `ThemeLab.tsx`), so
 * a cell here shows exactly what the `audit-out/real/` contact sheets show.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { THEME_PRESETS, assembleVegaLite } from 'flint-chart';
import { VegaLiteView } from '../components/VegaLiteView';
import { ScaleToFit } from '../components/ScaleToFit';
import { siteTheme } from '../shared/theme';
import type { PreviewCase } from './new-case-preview-data';

export const REAL_COLUMNS = ['flint', ...Object.keys(THEME_PRESETS)] as const;
export type RealColumn = (typeof REAL_COLUMNS)[number];

/** Tile geometry — fixed so a chart is never flex-shrunk below legibility. */
export const REAL_TILE_WIDTH = 320;
const REAL_TILE_HEIGHT = 320;

/** Assembly input for a real case — mirrors `scripts/theme-real.ts` `inputFor`. */
export function realInput(c: PreviewCase): any {
    return {
        data: { values: c.data },
        semantic_types: c.semantic_types,
        chart_spec: {
            chartType: c.chartType,
            title: c.title,
            encodings: c.encodings,
            baseSize: { width: 300, height: 300 },
            ...(c.chartProperties ? { chartProperties: c.chartProperties } : {}),
        },
    };
}

function stripInternal(node: any): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(stripInternal);
    for (const key of Object.keys(node)) {
        if (/^_[^_]/.test(key)) delete node[key];
        else stripInternal(node[key]);
    }
}

interface Compiled {
    spec?: any;
    background: string;
    error?: string;
    reportCount: number;
}

function compileCell(c: PreviewCase, column: RealColumn): Compiled {
    try {
        const input = realInput(c);
        const themeId = column === 'flint' ? null : column;
        const spec = assembleVegaLite(
            themeId ? { ...input, theme_spec: (THEME_PRESETS as any)[themeId].spec } : input,
        ) as any;
        const reportCount = spec._theme?.report?.length ?? 0;
        const background = typeof spec.background === 'string' ? spec.background : '#ffffff';
        stripInternal(spec);
        delete spec.$schema;
        return { spec, background, reportCount };
    } catch (err) {
        return { background: '#ffe8e8', error: (err as Error).message, reportCount: 0 };
    }
}

export function RealCell({ c, column }: { c: PreviewCase; column: RealColumn }) {
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

    const built = useMemo(() => (visible ? compileCell(c, column) : null), [visible, c, column]);

    return (
        <div
            ref={ref}
            style={{
                width: REAL_TILE_WIDTH,
                flex: `0 0 ${REAL_TILE_WIDTH}px`,
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
                <span>{column}</span>
                {built && !built.error ? (
                    <span style={{ fontWeight: 400, opacity: 0.6 }}>{built.reportCount} notes</span>
                ) : null}
            </div>
            <div
                style={{
                    position: 'relative',
                    height: REAL_TILE_HEIGHT,
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
                    <ScaleToFit fill padding={6} height={REAL_TILE_HEIGHT}>
                        <VegaLiteView spec={built.spec} renderer="svg" />
                    </ScaleToFit>
                )}
            </div>
        </div>
    );
}
