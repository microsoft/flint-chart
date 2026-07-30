// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Theme lab — round 2 (coverage).
 *
 * One row per gallery case, seven columns: Flint's default plus every house.
 * There is no hand-authored column here — at this corpus size there cannot be
 * (doc 05). The page is an inspection surface: does the compiler produce
 * anything broken, illegible or absurd on a chart nobody tuned it against, and
 * is the house still recognisable.
 *
 * Cases are paged by family so the DOM never holds more than one family at a
 * time, and each cell compiles only when it scrolls into view.
 */

import { useState } from 'react';
import { siteTheme } from '../shared/theme';
import {
    R2_CASES,
    R2_FAMILY_ORDER,
    type R2Case,
    type R2Family,
} from './theme-lab-r2-data';
import { R2Cell, R2_COLUMNS } from './ThemeLabR2Cell';

function byFamily(family: R2Family): R2Case[] {
    return R2_CASES.filter((c) => c.family === family);
}

function Row({ c }: { c: R2Case }) {
    return (
        <section style={{ marginBottom: 28 }}>
            <header style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: siteTheme.text }}>
                    <code style={{ fontSize: 12, color: siteTheme.accent }}>{c.id}</code> · {c.title}
                    {c.subtitle ? (
                        <span style={{ fontWeight: 400, color: siteTheme.textMuted }}> — {c.subtitle}</span>
                    ) : null}
                </div>
                <div style={{ fontSize: 12, color: siteTheme.textMuted, marginTop: 2 }}>
                    {c.gen} · probe: {c.probe}
                </div>
            </header>
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${R2_COLUMNS.length}, minmax(0, 1fr))`,
                    gap: 8,
                }}
            >
                {R2_COLUMNS.map((col) => (
                    <R2Cell key={col} c={c} column={col} />
                ))}
            </div>
        </section>
    );
}

export function ThemeLabR2() {
    const [family, setFamily] = useState<R2Family>(R2_FAMILY_ORDER[0]);
    const cases = byFamily(family);

    return (
        <div style={{ padding: '8px 4px 64px' }}>
            <div style={{ marginBottom: 12 }}>
                <h2 style={{ margin: '0 0 4px', fontSize: 18, color: siteTheme.text }}>
                    Theme lab · round 2 (coverage)
                </h2>
                <p style={{ margin: 0, fontSize: 13, color: siteTheme.textMuted, maxWidth: 720 }}>
                    Gallery cases the compiler was never tuned against, each read as all six houses.
                    Held-out criterion: nothing broken, illegible or absurd, and the house present.
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
                {R2_FAMILY_ORDER.map((f) => {
                    const active = f === family;
                    return (
                        <button
                            key={f}
                            onClick={() => setFamily(f)}
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
                            {f} ({byFamily(f).length})
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
