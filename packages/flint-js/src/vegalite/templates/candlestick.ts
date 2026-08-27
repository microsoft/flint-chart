// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ChartTemplateDef } from '../../core/types';
import { adjustBarMarks } from './utils';
import { elementsFromHits, fieldsFromEncodingChannels } from '../../core/interaction-semantics';
import { annotationCandidates, presentAnnotationUpdate, rangeAnnotationText } from '../../interactive/updates/annotation';

export const candlestickChartDef: ChartTemplateDef = {
    chart: "Candlestick Chart",
    template: {
        encoding: {},
        layer: [
            { mark: "rule", encoding: {} },
            { mark: { type: "bar", size: 14 }, encoding: {} },
        ],
    },
    channels: ["x", "open", "high", "low", "close", "column", "row"],
    navigation: { axes: ['x'] },
    markCognitiveChannel: 'position',
    semanticInteractions: ({ resolvedEncodings }) => {
        const categoryField = resolvedEncodings.x?.field;
        return {
            fields: fieldsFromEncodingChannels(resolvedEncodings, ['x', 'open', 'high', 'low', 'close']),
            categoryField,
            selectableMarks: ['rule', 'bar', 'tick'],
            renderHoverStyles: {
                rule: { strokeWidth: 2.5 },
                rect: { opacity: 'contrast' },
            },
            resolve: (event, context) => {
                const elements = elementsFromHits(event.hits, context.keyField);
                return elements.length > 0
                    ? { visual: { kind: 'mark', role: 'candlestick' }, elements }
                    : null;
            },
            presentUpdate: presentAnnotationUpdate(
                () => annotationCandidates('top', 'center', 'right', 'left', 'bottom'),
                rangeAnnotationText(resolvedEncodings.open?.field, resolvedEncodings.close?.field),
            ),
        };
    },
    declareLayoutMode: () => ({
        axisFlags: { x: { banded: true } },
    }),
    instantiate: (spec, ctx) => {
        const { x, open, high, low, close, column, row } = ctx.resolvedEncodings;

        if (!spec.encoding) spec.encoding = {};
        if (x) {
            spec.encoding.x = x;
            if (x.type === 'nominal' || x.type === 'ordinal') {
                spec.encoding.x.sort = null;
            }
        }
        if (column) spec.encoding.column = column;
        if (row) spec.encoding.row = row;

        spec.encoding.y = {
            type: "quantitative",
            scale: { zero: false },
            axis: { title: null },
        };

        spec.title = { text: "Price", anchor: "start", fontSize: 11, fontWeight: "normal", color: "#666" };

        if (low) spec.layer[0].encoding.y = { field: low.field };
        if (high) spec.layer[0].encoding.y2 = { field: high.field };
        if (open) spec.layer[1].encoding.y = { field: open.field };
        if (close) spec.layer[1].encoding.y2 = { field: close.field };

        if (open?.field && close?.field) {
            // `<=`, not `<`: a session that closes exactly where it opened has
            // not fallen, and colouring it as a decline is a false statement.
            spec.encoding.color = {
                condition: {
                    test: `datum['${open.field}'] <= datum['${close.field}']`,
                    value: "#06982d",
                },
                value: "#ae1325",
            };
        }

        // Body width.
        //
        // On a banded *continuous* x — the usual case, dates — the slot width
        // is set by the smallest gap between observations, not by the row
        // count: nine trading days spanning eleven calendar days occupy eleven
        // slots, two of which are the weekend. Sizing on cardinality makes
        // every body wider than its own slot and adjacent candles fuse into a
        // single polygon. adjustBarMarks() already performs that min-gap
        // analysis for bar marks, so use it rather than keep a second, wrong
        // copy of the arithmetic here.
        //
        // It returns the largest *non-overlapping* size, and bodies that
        // merely touch still read as one shape when consecutive sessions move
        // the same way. A candlestick needs a visible gutter, so take a
        // fraction of the fitted width.
        const BODY_FILL = 0.8;
        if ((ctx.layout?.xContinuousAsDiscrete ?? 0) > 0) {
            adjustBarMarks(spec, ctx);
            const fitted = (spec.layer[1].mark as { size?: number })?.size ?? 14;
            spec.layer[1].mark = { ...spec.layer[1].mark, size: Math.max(2, Math.floor(fitted * BODY_FILL)) };
        } else {
            const step = ctx.layout?.xStep ?? 20;
            spec.layer[1].mark = { ...spec.layer[1].mark, size: Math.max(2, Math.round(step * BODY_FILL)) };
        }

        // Doji sessions.
        //
        // When open === close the open→close bar has zero height and vanishes,
        // so a flat session renders as a bare wick with no candle on it. Draw
        // it as a horizontal tick at the shared price, which is the convention
        // and is exactly what the bar degenerates to.
        if (open?.field && close?.field) {
            const bodySize = (spec.layer[1].mark as { size?: number })?.size ?? 14;
            spec.layer.push({
                transform: [{ filter: `datum['${open.field}'] === datum['${close.field}']` }],
                mark: { type: "tick", size: bodySize, thickness: 2 },
                encoding: { y: { field: close.field } },
            });
        }
    },
};
