// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ChartTemplateDef } from '../../core/types';
import {
    fieldsFromEncodingChannels,
    firstDiscreteEncodingField,
    resolveSeriesTarget,
} from '../../core/interaction-semantics';
import {
    annotationCandidates,
    comparisonAnnotationText,
    presentAnnotationUpdate,
} from '../../interactive/presentation/annotation';
import { INTERACTION_ROLE } from '../interactions/hit-adapter';

/**
 * Bullet chart — a compact KPI panel: one row per label, each showing a measure
 * bar compared against its own target, set against muted gray range bands.
 *
 * Channels:
 *   - y      label (the banded category axis — one row per KPI)
 *   - x      measured value (the bar, drawn from a zero baseline)
 *   - goal   target / comparative value (drawn as a tick across the bar)
 *   - color  optional explicit grouping for the value bar
 *
 * Following Stephen Few's design, each row carries graduated gray qualitative
 * bands whose breakpoints are derived from that row's own goal (a quarter, half
 * and three quarters of target), so the comparison is per bar rather than one
 * shared block. The 75%-100% target range is left as the white plot background
 * so the bar and target tick stay the focal elements. The value bar is colored
 * by goal attainment using an explicit muted red/green status palette; a dark
 * tick marks the exact target.
 *
 * Layout follows the candlestick pattern: the banded category channel (y) lives
 * at the top level so every layer — bands, bar and tick — aligns to the same
 * rows, while each layer supplies its own value on x.
 */

// Muted grays for the qualitative zones, darkest nearest zero (poorest range).
const ZONE_GRAYS = ['#e2e2e2', '#ececec', '#f5f5f5'];
// Goal-attainment colors: muted red for under target, muted green for met target.
const STATUS_COLORS = { below: '#c44e52', met: '#2f855a' };
const STATUS_BELOW = 'Below target';
const STATUS_MET = 'Meets target';

