// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Barrel export for chart test-data generators.
 *
 * Re-exports every generator plus the shared types,
 * and exposes the master TEST_GENERATORS map and GALLERY_SECTIONS config.
 */

// Shared types & helpers
export type { TestCase, DateFormat } from './types';
export { makeField, makeEncodingItem, inferType, buildMetadata } from './types';

// Utilities
export { seededRandom, genDates, genMonths, genYears, genNaturalDates, genCategories, genRandomNames, genMeasure } from './generators';

// Chart-type generators
export { genScatterTests, genRegressionTests } from './scatter-tests';
export { genBarTests, genStackedBarTests, genGroupedBarTests } from './bar-tests';
export { genHistogramTests, genBoxplotTests, genDensityTests, genStripPlotTests } from './distribution-tests';
export { genDensityContourTests } from './density-2d-tests';
export { genViolinTests } from './violin-tests';
export { genLineTests } from './line-tests';
export { genSparklineTests } from './sparkline-tests';
export { genBumpChartTests } from './line-area-tests';
export { genSlopeTests, genEChartsSlopeTests, genChartJsSlopeTests } from './slope-tests';
export { genConnectedScatterTests, genEChartsConnectedScatterTests, genChartJsConnectedScatterTests } from './connected-scatter-tests';
export { genAreaTests, genStreamgraphTests } from './area-tests';
export { genRangeAreaTests, genEChartsRangeAreaTests, genChartJsRangeAreaTests } from './range-area-tests';
export { genEcdfTests, genEChartsEcdfTests, genChartJsEcdfTests } from './ecdf-tests';
export {
    genHeatmapTests, genPieTests, genRangedDotPlotTests, genLollipopTests,
    genWaterfallTests, genBarTableTests, genCandlestickTests, genRadarTests, genPyramidTests,
    genRoseTests,
} from './specialized-tests';
export { FACET_SIZES, DISCRETE_SIZES, genFacetColumnTests, genFacetRowTests, genFacetColRowTests, genFacetSmallTests, genFacetWrapTests, genFacetClipTests, genFacetOverflowedColTests, genFacetOverflowedColRowTests, genFacetOverflowedRowTests, genFacetDenseLineTests } from './facet-tests';
export { genOverflowTests, genElasticityTests } from './stress-tests';
export { genGasPressureTests } from './gas-pressure-tests';
export { genLineAreaStretchTests } from './line-area-stretch-tests';
export { genEChartsScatterTests, genEChartsLineTests, genEChartsBarTests, genEChartsStackedBarTests, genEChartsGroupedBarTests, genEChartsStressTests, genEChartsAreaTests, genEChartsPieTests, genEChartsHeatmapTests, genEChartsHistogramTests, genEChartsBoxplotTests, genEChartsRadarTests, genEChartsCandlestickTests, genEChartsStreamgraphTests, genEChartsFacetSmallTests, genEChartsFacetWrapTests, genEChartsFacetClipTests, genEChartsRoseTests, genEChartsGaugeTests, genEChartsFunnelTests, genEChartsTreemapTests, genEChartsSunburstTests, genEChartsSankeyTests, genEChartsUniqueStressTests, genEChartsCalendarTests, genEChartsParallelTests, genEChartsGraphTests, genEChartsTreeTests } from './echarts-tests';
export { genChartJsScatterTests, genChartJsLineTests, genChartJsBarTests, genChartJsStackedBarTests, genChartJsGroupedBarTests, genChartJsAreaTests, genChartJsPieTests, genChartJsHistogramTests, genChartJsRadarTests, genChartJsStressTests, genChartJsRoseTests, genChartJsBubbleTests, genChartJsDoughnutTests, genChartJsComboTests } from './chartjs-tests';
export { genPlotlyCoreTests, genPlotlyFacetTests } from './plotly-tests';
export { genDiscreteAxisTests } from './discrete-axis-tests';
export { genDateTests, genDateYearTests, genDateMonthTests, genDateYearMonthTests, genDateDecadeTests, genDateDateTimeTests, genDateHoursTests } from './date-tests';
export { genSemanticContextTests, genSnapToBoundTests } from './semantic-tests';
export { genMapTests, genChoroplethTests } from './map-tests';
export { genGanttTests, genBulletTests, genKpiCardTests } from './gantt-bullet-tests';
export {
    OMNI_VIZ_ROWS,
    OMNI_VIZ_LEVELS,
    OMNI_VIZ_MONTHS,
    OMNI_VIZ_REGIONS,
    OMNI_VIZ_GAME_TYPES,
    OMNI_VIZ_GAME_ORDER,
    omniVizDetailTable,
    omniVizGroupedBarRegionGameTypeTable,
    omniVizHeatmapGameMonthTable,
    omniVizLineTable,
    omniVizSunburstTable,
    omniVizWaterfallTable,
    type OmniVizRow,
} from './omni-viz-dataset';
export {
    genOmniVizGroupedBarTests,
    genOmniVizLineTests,
    genOmniVizHeatmapTests,
    genOmniVizSunburstTests,
    genOmniVizWaterfallTests,
    GALLERY_OMNI_VIZ_GENERATOR_KEYS,
    OMNI_VIZ_GALLERY_DATA_TABLE_ENTRY,
} from './omni-viz-tests';

