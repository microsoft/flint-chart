// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ChartTemplateDef } from '../../core/types';
import { defaultBuildEncodings } from './utils';
import { interpolateConfigProperty, applyInterpolate } from './line';
import {
    fieldsFromEncodingChannels,
    firstDiscreteEncodingField,
    MUTED_HOVER_STROKE,
    resolveSeriesTarget,
} from '../../core/interaction-semantics';
import { annotationCandidates, presentAnnotationUpdate, transitionAnnotationText } from '../../interactive/presentation/annotation';

/** Semantic types that indicate a rank-like field */
const RANK_SEMANTIC_TYPES = new Set(['Rank', 'Score', 'Level']);

const isDiscrete = (type: string | undefined) =>
    type === 'nominal' || type === 'ordinal';

export const bumpChartDef: ChartTemplateDef = {
    chart: "Bump Chart",
    template: {
        mark: { type: "line", point: true, interpolate: "linear", strokeWidth: 2 },
        encoding: {},
    },
    channels: ["x", "y", "color", "detail", "column", "row"],
    navigation: {},
    markCognitiveChannel: 'position',
    semanticInteractions: ({ resolvedEncodings }) => {
        const seriesField = firstDiscreteEncodingField(resolvedEncodings, ['color', 'detail']);
        const colorField = resolvedEncodings.color?.field;
        return {
            fields: fieldsFromEncodingChannels(resolvedEncodings, ['x', 'y', 'color', 'detail']),
            categoryField: firstDiscreteEncodingField(resolvedEncodings, ['x']),
            seriesField,
            legendFields: colorField ? { color: colorField } : undefined,
            selectableMarks: ['line', 'point'],
            renderHoverStyles: {
                line: { strokeWidth: 3 },
                symbol: { stroke: MUTED_HOVER_STROKE, strokeWidth: 2 },
            },
            renderSelectionStyles: { line: { strokeWidthMultiplier: 1.2 } },
            resolve: (event, context) => resolveSeriesTarget(event, context, seriesField),
            presentUpdate: presentAnnotationUpdate(
                () => annotationCandidates('segment-midpoint', 'center', 'right', 'left'),
                transitionAnnotationText(resolvedEncodings.y?.field),
            ),
        };
    },
    properties: [interpolateConfigProperty],
    declareLayoutMode: () => ({
        paramOverrides: { continuousMarkCrossSection: { x: 80, y: 20, seriesCountAxis: 'auto' }, facetAspectRatioResistance: 0.4 },
    }),
    instantiate: (spec, ctx) => {
        defaultBuildEncodings(spec, ctx.resolvedEncodings);

        // Straight segments between one standing and the next. A curve would
        // draw a rank the reader can point at halfway between two Games, and
        // there was no such rank — nothing was measured between them. A caller
        // or a house that wants the softer read says so through the curve
        // option.
        spec.mark = applyInterpolate(spec.mark, ctx.chartProperties);

        const xEnc = spec.encoding?.x;
        const yEnc = spec.encoding?.y;
        if (!xEnc || !yEnc) return;

        const semanticTypes = ctx.semanticTypes;

        // --- Decide which axis is rank ---
        let rankAxis: 'x' | 'y';

        const xSemType = (xEnc.field && semanticTypes?.[xEnc.field]) || '';
        const ySemType = (yEnc.field && semanticTypes?.[yEnc.field]) || '';
        const xIsRank = RANK_SEMANTIC_TYPES.has(xSemType);
        const yIsRank = RANK_SEMANTIC_TYPES.has(ySemType);

        if (yIsRank && !xIsRank) {
            rankAxis = 'y';
        } else if (xIsRank && !yIsRank) {
            rankAxis = 'x';
        } else if (isDiscrete(xEnc.type) && !isDiscrete(yEnc.type)) {
            rankAxis = 'y';
        } else if (isDiscrete(yEnc.type) && !isDiscrete(xEnc.type)) {
            rankAxis = 'x';
        } else {
            rankAxis = 'y';
        }

        // Y is rank → reverse Y so rank 1 is at top
        if (rankAxis === 'y') {
            yEnc.scale = { ...yEnc.scale, reverse: true };
        }

        // X is rank → fix line connection order
        if (rankAxis === 'x' && yEnc.field) {
            spec.encoding.order = {
                field: yEnc.field,
                type: yEnc.type || "quantitative",
            };
        }

        applyRankScale(spec.encoding[rankAxis], ctx, rankAxis);
        padSequenceEnds(spec.encoding[rankAxis === 'y' ? 'x' : 'y']);
    },
};

/**
 * A rank runs from first to last, and there is no zeroth place.
 *
 * The axis a bump chart is read against is a standing, whatever the field was
 * tagged as — the template picked it out for exactly that reason. So it is
 * fitted to the standings that exist: an author's declared bounds if there are
 * any, otherwise the ranks in the data. A zero baseline here is not a
 * conservative choice, it is a tick for a position nobody can finish in, and
 * it costs the chart a fifth of its height.
 *
 * Both ends then get a little air. First place drawn on the frame reads as
 * clipped rather than as first, and the label riding on it has nowhere to sit.
 */
function applyRankScale(enc: any, ctx: any, rankAxis: 'x' | 'y'): void {
    if (!enc?.field || enc.type !== 'quantitative') return;

    const declared = ctx.channelSemantics?.[rankAxis]?.semanticAnnotation?.intrinsicDomain;
    let domain: [number, number] | undefined = Array.isArray(declared) && declared.length === 2
        ? [declared[0], declared[1]]
        : undefined;

    if (!domain) {
        let min = Infinity;
        let max = -Infinity;
        for (const row of ctx.table ?? []) {
            const v = Number(row?.[enc.field]);
            if (!Number.isFinite(v)) continue;
            if (v < min) min = v;
            if (v > max) max = v;
        }
        if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return;
        domain = [min, max];
    }

    enc.scale = { ...enc.scale, domain, zero: false, nice: false, padding: RANK_END_PAD };

    // Every place gets its own tick while there are few enough of them to
    // name. A generic tick count on a rank axis lands on 2, 4, 6 and leaves
    // first place — the one line the reader came for — with no label at all.
    const [lo, hi] = domain;
    if (Number.isInteger(lo) && Number.isInteger(hi) && hi - lo <= MAX_NAMED_RANKS) {
        const values: number[] = [];
        for (let v = lo; v <= hi; v++) values.push(v);
        // The count travels with the values: a house that asks for four ticks
        // on its value axes means four on a measured axis, but here the ticks
        // are the places themselves, and Vega thins a named list down to the
        // house count unless it is told how many names there are.
        enc.axis = { ...enc.axis, values, tickCount: values.length };
    }
}

/** Ranks we will label one by one before falling back to the axis's own count. */
const MAX_NAMED_RANKS = 11;

/** Room at the ends of the scale, in pixels. */
const RANK_END_PAD = 14;
const SEQUENCE_END_PAD = 10;

/**
 * Air at the start and the end of the sequence axis.
 *
 * The first reading sits on the value axis and the last sits on the frame,
 * which puts a point and its name in the same pixels as the axis labels. The
 * padding is what the reader would leave if they were drawing it by hand.
 */
function padSequenceEnds(enc: any): void {
    if (!enc?.field || enc.type === 'nominal' || enc.type === 'ordinal') return;
    if (enc.scale?.padding != null) return;
    enc.scale = { ...enc.scale, padding: SEQUENCE_END_PAD };
}
