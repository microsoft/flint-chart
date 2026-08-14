// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Generates JSON Schema files describing the permitted Flint ChartAssemblyInput.
 *
 * Produces:
 *   docs/schema/flint-input.schema.json            — universal (chart types common to ALL backends)
 *   docs/schema/flint-input-vegalite.schema.json   — Vega-Lite backend
 *   docs/schema/flint-input-echarts.schema.json    — ECharts backend
 *   docs/schema/flint-input-chartjs.schema.json    — Chart.js backend
 *   docs/schema/flint-input-plotly.schema.json     — Plotly backend
 *
 * Run via:  npm run gen:schema   (bundled with esbuild, see root package.json)
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import type { ChartTemplateDef, ChartPropertyDef } from '../packages/flint-js/src/core/types';
import { vlTemplateDefs } from '../packages/flint-js/src/vegalite/templates/index';
import { ecTemplateDefs } from '../packages/flint-js/src/echarts/templates/index';
import { cjsTemplateDefs } from '../packages/flint-js/src/chartjs/templates/index';
import { plTemplateDefs } from '../packages/flint-js/src/plotly/templates/index';
import { getRegisteredTypes } from '../packages/flint-js/src/core/type-registry';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = resolve(__dirname, '../docs/schema');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CategorizedDefs = { [category: string]: ChartTemplateDef[] };

function flattenDefs(defs: CategorizedDefs): ChartTemplateDef[] {
    return Object.values(defs).flat();
}

function getChartNames(defs: CategorizedDefs): string[] {
    return flattenDefs(defs).map(d => d.chart).sort();
}

/**
 * Build a JSON Schema for `chartProperties` from a template's property defs.
 * Returns undefined if no properties are defined.
 */
function buildChartPropertiesSchema(properties: ChartPropertyDef[] | undefined): object | undefined {
    if (!properties || properties.length === 0) return undefined;

    const props: Record<string, object> = {};
    for (const p of properties) {
        switch (p.type) {
            case 'binary':
                props[p.key] = {
                    type: 'boolean',
                    description: p.label,
                    ...(p.defaultValue !== undefined ? { default: p.defaultValue } : {}),
                };
                break;
            case 'continuous':
                props[p.key] = {
                    type: 'number',
                    description: p.label,
                    minimum: p.min,
                    maximum: p.max,
                    ...(p.step !== undefined ? { multipleOf: p.step } : {}),
                    ...(p.defaultValue !== undefined ? { default: p.defaultValue } : {}),
                };
                break;
            case 'discrete':
                props[p.key] = {
                    description: p.label,
                    enum: p.options.map(o => o.value),
                    ...(p.defaultValue !== undefined ? { default: p.defaultValue } : {}),
                };
                break;
        }
    }

    return {
        type: 'object',
        properties: props,
        additionalProperties: true,
    };
}

/**
 * Build per-chart-type conditional schema blocks (allOf with if/then).
 */
function buildChartTypeConditions(defs: ChartTemplateDef[]): object[] {
    return defs.map(def => {
        const thenSchema: any = {
            properties: {
                encodings: {
                    type: 'object',
                    propertyNames: {
                        enum: def.channels,
                    },
                    additionalProperties: { $ref: '#/$defs/RawEncodingValue' },
                    description: `Valid channels for ${def.chart}`,
                },
            },
        };

        const propsSchema = buildChartPropertiesSchema(def.properties);
        if (propsSchema) {
            thenSchema.properties.chartProperties = propsSchema;
        }

        return {
            if: {
                properties: { chartType: { const: def.chart } },
                required: ['chartType'],
            },
            then: thenSchema,
        };
    });
}

// ---------------------------------------------------------------------------
// Schema Construction
// ---------------------------------------------------------------------------

/** All registered semantic type strings */
const SEMANTIC_TYPES = getRegisteredTypes();