export {
    STATIC_SERIES_GALLERY_EXAMPLES,
    STATIC_SERIES_LINE_BASIC,
    STATIC_SERIES_LINE_THREE_KPIS,
    STATIC_SERIES_LINE_MANY_SERIES,
    STATIC_SERIES_DOTTED_LINE_STOCKS,
    STATIC_SERIES_AREA_STACKED,
    STATIC_SERIES_SCATTER,
} from './static-series-tests';

// ---------------------------------------------------------------------------
// Master TEST_GENERATORS map
// ---------------------------------------------------------------------------
import { TestCase } from './types';

import { genScatterTests, genRegressionTests } from './scatter-tests';
import { genBarTests, genStackedBarTests, genGroupedBarTests, galleryBarSizingShowcase } from './bar-tests';
import { genHistogramTests, genBoxplotTests, genDensityTests, genStripPlotTests } from './distribution-tests';
import { genDensityContourTests } from './density-2d-tests';
import { genViolinTests } from './violin-tests';
import { genMapTests, genChoroplethTests } from './map-tests';
import { genGanttTests, genBulletTests, genKpiCardTests } from './gantt-bullet-tests';
import { genLineTests } from './line-tests';
import { genSparklineTests } from './sparkline-tests';
import { genBumpChartTests } from './line-area-tests';
import { genSlopeTests, genEChartsSlopeTests, genChartJsSlopeTests } from './slope-tests';
import { genConnectedScatterTests, genEChartsConnectedScatterTests, genChartJsConnectedScatterTests } from './connected-scatter-tests';
import { genAreaTests, genStreamgraphTests } from './area-tests';
import { genRangeAreaTests, genEChartsRangeAreaTests, genChartJsRangeAreaTests } from './range-area-tests';
import { genEcdfTests, genEChartsEcdfTests, genChartJsEcdfTests } from './ecdf-tests';
import {
    genHeatmapTests, genPieTests, genDonutTests, genRangedDotPlotTests, genLollipopTests,
    genWaterfallTests, genBarTableTests, genCandlestickTests, genRadarTests, genPyramidTests,
    genRoseTests,
} from './specialized-tests';
import { genFacetColumnTests, genFacetRowTests, genFacetColRowTests, genFacetSmallTests, genFacetWrapTests, genFacetClipTests, genFacetOverflowedColTests, genFacetOverflowedColRowTests, genFacetOverflowedRowTests, genFacetDenseLineTests } from './facet-tests';
import { genOverflowTests, genElasticityTests } from './stress-tests';
import { genGasPressureTests } from './gas-pressure-tests';
import { genLineAreaStretchTests } from './line-area-stretch-tests';
import { genDiscreteAxisTests } from './discrete-axis-tests';
import { genDateYearTests, genDateMonthTests, genDateYearMonthTests, genDateDecadeTests, genDateDateTimeTests, genDateHoursTests } from './date-tests';
import { genSemanticContextTests, genSnapToBoundTests } from './semantic-tests';
import { genEChartsScatterTests, genEChartsLineTests, genEChartsBarTests, genEChartsStackedBarTests, genEChartsGroupedBarTests, genEChartsStressTests, genEChartsAreaTests, genEChartsPieTests, genEChartsHeatmapTests, genEChartsHistogramTests, genEChartsBoxplotTests, genEChartsRadarTests, genEChartsCandlestickTests, genEChartsStreamgraphTests, genEChartsFacetSmallTests, genEChartsFacetWrapTests, genEChartsFacetClipTests, genEChartsRoseTests, genEChartsGaugeTests, genEChartsFunnelTests, genEChartsTreemapTests, genEChartsSunburstTests, genEChartsSankeyTests, genEChartsUniqueStressTests, genEChartsCalendarTests, genEChartsParallelTests, genEChartsGraphTests, genEChartsTreeTests } from './echarts-tests';
import { genChartJsScatterTests, genChartJsLineTests, genChartJsBarTests, genChartJsStackedBarTests, genChartJsGroupedBarTests, genChartJsAreaTests, genChartJsPieTests, genChartJsHistogramTests, genChartJsRadarTests, genChartJsStressTests, genChartJsRoseTests, genChartJsBubbleTests, genChartJsDoughnutTests, genChartJsComboTests } from './chartjs-tests';
import { genPlotlyCoreTests, genPlotlyFacetTests } from './plotly-tests';
import {
    genGalleryRegionalSurveyScatterTests,
    genGalleryRegionalSurveyLineTests,
    genGalleryRegionalSurveyBarTests,
    genGalleryRegionalSurveyStackedBarTests,
    genGalleryRegionalSurveyGroupedBarTests,
    genGalleryRegionalSurveyAreaTests,
    genGalleryRegionalSurveyPieTests,
    genGalleryRegionalSurveyHistogramTests,
    genGalleryRegionalSurveyRadarTests,
    genGalleryRegionalSurveyRoseTests,
} from '../gallery/regional-survey-tests';
import { genGalleryKpiCardTests } from '../gallery/bi-tests';
import {
    genOmniVizGroupedBarTests,
    genOmniVizLineTests,
    genOmniVizHeatmapTests,
    genOmniVizSunburstTests,
    genOmniVizWaterfallTests,
} from './omni-viz-tests';
import {
    galleryFacetBarExample,
    galleryFacetLineExample,
    galleryFacetScatterExample,
    galleryFacetAreaExample,
} from './gallery-facet-tests';