export const bulletChartDef: ChartTemplateDef = {
    chart: "Bullet Chart",
    template: {
        encoding: {},
        layer: [],
    },
    channels: ["y", "x", "goal", "color", "column", "row"],
    markCognitiveChannel: 'length',
    semanticInteractions: ({ resolvedEncodings }) => {
        const categoryField = resolvedEncodings.y?.field;
        const seriesField = firstDiscreteEncodingField(resolvedEncodings, ['color']);
        const colorField = resolvedEncodings.color?.field;
        const actualField = resolvedEncodings.x?.field;
        const expectedField = resolvedEncodings.goal?.field;
        const statusField = !colorField && actualField && expectedField ? '__status' : undefined;
        return {
            fields: fieldsFromEncodingChannels(resolvedEncodings, ['y', 'x', 'goal', 'color', 'column', 'row']),
            categoryField,
            seriesField,
            legendFields: colorField || statusField ? { color: colorField ?? statusField! } : undefined,
            selectableMarks: ['bar', 'tick'],
            renderHoverStyles: {
                // Vega compiles a Vega-Lite bar to a rect. Treat that filled
                // area like every other bar: preserve its colour, add no
                // border, and distinguish it through opacity contrast.
                rect: { opacity: 'contrast' },
            },
            resolve: (event, context) => resolveSeriesTarget(event, context, seriesField),
            presentUpdate: presentAnnotationUpdate(
                () => annotationCandidates('right', 'left', 'top', 'bottom', 'center').map((candidate) => ({
                    ...candidate,
                    connectorAnchors: [
                        { role: 'bullet-actual', connection: 'value-end' as const, valueAxis: 'x' as const },
                        { role: 'bullet-expected', connection: 'center' as const },
                    ],
                })),
                comparisonAnnotationText(actualField, expectedField),
            ),
        };
    },
    declareLayoutMode: () => ({
        axisFlags: { y: { banded: true } },
    }),
    instantiate: (spec, ctx) => {
        const { x, y, goal, color, column, row } = ctx.resolvedEncodings;

        const valueTitle = x ? (x.title ?? x.field) : undefined;
        const xAxis = valueTitle != null ? { title: valueTitle } : {};

        // Shared category axis at the top level so every layer aligns by row.
        spec.encoding = {};
        const yEnc = y
            ? { ...y, axis: { ...(y.axis ?? {}), title: null } }
            : undefined;
        if (yEnc) spec.encoding.y = yEnc;
        if (column) spec.encoding.column = column;
        if (row) spec.encoding.row = row;

        const table = ctx.table ?? [];
        const layers: any[] = [];

        // --- Per-row gray qualitative bands (drawn first, behind everything) ---
        // Breakpoints come from each row's own goal in quarters; only the lower
        // performance ranges are shaded, leaving 75% of target and above on the
        // white plot background.
        if (x?.field && y?.field && goal?.field && table.length > 0) {
            const zoneData: Array<Array<Record<string, any>>> = [[], [], []];
            for (const r of table) {
                const cat = r[y.field];
                const g = Number(r[goal.field]);
                if (cat == null || !Number.isFinite(g) || g <= 0) continue;
                zoneData[0].push({ [y.field]: cat, __lo: 0, __hi: 0.25 * g });
                zoneData[1].push({ [y.field]: cat, __lo: 0.25 * g, __hi: 0.5 * g });
                zoneData[2].push({ [y.field]: cat, __lo: 0.5 * g, __hi: 0.75 * g });
            }
            zoneData.forEach((rows, i) => {
                if (rows.length === 0) return;
                layers.push({
                    data: { values: rows },
                    mark: { type: 'rect', color: ZONE_GRAYS[i], opacity: 1 },
                    encoding: {
                        x: { field: '__lo', type: 'quantitative', axis: xAxis },
                        x2: { field: '__hi' },
                    },
                });
            });
        }

        // --- Value bar — length from zero, colored by goal attainment ---
        const barLayer: any = {
            mark: { type: 'bar', height: { band: 0.5 } },
            encoding: {},
        };
        if (x) {
            barLayer.encoding.x = {
                ...x,
                scale: { ...(x.scale ?? {}), zero: true },
                axis: { ...(x.axis ?? {}), title: valueTitle },
            };
        }
        if (color) {
            // Explicit grouping wins over goal-attainment coloring.
            barLayer.encoding.color = color;
        } else if (x?.field && goal?.field) {
            barLayer.transform = [{
                calculate: `datum[${JSON.stringify(x.field)}] >= datum[${JSON.stringify(goal.field)}] ? '${STATUS_MET}' : '${STATUS_BELOW}'`,
                as: '__status',
            }];
            barLayer.encoding.color = {
                field: '__status',
                type: 'nominal',
                scale: {
                    domain: [STATUS_BELOW, STATUS_MET],
                    range: [STATUS_COLORS.below, STATUS_COLORS.met],
                },
                legend: { title: null },
                title: null,
            };
        }
        barLayer.transform = [
            ...(barLayer.transform ?? []),
            { calculate: "'bullet-actual'", as: INTERACTION_ROLE },
        ];
        layers.push(barLayer);

        // --- Target marker — a dark tick at the goal, sized to the row band ---
        if (goal) {
            // Size the tick to the actual row band (yStep) so the marker always
            // sits within its own row, whatever the cardinality. The value bar
            // fills 50% of the band, so a tick at ~72% reads as a slightly taller
            // reference marker without spilling into neighbouring rows or past the
            // plot edges (the bug when sizing off canvas height / row count).
            const band = ctx.layout?.yStep;
            const tickSize = band && band > 0
                ? Math.min(band, Math.max(8, Math.round(band * 0.72)))
                : 22;
            layers.push({
                transform: [{ calculate: "'bullet-expected'", as: INTERACTION_ROLE }],
                mark: { type: 'tick', color: '#1a1a1a', thickness: 3, opacity: 1, size: tickSize },
                encoding: {
                    x: { field: goal.field, type: 'quantitative', axis: xAxis },
                },
            });
        }

        spec.layer = layers;
    },
};
