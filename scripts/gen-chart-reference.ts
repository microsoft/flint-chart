// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Generates the per-backend "Chart reference" documentation pages.
 *
 * Each page lists every chart type a backend ships, its encoding channels, and
 * the configurable parameters (`chart_spec.chartProperties`) the template
 * exposes — pulled straight from the live `ChartTemplateDef` registries so the
 * docs never drift from the code.
 *
 * Run via:  npm run gen:reference   (bundled with esbuild, see package.json)
 * Output:   docs/reference-<backend>.md
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import type { ChartTemplateDef, ChartPropertyDef } from '../packages/flint-js/src/core/types';
import { vlTemplateDefs } from '../packages/flint-js/src/vegalite/templates/index';
import { ecTemplateDefs } from '../packages/flint-js/src/echarts/templates/index';
import { cjsTemplateDefs } from '../packages/flint-js/src/chartjs/templates/index';
import { plTemplateDefs } from '../packages/flint-js/src/plotly/templates/index';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = resolve(__dirname, '../docs');

type CategorizedDefs = { [category: string]: ChartTemplateDef[] };

interface BackendSpec {
    /** Backend display name. */
    name: string;
    /** Output file basename (docs/<file>). */
    file: string;
    /** Categorized template registry. */
    defs: CategorizedDefs;
    /** Short blurb under the title. */
    blurb: string;
}

const BACKENDS: BackendSpec[] = [
    {
        name: 'Vega-Lite',
        file: 'reference-vegalite.md',
        defs: vlTemplateDefs,
        blurb:
            'The Vega-Lite backend serves as Flint\'s reference implementation and offers the broadest chart coverage. ' +
            'Use it when you want the most complete support for declarative charts, including axis, scale, and faceting behavior.',
    },
    {
        name: 'ECharts',
        file: 'reference-echarts.md',
        defs: ecTemplateDefs,
        blurb:
            'The ECharts backend targets interactive, canvas-rendered charts and covers several structures ' +
            'outside Vega-Lite\'s scope: sunburst, treemap, sankey, gauge, graph, tree, parallel coordinates, ' +
            'and calendar heatmap.',
    },
    {
        name: 'Chart.js',
        file: 'reference-chartjs.md',
        defs: cjsTemplateDefs,
        blurb:
            'The Chart.js backend is the lightweight embedding target for common chart families. It keeps the ' +
            'parameter surface intentionally small.',
    },
    {
        name: 'Plotly',
        file: 'reference-plotly.md',
        defs: plTemplateDefs,
        blurb:
            'The Plotly backend compiles to a Plotly.js figure (`{ data, layout }`) and leans on Plotly-native ' +
            'trace types wherever one exists (candlestick, box, violin, heatmap, waterfall, `scatterpolar`/`barpolar`, ' +
            '`indicator`, `scattergeo`/`choropleth`) instead of hand-building the mark. Funnel and Gauge have no ' +
            'Vega-Lite equivalent and showcase Plotly-specific native primitives. Map and Choropleth use Plotly\'s ' +
            'own built-in geo atlas (no external TopoJSON fetch/join needed). Sparkline and Bar Table are ' +
            'composite, self-contained figures (their own multi-axis-pair grid + annotations) rather than the ' +
            'generic column/row facet combiner.',
    },
];

/**
 * Friendly one-line descriptions for the parameters, keyed by property `key`.
 * Falls back to the property `label` when a key is not listed. Keep these
 * generic — the same key means the same thing across backends.
 */
const PARAM_DESCRIPTIONS: Record<string, string> = {
    opacity: 'Mark opacity.',
    fillOpacity: 'Fill opacity for the area or region.',
    pointSize: 'Point or marker size.',
    dotSize: 'Size of the dot mark.',
    cornerRadius: 'Corner radius for supported marks.',
    taskHeight: 'Task bar height as a percentage of each row.',
    intervalLabels: 'Text shown on task intervals.',
    interpolate: 'Line or area interpolation method.',
    showPoints: 'Overlay point markers on the line.',
    showTextLabels: 'Render value labels on the marks.',
    showPercent: 'Show each value as a percentage of the total.',
    stackMode: 'Stacking strategy for overlapping series.',
    binCount: 'Maximum bin cap; Auto lets the backend choose.',
    bandwidth: 'Kernel-density bandwidth (0 = auto).',
    innerRadius: 'Inner radius as a percentage of the outer radius.',
    padAngle: 'Angular gap between radial segments.',
    alignment: 'Segment alignment for radial charts.',
    strokeWidth: 'Line stroke width.',
    filled: 'Fill the enclosed radar area.',
    maxRows: 'Maximum number of table rows to display.',
    stepWidth: 'Jitter spread width.',
    regressionMethod: 'Regression fit method.',
    polyOrder: 'Polynomial order for the regression fit.',
    independentYAxis: 'Use independent y-scales for facets.',
    logScale_x: 'Use a log/symlog scale on the x-axis.',
    logScale_y: 'Use a log/symlog scale on the y-axis.',
    includeZero_x: 'Anchor the x-axis at zero.',
    includeZero_y: 'Anchor the y-axis at zero.',
    xAxisType: 'Interpret the x-axis as a continuous time scale or discrete bands.',
    yAxisType: 'Interpret the y-axis as a continuous time scale or discrete bands.',
    sort: 'Sort order for ordered stages or categories.',
    orient: 'Chart orientation.',
    gap: 'Gap between segments.',
    breadcrumb: 'Show or hide treemap breadcrumb navigation.',
    labelRotate: 'Label orientation for sunburst sectors.',
    showMA: 'Show a moving-average overlay.',
    maWindow: 'Moving-average window size.',
};