/** All test generators mapped by chart group */
export const TEST_GENERATORS: Record<string, () => TestCase[]> = {
    'Scatter Plot': () => [...genScatterTests(), galleryFacetScatterExample()],
    'Regression': genRegressionTests,
    'Bar Chart': () => [...genBarTests(), galleryBarSizingShowcase(), galleryFacetBarExample()],
    'Stacked Bar Chart': genStackedBarTests,
    'Grouped Bar Chart': genGroupedBarTests,
    'Histogram': genHistogramTests,
    'Heatmap': genHeatmapTests,
    'Line Chart': () => [...genLineTests(), galleryFacetLineExample()],
    'Sparkline': genSparklineTests,
    'Bump Chart': genBumpChartTests,
    'Slope Chart': genSlopeTests,
    'Connected Scatter Plot': genConnectedScatterTests,
    'Boxplot': genBoxplotTests,
    'Violin Plot': genViolinTests,
    'Pie Chart': genPieTests,
    'Donut Chart': genDonutTests,
    'Ranged Dot Plot': genRangedDotPlotTests,
    'Area Chart': () => [...genAreaTests(), galleryFacetAreaExample()],
    'Streamgraph': genStreamgraphTests,
    'Range Area Chart': genRangeAreaTests,
    'ECDF Plot': genEcdfTests,
    'Lollipop Chart': genLollipopTests,
    'Density Plot': genDensityTests,
    'Density Contour': genDensityContourTests,
    'Candlestick Chart': genCandlestickTests,
    'Waterfall Chart': genWaterfallTests,
    'Bar Table': genBarTableTests,
    'Strip Plot': genStripPlotTests,
    'Radar Chart': genRadarTests,
    'Pyramid Chart': genPyramidTests,
    'Rose Chart': genRoseTests,
    'Map': genMapTests,
    'Choropleth': genChoroplethTests,
    'Gantt Chart': genGanttTests,
    'Bullet Chart': genBulletTests,
    'KPI Card': genKpiCardTests,
    'Facet: Columns': genFacetColumnTests,
    'Facet: Rows': genFacetRowTests,
    'Facet: Cols+Rows': genFacetColRowTests,
    'Facet: Small': genFacetSmallTests,
    'Facet: Wrap': genFacetWrapTests,
    'Facet: Clip': genFacetClipTests,
    'Facet: Overflowed Col': genFacetOverflowedColTests,
    'Facet: Overflowed Col+Row': genFacetOverflowedColRowTests,
    'Facet: Overflowed Row': genFacetOverflowedRowTests,
    'Facet: Dense Line': genFacetDenseLineTests,
    'Overflow': genOverflowTests,
    'Elasticity & Stretch': genElasticityTests,
    'Dates: Year': genDateYearTests,
    'Dates: Month': genDateMonthTests,
    'Dates: Year-Month': genDateYearMonthTests,
    'Dates: Decade': genDateDecadeTests,
    'Dates: Date/DateTime': genDateDateTimeTests,
    'Dates: Hours': genDateHoursTests,
    'Discrete Axis Sizing': genDiscreteAxisTests,
    'Gas Pressure (§2)': genGasPressureTests,
    'Line/Area Stretch': genLineAreaStretchTests,
    'Semantic Context': genSemanticContextTests,
    'Snap-to-Bound': genSnapToBoundTests,
    'ECharts: Scatter': () => [...genEChartsScatterTests(), galleryFacetScatterExample()],
    'ECharts: Line': () => [...genEChartsLineTests(), galleryFacetLineExample()],
    'ECharts: Bar': () => [...genEChartsBarTests(), galleryFacetBarExample()],
    'ECharts: Stacked Bar': genEChartsStackedBarTests,
    'ECharts: Grouped Bar': genEChartsGroupedBarTests,
    'ECharts: Area': () => [...genEChartsAreaTests(), galleryFacetAreaExample()],
    'ECharts: Pie': genEChartsPieTests,
    'ECharts: Heatmap': genEChartsHeatmapTests,
    'ECharts: Histogram': genEChartsHistogramTests,
    'ECharts: Boxplot': genEChartsBoxplotTests,
    'ECharts: Radar': genEChartsRadarTests,
    'ECharts: Candlestick': genEChartsCandlestickTests,
    'ECharts: Streamgraph': genEChartsStreamgraphTests,
    'ECharts: Slope': genEChartsSlopeTests,
    'ECharts: Connected Scatter': genEChartsConnectedScatterTests,
    'ECharts: Range Area': genEChartsRangeAreaTests,
    'ECharts: ECDF': genEChartsEcdfTests,
    'ECharts: Facet Small': genEChartsFacetSmallTests,
    'ECharts: Facet Wrap': genEChartsFacetWrapTests,
    'ECharts: Facet Clip': genEChartsFacetClipTests,
    'ECharts: Rose': genEChartsRoseTests,
    'ECharts: Stress Tests': genEChartsStressTests,
    'ECharts: Gauge': genEChartsGaugeTests,
    'ECharts: Funnel': genEChartsFunnelTests,
    'ECharts: Treemap': genEChartsTreemapTests,
    'ECharts: Sunburst': genEChartsSunburstTests,
    'ECharts: Sankey': genEChartsSankeyTests,
    'ECharts: Calendar Heatmap *': genEChartsCalendarTests,
    'ECharts: Parallel Coordinates *': genEChartsParallelTests,
    'ECharts: Network Graph *': genEChartsGraphTests,
    'ECharts: Tree *': genEChartsTreeTests,
    'ECharts: Unique Stress': genEChartsUniqueStressTests,
    'Chart.js: Scatter': () => [...genChartJsScatterTests(), galleryFacetScatterExample()],
    'Chart.js: Line': () => [...genChartJsLineTests(), galleryFacetLineExample()],
    'Chart.js: Slope': genChartJsSlopeTests,
    'Chart.js: Connected Scatter': genChartJsConnectedScatterTests,
    'Chart.js: Range Area': genChartJsRangeAreaTests,
    'Chart.js: ECDF': genChartJsEcdfTests,
    'Chart.js: Bar': () => [...genChartJsBarTests(), galleryFacetBarExample()],
    'Chart.js: Stacked Bar': genChartJsStackedBarTests,
    'Chart.js: Grouped Bar': genChartJsGroupedBarTests,
    'Chart.js: Area': () => [...genChartJsAreaTests(), galleryFacetAreaExample()],
    'Chart.js: Pie': genChartJsPieTests,
    'Chart.js: Histogram': genChartJsHistogramTests,
    'Chart.js: Radar': genChartJsRadarTests,
    'Chart.js: Rose': genChartJsRoseTests,
    'Chart.js: Bubble *': genChartJsBubbleTests,
    'Chart.js: Doughnut *': genChartJsDoughnutTests,
    'Chart.js: Combo *': genChartJsComboTests,
    'Chart.js: Stress Tests': genChartJsStressTests,
    'Plotly: Core Templates': genPlotlyCoreTests,
    'Plotly: Facets': genPlotlyFacetTests,
    'Gallery: Scatter': genGalleryRegionalSurveyScatterTests,
    'Gallery: Line': genGalleryRegionalSurveyLineTests,
    'Gallery: Bar': genGalleryRegionalSurveyBarTests,
    'Gallery: Stacked Bar': genGalleryRegionalSurveyStackedBarTests,
    'Gallery: Grouped Bar': genGalleryRegionalSurveyGroupedBarTests,
    'Gallery: Area': genGalleryRegionalSurveyAreaTests,
    'Gallery: Pie': genGalleryRegionalSurveyPieTests,
    'Gallery: Histogram': genGalleryRegionalSurveyHistogramTests,
    'Gallery: Radar': genGalleryRegionalSurveyRadarTests,
    'Gallery: Rose': genGalleryRegionalSurveyRoseTests,
    'Gallery: KPI Card': genGalleryKpiCardTests,
    'Omni: Line': genOmniVizLineTests,
    'Omni: Grouped Bar': genOmniVizGroupedBarTests,
    'Omni: Waterfall': genOmniVizWaterfallTests,
    'Omni: Heatmap': genOmniVizHeatmapTests,
    'Omni: Sunburst': genOmniVizSunburstTests,
};

