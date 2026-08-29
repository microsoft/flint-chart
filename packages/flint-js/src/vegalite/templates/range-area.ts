// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Vega-Lite Range Area Chart (band / high–low / area-range) template.
 *
 * A filled band over a continuum showing a **low–high range** at each x (daily
 * min/max temperature, a forecast/confidence band, a 52-week stock range). The
 * read is the *extent* of the band (its width) and how it moves over x — NOT a
 * length measured from a zero baseline, so the value axis fits the two bounds.
 *
 * Vega-Lite renders this natively: `mark: "area"` with BOTH `encoding.y` (the
 * lower bound) and `encoding.y2` (the upper bound). The fill spans y..y2; it is
 * never anchored at zero.
 *
 * Contract:
 *   x      — position (temporal / quantitative / ordinal).
 *   y      — lower bound (quantitative).
 *   y2     — upper bound (quantitative, shares y's scale).
 *   color  — optional series → one OVERLAPPING band per value (legend). Ranged
 *            areas must never stack, so VL's automatic area stacking is disabled.
 *
 * Mirrors area.ts for structure (mark "area", 'area' cognitive channel, the
 * continuous-mark cross-section), but wires y2 and forbids the zero baseline.
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import {
    fieldsFromEncodingChannels,
    firstDiscreteEncodingField,
    legendMatchedHits,
    targetFromHits,
} from '../../core/interaction-semantics';
import { annotationCandidates, presentAnnotationUpdate, rangeAnnotationText } from '../../interactive/presentation/annotation';
import { defaultBuildEncodings, setMarkProp } from './utils';

const interpolateConfigProperty: ChartPropertyDef = {
    key: 'interpolate', label: 'Curve', type: 'discrete', options: [
        { value: undefined, label: 'Default (linear)' },
        { value: 'linear', label: 'Linear' },
        { value: 'monotone', label: 'Monotone (smooth)' },
        { value: 'step', label: 'Step' },
        { value: 'step-before', label: 'Step Before' },
        { value: 'step-after', label: 'Step After' },
        { value: 'basis', label: 'Basis (smooth)' },
    ],
};

export const rangeAreaChartDef: ChartTemplateDef = {
    chart: 'Range Area Chart',
    reorder: false,
    template: { mark: { type: 'area', opacity: 0.5, line: { strokeWidth: 1 } }, encoding: {} },
    channels: ['x', 'y', 'y2', 'color', 'column', 'row'],
    navigation: {},
    markCognitiveChannel: 'area',
    geometryKinds: ['area'],
    semanticInteractions: ({ resolvedEncodings }) => {
        const categoryField = firstDiscreteEncodingField(resolvedEncodings, ['x']);
        const seriesField = firstDiscreteEncodingField(resolvedEncodings, ['color']);
        const colorField = resolvedEncodings.color?.field;
        return {
            fields: fieldsFromEncodingChannels(resolvedEncodings, ['x', 'y', 'y2', 'color']),
            categoryField,
            seriesField,
            legendFields: colorField ? { color: colorField } : undefined,
            selectableMarks: ['area'],
            renderHoverStyles: { area: { opacity: 'spotlight' } },
            resolve: (event, context) => {
                const legendField = event.legendField ?? seriesField;
                const hits = event.role === 'legend-item' && legendField
                    ? legendMatchedHits(event, context, legendField)
                    : event.hits;
                return targetFromHits(hits, context.keyField, { kind: 'path', role: event.role });
            },
            presentUpdate: presentAnnotationUpdate(
                () => annotationCandidates('segment-midpoint', 'center', 'top', 'bottom', 'right', 'left'),
                rangeAnnotationText(resolvedEncodings.y?.field, resolvedEncodings.y2?.field),
            ),
        };
    },
    declareLayoutMode: () => ({
        paramOverrides: {
            continuousMarkCrossSection: { x: 100, y: 20, seriesCountAxis: 'auto' },
            facetAspectRatioResistance: 0.5,
        },
    }),
    instantiate: (spec, ctx) => {
        defaultBuildEncodings(spec, ctx.resolvedEncodings);

        const yEnc = spec.encoding?.y;
        const y2Enc = spec.encoding?.y2;
        if (!yEnc || !y2Enc?.field) return;

        // y2 (upper bound) shares y's scale — only the field reference is needed.
        // Strip any type/scale/sort the generic resolver may have attached so it
        // behaves as a pure second positional bound (matches candlestick/gantt).
        spec.encoding.y2 = { field: y2Enc.field };

        // The band spans y..y2; it is NOT measured from a zero baseline, so the
        // value axis fits the two bounds rather than anchoring at zero. Setting
        // scale.zero explicitly also makes vlApplyLayoutToSpec skip its
        // zero-baseline override for this axis.
        yEnc.scale = { ...yEnc.scale, zero: false, nice: true };

        // Multiple bands (a color series) must OVERLAP, never stack — a ranged
        // area cannot be stacked. Disable Vega-Lite's automatic area stacking.
        if (spec.encoding.color) {
            yEnc.stack = null;
        }

        const config = ctx.chartProperties;
        if (config?.interpolate) {
            spec.mark = setMarkProp(spec.mark, 'interpolate', config.interpolate);
        }
        if (config?.opacity !== undefined && config.opacity < 1) {
            spec.mark = setMarkProp(spec.mark, 'opacity', config.opacity);
        }
    },
    properties: [
        interpolateConfigProperty,
        { key: 'opacity', label: 'Opacity', type: 'continuous', min: 0.1, max: 1, step: 0.1, defaultValue: 0.5 },
    ] as ChartPropertyDef[],
};
