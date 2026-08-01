// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Swiss lab — hand-authored Vega-Lite mockups of the International Typographic
 * Style, laid out as a simple chart grid for look-and-feel inspection. These
 * are manual reference specs (see swiss-lab-data.ts), NOT theme-pipeline output;
 * they establish the target a future "swiss" ThemeSpec preset should reproduce.
 */

import { siteTheme } from '../shared/theme';
import { VegaLiteView } from '../components/VegaLiteView';
import { SWISS_CASES } from './swiss-lab-data';

export function SwissLab() {
    return (
        <div style={{ padding: '8px 4px 64px' }}>
            <div style={{ marginBottom: 20 }}>
                <h2 style={{ margin: '0 0 4px', fontSize: 18, color: siteTheme.text }}>
                    Swiss lab · hand-authored mockups
                </h2>
                <p style={{ margin: 0, fontSize: 13, color: siteTheme.textMuted, maxWidth: 760 }}>
                    Manual Vega-Lite specs in the International Typographic Style — visible modular
                    grid, flush-left Helvetica title, warm paper + signal-red accent, hard corners.
                    These are a design target for a future <code>swiss</code> preset, not
                    theme-pipeline output. Refs: swissted.com · Poster House "The Swiss Grid" ·
                    Müller-Brockmann · Vignelli subway map · Aicher '72 palette.
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
                {SWISS_CASES.map((c) => (
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
