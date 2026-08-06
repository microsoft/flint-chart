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
import type { ExcelTemplateDef } from '../packages/flint-js/src/excel/templates/types';
import { vlTemplateDefs } from '../packages/flint-js/src/vegalite/templates/index';
import { ecTemplateDefs } from '../packages/flint-js/src/echarts/templates/index';
import { cjsTemplateDefs } from '../packages/flint-js/src/chartjs/templates/index';
import { plTemplateDefs } from '../packages/flint-js/src/plotly/templates/index';
import { excelAllTemplateDefs } from '../packages/flint-js/src/excel/templates/index';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = resolve(__dirname, '../docs');
const ZH_DOCS_DIR = resolve(DOCS_DIR, 'zh-CN');

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
    showTextLabels: 'Render value labels on the marks (legacy spelling of showValueLabels).',
    showValueLabels: 'Print the numbers on the marks. Seeded from the theme’s own habit at this density; withheld when the marks are too dense to read. On a stacked bar each segment prints its own value, centred in the segment — or its share, where the stack is normalized. Printed values are rounded to about three significant figures, with a k/M suffix once the numbers get long — but never so far that two different marks print the same number, or a value that is not zero prints as zero, so the mark carries a number rather than a transcription.',
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

const ZH_PARAM_DESCRIPTIONS: Record<string, string> = {
    opacity: '标记不透明度。',
    fillOpacity: '区域填充不透明度。',
    dotSize: '点标记大小。',
    cornerRadius: '受支持标记的圆角半径。',
    taskHeight: '任务条占每行高度的百分比。',
    intervalLabels: '在任务区间上显示文本。',
    interpolate: '线或区域的插值方式。',
    showPoints: '在线上叠加点标记。',
    showTextLabels: '在标记上显示数值标签（showValueLabels 的旧写法）。',
    showValueLabels: '在标记上打印数值。默认值来自主题在当前密度下的习惯；标记过密时不提供该选项。堆叠柱状图会在每个分段中部打印该分段自身的数值；归一化堆叠时打印占比。打印的数值约保留三位有效数字，数值较大时使用 k/M 后缀，使标记上呈现的是可读数字而非完整转录。',
    showPercent: '将数值显示为总量百分比。',
    stackMode: '重叠系列的堆叠策略。',
    binCount: '最大分箱数。',
    bandwidth: '核密度带宽，0 表示自动。',
    innerRadius: '内半径占外半径的百分比。',
    filled: '填充雷达图围成的区域。',
    maxRows: '最多显示的表格行数。',
    regressionMethod: '回归拟合方法。',
    polyOrder: '多项式回归阶数。',
    showMA: '显示移动平均线。',
    maWindow: '移动平均窗口大小。',
    totals: '瀑布图总计标记。',
    showOutliers: '显示离群点。',
    showBox: '显示内部箱体。',
    sortSlices: '扇区排序方式。',
    labelType: '标签内容。',
    layout: '布局方向。',
    baseline: '参考基线。',
    trendWidth: '迷你趋势图宽度。',
    region: '地图区域。',
    projection: '地图投影。',
    projectionCenter: '地图投影中心。',
    sort: '有序阶段或类别的排序方式。',
    min: '最小值。',
    max: '最大值。',
};

