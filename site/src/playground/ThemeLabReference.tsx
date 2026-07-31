// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Theme lab — reference examples.
 *
 * Hand-authored, faithful recreations of one signature chart per design house
 * (see `theme-lab-reference-data.ts`). These are the visual targets the house
 * ThemeSpecs are tuned towards; each card lists the design principles it is
 * meant to teach so the gap to Flint's compiled output can be read off
 * directly. Cards render lazily on scroll to keep the page responsive.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { VegaLiteView } from '../components/VegaLiteView';
import { siteTheme } from '../shared/theme';
import {
    REFERENCE_CASES,
    REFERENCE_HOUSE_ORDER,
    REFERENCE_HOUSE_LABEL,
    type ReferenceCase,
    type ReferenceHouse,
} from './theme-lab-reference-data';

function Pill({ children }: { children: ReactNode }) {
    return (
        <span
            style={{
                display: 'inline-block',
                fontSize: 11,
                lineHeight: 1.5,
                padding: '1px 8px',
                borderRadius: 999,
                background: siteTheme.bg,
                border: `1px solid ${siteTheme.border}`,
                color: siteTheme.textMuted,
            }}
        >
            {children}
        </span>
    );
}

function ReferenceCard({ c }: { c: ReferenceCase }) {
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

    const spec = useMemo(() => (visible ? c.spec : null), [visible, c]);

    return (
        <div
            ref={ref}
            style={{
                width: 400,
                flex: '0 0 400px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
            }}
        >
            <div style={{ fontSize: 13, fontWeight: 700, color: siteTheme.text }}>
                <code style={{ fontSize: 11, color: siteTheme.accent }}>{c.id}</code> · {c.title}
            </div>
            <div
                style={{
                    background: c.tile ?? siteTheme.surface,
                    border: `1px solid ${siteTheme.border}`,
                    borderRadius: 6,
                    overflow: 'hidden',
                }}
            >
                {c.tab ? (
                    <div style={{ height: 5, width: 42, background: c.tab, margin: '8px 0 0 10px' }} />
                ) : null}
                <div
                    style={{
                        minHeight: c.height,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 10,
                    }}
                >
                    {spec ? (
                        <VegaLiteView spec={spec} renderer="svg" />
                    ) : (
                        <span style={{ color: siteTheme.textMuted, fontSize: 12 }}>…</span>
                    )}
                </div>
            </div>
            <div style={{ fontSize: 11.5, color: siteTheme.textMuted, lineHeight: 1.5 }}>
                {c.sourceNote}
            </div>
            <ul style={{ margin: '2px 0 0', paddingLeft: 16, fontSize: 11.5, color: siteTheme.text, lineHeight: 1.5 }}>
                {c.principles.map((p) => (
                    <li key={p}>{p}</li>
                ))}
            </ul>
        </div>
    );
}

export function ThemeLabReference() {
    const [house, setHouse] = useState<ReferenceHouse | 'all'>('all');
    const cases =
        house === 'all' ? REFERENCE_CASES : REFERENCE_CASES.filter((c) => c.house === house);

    return (
        <div style={{ padding: '8px 4px 64px' }}>
            <div style={{ marginBottom: 12 }}>
                <h2 style={{ margin: '0 0 4px', fontSize: 18, color: siteTheme.text }}>
                    Theme lab · reference examples
                </h2>
                <p style={{ margin: 0, fontSize: 13, color: siteTheme.textMuted, maxWidth: 760 }}>
                    Hand-authored recreations of a signature chart from each house, faithful to its
                    published colour, type, gridline and aspect-ratio conventions. These are the
                    targets the house ThemeSpecs are tuned towards — read the gap against the R2 grid.
                </p>
            </div>

            <nav
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    marginBottom: 20,
                    position: 'sticky',
                    top: 0,
                    background: siteTheme.surface,
                    padding: '8px 0',
                    zIndex: 2,
                    borderBottom: `1px solid ${siteTheme.border}`,
                }}
            >
                {(['all', ...REFERENCE_HOUSE_ORDER] as const).map((h) => {
                    const active = h === house;
                    const label = h === 'all' ? 'All' : REFERENCE_HOUSE_LABEL[h];
                    return (
                        <button
                            key={h}
                            onClick={() => setHouse(h)}
                            style={{
                                fontSize: 12,
                                padding: '4px 10px',
                                borderRadius: 999,
                                cursor: 'pointer',
                                border: `1px solid ${active ? siteTheme.accent : siteTheme.border}`,
                                background: active ? siteTheme.accent : 'transparent',
                                color: active ? '#fff' : siteTheme.text,
                            }}
                        >
                            {label}
                        </button>
                    );
                })}
            </nav>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
                {cases.map((c) => (
                    <ReferenceCard key={c.id} c={c} />
                ))}
            </div>
        </div>
    );
}
