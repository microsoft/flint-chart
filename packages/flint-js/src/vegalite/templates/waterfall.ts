// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { resolveTotalsMode } from '../../core/waterfall';

/**
 * Waterfall Chart template.
 *
 * Expects data with:
 *   - x (nominal): step labels in display order
 *   - y (quantitative): the delta/amount for each step
 *   - color (nominal, optional): a "Type" column with values like
 *     "start", "delta", "end"
 *
 * Uses a layered spec: bars + connector rules.
 */
export const waterfallChartDef: ChartTemplateDef = {
    chart: "Waterfall Chart",
    template: { mark: "bar", encoding: {} },
    channels: ["x", "y", "color", "column", "row"],
    markCognitiveChannel: 'length',
    declareLayoutMode: () => ({
        axisFlags: { x: { banded: true } },
    }),
    instantiate: (spec, ctx) => {
        const { x, y, color, column, row } = ctx.resolvedEncodings;
        const config = ctx.chartProperties;

        const xField: string = x?.field || 'Category';
        const yField: string = y?.field || 'Amount';
        const colorField: string | undefined = color?.field;

        if (!spec.encoding) spec.encoding = {};
        if (column) spec.encoding.column = column;
        if (row) spec.encoding.row = row;

        const hasTypeCol = !!colorField;
        const typeField = colorField || '__wf_type';

        // ── Transforms ───────────────────────────────────────────────
        const transforms: any[] = [];

        if (!hasTypeCol) {
            // Which bars (if any) are drawn as full "total" bars that touch down to
            // zero. The default is data-aware (see core/waterfall.ts): the first bar
            // is a start total and the last bar is a total only when its value
            // reconciles with the running cumulative of the prior rows; otherwise it
            // stays a floating delta. The user's `totals` property overrides this.
            // When an explicit Type column is present it is authoritative and this
            // is skipped entirely.
            const wfValues = ((ctx.fullTable ?? ctx.table) ?? []).map((r: any) => Number(r[yField]));
            const totalsMode = resolveTotalsMode(wfValues, config?.totals);
            const wantFirst = totalsMode === 'first' || totalsMode === 'both';
            const wantLast = totalsMode === 'last' || totalsMode === 'both';

            if (wantFirst || wantLast) {
                transforms.push(
                    { window: [{ op: "row_number", as: "__wf_row" }] },
                    { joinaggregate: [{ op: "count", as: "__wf_total" }] },
                );
                const branches: string[] = [];
                if (wantFirst) branches.push(`datum.__wf_row === 1 ? 'start'`);
                if (wantLast) branches.push(`datum.__wf_row === datum.__wf_total ? 'end'`);
                transforms.push({
                    calculate: `${branches.join(' : ')} : 'delta'`,
                    as: typeField,
                });
            } else {
                transforms.push({ calculate: `'delta'`, as: typeField });
            }
        }

        transforms.push({
            window: [{ op: "sum", field: yField, as: "__wf_sum_raw" }],
        });

        transforms.push({
            calculate: `datum['${typeField}'] === 'end' ? datum.__wf_sum_raw - datum['${yField}'] : datum.__wf_sum_raw`,
            as: "__wf_sum",
        });

        transforms.push({
            calculate: `datum['${typeField}'] === 'end' ? 0 : datum.__wf_sum - datum['${yField}']`,
            as: "__wf_prev_sum",
        });

        // A bar is a beige "total" only when its Type value is a recognized anchor
        // keyword (start/end) — matching the ECharts/Chart.js templates, which key
        // their color off `start`/`end` too. Any other value, including an
        // agent-supplied increase/decrease category, is a floating delta colored by
        // sign, so an unrecognized color vocabulary degrades to sign-based coloring
        // instead of collapsing every bar to the single "total" hue.
        transforms.push({
            calculate: `(datum['${typeField}'] === 'start' || datum['${typeField}'] === 'end') ? 'total' : datum['${yField}'] >= 0 ? 'increase' : 'decrease'`,
            as: "__wf_color",
        });

        // Connector lookahead: the next bar's x label, used to draw a thin rule
        // bridging the gap between adjacent bars at the running-cumulative level.
        // On the last row lead() is null, so we point it back at the current label
        // and null out the connector level so no stray rule is drawn.
        transforms.push({
            window: [{ op: "lead", field: xField, as: "__wf_lead" }],
        });
        transforms.push({
            calculate: `datum.__wf_lead === null ? datum['${xField}'] : datum.__wf_lead`,
            as: "__wf_lead",
        });
        transforms.push({
            calculate: `datum.__wf_lead === datum['${xField}'] ? null : datum.__wf_sum`,
            as: "__wf_connector_y",
        });

        spec.transform = transforms;

        // ── Shared x encoding ────────────────────────────────────────
        const xEnc = {
            field: xField,
            type: "ordinal" as const,
            sort: null,
            axis: { labelAngle: -45 },
        };

        // ── Preserve facet encodings ─────────────────────────────────
        const facetEncodings: any = {};
        if (spec.encoding?.column) facetEncodings.column = spec.encoding.column;
        if (spec.encoding?.row) facetEncodings.row = spec.encoding.row;

        const cornerRadius = (config?.cornerRadius && config.cornerRadius > 0) ? config.cornerRadius : 0;

        const xStep = ctx.layout?.xStep ?? 0;

        // Value labels: keep the text small and only show it when bars are wide
        // enough that adjacent labels won't collide (safe labeling, like the
        // heatmap). Font steps down with the band; very narrow bands skip labels.
        const showLabels = !!config?.showTextLabels;
        const labelStep = xStep || 40;
        const labelFits = labelStep >= 18;
        const labelFontSize = labelStep >= 40 ? 10 : labelStep >= 26 ? 9 : 8;
        const labelFormat = labelStep >= 36 ? ',' : '~s';

        // Minimum bar height (in data units) needed to hold the inner delta text.
        // Derived from the running-cumulative span vs the plot height so the gate
        // is resolution-aware; short bars skip the inner label (outer total stays).
        const wfLevels = (() => {
            const vals = ((ctx.fullTable ?? ctx.table) ?? []).map((r: any) => Number(r[yField]) || 0);
            const lv = [0];
            let racc = 0;
            for (const v of vals) { racc += v; lv.push(racc); }
            return lv;
        })();
        const yMin = Math.min(...wfLevels);
        const yMax = Math.max(...wfLevels);
        const ySpan = (yMax - yMin) || 1;
        const plotH = ctx.layout?.subplotHeight || 300;
        const minDataHeight = ((labelFontSize + 4) / plotH) * ySpan;

        // When outer labels are on, pad the domain so the running-total text at the
        // extreme top/bottom bar tips isn't clipped by the plot edge.
        const labelPad = showLabels && labelFits ? ((labelFontSize + 8) / plotH) * ySpan : 0;
        const yDomain = labelPad > 0 ? [yMin - labelPad, yMax + labelPad] : null;

        spec.encoding = {
            x: xEnc,
            ...facetEncodings,
        };

        spec.layer = [
            {
                mark: {
                    type: "bar",
                    ...(cornerRadius > 0 ? { cornerRadius: cornerRadius } : {}),
                },
                encoding: {
                    y: {
                        field: "__wf_prev_sum",
                        type: "quantitative",
                        title: yField,
                        ...(yDomain ? { scale: { domain: yDomain } } : {}),
                    },
                    y2: { field: "__wf_sum" },
                    color: {
                        field: "__wf_color",
                        type: "nominal",
                        scale: {
                            domain: ["total", "increase", "decrease"],
                            range: ["#f7e0b6", "#93c4aa", "#f78a64"],
                        },
                        legend: { title: "Type" },
                    },
                },
            },
            // Thin connector lines bridging each bar to the next at the running
            // cumulative level, tracing the bar tops from the current bar's left
            // edge to the next bar's right edge. `bandPosition` (0 = band left
            // edge, 1 = band right edge) tracks the actual rendered band width, so
            // the connector shrinks/grows with the bars automatically rather than
            // relying on a pixel offset derived from the abstract layout step.
            {
                mark: {
                    type: "rule",
                    color: "#6b7280",
                    opacity: 0.7,
                    strokeWidth: 1,
                },
                encoding: {
                    x: { field: xField, type: "ordinal", sort: null, bandPosition: 0 },
                    x2: { field: "__wf_lead", bandPosition: 1 },
                    y: { field: "__wf_connector_y", type: "quantitative" },
                },
            },
        ];

        if (showLabels && labelFits) {
            // Inner delta needs a vertical center and a signed string ("+1707" /
            // "-1425"); the running total is shown outside the bar.
            spec.transform.push(
                { calculate: "(datum.__wf_sum + datum.__wf_prev_sum) / 2", as: "__wf_center" },
                {
                    calculate: `datum.__wf_color === 'increase' ? '+' + format(datum['${yField}'], '${labelFormat}') : format(datum['${yField}'], '${labelFormat}')`,
                    as: "__wf_delta_text",
                },
            );

            spec.layer.push(
                // Running total outside the bar (above increases / below decreases).
                {
                    mark: {
                        type: "text",
                        align: "center",
                        baseline: { expr: "datum.__wf_sum >= datum.__wf_prev_sum ? 'bottom' : 'top'" },
                        dy: { expr: "datum.__wf_sum >= datum.__wf_prev_sum ? -4 : 4" },
                        fontSize: labelFontSize,
                        fill: "#374151",
                    },
                    encoding: {
                        y: { field: "__wf_sum", type: "quantitative" },
                        text: { field: "__wf_sum", type: "quantitative", format: labelFormat },
                    },
                },
                // Delta inside the bar, muted in the bar's own hue. Skipped when the
                // bar is too short to hold the text.
                {
                    transform: [{ filter: `abs(datum.__wf_sum - datum.__wf_prev_sum) >= ${minDataHeight}` }],
                    mark: {
                        type: "text",
                        align: "center",
                        baseline: "middle",
                        fontSize: labelFontSize,
                    },
                    encoding: {
                        y: { field: "__wf_center", type: "quantitative" },
                        text: { field: "__wf_delta_text", type: "nominal" },
                        color: {
                            condition: { test: "datum.__wf_color === 'total'", value: "#725a30" },
                            value: "white",
                        },
                    },
                },
            );
        }

        delete spec.mark;
    },
    properties: [
        { key: "cornerRadius", label: "Corners", type: "continuous", min: 0, max: 8, step: 1, defaultValue: 0 },
        {
            key: "totals", label: "Totals", type: "discrete",
            options: [
                { value: "auto", label: "Auto" },
                { value: "none", label: "None" },
                { value: "first", label: "First" },
                { value: "last", label: "Last" },
                { value: "both", label: "Both" },
            ],
            defaultValue: "auto",
            // Only meaningful when Flint must infer the totals — i.e. there is no
            // explicit Type column. When the user binds a color/Type field their
            // start/delta/end is authoritative, so the toggle is not offered. The
            // default "auto" resolves to the data-aware recommendation inside the
            // template (see core/waterfall.ts resolveTotalsMode).
            check: (ctx) => ({ applicable: !ctx.encodings?.color?.field }),
        },
        { key: 'showTextLabels', label: 'Show labels', type: 'binary', defaultValue: false },
    ] as ChartPropertyDef[],
};