const ZH_CATEGORY_NAMES: Record<string, string> = {
    'Scatter & Point': '散点与点图',
    Bar: '条形图',
    Distributions: '分布图',
    'Line & Area': '折线与区域图',
    Circular: '圆形图',
    'Tables & KPIs': '表格与 KPI',
    Maps: '地图',
    Opportunity: 'Plotly 特有图表',
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

function renderChartZh(def: ChartTemplateDef): string {
    const lines: string[] = [];
    const icon = ICON_BY_CHART[def.chart];
    lines.push(`### ${icon ? `![](${icon}) ` : ''}${def.chart}`, '');
    const channels = (def.channels ?? []).map((channel) => `\`${channel}\``).join(', ') || '_无_';
    lines.push(`**编码通道：** ${channels}`, '');
    const props = def.properties ?? [];
    if (props.length === 0) return [...lines, '_无模板专用参数。_', ''].join('\n');
    lines.push('| 参数 | 控件 | 取值范围 | 默认值 | 可用性 | 说明 |', '|---|---|---|---|---|---|');
    for (const property of props) {
        lines.push(
            `| \`${property.key}\` | ${controlLabel(property)} | ${domain(property)} | ${defaultValue(property)} | ${availability(property)} | ${ZH_PARAM_DESCRIPTIONS[property.key] ?? describe(property)} |`,
        );
    }
    lines.push('');
    return lines.join('\n');
}

function renderPlotlyZh(): string {
    const out = [
        '# Plotly 图表参考',
        '',
        '> 本页由实时图表模板注册表生成（`scripts/gen-chart-reference.ts`）。请勿手动编辑；请运行 `npm run gen:reference`。',
        '',
        'Plotly 后端编译为 Plotly.js `{ data, layout }` 图形，并优先使用原生 trace 类型。地图使用 Plotly 内置地理图集，无需外部 TopoJSON。',
        '',
        '## 本页内容',
        '',
        `本参考列出 Plotly 后端当前支持的 ${Object.values(plTemplateDefs).flat().length} 种图表，分为 ${Object.keys(plTemplateDefs).length} 类。图表名称必须与 \`chart_spec.chartType\` 中的值完全一致。`,
        '',
        '- **编码通道**：`chart_spec.encodings` 接受的视觉角色。',
        '- **选项**：模板专用的 `chart_spec.chartProperties` 键及其取值范围、默认值和可用性。',
        '',
        '## 设置编码与选项',
        '',
        '```jsonc',
        '{',
        '  "chartType": "Bar Chart",',
        '  "encodings": { "x": { "field": "category" }, "y": { "field": "value" } },',
        '  "chartProperties": { "cornerRadius": 4, "stackMode": "normalize" }',
        '}',
        '```',
        '',
        '可用性为 `conditional` 的参数仅在数据和编码适用时生效；不适用的参数会被 assembler 忽略。',
        '',
    ];
    for (const [category, defs] of Object.entries(plTemplateDefs)) {
        out.push(`## ${ZH_CATEGORY_NAMES[category] ?? category}`, '');
        for (const def of defs) out.push(renderChartZh(def));
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

function excelNativeTypes(def: ExcelTemplateDef): string {
    const { vertical, horizontal } = def.typeMapping;
    return horizontal && horizontal !== vertical ? `\`${vertical}\` / \`${horizontal}\`` : `\`${vertical}\``;
}

function renderExcelReference(locale: 'en' | 'zh-CN'): string {
    const zh = locale === 'zh-CN';
    const out = [
        `# ${zh ? 'Excel 图表参考' : 'Excel chart reference'}`,
        '',
        zh
            ? '> 本页由实时 Excel 图表模板注册表生成（`scripts/gen-chart-reference.ts`）。请勿手动编辑；请运行 `npm run gen:reference`。'
            : '> This page is generated from the live Excel chart-template registry (`scripts/gen-chart-reference.ts`). Do not edit it by hand — run `npm run gen:reference`.',
        '',
        zh
            ? 'Excel 后端把 Flint 规范编译为带版本的原生图表工件，再由 Office.js 在 Excel 工作簿中创建可编辑图表。'
            : 'The Excel backend compiles a Flint specification into a versioned native-chart artifact, which Office.js turns into an editable chart in an Excel workbook.',
        '',
        `## ${zh ? '支持的图表' : 'Supported charts'}`,
        '',
        zh
            ? `当前支持 ${excelAllTemplateDefs.length} 种图表。请在 \`chart_spec.chartType\` 中使用下表所示的精确名称。`
            : `The backend currently supports ${excelAllTemplateDefs.length} chart types. Use the exact name shown below in \`chart_spec.chartType\`.`,
        '',
        zh
            ? '| Flint 图表类型 | 编码通道 | 原生 `Excel.ChartType` |'
            : '| Flint chart type | Encoding channels | Native `Excel.ChartType` |',
        '|---|---|---|',
        ...excelAllTemplateDefs.map((def) => {
            const channels = def.channels.map((channel) => `\`${channel}\``).join(', ');
            return `| ${def.chart} | ${channels} | ${excelNativeTypes(def)} |`;
        }),
        '',
        `## ${zh ? '编译与渲染' : 'Compile and render'}`,
        '',
        zh
            ? '`assembleExcel(input)` 返回一个 `flint.excel.chart/v1` 工件。它描述工作表数据矩阵、原生图表类型、系列绑定、坐标轴、图例、标签及格式，但不会自行打开 Excel。'
            : '`assembleExcel(input)` returns a `flint.excel.chart/v1` artifact. It describes the worksheet data matrix, native chart type, series bindings, axes, legend, labels, and formatting, but does not open Excel itself.',
        '',
        '```ts',
        "import { assembleExcel, renderExcelChart } from 'flint-chart';",
        '',
        'const artifact = assembleExcel(input);',
        'const result = await renderExcelChart(Excel, artifact);',
        '```',
        '',
        zh
            ? '`renderExcelChart` 必须在提供 Office.js `Excel.run` 和 `Excel.ImageFittingMode.fit` 的 Excel 宿主中运行。它会在活动工作表中创建原生图表，并返回由 `Chart.getImage()` 捕获的 PNG。'
            : '`renderExcelChart` must run in an Excel host that provides Office.js `Excel.run` and `Excel.ImageFittingMode.fit`. It creates a native chart on the active worksheet and returns a PNG captured through `Chart.getImage()`.',
        '',
        zh
            ? '若需要可移植的 Office.js 源码而不是立即执行，可调用 `generateOfficeJs(artifact)`。'
            : 'Call `generateOfficeJs(artifact)` when you need portable Office.js source instead of immediate execution.',
        '',
        `## ${zh ? '限制' : 'Limitations'}`,
        '',
        zh
            ? '- 一个原生 Excel 图表不支持 Flint 的 `column` 或 `row` 分面。'
            : '- A single native Excel chart does not support Flint `column` or `row` facets.',
        zh
            ? '- 没有原生 Excel 对应类型的图表（例如 Heatmap）会在渲染前被拒绝。'
            : '- Chart types without a native Excel equivalent, such as Heatmap, are rejected before rendering.',
        zh
            ? '- 部分图表有更严格的数据要求；例如散点图要求定量 `x` 和 `y`，蜡烛图要求 `open`、`high`、`low`、`close` 通道。Assembler 会返回具体的验证错误。'
            : '- Some charts impose stricter data requirements. For example, scatter charts require quantitative `x` and `y`, while candlesticks require `open`, `high`, `low`, and `close`. The assembler reports a specific validation error.',
        '',
        zh
            ? '可使用 `excelGetTemplateDef(chartType)` 或 `excelGetTemplateChannels(chartType)` 在编译前检查支持情况。'
            : 'Use `excelGetTemplateDef(chartType)` or `excelGetTemplateChannels(chartType)` to check support before compiling.',
    ];
    return out.join('\n') + '\n';
}

for (const spec of BACKENDS) {
    const md = renderBackend(spec);
    const path = resolve(DOCS_DIR, spec.file);
    writeFileSync(path, md, 'utf8');
    const total = Object.values(spec.defs).reduce((n, defs) => n + defs.length, 0);
    // eslint-disable-next-line no-console
    console.log(`Wrote ${spec.file} (${total} chart types)`);
}

for (const [locale, directory] of [['en', DOCS_DIR], ['zh-CN', ZH_DOCS_DIR]] as const) {
    const file = 'reference-excel.md';
    writeFileSync(resolve(directory, file), renderExcelReference(locale), 'utf8');
    // eslint-disable-next-line no-console
    console.log(`Wrote ${locale === 'en' ? file : `zh-CN/${file}`} (${excelAllTemplateDefs.length} chart types)`);
}

writeFileSync(resolve(ZH_DOCS_DIR, 'reference-plotly.md'), renderPlotlyZh(), 'utf8');
// eslint-disable-next-line no-console
console.log(`Wrote zh-CN/reference-plotly.md (${Object.values(plTemplateDefs).flat().length} chart types)`);
