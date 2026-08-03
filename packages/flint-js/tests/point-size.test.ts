// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite } from '../src';
import { THEME_PRESETS } from '../src/core/theme/presets';

/**
 * How big a dot is.
 *
 * A house's dot size is the size of a dot that has room. Crowd the plot and
 * the dots have to give ground, or a cloud of observations turns into one
 * solid field — but they may only give so much before a dot stops being a
 * dot, and they must not give ground for marks that were never drawn.
 */

const scatter = (n: number, house: string, extra: Record<string, unknown> = {}, groups = 6) => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const values = Array.from({ length: n }, (_, i) => ({
        Weight: 1 + rnd() * 3,
        Economy: 12 + rnd() * 30,
        Group: `G${i % groups}`,
    }));
    return assembleVegaLite({
        data: { values },
        semantic_types: { Weight: 'Quantity', Economy: 'Quantity', Group: 'Category' },
        chart_spec: {
            chartType: 'Scatter Plot',
            encodings: { x: { field: 'Weight' }, y: { field: 'Economy' }, ...extra },
        },
        theme_spec: THEME_PRESETS[house].spec,
    } as never) as never as { mark?: unknown; config?: Record<string, { size?: number }> };
};

const drawnSize = (spec: { mark?: unknown; config?: Record<string, { size?: number }> }) => {
    // A mark-level size beats the config block, so reading the config alone
    // can report a size that nothing is actually drawn at.
    const mark = (typeof spec.mark === 'string' ? { type: spec.mark } : spec.mark ?? {}) as { type?: string; size?: number };
    return mark.size ?? (mark.type ? spec.config?.[mark.type]?.size : undefined);
};

const declaredSize = (house: string) =>
    (THEME_PRESETS[house].spec as { marks?: { point?: { size?: number } } }).marks?.point?.size;

describe('point size', () => {
    it('every house says how big its dots are', () => {
        // Silence is not a style. A house that never names a size inherits
        // the renderer's own default, which is nobody's design decision, and
        // — because the crowding budget can only cut a size that exists —
        // it also opts out of ever giving ground when the plot fills up.
        for (const id of Object.keys(THEME_PRESETS)) {
            expect(declaredSize(id), `${id} declares no point size`).toBeGreaterThan(0);
        }
    });

    it('a sparse scatter draws the house size', () => {
        for (const id of ['economist', 'swiss', 'nyt', 'mckinsey']) {
            const drawn = drawnSize(scatter(30, id));
            expect(drawn, `${id} draws no size of its own`).toBeGreaterThan(0);
            expect(drawn, id).toBe(declaredSize(id));
        }
    });

    it('a crowded scatter gives ground, but never past the floor', () => {
        for (const id of ['economist', 'swiss', 'nyt', 'mckinsey']) {
            const dense = drawnSize(scatter(1500, id))!;
            expect(dense, `${id} did not shrink`).toBeLessThan(declaredSize(id)!);
            expect(dense, `${id} shrank past the floor`).toBeGreaterThanOrEqual(20);
        }
    });

    it('a facet budgets each panel against its own rows', () => {
        // Six panels draw a sixth of the table each. Charging one panel for
        // the whole table would shrink every dot to the floor to make room
        // for five panels' worth of marks that are not drawn there.
        const rows = 300;
        const panels = 3;
        const spec = scatter(rows, 'mckinsey', { column: { field: 'Group' } }, panels);
        const view = (spec.config as unknown as { view: { continuousWidth: number; continuousHeight: number } }).view;
        const budget = (share: number) => Math.floor((view.continuousWidth * view.continuousHeight * 0.12) / share);
        const perPanel = budget(rows / panels);
        // The dots are charged for the rows their own panel draws, not for
        // the whole table — which would be three times as harsh.
        expect(budget(rows)).toBeLessThan(perPanel);
        expect(drawnSize(spec)).toBe(Math.min(declaredSize('mckinsey')!, perPanel));
    });

    it('a chart that draws no dot cloud is not charged for the crowd', () => {
        // A line chart's dots are its vertices and a boxplot's are its
        // outliers — neither is one per row, so neither pays the crowd's
        // rent for rows it never drew. The same row count in a scatter,
        // where every row *is* a dot, does have to give ground.
        const rows = 900;
        const values = Array.from({ length: rows }, (_, i) => ({
            Month: `2024-${String((i % 12) + 1).padStart(2, '0')}-01`,
            Revenue: 100 + (i % 37),
            Series: `S${i % 3}`,
        }));
        const line = assembleVegaLite({
            data: { values },
            semantic_types: { Month: 'Time', Revenue: 'Quantity', Series: 'Category' },
            chart_spec: {
                chartType: 'Line Chart',
                encodings: { x: { field: 'Month' }, y: { field: 'Revenue' }, color: { field: 'Series' } },
            },
            theme_spec: THEME_PRESETS['mckinsey'].spec,
        } as never) as never as { config?: Record<string, { size?: number }> };
        expect(line.config?.circle?.size).toBe(declaredSize('mckinsey'));
        expect(drawnSize(scatter(rows, 'mckinsey'))).toBeLessThan(declaredSize('mckinsey')!);
    });
});
