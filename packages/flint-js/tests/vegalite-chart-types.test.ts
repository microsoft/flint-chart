// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { ChartPropertyDef, ChartTemplateDef, EncodingActionDef } from '../src/core/types';
import { vlAllTemplateDefs } from '../src/vegalite/templates';
import { generateVegaLiteChartTypes, propertyType } from '../scripts/vegalite-chart-types';

function template(properties: ChartPropertyDef[] = [], encodingActions: EncodingActionDef[] = []): ChartTemplateDef {
    return {
        chart: 'Test', template: {}, channels: [], markCognitiveChannel: 'position',
        instantiate: () => {}, properties, encodingActions,
    };
}

describe('Vega-Lite authoring property domains', () => {
    it('keeps binary and continuous domains broad, with explicit default resets', () => {
        expect(propertyType({ type: 'binary', defaultValue: true }, 'toggle')).toBe('boolean | undefined');
        expect(propertyType({ type: 'continuous', min: 5, max: 50, defaultValue: 0 }, 'bins'))
            .toBe('number | undefined');
    });

    it('uses values, not display labels, and includes literal defaults', () => {
        expect(propertyType({
            type: 'discrete',
            options: [{ value: 'linear', label: 'Linear curve' }, { value: 'linear', label: 'Duplicate' }],
            defaultValue: 'auto',
        }, 'curve')).toBe('"auto" | "linear" | undefined');
    });

    it('preserves primitive literals, null, undefined, and escaped strings', () => {
        const values = [undefined, null, false, true, -1, 2.5, 'a"\n\\b'];
        const output = propertyType({
            type: 'discrete', options: values.map(value => ({ value, label: 'unused' })),
            defaultValue: undefined,
        }, 'primitives');
        expect(output).toBe([JSON.stringify('a"\n\\b'), '-1', '2.5', 'false', 'null', 'true', 'undefined'].sort().join(' | '));
    });

    it('preserves arrays as finite tuples, including nested arrays and array defaults', () => {
        expect(propertyType({
            type: 'discrete',
            options: [
                { value: [105, 35], label: 'China' },
                { value: [], label: 'Empty' },
                { value: [[1], 'a', undefined], label: 'Nested' },
            ],
            defaultValue: [0, 0],
        }, 'center')).toBe('[0, 0] | [105, 35] | [[1], "a", undefined] | [] | undefined');
    });

    it.each([NaN, Infinity, -Infinity, {}, new Date(0), /pattern/, () => 0, Symbol('value'), 1n])(
        'rejects unsupported enum values: %s', value => {
            expect(() => propertyType({ type: 'discrete', options: [{ value, label: 'invalid' }] }, 'Chart.key'))
                .toThrow('Chart.key: unsupported enum value');
        },
    );

    it('rejects unsupported defaults and values nested in arrays', () => {
        expect(() => propertyType({
            type: 'discrete', options: [{ value: 1, label: 'One' }], defaultValue: {},
        }, 'choice')).toThrow('choice default: unsupported enum value');
        expect(() => propertyType({
            type: 'discrete', options: [{ value: [0, Infinity], label: 'Invalid' }],
        }, 'center')).toThrow('center[1]: unsupported enum value');
        expect(() => propertyType({ type: 'continuous', min: 0, max: 1, defaultValue: NaN }, 'size'))
            .toThrow('invalid continuous default');
        // @ts-expect-error Deliberately malformed registry metadata must also fail at generation time.
        expect(() => propertyType({ type: 'binary', defaultValue: 'true' }, 'toggle'))
            .toThrow('invalid binary default');
    });

    it('rejects empty or malformed discrete domains, even with a default', () => {
        expect(() => propertyType({ type: 'discrete', options: [], defaultValue: 'auto' }, 'choice'))
            .toThrow('discrete options must be nonempty');
        // @ts-expect-error Deliberately missing options.
        expect(() => propertyType({ type: 'discrete' }, 'choice')).toThrow('discrete options must be nonempty');
        // @ts-expect-error A missing value differs from an explicitly registered undefined.
        expect(() => propertyType({ type: 'discrete', options: [{ label: 'Missing' }] }, 'choice'))
            .toThrow('enum option must declare a value');
        // @ts-expect-error New unsupported metadata must not become any, unknown, or string.
        expect(() => propertyType({ type: 'text' }, 'choice')).toThrow('unsupported property metadata');
    });

    it('rejects sparse and cyclic enum arrays', () => {
        const cyclic: unknown[] = [];
        cyclic.push(cyclic);
        for (const [value, message] of [[new Array(2), 'sparse'], [cyclic, 'cyclic']] as const) {
            expect(() => propertyType({ type: 'discrete', options: [{ value, label: 'Invalid' }] }, 'array'))
                .toThrow(`${message} enum array`);
        }
    });
});

