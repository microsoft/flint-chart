import { describe, expect, it } from 'vitest';
import { compile } from 'vega-lite';
import { TEST_GENERATORS } from '../src/test-data';
import { assembleVegaLite } from '../src/index';
import { vlListTooltipFields } from '../src/vegalite/instantiate-spec';

/** The labels each mark's tooltip lists, as the compiled Vega spec draws them. */
function tooltipLabels(input: any): string[][] {
    const spec: any = assembleVegaLite({ ...input, options: { ...(input.options ?? {}), addTooltips: true } });
    const { _theme, _canvasFit, _legendLayout, ...vl } = spec;
    const out: string[][] = [];
    JSON.stringify(compile(vl).spec, (key, value) => {
        if (key === 'tooltip' && value && typeof value.signal === 'string' && value.signal.startsWith('{')) {
            out.push([...value.signal.matchAll(/"((?:[^"\\]|\\.)*)":\s/g)].map((match) => match[1]));
        }
        return value;
    });
    return out;
}

function fromCase(chartType: string, theme?: string): any {
    const testCase = (TEST_GENERATORS as any)[chartType]()[0];
    const names = new Map(testCase.fields.map((field: any) => [field.id, field.name]));
    const encodings = Object.fromEntries(Object.entries<any>(testCase.encodingMap)
        .filter(([, encoding]) => names.get(encoding?.fieldID)).map(([channel, encoding]) => [channel, names.get(encoding.fieldID)]));
    return {
        data: { values: testCase.data },
        semantic_types: Object.fromEntries(Object.entries<any>(testCase.metadata).map(([field, meta]) => [field, meta.semanticType])),
        chart_spec: { chartType: testCase.chartType, encodings, chartProperties: testCase.chartProperties },
        ...(theme ? { theme_spec: theme } : {}),
    };
}

const working = (label: string) => /^(__|_flint)/.test(label);

describe('tooltips and Flint\'s working columns', () => {
    it('lists no position, order or connector column a template computes', () => {
        for (const type of ['Radar Chart', 'Pie Chart', 'Waterfall Chart', 'Strip Plot']) {
            const labels = tooltipLabels(fromCase(type)).flat();
            expect(labels.filter(working), type).toEqual([]);
        }
    });

    it('lists a repacked field under the author\'s name', () => {
        // The waterfall's step kind is its own column, named for the reader.
        expect(tooltipLabels(fromCase('Waterfall Chart')).flat()).toContain('Type');
        // A colour key folded into "Others" is listed under its field, and its sort index not at all.
        const groups = Array.from({ length: 20 }, (_, index) => ({ Category: ['A', 'B', 'C'][index % 3], Value: index + 1, Segment: `Segment ${index + 1}` }));
        const labels = tooltipLabels({
            data: { values: groups }, semantic_types: { Category: 'Category', Value: 'Quantity', Segment: 'Category' },
            chart_spec: { chartType: 'Bar Chart', encodings: { x: 'Category', y: 'Value', color: 'Segment' } }, theme_spec: 'economist',
        }).flat();
        expect(labels).toContain('Segment');
        expect(labels.filter(working)).toEqual([]);
    });

    it('keeps a boxplot\'s own summary', () => {
        const labels = tooltipLabels(fromCase('Boxplot')).flat();
        expect(labels.some((label) => /Q1|Median|Whisker/i.test(label))).toBe(true);
    });

    it('leaves a spec alone where tooltips are off', () => {
        const spec = { mark: 'point', encoding: { x: { field: '__x', type: 'quantitative' }, y: { field: 'Value', type: 'quantitative' } } };
        const copy = structuredClone(spec);
        vlListTooltipFields(copy);
        expect(copy).toEqual(spec);
        const on = { ...structuredClone(spec), config: { mark: { tooltip: true } } };
        vlListTooltipFields(on);
        expect((on as any).encoding.tooltip).toEqual([{ field: 'Value', type: 'quantitative' }]);
    });

    it('lists no sort index Vega-Lite computes to stack in a colour domain\'s order', () => {
        // Interactive filtering pins the colour domain after assembly, then lists the tooltip again.
        const spec: any = assembleVegaLite({
            data: { values: ['Drama', 'Comedy', 'Action'].map((Genre, index) => ({ Genre, Movies: 100 - index })) },
            semantic_types: { Genre: 'Category', Movies: 'Count' },
            chart_spec: { chartType: 'Bar Chart', encodings: { y: 'Genre', x: 'Movies', color: 'Genre' } },
            options: { addTooltips: true },
        } as any);
        const { _theme, _canvasFit, _legendLayout, ...vl } = spec;
        vl.encoding.color.scale = { ...vl.encoding.color.scale, domain: ['Action', 'Comedy', 'Drama'] };
        vlListTooltipFields(vl);
        const signals: string[] = [];
        JSON.stringify(compile(vl).spec, (key, value) => {
            if (key === 'tooltip' && typeof value?.signal === 'string' && value.signal.startsWith('{')) signals.push(value.signal);
            return value;
        });
        expect(signals.length).toBeGreaterThan(0);
        for (const signal of signals) {
            expect(signal).not.toContain('sort_index');
            expect(signal).toContain('"Genre"');
            expect(signal).toContain('"Movies"');
        }
        // A stack its author unstacked computes no index, and its tooltip is left to Vega-Lite.
        const unstacked = { mark: 'bar', config: { mark: { tooltip: true } }, encoding: {
            x: { field: 'Movies', type: 'quantitative', stack: null }, y: { field: 'Genre', type: 'nominal' },
            color: { field: 'Genre', type: 'nominal', scale: { domain: ['Action'] } } } };
        vlListTooltipFields(unstacked);
        expect((unstacked.encoding as any).tooltip).toBeUndefined();
    });
});
