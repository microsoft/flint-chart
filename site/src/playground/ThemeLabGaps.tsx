// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Theme lab — round 2 gaps.
 *
 * Cases the coverage round found too particular to generalise from: a fix that
 * only helped one of them would be a hack, not a fix (doc 05 §3). They are
 * parked here with the reason they resist a general rule, so a human can decide
 * whether the schema should grow to meet them. Empty until the round finds one.
 */

import { siteTheme } from '../shared/theme';
import { R2_CASES } from './theme-lab-r2-data';
import { GAP_NOTES } from './theme-lab-gaps-data';
import { R2Cell, R2_COLUMNS } from './ThemeLabR2Cell';

export function ThemeLabGaps() {
    return (
        <div style={{ padding: '8px 4px 64px' }}>
            <div style={{ marginBottom: 20 }}>
                <h2 style={{ margin: '0 0 4px', fontSize: 18, color: siteTheme.text }}>
                    Theme lab · round 2 gaps
                </h2>
                <p style={{ margin: 0, fontSize: 13, color: siteTheme.textMuted, maxWidth: 720 }}>
                    Cases parked for inspection — too particular for a general rule to reach without
                    becoming a per-chart hack. Each carries the reason it resists.
                </p>
            </div>

            {GAP_NOTES.length === 0 ? (
                <p style={{ fontSize: 13, color: siteTheme.textMuted }}>
                    No gaps parked yet.
                </p>
            ) : (
                GAP_NOTES.map((g, i) => {
                    const c = R2_CASES.find((x) => x.id === g.id);
                    const columns = g.theme ? (['flint', g.theme] as const) : R2_COLUMNS;
                    return (
                        <section key={`${g.id}-${i}`} style={{ marginBottom: 32 }}>
                            <header style={{ marginBottom: 8 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: siteTheme.text }}>
                                    <code style={{ fontSize: 12, color: siteTheme.accent }}>{g.id}</code>
                                    {g.theme ? <span> · {g.theme}</span> : null}
                                    {c ? <span style={{ fontWeight: 400 }}> — {c.title}</span> : null}
                                </div>
                                <div style={{ fontSize: 12, color: '#b26a00', marginTop: 2 }}>{g.note}</div>
                            </header>
                            {c ? (
                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
                                        gap: 8,
                                        maxWidth: columns.length === 2 ? 640 : undefined,
                                    }}
                                >
                                    {columns.map((col) => (
                                        <R2Cell key={col} c={c} column={col as any} />
                                    ))}
                                </div>
                            ) : (
                                <p style={{ fontSize: 12, color: '#b00020' }}>unknown case `{g.id}`</p>
                            )}
                        </section>
                    );
                })
            )}
        </div>
    );
}