/** Base definitions shared by all schemas */
function buildDefs(): Record<string, object> {
    return {
        ChartEncoding: {
            type: 'object',
            properties: {
                field: { type: 'string', description: 'Field (column) name from the data' },
                type: {
                    type: 'string',
                    enum: ['quantitative', 'nominal', 'ordinal', 'temporal'],
                    description: 'Encoding type override',
                },
                aggregate: {
                    type: 'string',
                    enum: ['count', 'sum', 'average', 'mean'],
                    description: 'Aggregation function',
                },
                sortOrder: {
                    type: 'string',
                    enum: ['ascending', 'descending'],
                    description: 'Sort order for this channel',
                },
                sortBy: { type: 'string', description: 'Field name to sort by' },
                scheme: { type: 'string', description: 'Color scheme name (color channel)' },
            },
            additionalProperties: false,
        },
        RawEncodingValue: {
            description: 'A channel encoding: an object, a bare field-name string shorthand, or an array (static series).',
            oneOf: [
                { $ref: '#/$defs/ChartEncoding' },
                { type: 'string', description: 'Shorthand for { field: <string> }' },
                {
                    type: 'array',
                    items: {
                        oneOf: [
                            { $ref: '#/$defs/ChartEncoding' },
                            { type: 'string' },
                        ],
                    },
                    description: 'Static series array (multiple fields on the same channel)',
                },
            ],
        },
        SemanticAnnotation: {
            type: 'object',
            properties: {
                semanticType: {
                    type: 'string',
                    description: 'Semantic type string (e.g. "Amount", "Country", "Year")',
                },
                intrinsicDomain: {
                    type: 'array',
                    items: { type: 'number' },
                    minItems: 2,
                    maxItems: 2,
                    description: 'Intrinsic domain [min, max] for bounded/scaled types',
                },
                unit: { type: 'string', description: 'Unit or currency code (e.g. "USD", "°C", "kg")' },
                sortOrder: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Explicit ordinal ordering',
                },
            },
            required: ['semanticType'],
            additionalProperties: false,
        },
        SemanticTypeValue: {
            description: 'A semantic type: either a string name or a SemanticAnnotation object.',
            oneOf: [
                {
                    type: 'string',
                    enum: SEMANTIC_TYPES,
                    description: 'Registered semantic type name',
                },
                { type: 'string', description: 'Custom/unregistered semantic type name' },
                { $ref: '#/$defs/SemanticAnnotation' },
            ],
        },
        Size: {
            type: 'object',
            properties: {
                width: { type: 'number', minimum: 1, description: 'Width in pixels' },
                height: { type: 'number', minimum: 1, description: 'Height in pixels' },
            },
            required: ['width', 'height'],
            additionalProperties: false,
        },
        AssembleOptions: {
            type: 'object',
            description: 'Layout tuning parameters. All optional with sensible defaults.',
            properties: {
                addTooltips: { type: 'boolean', description: 'Add tooltips (default: false)', default: false },
                stepPadding: { type: 'number', minimum: 0, maximum: 1, description: 'Inter-category padding fraction (default: 0.1)', default: 0.1 },
                elasticity: { type: 'number', description: 'Power-law exponent for discrete axis stretch (default: 0.5)', default: 0.5 },
                maxStretch: { type: 'number', minimum: 1, description: 'Maximum stretch multiplier (default: 2)', default: 2 },
                maxStretchX: { type: 'number', minimum: 1, description: 'Per-dimension X stretch cap' },
                maxStretchY: { type: 'number', minimum: 1, description: 'Per-dimension Y stretch cap' },
                facetElasticity: { type: 'number', description: 'Facet subplot stretch exponent (default: 0.3)', default: 0.3 },
                minStep: { type: 'number', minimum: 1, description: 'Min px per discrete axis item (default: 6)', default: 6 },
                maxColorValues: { type: 'integer', minimum: 1, description: 'Max distinct color values before truncation (default: 24)', default: 24 },
                minSubplotSize: { type: 'number', minimum: 1, description: 'Min facet subplot size in px (default: 60)', default: 60 },
                facetFixedPadding: { $ref: '#/$defs/Size', description: 'Fixed overhead in px for axis labels/titles/legend' },
                facetGap: { type: 'number', minimum: 0, description: 'Gap between facet panels in px' },
                facetColumns: { type: 'integer', minimum: 1, description: 'Explicit facet column count (overrides auto-wrap)' },
                defaultBandSize: { type: 'number', minimum: 1, description: 'Base px per discrete category at 300px baseline (default: 20)', default: 20 },
                maxBandSize: { type: 'number', minimum: 1, description: 'Max px per discrete category (sparse expansion ceiling)' },
                baseLabelFontSize: { type: 'number', minimum: 1, description: 'Base tick label font size (default: 10)', default: 10 },
                baseTitleFontSize: { type: 'number', minimum: 1, description: 'Base header/title font size (default: 11)', default: 11 },
                maintainContinuousAxisRatio: { type: 'boolean', description: 'Lock continuous axes aspect ratio (default: false)', default: false },
                continuousMarkCrossSection: {
                    description: 'Gas-pressure tuning for continuous axes',
                    oneOf: [
                        { type: 'number' },
                        {
                            type: 'object',
                            properties: {
                                x: { type: 'number' },
                                y: { type: 'number' },
                                elasticity: { type: 'number' },
                                maxStretch: { type: 'number' },
                                seriesCountAxis: { type: 'string', enum: ['x', 'y', 'auto'] },
                            },
                            required: ['x', 'y'],
                        },
                    ],
                },
                facetAspectRatioResistance: { type: 'number', minimum: 0, maximum: 1, description: 'Resistance to AR distortion when faceting (0–1)' },
                autoFacetWrap: { type: 'boolean', description: 'Auto-wrap column-only facets (default: true)', default: true },
                targetBandAR: { type: 'number', description: 'Target aspect ratio for a single band (0 = no correction)' },
            },
            additionalProperties: false,
        },
    };
}

