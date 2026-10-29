// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it } from 'vitest';
import { assembleChartjs, assembleECharts, assemblePlotly, assembleVegaLite } from '../src';
import { cjsGetTemplateDef } from '../src/chartjs/templates';
import { ecGetTemplateDef } from '../src/echarts/templates';
import { plGetTemplateDef } from '../src/plotly/templates';
import { vlGetTemplateDef } from '../src/vegalite/templates';
import { TEST_GENERATORS, type TestCase } from '../src/test-data';
import type { ChartAssemblyInput, ChartEncoding, ChartWarning } from '../src/core/types';

function testCaseInput(testCase: TestCase): ChartAssemblyInput {
    const names = new Map(testCase.fields.map(field => [field.id, field.name]));
    const encodings: Record<string, ChartEncoding> = {};
    for (const [channel, encoding] of Object.entries(testCase.encodingMap)) {
        if (!encoding?.fieldID) continue;
        encodings[channel] = {
            field: names.get(encoding.fieldID) ?? encoding.fieldID,
            type: encoding.dtype,
            aggregate: encoding.aggregate,
            sortOrder: encoding.sortOrder,
            sortBy: encoding.sortBy,
            scheme: encoding.scheme,
        };
    }
    return {
        data: { values: testCase.data },
        semantic_types: {
            ...Object.fromEntries(Object.entries(testCase.metadata).map(([field, meta]) => [field, meta.semanticType])),
            ...testCase.semanticAnnotations,
        },
        chart_spec: {
            chartType: testCase.chartType,
            encodings,
            chartProperties: testCase.chartProperties,
            baseSize: { width: 350, height: 240 },
        },
        options: testCase.assembleOptions,
    } as ChartAssemblyInput;
}

function galleryBackend(group: string) {
    if (group.startsWith('ECharts:')) return [assembleECharts, ecGetTemplateDef] as const;
    if (group.startsWith('Chart.js:')) return [assembleChartjs, cjsGetTemplateDef] as const;
    if (group.startsWith('Plotly:')) return [assemblePlotly, plGetTemplateDef] as const;
    // These backends do not use the four template registries checked here.
    if (group.startsWith('Image-Charts:') || group.startsWith('Omni:')) return undefined;
    return [assembleVegaLite, vlGetTemplateDef] as const;
}

// These examples contain knobs the templates do not read. Keep reporting them;
// allowing a property on one chart must not silently allow it on another.
const EXPECTED_WARNINGS: Record<string, string[]> = {
    'Strip Plot': ['No Jitter (aligned strip): chartProperties.jitterWidth'],
    'Rose Chart': ['Donut Rose (12 months, innerRadius): chartProperties.innerRadius'],
};

describe('gallery and test-data input-key diagnostics', () => {
    for (const [group, generate] of Object.entries(TEST_GENERATORS)) {
        const backend = galleryBackend(group);
        if (!backend) continue;
        const [assemble, getTemplate] = backend;
        const cases = generate().filter(testCase => getTemplate(testCase.chartType));
        if (!cases.length) continue;
        it(`${group} has no unexpected unknown-key warnings`, () => {
            const failures: string[] = [];
            for (const testCase of cases) {
                const input = testCaseInput(testCase);
                const spec = assemble(input);
                for (const warning of (spec._warnings ?? []) as ChartWarning[]) {
                    if (warning.code === 'unknown-chart-property' || warning.code === 'unknown-assemble-option') {
                        failures.push(`${testCase.title}: ${warning.message.split(':', 1)[0]}`);
                    }
                }
            }
            expect([...new Set(failures)]).toEqual(EXPECTED_WARNINGS[group] ?? []);
        });
    }
});