/**
 * Chart-type name → icon SVG basename (under site/src/assets/chart-icons/).
 * Used to render a small glyph next to each chart heading. Names match the
 * `chart` field on every backend's `ChartTemplateDef`; unmapped types simply
 * render without an icon.
 */
const ICON_BY_CHART: Record<string, string> = {
    'Scatter Plot': 'chart-icon-scatter.svg',
    'Regression': 'chart-icon-linear-regression.svg',
    'Connected Scatter Plot': 'chart-icon-connected-scatter.svg',
    'Ranged Dot Plot': 'chart-icon-dot-plot-horizontal.svg',
    'Strip Plot': 'chart-icon-strip-plot.svg',
    'Boxplot': 'chart-icon-box-plot.svg',
    'Bubble Chart': 'chart-icon-bubble.svg',
    'Bar Chart': 'chart-icon-column.svg',
    'Grouped Bar Chart': 'chart-icon-column-grouped.svg',
    'Stacked Bar Chart': 'chart-icon-column-stacked.svg',
    'Pyramid Chart': 'chart-icon-pyramid.svg',
    'Histogram': 'chart-icon-histogram.svg',
    'Heatmap': 'chart-icon-heat-map.svg',
    'Calendar Heatmap': 'chart-icon-calendar.svg',
    'Lollipop Chart': 'chart-icon-lollipop.svg',
    'Waterfall Chart': 'chart-icon-waterfall.svg',
    'Gantt Chart': 'chart-icon-gantt.svg',
    'Bullet Chart': 'chart-icon-bullet.svg',
    'Combo Chart': 'chart-icon-combo.svg',
    'Bar Table': 'chart-icon-bar-table.svg',
    'Density Plot': 'chart-icon-density.svg',
    'ECDF Plot': 'chart-icon-ecdf.svg',
    'Violin Plot': 'chart-icon-violin.svg',
    'Candlestick Chart': 'chart-icon-candlestick.svg',
    'Parallel Coordinates': 'chart-icon-parallel.svg',
    'Line Chart': 'chart-icon-line.svg',
    'Bump Chart': 'chart-icon-bump.svg',
    'Slope Chart': 'chart-icon-slope.svg',
    'Area Chart': 'chart-icon-area.svg',
    'Streamgraph': 'chart-icon-streamgraph.svg',
    'Range Area Chart': 'chart-icon-range-area.svg',
    'Pie Chart': 'chart-icon-pie.svg',
    'Doughnut Chart': 'chart-icon-doughnut.svg',
    'Donut Chart': 'chart-icon-doughnut.svg',
    'Scatter Pie Chart': 'chart-icon-pie.svg',
    'Rose Chart': 'chart-icon-rose.svg',
    'Radar Chart': 'chart-icon-radar.svg',
    'Gauge Chart': 'chart-icon-gauge.svg',
    'Funnel Chart': 'chart-icon-funnel.svg',
    'Treemap': 'chart-icon-treemap.svg',
    'Sunburst Chart': 'chart-icon-sunburst.svg',
    'Tree': 'chart-icon-tree.svg',
    'Sankey Diagram': 'chart-icon-sankey.svg',
    'Network Graph': 'chart-icon-network.svg',
    'KPI Card': 'chart-icon-kpi-card.svg',
    'Map': 'chart-icon-world-map.svg',
    'Choropleth': 'chart-icon-us-map.svg',
};

function esc(s: string): string {
    return s
        .replace(/\\/g, '\\\\')
        .replace(/\r?\n/g, '<br>')
        .replace(/\|/g, '\\|');
}

function describe(p: ChartPropertyDef): string {
    return esc(PARAM_DESCRIPTIONS[p.key] ?? p.label);
}

/** Human-readable value domain for a property. */
function domain(p: ChartPropertyDef): string {
    switch (p.type) {
        case 'continuous': {
            const step = p.step != null ? ` (step ${p.step})` : '';
            return `${p.min} – ${p.max}${step}`;
        }
        case 'discrete':
            // Show the accepted `value` (what callers pass in
            // `chartProperties`), with the human label as secondary text — the
            // labels are not valid inputs. An `undefined` value means "omit the
            // property to get this default", so render just its label.
            return p.options
                .map((o) =>
                    o.value === undefined || o.value === null
                        ? `${o.label} _(default)_`
                        : `\`${o.value}\`${o.label ? ` (${o.label})` : ''}`,
                )
                .join(', ');
        case 'binary':
            return 'on / off';
    }
}

