// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Theme lab — real data.
 *
 * The R2 page drives the houses with synthetic gallery generators (clean
 * cardinalities, tidy labels). This page drives them with the *real-world*
 * datasets in `new-case-preview-data.ts` (the r1 theme-lab set): real category
 * names, real distributions, negatives and long labels. It is the browser twin
 * of the `audit-out/real/` contact sheets (`scripts/theme-real.ts`).
 *
 * One row per case, eight columns: Flint's default plus every house. Only the
 * VL-supported cases are shown (Plotly-only cases have no ThemeSpec path). The
 * corpus is chunked into fixed-size pages so the DOM never holds more than a
 * handful of rows, and each cell compiles only when it scrolls into view.
 */

import { useState, type ReactNode } from 'react';
import { vlGetTemplateDef } from 'flint-chart';
import { siteTheme } from '../shared/theme';
import { PREVIEW_CASES, type PreviewCase } from './new-case-preview-data';
import { RealCell, REAL_COLUMNS } from './ThemeLabRealCell';

/** VL-supported real cases (Plotly-only cases have no ThemeSpec path). */
const REAL_CASES: PreviewCase[] = PREVIEW_CASES.filter((c) => vlGetTemplateDef(c.chartType));

const PAGE_SIZE = 6;
const PAGE_COUNT = Math.ceil(REAL_CASES.length / PAGE_SIZE);

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

function Row({ c }: { c: PreviewCase }) {
    return (
        <section style={{ marginBottom: 28 }}>
            <header style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: siteTheme.text }}>
                    <code style={{ fontSize: 12, color: siteTheme.accent }}>{c.id}</code> · {c.title}
                </div>
                {c.blurb ? (
                    <div style={{ fontSize: 12, color: siteTheme.textMuted, marginTop: 2 }}>{c.blurb}</div>
                ) : null}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    <Pill>{c.chartType}</Pill>
                    {c.source ? <Pill>src: {c.source}</Pill> : null}
                </div>
            </header>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingBottom: 10 }}>
                {REAL_COLUMNS.map((col) => (
                    <RealCell key={col} c={c} column={col} />
                ))}
            </div>
        </section>
    );
}

export function ThemeLabReal() {
    const [page, setPage] = useState(0);
    const start = page * PAGE_SIZE;
    const cases = REAL_CASES.slice(start, start + PAGE_SIZE);

    return (
        <div style={{ padding: '8px 4px 64px' }}>
            <div style={{ marginBottom: 12 }}>
                <h2 style={{ margin: '0 0 4px', fontSize: 18, color: siteTheme.text }}>
                    Theme lab · real data{' '}
                    <span style={{ fontSize: 13, fontWeight: 400, color: siteTheme.textMuted }}>
                        ({REAL_CASES.length} cases)
                    </span>
                </h2>
            </div>

            <nav
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
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
                {Array.from({ length: PAGE_COUNT }, (_, i) => {
                    const active = i === page;
                    const first = REAL_CASES[i * PAGE_SIZE];
                    return (
                        <button
                            key={i}
                            onClick={() => setPage(i)}
                            title={first?.id}
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
                            {i * PAGE_SIZE + 1}–{Math.min((i + 1) * PAGE_SIZE, REAL_CASES.length)}
                        </button>
                    );
                })}
            </nav>

            {cases.map((c) => (
                <Row key={c.id} c={c} />
            ))}
        </div>
    );
}
