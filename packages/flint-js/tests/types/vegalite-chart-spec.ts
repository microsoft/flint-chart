// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Compiled by tsc, both against source and the built package's public exports.
import type {
    ChartAssemblyInput,
    VegaLiteChartType,
    VegaLiteChartPropertiesMap,
    VegaLiteChartSpec,
} from 'flint-chart';
import type { VegaLiteChartSpec as BackendChartSpec } from 'flint-chart/vegalite';

type Equal<A, B> =
    (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
type NativeSpec = ChartAssemblyInput['chart_spec'];
type NativeFields = Omit<NativeSpec, 'chartType' | 'chartProperties'>;

export type NativeFieldsPreserved = Assert<Equal<
    Omit<VegaLiteChartSpec, 'chartType' | 'chartProperties'>, NativeFields
>>;
export type BackendExportMatches = Assert<Equal<VegaLiteChartSpec, BackendChartSpec>>;
export type NamesMatchMap = Assert<Equal<VegaLiteChartType, keyof VegaLiteChartPropertiesMap>>;

export const area = {
    chartType: 'Area Chart',
    title: 'Revenue',
    subtitle: 'By quarter',
    baseSize: { width: 400, height: 300 },
    canvasSize: { width: 800, height: 600 },
    encodings: {
        x: 'quarter',
        y: [{ field: 'revenue', type: 'quantitative', aggregate: 'sum' }, 'profit'],
        color: { field: 'region', type: 'nominal', sortOrder: 'ascending' },
    },
    chartProperties: { stackMode: 'layered', interpolate: 'cardinal', opacity: 0.7 },
} satisfies VegaLiteChartSpec;

export const native: NativeSpec = area;
export const input: ChartAssemblyInput = { data: { values: [] }, chart_spec: area };
export const noProperties = { chartType: 'Bar Chart', encodings: {} } satisfies VegaLiteChartSpec;
export const legacyOn = {
    chartType: 'Bar Chart', encodings: {}, chartProperties: { showTextLabels: true },
} satisfies VegaLiteChartSpec;
export const legacyOff = {
    chartType: 'Heatmap', encodings: {},
    chartProperties: { showTextLabels: false, showValueLabels: true, colorScheme: 'viridis' },
} satisfies VegaLiteChartSpec;
export const defaults = {
    chartType: 'Bar Chart', encodings: {},
    chartProperties: {
        cornerRadius: undefined, sort: undefined, showValueLabels: undefined,
        showTextLabels: undefined, facetColumns: undefined, xAxisType: undefined,
    },
} satisfies VegaLiteChartSpec;
export const range = {
    chartType: 'Range Area Chart', encodings: {},
    chartProperties: { interpolate: 'monotone', facetColumns: 3 },
} satisfies VegaLiteChartSpec;
export const sort: VegaLiteChartPropertiesMap['Bar Chart'] = { sort: 'value-desc' };
export const facets: VegaLiteChartPropertiesMap['Sparkline'] = { facetColumns: 2 };
export const center: VegaLiteChartPropertiesMap['Map'] = { projectionCenter: [105, 35] };
export const continuous: VegaLiteChartPropertiesMap['Histogram'] = { binCount: 0.5 };
export const calendar: VegaLiteChartType = 'Calendar Heatmap';

export function narrow(spec: VegaLiteChartSpec): NativeSpec {
    if (spec.chartType === 'Area Chart') {
        const stack: 'layered' | 'normalize' | 'center' | undefined = spec.chartProperties?.stackMode;
        void stack;
    }
    if (spec.chartType === 'Stacked Bar Chart') {
        const stack: 'normalize' | 'center' | undefined = spec.chartProperties?.stackMode;
        // @ts-expect-error Only area charts accept the layered stack mode.
        const layered: 'layered' = spec.chartProperties?.stackMode;
        void stack;
        void layered;
    }
    return spec;
}

// @ts-expect-error Chart names are the registered names, not arbitrary backend names.
export const wrongName: VegaLiteChartType = 'Area';
// @ts-expect-error The spec is a closed, nongeneric discriminated union.
export type NotGeneric = VegaLiteChartSpec<'Bar Chart'>;
// @ts-expect-error Discriminant and properties must agree.
export const wrongPair: VegaLiteChartSpec = { chartType: 'Stacked Bar Chart', encodings: {}, chartProperties: { stackMode: 'layered' } };
// @ts-expect-error Unknown property keys are rejected on authored literals.
export const wrongKey: VegaLiteChartPropertiesMap['Bar Chart'] = { cornerRaduis: 3 };
// @ts-expect-error Stacked bars do not have the area's layered mode.
export const wrongStack: VegaLiteChartPropertiesMap['Stacked Bar Chart'] = { stackMode: 'layered' };
// @ts-expect-error Range area has a narrower interpolation domain than area.
export const wrongCurve: VegaLiteChartPropertiesMap['Range Area Chart'] = { interpolate: 'cardinal' };
// @ts-expect-error Binary controls accept booleans, not strings.
export const wrongBoolean: VegaLiteChartPropertiesMap['Bar Chart'] = { showValueLabels: 'true' };
// @ts-expect-error Display labels are not enum values.
export const wrongLabel: VegaLiteChartPropertiesMap['Regression'] = { regressionMethod: 'Logarithmic' };
// @ts-expect-error Encoding actions have finite domains too.
export const wrongSort: VegaLiteChartPropertiesMap['Bar Chart'] = { sort: 'descending' };
// @ts-expect-error Only registered tuples, not arbitrary numeric pairs.
export const wrongCenter: VegaLiteChartPropertiesMap['Map'] = { projectionCenter: [1, 2] };
// @ts-expect-error Tuple length is preserved.
export const wrongCenterLength: VegaLiteChartPropertiesMap['Map'] = { projectionCenter: [105, 35, 0] };
// @ts-expect-error No legacy alias when the chart does not declare showValueLabels.
export const wrongAlias: VegaLiteChartPropertiesMap['Line Chart'] = { showTextLabels: true };
// @ts-expect-error Calendar does not declare a column facet channel.
export const wrongFacet: VegaLiteChartPropertiesMap['Calendar Heatmap'] = { facetColumns: 2 };
// @ts-expect-error Dynamic chart transitions are not a static property domain.
export const dynamicChart: VegaLiteChartPropertiesMap['Bar Chart'] = { chartType: 'Line Chart' };
// @ts-expect-error Pivot IDs are resolved from current data and encodings.
export const dynamicPivot: VegaLiteChartPropertiesMap['Bar Chart'] = { pivot: 'transpose' };
// @ts-expect-error Arrangement IDs are resolved from current data and encodings.
export const dynamicArrange: VegaLiteChartPropertiesMap['Bar Chart'] = { arrange: 'column' };
// @ts-expect-error Native title remains a string.
export const wrongTitle: VegaLiteChartSpec = { chartType: 'Bar Chart', encodings: {}, title: 123 };
// @ts-expect-error Native sizes remain numeric.
export const wrongSize: VegaLiteChartSpec = { chartType: 'Bar Chart', encodings: {}, baseSize: { width: '400', height: 300 } };
// @ts-expect-error Encodings remain required.
export const missingEncodings: VegaLiteChartSpec = { chartType: 'Bar Chart' };
// @ts-expect-error Native encoding values do not accept numbers.
export const wrongEncoding: VegaLiteChartSpec = { chartType: 'Bar Chart', encodings: { x: 123 } };
// @ts-expect-error Native field names remain strings.
export const wrongField: VegaLiteChartSpec = { chartType: 'Bar Chart', encodings: { x: { field: 123 } } };
// @ts-expect-error Native encoding type has a finite domain.
export const wrongEncodingType: VegaLiteChartSpec = { chartType: 'Bar Chart', encodings: { x: { type: 'number' } } };
// @ts-expect-error Static series preserve the native aggregate domain.
export const wrongSeries: VegaLiteChartSpec = { chartType: 'Bar Chart', encodings: { y: [{ field: 'revenue', aggregate: 'median' }] } };

// Existing dynamic callers keep the broad native contract.
export const dynamic: NativeSpec = {
    chartType: 'host-defined',
    encodings: {},
    chartProperties: { pivot: 'runtime-id', arrange: 'runtime-id', chartType: 'runtime-id' },
};