/** Default value rendered for display. */
function defaultValue(p: ChartPropertyDef): string {
    let raw: unknown;
    if (p.type === 'binary') raw = p.defaultValue ?? false;
    else raw = p.defaultValue;
    if (raw == null) return '—';
    if (p.key === 'binCount' && raw === 0) return '`Auto`';
    if (p.type === 'discrete') {
        // Render the accepted `value`, not the display label, so the default
        // shown matches what a caller passes in `chartProperties`.
        const match = p.options.find((o) => o.value === raw);
        return match ? `\`${String(match.value)}\`` : `\`${String(raw)}\``;
    }
    return `\`${String(raw)}\``;
}

function controlLabel(p: ChartPropertyDef): string {
    switch (p.type) {
        case 'continuous':
            return 'number';
        case 'discrete':
            return 'choice';
        case 'binary':
            return 'toggle';
    }
}

function availability(p: ChartPropertyDef): string {
    return p.check ? 'conditional' : 'always';
}

function renderChart(def: ChartTemplateDef): string {
    const lines: string[] = [];
    const icon = ICON_BY_CHART[def.chart];
    const iconMd = icon ? `![](${icon}) ` : '';
    lines.push(`### ${iconMd}${def.chart}`);
    lines.push('');
    const channels = (def.channels ?? []).map((c) => `\`${c}\``).join(', ') || '_none_';
    lines.push(`**Encoding channels:** ${channels}`);
    lines.push('');

    const props = def.properties ?? [];
    if (props.length === 0) {
        lines.push('_No template-specific parameters._');
        lines.push('');
        return lines.join('\n');
    }

    lines.push('| Parameter | Control | Domain | Default | Availability | Description |');
    lines.push('|---|---|---|---|---|---|');
    for (const p of props) {
        lines.push(
            `| \`${p.key}\` | ${controlLabel(p)} | ${domain(p)} | ${defaultValue(p)} | ${availability(
                p,
            )} | ${describe(p)} |`,
        );
    }
    lines.push('');
    return lines.join('\n');
}

function renderBackend(spec: BackendSpec): string {
    const out: string[] = [];
    const total = Object.values(spec.defs).reduce((n, defs) => n + defs.length, 0);
    const categoryCount = Object.keys(spec.defs).length;

    out.push(`# ${spec.name} chart reference`);
    out.push('');
    out.push(
        '> This page is generated from the live chart-template registry ' +
            '(`scripts/gen-chart-reference.ts`). Do not edit it by hand — run `npm run gen:reference`.',
    );
    out.push('');
    out.push(spec.blurb);
    out.push('');
    out.push('## What this page covers');
    out.push('');
    out.push(
        `This reference lists the ${total} chart types currently supported by the ${spec.name} backend, ` +
            `grouped into ${categoryCount} categories. Each chart entry shows:`,
    );
    out.push('');
    out.push(
        '- **Encoding channels** — the visual roles accepted in `chart_spec.encodings`, such as `x`, `y`, `color`, `size`, `column`, or `row`.',
    );
    out.push(
        '- **Options** — template-specific `chart_spec.chartProperties` keys, including control type, domain, default, availability, and description.',
    );
    out.push('');
    out.push('Use the chart type name exactly as shown in `chart_spec.chartType`.');
    out.push('');
    out.push('## How to set encodings and options');
    out.push('');
    out.push(
        'Set encodings in `chart_spec.encodings` and chart-specific options in `chart_spec.chartProperties`. ' +
            'Option keys match the parameter names below:',
    );
    out.push('');
    out.push('```jsonc');
    out.push('{');
    out.push('  "chartType": "Bar Chart",');
    out.push('  "encodings": { "x": { "field": "category" }, "y": { "field": "value" } },');
    out.push('  "chartProperties": { "cornerRadius": 4, "stackMode": "normalize" }');
    out.push('}');
    out.push('```');
    out.push('');
    out.push(
        'The **Availability** column shows whether a parameter is `always` available or `conditional`, ' +
            'meaning it appears only when the data and encodings make it relevant. For example, log-scale ' +
            'controls appear only on wide-range axes. Non-applicable parameters are safe to pass; the assembler ignores them.',
    );
    out.push('');

    for (const [category, defs] of Object.entries(spec.defs)) {
        out.push(`## ${category}`);
        out.push('');
        for (const def of defs) {
            out.push(renderChart(def));
        }
    }

    return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

for (const spec of BACKENDS) {
    const md = renderBackend(spec);
    const path = resolve(DOCS_DIR, spec.file);
    writeFileSync(path, md, 'utf8');
    const total = Object.values(spec.defs).reduce((n, defs) => n + defs.length, 0);
    // eslint-disable-next-line no-console
    console.log(`Wrote ${spec.file} (${total} chart types)`);
}