describe('Vega-Lite authoring generation', () => {
    const generated = readFileSync(new URL('../src/vegalite/chart-types.generated.ts', import.meta.url), 'utf8')
        .replace(/\r\n/g, '\n');

    it('matches the checked-in output from the live registry', () => {
        expect(generateVegaLiteChartTypes()).toBe(generated);
    });

    it('is deterministic independent of chart, property, action, and option order', () => {
        const reversed = [...vlAllTemplateDefs].reverse().map(definition => ({
            ...definition,
            properties: [...(definition.properties ?? [])].reverse().map(property =>
                property.type === 'discrete' ? { ...property, options: [...property.options].reverse() } : property),
            encodingActions: [...(definition.encodingActions ?? [])].reverse().map(action => ({
                ...action,
                control: action.control.type === 'discrete'
                    ? { ...action.control, options: [...action.control.options].reverse() }
                    : action.control,
            })),
        }));
        expect(generateVegaLiteChartTypes(reversed)).toBe(generated);
    });

    it('detects registry additions and property/action domain drift', () => {
        expect(generateVegaLiteChartTypes([...vlAllTemplateDefs, template()])).not.toBe(generated);
        const [first, ...rest] = vlAllTemplateDefs;
        expect(generateVegaLiteChartTypes([{
            ...first,
            properties: [...(first.properties ?? []), { key: 'newProperty', label: 'New', type: 'binary' }],
        }, ...rest])).not.toBe(generated);
        const changed = vlAllTemplateDefs.map(definition => ({
            ...definition,
            encodingActions: definition.encodingActions?.map(action => ({
                ...action,
                control: { type: 'binary' as const },
            })),
        }));
        expect(generateVegaLiteChartTypes(changed)).not.toBe(generated);
    });

    it('derives both properties and encoding controls without running data-dependent callbacks', () => {
        const callback = vi.fn(() => { throw new Error('Must not evaluate runtime applicability'); });
        const result = generateVegaLiteChartTypes([template(
            [{ key: 'toggle', label: 'Toggle', type: 'binary', check: callback }],
            [{ key: 'action', label: 'Action', control: { type: 'discrete', options: [{ value: 'accepted', label: 'Label' }] },
                get: callback, set: callback, isApplicable: callback }],
        )]);
        expect(result).toContain('"toggle"?: boolean | undefined');
        expect(result).toContain('"action"?: "accepted" | undefined');
        expect(callback).not.toHaveBeenCalled();
    });

    it('adds only the two source-backed supplements where structurally eligible', () => {
        for (const definition of vlAllTemplateDefs) {
            const result = generateVegaLiteChartTypes([definition]);
            expect(result.includes('"facetColumns"?: number | undefined'), definition.chart)
                .toBe(definition.channels.includes('column'));
            expect(result.includes('"showTextLabels"?: boolean | undefined'), definition.chart)
                .toBe(definition.properties?.some(property => property.key === 'showValueLabels') ?? false);
        }
        expect(generateVegaLiteChartTypes([{ ...template(), channels: ['row'] }])).not.toContain('"facetColumns"');
    });

    it('excludes dynamic IDs without adding a loose index signature', () => {
        const result = generateVegaLiteChartTypes([template(
            [{ key: 'pivot', label: 'Pivot', type: 'binary' }],
            ['chartType', 'arrange'].map(key => ({
                key, label: key, control: { type: 'binary' }, get: () => false, set: encodings => encodings,
            })),
        )]);
        expect(result).toContain('"Test": never;');
        expect(result).not.toMatch(/"(pivot|chartType|arrange)"\?:|\[key: string\]/);
    });

    it('rejects empty registries and conflicting names instead of overwriting metadata', () => {
        expect(() => generateVegaLiteChartTypes([])).toThrow('registry is empty');
        expect(() => generateVegaLiteChartTypes([template(), template()])).toThrow('duplicate chart name');
        const property: ChartPropertyDef = { key: 'same', label: 'Same', type: 'binary' };
        expect(() => generateVegaLiteChartTypes([template([property, property])])).toThrow('duplicate property');
        expect(() => generateVegaLiteChartTypes([template([property], [{
            key: 'same', label: 'Same', control: { type: 'binary' }, get: () => false, set: encodings => encodings,
        }])])).toThrow('duplicate property');
    });
});
