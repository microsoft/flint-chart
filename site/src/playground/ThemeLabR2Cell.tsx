// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * A single (case × column) cell of the round-2 theme grid. It compiles its
 * spec — Flint's default, or one house's ThemeSpec on top of it — the first
 * time it scrolls into view, so a page of 80-odd cases across seven columns
 * pays only for the panels a reader is actually looking at.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { THEME_PRESETS, assembleVegaLite } from 'flint-chart';
import { VegaLiteView } from '../components/VegaLiteView';
import { siteTheme } from '../shared/theme';
import { r2Input, type R2Case } from './theme-lab-r2-data';

export const R2_COLUMNS = ['flint', ...Object.keys(THEME_PRESETS)] as const;
export type R2Column = (typeof R2_COLUMNS)[number];

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

function compileCell(c: R2Case, column: R2Column): Compiled {
    try {
        const input = r2Input(c);
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

export function R2Cell({ c, column }: { c: R2Case; column: R2Column }) {
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
                minWidth: 0,
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
                    background: built?.background ?? siteTheme.surface,
                    border: `1px solid ${siteTheme.border}`,
                    borderRadius: 6,
                    minHeight: 300,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    padding: 4,
                }}
            >
                {!built ? (
                    <span style={{ color: siteTheme.textMuted, fontSize: 12 }}>…</span>
                ) : built.error ? (
                    <span style={{ color: '#b00020', fontSize: 11, padding: 8, textAlign: 'center' }}>
                        {built.error}
                    </span>
                ) : (
                    <VegaLiteView spec={built.spec} renderer="svg" />
                )}
            </div>
        </div>
    );
}
