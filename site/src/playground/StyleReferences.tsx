// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Style references — the hand-authored look-and-feel targets, on one page.
 *
 * Every reference is the same thing seen from a different house: a grid of
 * manual Vega-Lite mockups a preset is judged against by eye. That made two
 * near-identical pages, so there is now one, and adding a house is a matter of
 * adding it to the registry in `style-references.ts`.
 *
 * The house is in the URL rather than in state alone, so a reference can be
 * linked to — which is what these pages are for.
 */

import { NavLink, useParams } from 'react-router-dom';
import { siteTheme } from '../shared/theme';
import { VegaLiteView } from '../components/VegaLiteView';
import { STYLE_REFERENCES, findStyleReference } from './style-references';

export function StyleReferences() {
    const { house } = useParams<{ house?: string }>();
    const reference = findStyleReference(house);

    return (
        <div style={{ padding: '8px 4px 64px' }}>
            <div style={{ marginBottom: 20 }}>
                <h2 style={{ margin: '0 0 8px', fontSize: 18, color: siteTheme.text }}>
                    Style references · hand-authored mockups
                </h2>

                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    {STYLE_REFERENCES.map((r) => (
                        <NavLink
                            key={r.id}
                            to={`../style-references/${r.id}`}
                            style={({ isActive }) => ({
                                padding: '4px 12px',
                                fontSize: 13,
                                fontWeight: 600,
                                textDecoration: 'none',
                                border: `1px solid ${isActive ? siteTheme.accent : siteTheme.border}`,
                                color: isActive ? siteTheme.accent : siteTheme.textMuted,
                                background: isActive ? `${siteTheme.accent}14` : 'transparent',
                            })}
                        >
                            {r.label}
                        </NavLink>
                    ))}
                </div>

                <p style={{ margin: '0 0 4px', fontSize: 13, color: siteTheme.textMuted, maxWidth: 780 }}>
                    {reference.blurb}
                </p>
                <p style={{ margin: 0, fontSize: 12, color: siteTheme.textMuted, maxWidth: 780 }}>
                    These are manual specs, <strong>not</strong> theme-pipeline output. Refs: {reference.refs}
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
                {reference.cases.map((c) => (
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
