// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly Regression template — scatter + fitted trend line.
 *
 * Plotly has no built-in regression transform (Vega-Lite's `transform:
 * [{regression}]` runs in the Vega runtime); the fit is computed here,
 * mirroring `ecRegressionDef`.
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { groupBy, getPlotlyPalette, getSeriesColor } from './utils';

/** Simple linear regression: slope and intercept. */
function linearRegression(data: number[][]): { slope: number; intercept: number; xMin: number; xMax: number } {
    const n = data.length;
    if (n === 0) return { slope: 0, intercept: 0, xMin: 0, xMax: 0 };
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    let xMin = data[0][0], xMax = data[0][0];
    for (const [x, y] of data) {
        sumX += x; sumY += y; sumXY += x * y; sumXX += x * x;
        if (x < xMin) xMin = x;
        if (x > xMax) xMax = x;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX) || 0;
    const intercept = (sumY - slope * sumX) / n;
    return { slope, intercept, xMin, xMax };
}

/** Polynomial regression via least-squares normal equations. */
function polyRegression(data: number[][], order: number): { coeffs: number[]; xMin: number; xMax: number } {
    const n = data.length;
    if (n === 0) return { coeffs: [0], xMin: 0, xMax: 0 };
    let xMin = data[0][0], xMax = data[0][0];
    for (const [x] of data) { if (x < xMin) xMin = x; if (x > xMax) xMax = x; }
    const k = order + 1;
    const xtx: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
    const xty: number[] = new Array(k).fill(0);
    for (const [x, y] of data) {
        const xp: number[] = new Array(2 * order + 1);
        xp[0] = 1;
        for (let p = 1; p < xp.length; p++) xp[p] = xp[p - 1] * x;
        for (let i = 0; i < k; i++) {
            xty[i] += y * xp[i];
            for (let j = 0; j < k; j++) xtx[i][j] += xp[i + j];
        }
    }
    const aug: number[][] = xtx.map((row, i) => [...row, xty[i]]);
    for (let col = 0; col < k; col++) {
        let maxRow = col;
        for (let row = col + 1; row < k; row++) if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
        if (maxRow !== col) [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
        const pivot = aug[col][col];
        if (Math.abs(pivot) < 1e-12) continue;
        for (let j = col; j <= k; j++) aug[col][j] /= pivot;
        for (let row = 0; row < k; row++) {
            if (row === col) continue;
            const factor = aug[row][col];
            for (let j = col; j <= k; j++) aug[row][j] -= factor * aug[col][j];
        }
    }
    return { coeffs: aug.map(row => row[k]), xMin, xMax };
}

function polyEval(coeffs: number[], x: number): number {
    let result = 0, xp = 1;
    for (const c of coeffs) { result += c * xp; xp *= x; }
    return result;
}

/** Generate regression curve points for a given method. */
function regressionCurvePoints(data: number[][], method: string, order: number, numPoints = 50): number[][] {
    if (data.length === 0) return [];
    if (method === 'linear' || !method) {
        const reg = linearRegression(data);
        return [[reg.xMin, reg.slope * reg.xMin + reg.intercept], [reg.xMax, reg.slope * reg.xMax + reg.intercept]];
    }
    if (method === 'log') {
        const filtered = data.filter(([x]) => x > 0);
        if (filtered.length < 2) return [];
        const reg = linearRegression(filtered.map(([x, y]) => [Math.log(x), y]));
        let xMin = Infinity, xMax = -Infinity;
        for (const [x] of filtered) { if (x < xMin) xMin = x; if (x > xMax) xMax = x; }
        return Array.from({ length: numPoints }, (_v, i) => {
            const x = xMin + (xMax - xMin) * i / (numPoints - 1);
            return [x, reg.intercept + reg.slope * Math.log(x)];
        });
    }
    if (method === 'exp') {
        const filtered = data.filter(([, y]) => y > 0);
        if (filtered.length < 2) return [];
        const reg = linearRegression(filtered.map(([x, y]) => [x, Math.log(y)]));
        let xMin = Infinity, xMax = -Infinity;
        for (const [x] of filtered) { if (x < xMin) xMin = x; if (x > xMax) xMax = x; }
        return Array.from({ length: numPoints }, (_v, i) => {
            const x = xMin + (xMax - xMin) * i / (numPoints - 1);
            return [x, Math.exp(reg.intercept + reg.slope * x)];
        });
    }
    if (method === 'pow') {
        const filtered = data.filter(([x, y]) => x > 0 && y > 0);
        if (filtered.length < 2) return [];
        const reg = linearRegression(filtered.map(([x, y]) => [Math.log(x), Math.log(y)]));
        let xMin = Infinity, xMax = -Infinity;
        for (const [x] of filtered) { if (x < xMin) xMin = x; if (x > xMax) xMax = x; }
        return Array.from({ length: numPoints }, (_v, i) => {
            const x = xMin + (xMax - xMin) * i / (numPoints - 1);
            return [x, Math.exp(reg.intercept) * Math.pow(x, reg.slope)];
        });
    }
    if (method === 'quad' || method === 'poly') {
        const reg = polyRegression(data, method === 'quad' ? 2 : order);
        return Array.from({ length: numPoints }, (_v, i) => {
            const x = reg.xMin + (reg.xMax - reg.xMin) * i / (numPoints - 1);
            return [x, polyEval(reg.coeffs, x)];
        });
    }
    const reg = linearRegression(data);
    return [[reg.xMin, reg.slope * reg.xMin + reg.intercept], [reg.xMax, reg.slope * reg.xMax + reg.intercept]];
}

export const plRegressionDef: ChartTemplateDef = {
    chart: 'Regression',
    template: { mark: 'circle', encoding: {} },
    channels: ['x', 'y', 'size', 'color', 'column', 'row'],
    markCognitiveChannel: 'position',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const xField = channelSemantics.x?.field;
        const yField = channelSemantics.y?.field;
        const colorField = channelSemantics.color?.field;
        if (!xField || !yField) return;

        const method = String(chartProperties?.regressionMethod ?? 'linear');
        const polyOrder = Number(chartProperties?.polyOrder ?? 3);
        const opacity = Number(chartProperties?.opacity ?? 1);
        const palette = getPlotlyPalette(ctx, 'color');

        const traces: any[] = [];
        const pushGroup = (name: string | undefined, rows: any[], idx: number) => {
            const data = rows.map((r: any) => [Number(r[xField]), Number(r[yField])]).filter(([x, y]) => isFinite(x) && isFinite(y));
            const lineData = regressionCurvePoints(data, method, polyOrder);
            const color = getSeriesColor(palette, idx);
            traces.push({
                type: 'scatter', mode: 'markers',
                ...(name != null ? { name } : {}),
                x: data.map(d => d[0]), y: data.map(d => d[1]),
                marker: { color, opacity },
            });
            traces.push({
                type: 'scatter', mode: 'lines',
                name: name != null ? `${name} (trend)` : 'Trend',
                x: lineData.map(d => d[0]), y: lineData.map(d => d[1]),
                line: { color: name != null ? color : '#ee6666', width: 2, shape: method !== 'linear' ? 'spline' : 'linear' },
            });
        };

        if (colorField) {
            let i = 0;
            for (const [name, rows] of groupBy(table, colorField)) { pushGroup(name, rows, i); i++; }
        } else {
            pushGroup(undefined, table, 0);
        }

        const xAxisSpec: any = { title: { text: xField } };
        const yAxisSpec: any = { title: { text: yField } };
        if (channelSemantics.x?.zero) xAxisSpec.rangemode = channelSemantics.x.zero.zero !== false ? 'tozero' : 'normal';
        if (channelSemantics.y?.zero) yAxisSpec.rangemode = channelSemantics.y.zero.zero !== false ? 'tozero' : 'normal';

        Object.assign(spec, { data: traces, layout: { xaxis: xAxisSpec, yaxis: yAxisSpec, showlegend: !!colorField } });
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        {
            key: 'regressionMethod', label: 'Method', type: 'discrete',
            options: [
                { value: 'linear', label: 'Linear' },
                { value: 'log', label: 'Logarithmic' },
                { value: 'exp', label: 'Exponential' },
                { value: 'pow', label: 'Power' },
                { value: 'quad', label: 'Quadratic' },
                { value: 'poly', label: 'Polynomial' },
            ],
            defaultValue: 'linear',
        } as ChartPropertyDef,
        { key: 'polyOrder', label: 'Poly Order', type: 'continuous', min: 2, max: 10, step: 1, defaultValue: 3 } as ChartPropertyDef,
        { key: 'opacity', label: 'Opacity', type: 'continuous', min: 0.1, max: 1, step: 0.05, defaultValue: 1 } as ChartPropertyDef,
    ],
};