/**
 * Build the full schema for a given set of chart type names and template definitions.
 */
function buildSchema(
    title: string,
    description: string,
    chartTypeNames: string[],
    allDefs: ChartTemplateDef[],
): object {
    // Only include templates that are in the chartTypeNames list
    const relevantDefs = allDefs.filter(d => chartTypeNames.includes(d.chart));
    const conditions = buildChartTypeConditions(relevantDefs);

    return {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: `https://github.com/microsoft/flint-chart/docs/schema/${title}`,
        title,
        description,
        type: 'object',
        properties: {
            $schema: {
                type: 'string',
                description: 'JSON Schema reference URI (confers no versioning guarantee; not currently used to validate input)',
            },
            data: {
                description: 'Data source — provide inline rows via `values`, or a local file path via `url`.',
                oneOf: [
                    {
                        type: 'object',
                        properties: {
                            values: {
                                type: 'array',
                                items: { type: 'object' },
                                description: 'Inline data rows (array of row objects)',
                            },
                        },
                        required: ['values'],
                        additionalProperties: false,
                    },
                    {
                        type: 'object',
                        properties: {
                            url: {
                                type: 'string',
                                description: 'Local file path to JSON/CSV/TSV data',
                            },
                        },
                        required: ['url'],
                        additionalProperties: false,
                    },
                ],
            },
            semantic_types: {
                type: 'object',
                description: 'Per-column semantic type annotations (field name → semantic type string or SemanticAnnotation object).',
                additionalProperties: { $ref: '#/$defs/SemanticTypeValue' },
            },
            chart_spec: {
                type: 'object',
                description: 'Chart specification — describes what to draw.',
                properties: {
                    chartType: {
                        type: 'string',
                        enum: chartTypeNames,
                        description: 'Chart template name',
                    },
                    encodings: {
                        type: 'object',
                        description: 'Channel → encoding map. Valid channels depend on chartType.',
                        additionalProperties: { $ref: '#/$defs/RawEncodingValue' },
                    },
                    baseSize: {
                        $ref: '#/$defs/Size',
                        description: 'Base (target) chart size in pixels (default: 400×320)',
                    },
                    canvasSize: {
                        $ref: '#/$defs/Size',
                        description: 'Hard ceiling on rendered size in pixels (optional)',
                    },
                    chartProperties: {
                        type: 'object',
                        description: 'Template-specific configurable properties. Valid properties depend on chartType.',
                        additionalProperties: true,
                    },
                },
                required: ['chartType', 'encodings'],
                // Per-chart-type conditional refinements
                allOf: conditions,
            },
            options: { $ref: '#/$defs/AssembleOptions' },
            field_display_names: {
                type: 'object',
                description: 'Field name → display label (used as axis titles and legend headers)',
                additionalProperties: { type: 'string' },
            },
        },
        required: ['data', 'chart_spec'],
        additionalProperties: false,
        $defs: buildDefs(),
    };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// Collect chart type names per backend
const vlNames = getChartNames(vlTemplateDefs);
const ecNames = getChartNames(ecTemplateDefs);
const cjsNames = getChartNames(cjsTemplateDefs);
const plNames = getChartNames(plTemplateDefs);

// Universal = intersection of all four backends
const universalNames = vlNames.filter(
    name => ecNames.includes(name) && cjsNames.includes(name) && plNames.includes(name),
);

// All flat template arrays
const vlAll = flattenDefs(vlTemplateDefs);
const ecAll = flattenDefs(ecTemplateDefs);
const cjsAll = flattenDefs(cjsTemplateDefs);
const plAll = flattenDefs(plTemplateDefs);

// For universal schema, use VL definitions as canonical (they have the broadest property coverage)
const universalDefs = vlAll.filter(d => universalNames.includes(d.chart));

interface SchemaSpec {
    title: string;
    file: string;
    description: string;
    chartNames: string[];
    defs: ChartTemplateDef[];
}

const schemas: SchemaSpec[] = [
    {
        title: 'flint-input',
        file: 'flint-input.schema.json',
        description: 'Flint ChartAssemblyInput — universal schema (chart types supported by all backends: Vega-Lite, ECharts, Chart.js, Plotly).',
        chartNames: universalNames,
        defs: universalDefs,
    },
    {
        title: 'flint-input-vegalite',
        file: 'flint-input-vegalite.schema.json',
        description: 'Flint ChartAssemblyInput — Vega-Lite backend (all chart types).',
        chartNames: vlNames,
        defs: vlAll,
    },
    {
        title: 'flint-input-echarts',
        file: 'flint-input-echarts.schema.json',
        description: 'Flint ChartAssemblyInput — ECharts backend (all chart types).',
        chartNames: ecNames,
        defs: ecAll,
    },
    {
        title: 'flint-input-chartjs',
        file: 'flint-input-chartjs.schema.json',
        description: 'Flint ChartAssemblyInput — Chart.js backend (all chart types).',
        chartNames: cjsNames,
        defs: cjsAll,
    },
    {
        title: 'flint-input-plotly',
        file: 'flint-input-plotly.schema.json',
        description: 'Flint ChartAssemblyInput — Plotly backend (all chart types).',
        chartNames: plNames,
        defs: plAll,
    },
];

// Ensure output directory exists
mkdirSync(SCHEMA_DIR, { recursive: true });

for (const spec of schemas) {
    const schema = buildSchema(spec.title, spec.description, spec.chartNames, spec.defs);
    const outPath = resolve(SCHEMA_DIR, spec.file);
    writeFileSync(outPath, JSON.stringify(schema, null, 2) + '\n', 'utf-8');
    console.log(`✓ ${spec.file} (${spec.chartNames.length} chart types)`);
}

console.log(`\nDone — ${schemas.length} schema files written to docs/schema/`);
