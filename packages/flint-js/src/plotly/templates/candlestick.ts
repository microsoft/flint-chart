// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly Candlestick Chart template.
 *
 * Native `candlestick` trace: pass `x`, `open`, `high`, `low`, `close` and
 * Plotly draws the OHLC bars with built-in up/down coloring — one of
 * Plotly's strongest native chart types (the Vega-Lite equivalent is a
 * layered rule+bar spec; ECharts needs a manual `[open, close, low, high]`
 * reordering).
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { isDiscreteType } from './utils';

export const plCandlestickChartDef: ChartTemplateDef = {
    chart: 'Candlestick Chart',
    template: { mark: 'candlestick', encoding: {} },
    channels: ['x', 'open', 'high', 'low', 'close', 'column', 'row'],
    markCognitiveChannel: 'position',
    declareLayoutMode: () => ({ axisFlags: { x: { banded: true } } }),
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const xCS = channelSemantics.x;
        const openField = channelSemantics.open?.field;
        const highField = channelSemantics.high?.field;
        const lowField = channelSemantics.low?.field;
        const closeField = channelSemantics.close?.field;
        if (!xCS?.field || !openField || !closeField) return;
        const xField = xCS.field;
        const xIsTemporal = xCS.type === 'temporal';
        const xIsDiscrete = isDiscreteType(xCS.type);

        const xVals = table.map((r: any) => r[xField]);
        const open = table.map((r: any) => Number(r[openField]));
        const close = table.map((r: any) => Number(r[closeField]));
        const high = highField ? table.map((r: any) => Number(r[highField])) : open.map((o, i) => Math.max(o, close[i]));
        const low = lowField ? table.map((r: any) => Number(r[lowField])) : open.map((o, i) => Math.min(o, close[i]));

        const traces: any[] = [{
            type: 'candlestick',
            x: xVals, open, high, low, close,
            increasing: { line: { color: '#06982d' } },
            decreasing: { line: { color: '#ae1325' } },
        }];

        if (chartProperties?.showMA) {
            const maWindow = Number(chartProperties.maWindow) || 5;
            const ma = computeMA(close, maWindow);
            traces.push({
                type: 'scatter', mode: 'lines', name: `MA${maWindow}`,
                x: xVals, y: ma,
                line: { width: 1.5, shape: 'spline' as const },
            });
        }

        const xAxisSpec: any = { title: { text: xField }, rangeslider: { visible: table.length > 60 } };
        if (xIsTemporal) xAxisSpec.type = 'date';
        else if (xIsDiscrete) { xAxisSpec.type = 'category'; }

        Object.assign(spec, {
            data: traces,
            layout: {
                xaxis: xAxisSpec,
                yaxis: { title: { text: 'Price' } },
                showlegend: !!chartProperties?.showMA,
            },
        });
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        { key: 'showMA', label: 'Moving average', type: 'binary', defaultValue: false } as ChartPropertyDef,
        { key: 'maWindow', label: 'Average window', type: 'continuous', min: 3, max: 30, step: 1, defaultValue: 5 } as ChartPropertyDef,
    ],
};

function computeMA(prices: number[], window: number): (number | null)[] {
    const result: (number | null)[] = [];
    for (let i = 0; i < prices.length; i++) {
        if (i < window - 1) { result.push(null); continue; }
        let sum = 0;
        for (let j = i - window + 1; j <= i; j++) sum += prices[j];
        result.push(Math.round((sum / window) * 100) / 100);
    }
    return result;
}
