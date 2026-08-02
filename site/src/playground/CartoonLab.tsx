// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Cartoon lab — hand-authored Vega-Lite mockups of a playful "cartoon" look,
 * laid out as a simple chart grid for look-and-feel inspection. These are
 * manual reference specs (see cartoon-lab-data.ts), NOT theme-pipeline output;
 * they explore what actually reads as *fun* before we commit to a `cartoon`
 * ThemeSpec preset (a first pipeline attempt felt flat).
 */

import { siteTheme } from '../shared/theme';
import { VegaLiteView } from '../components/VegaLiteView';
import { CARTOON_CASES } from './cartoon-lab-data';

export function CartoonLab() {
    return (
        <div style={{ padding: '8px 4px 64px' }}>
            <div style={{ marginBottom: 20 }}>
                <h2 style={{ margin: '0 0 4px', fontSize: 18, color: siteTheme.text }}>
                    Cartoon lab · hand-authored mockups
                </h2>
                <p style={{ margin: 0, fontSize: 13, color: siteTheme.textMuted, maxWidth: 780 }}>
                    Manual Vega-Lite specs exploring a playful, xkcd-flavoured look — a rounded
                    comic face, a bright crayon palette on warm paper, fat dark "sticker" outlines
                    on rounded marks, big haloed dots, and emoji markers. These are a design target
                    for a future <code>cartoon</code> preset, not theme-pipeline output: the first
                    pipeline pass felt flat, so we're testing which levers actually make it fun
                    (and which — like emoji markers — the theme spec would need to grow).
                </p>
            </div>

            <div
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 24,
                    alignItems: 'flex-start',
                }}
            >
                {CARTOON_CASES.map((c) => (
                    <section
                        key={c.id}
                        style={{
                            width: 400,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                        }}
                    >
                        <div
                            style={{
                                border: `1px solid ${siteTheme.border}`,
                                background: '#ffffff',
                                padding: 12,
                                overflow: 'hidden',
                            }}
                        >
                            <VegaLiteView spec={c.spec} renderer="svg" />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: siteTheme.text }}>
                                {c.title}
                                <code style={{ fontSize: 11, color: siteTheme.accent, marginLeft: 8, fontWeight: 400 }}>
                                    {c.id}
                                </code>
                            </div>
                            <div style={{ fontSize: 12, color: siteTheme.textMuted }}>{c.note}</div>
                        </div>
                    </section>
                ))}
            </div>
        </div>
    );
}
