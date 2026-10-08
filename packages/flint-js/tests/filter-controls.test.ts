import { describe, expect, it } from 'vitest';
import {
    currentFilters,
    describeFilterFields,
    filterControls,
    rowMatchesFilters,
    valueMatchesFilter,
} from '../src/interactive/filter-controls';
import { resolveFilterPlacement, summarizeFilter } from '../src/interactive/filter-controls-dom';
import { legendToggle, navigate } from '../src/interactive/interactions';
import { chartStateKeys } from '../src/interactive/chart-state';
import { resolveInteractionSpec } from '../src/interactive/spec/resolve';
import type { ChartAssemblyInput } from '../src/core/types';
import type { InteractionContext } from '../src/core/interaction-contracts';

const rows = [
    { year: 2000, region: 'Asia', country: 'China', gdp: 1.2, member: true, date: '2000-01-01' },
    { year: 2010, region: 'Asia', country: 'India', gdp: 1.7, member: false, date: '2010-01-01' },
    { year: 2000, region: 'Europe', country: 'France', gdp: 1.4, member: true, date: '2000-01-01' },
    { year: 2020, region: 'Europe', country: 'Spain', gdp: 1.3, member: false, date: '2020-01-01' },
];

const input: ChartAssemblyInput = {
    data: { values: rows },
    semantic_types: { year: 'Year', region: 'Region', country: 'Country', gdp: 'Amount', date: 'Date' },
    chart_spec: { chartType: 'Bar Chart', encodings: { x: 'country', y: 'gdp', color: 'region' } },
};

const context = (available: InteractionContext['available'] = []): InteractionContext => ({
    chartType: 'Bar Chart',
    selected: [],
    available,
});

describe('filter matching', () => {
    it('keeps listed values and inclusive ranges', () => {
        expect(valueMatchesFilter('Asia', { in: ['Asia'] })).toBe(true);
        expect(valueMatchesFilter(2010, { in: ['2010'] })).toBe(true);
        expect(valueMatchesFilter(2010, { range: [2000, 2010] })).toBe(true);
        expect(valueMatchesFilter(2020, { range: [2000, 2010] })).toBe(false);
        expect(valueMatchesFilter('2010-01-01', { range: ['2005-01-01', '2015-01-01'] })).toBe(true);
        expect(valueMatchesFilter(null, { range: [0, 1] })).toBe(false);
    });

    it('requires every field to pass', () => {
        const filters = { region: { in: ['Asia'] }, year: { range: [2005, 2020] as const } };
        expect(rows.filter((row) => rowMatchesFilters(row, filters)).map((row) => row.country)).toEqual(['India']);
    });
});

describe('filterControls', () => {
    it('swaps in the passing rows in filter mode and clears with no filter', () => {
        const control = filterControls();
        control.filterControls.bindRows(rows);
        const update = control.handle({ field: 'region', value: { in: ['Europe'] } }, context());
        expect(update).toEqual({
            id: 'filter-controls',
            ops: [{ op: 'set-data', source: 'main', value: { rows: [rows[2], rows[3]] } }],
        });
        expect(control.filterControls.getFilters()).toEqual({ region: { in: ['Europe'] } });
        expect(control.handle({ field: 'region', value: null }, context())).toEqual({ id: 'filter-controls', ops: [] });
    });

    it('keeps the last rows with data and reports empty when no row passes', () => {
        const control = filterControls();
        control.filterControls.bindRows(rows);
        control.handle({ field: 'region', value: { in: ['Asia'] } }, context());
        expect(control.filterControls.isEmpty()).toBe(false);
        const update = control.handle({ field: 'year', value: { range: [2015, 2025] } }, context());
        expect(control.filterControls.isEmpty()).toBe(true);
        expect(update).toEqual({
            id: 'filter-controls',
            ops: [{ op: 'set-data', source: 'main', value: { rows: [rows[0], rows[1]] } }],
        });
        control.handle({ reset: true }, context());
        expect(control.filterControls.isEmpty()).toBe(false);
        const fresh = filterControls({ initial: { region: { in: ['Africa'] } } });
        fresh.filterControls.bindRows(rows);
        expect(fresh.handle({ filters: { region: { in: ['Africa'] } } }, context()))
            .toEqual({ id: 'filter-controls', ops: [{ op: 'set-data', source: 'main', value: { rows } }] });
        expect(fresh.filterControls.isEmpty()).toBe(true);
    });

    it('leaves the chart data alone while no rows are bound', () => {
        const control = filterControls();
        expect(control.handle({ field: 'region', value: { in: ['Europe'] } }, context()))
            .toEqual({ id: 'filter-controls', ops: [] });
        expect(control.filterControls.getFilters()).toEqual({ region: { in: ['Europe'] } });
    });

    it('emphasises the passing marks in highlight mode, muting all when none pass', () => {
        const control = filterControls({ mode: 'highlight', dimOpacity: 0.2 });
        const china = { value: { country: 'China' }, records: [rows[0]] };
        const spain = { value: { country: 'Spain' }, records: [rows[3]] };
        const update = control.handle({ field: 'member', value: { in: [true] } }, context([china, spain]));
        expect(update?.ops[0]).toEqual({
            op: 'set-style',
            targets: [{ visual: { kind: 'mark', role: 'mark' }, elements: [china] }],
            value: { state: 'emphasized', mutedOpacity: 0.2 },
        });
        const none = control.handle({ field: 'region', value: { in: [] } }, context([china, spain]));
        expect(none?.ops[0]).toMatchObject({ op: 'set-style', targets: [], value: { state: 'emphasized' } });
    });

    it('replaces, resets, notifies, and rejects malformed payloads', () => {
        const control = filterControls({ initial: { region: { in: ['Asia'] } } });
        let notified = 0;
        control.filterControls.subscribe(() => { notified += 1; });
        control.handle({ filters: { year: { range: [2000, 2000] } } }, context());
        expect(control.filterControls.getFilters()).toEqual({ year: { range: [2000, 2000] } });
        control.handle({ reset: true }, context());
        expect(control.filterControls.getFilters()).toEqual({});
        expect(notified).toBe(2);
        expect(() => control.handle({ field: 'year', value: { between: 1 } } as never, context())).toThrow(/in: \[...\]/);
        expect(() => filterControls({ initial: { year: 2000 } as never })).toThrow(/initial/);
    });

    it('merges the filters of every control into the chart state', () => {
        const a = filterControls({ id: 'a', initial: { region: { in: ['Asia'] } } });
        const b = filterControls({ id: 'b', initial: { year: { range: [2000, 2010] } } });
        expect(currentFilters([a, b, legendToggle()])).toEqual({ region: { in: ['Asia'] }, year: { range: [2000, 2010] } });
        expect(currentFilters([legendToggle()])).toBeUndefined();
        const keys = chartStateKeys({ chartType: 'Bar Chart', selected: [], filters: { region: { in: ['Asia'] } } });
        expect(keys.filters).not.toBe(chartStateKeys({ chartType: 'Bar Chart', selected: [] }).filters);
    });

    it('resolves from interaction_spec as an external definition', () => {
        const { interactions } = resolveInteractionSpec({
            interactions: [{ type: 'filter-controls', options: { fields: ['region'], mode: 'highlight' } }],
        });
        expect(interactions).toHaveLength(1);
        expect(interactions[0]).toMatchObject({ id: 'filter-controls', external: true, preset: 'filter-controls' });
    });
});

describe('describeFilterFields', () => {
    it('infers widgets and skips measures when choosing fields itself', () => {
        const fields = describeFilterFields(input, {});
        expect(fields.map((field) => [field.field, field.widget])).toEqual([
            ['year', 'range'],
            ['region', 'checkboxes'],
            ['country', 'checkboxes'],
            ['member', 'toggle'],
        ]);
        expect(fields[0]!.extent).toEqual([2000, 2020]);
    });

    it('leaves a field to the interaction that already filters it', () => {
        const fields = describeFilterFields(input, {}, [legendToggle()]).map((field) => field.field);
        expect(fields).not.toContain('region');
        const timeline: ChartAssemblyInput = { ...input, chart_spec: { chartType: 'Line Chart', encodings: { x: 'year', y: 'gdp' } } };
        expect(describeFilterFields(timeline, {}, [navigate()]).map((field) => field.field)).not.toContain('year');
    });

    it('always offers listed fields, with their widget and label', () => {
        const fields = describeFilterFields(input, {
            fields: ['region', { field: 'gdp', label: 'GDP' }, { field: 'country', widget: 'select' }, { field: 'date' }],
        }, [legendToggle()]);
        expect(fields.map((field) => [field.field, field.widget, field.label])).toEqual([
            ['region', 'checkboxes', 'region'],
            ['gdp', 'range', 'GDP'],
            ['country', 'select', 'country'],
            ['date', 'range', 'date'],
        ]);
        expect(fields[3]!.extent).toBeUndefined();
        expect(fields[3]!.values).toEqual(['2000-01-01', '2010-01-01', '2020-01-01']);
    });
});

describe('value formatting from semantic types', () => {
    it('writes dates at their grain, years plainly, and prices with their currency', () => {
        const monthly: ChartAssemblyInput = {
            data: { values: ['2015-08-01', '2015-09-01', '2025-08-01'].map((Month, index) => ({ Month, Year: 2000 + index * 5000, Price: 1.2 + index })) },
            semantic_types: { Month: 'YearMonth', Year: 'Year', Price: { semanticType: 'Price', unit: 'USD' } },
            chart_spec: { chartType: 'Line Chart', encodings: { x: 'Month', y: 'Price' } },
        };
        const [month, year, price] = describeFilterFields(monthly, { fields: ['Month', 'Year', 'Price'] });
        expect(month!.format!('2015-08-01')).toBe('Aug 2015');
        expect(summarizeFilter(month!, { range: ['2015-08-01', '2025-08-01'] })).toBe('Aug 2015–Aug 2025');
        expect(year!.format!(12000)).toBe('12000');
        expect(price!.format!(1.2)).toMatch(/^\$1\.2/);
    });
});

describe('filter placement and summary', () => {
    it('puts the controls under the chart unless asked for the top', () => {
        expect(resolveFilterPlacement('auto')).toBe('bottom');
        expect(resolveFilterPlacement(undefined)).toBe('bottom');
        expect(resolveFilterPlacement('bottom')).toBe('bottom');
        expect(resolveFilterPlacement('top')).toBe('top');
    });

    it('summarises a field in the chip', () => {
        const region = describeFilterFields(input, { fields: ['country'] })[0]!;
        expect(summarizeFilter(region, undefined)).toBe('All');
        expect(summarizeFilter(region, { in: [] })).toBe('None');
        expect(summarizeFilter(region, { in: ['China', 'India'] })).toBe('China, India');
        expect(summarizeFilter(region, { in: ['China', 'India', 'Spain'] })).toBe('3 of 4');
        expect(summarizeFilter(region, { range: [2000, 2010] })).toBe('2000–2010');
        expect(summarizeFilter(region, { range: [266353, 7476880] })).toBe('266K–7.48M');
    });
});

describe('filtered banded axis', () => {
    it('finds the step and size signals a filter re-lays out', async () => {
        const { layoutSignals } = await import('../src/vegalite/interactive');
        const spec = {
            signals: [
                { name: 'width', value: 200 },
                { name: 'y_step', value: 8 },
                { name: 'height', update: "bandspace(domain('y').length, 0.1, 0.05) * y_step" },
            ],
        };
        expect(layoutSignals(spec)).toEqual([
            { dimension: 'width', signal: 'width', kind: 'size' },
            { dimension: 'height', signal: 'y_step', kind: 'step' },
        ]);
        expect(spec.signals[2].update).toBe("bandspace(domain('y').length, 0.1, 0.05) * y_step");
    });
});

describe('single-choice fields that split the marks', () => {
    const timeUse = ['All people', 'Men', 'Women'].flatMap((group) => [20, 30].flatMap((age) =>
        ['Alone', 'Family'].map((who) => ({ group, age, who, hours: age / 10 }))));
    const lines: ChartAssemblyInput = {
        data: { values: timeUse },
        semantic_types: { group: 'Category', age: 'Quantity', who: 'Category', hours: 'Quantity' },
        chart_spec: { chartType: 'Line Chart', encodings: { x: 'age', y: 'hours', color: 'who' } },
    };

    it('makes a field the marks need a dropdown without All', () => {
        const [group] = describeFilterFields(lines, { fields: ['group'] });
        expect(group).toMatchObject({ widget: 'select', required: true, values: ['All people', 'Men', 'Women'] });
        // Highlight mode keeps every row drawn, so All stays meaningful.
        expect(describeFilterFields(lines, { mode: 'highlight', fields: ['group'] })[0]).not.toHaveProperty('required');
        expect(describeFilterFields(lines, { fields: [{ field: 'group', all: true }] })[0]).toMatchObject({ widget: 'checkboxes' });
    });

    it('leaves a field that only groups separate marks as checkboxes', () => {
        // Each country is one bar, so region narrows the bars without overdrawing them.
        const [region] = describeFilterFields(
            { ...input, chart_spec: { chartType: 'Bar Chart', encodings: { x: 'country', y: 'gdp' } } },
            { fields: ['region'] },
        );
        expect(region).toMatchObject({ widget: 'checkboxes' });
        expect(region).not.toHaveProperty('required');
        expect(describeFilterFields(input, { fields: [{ field: 'region', widget: 'select', all: false }] })[0])
            .toMatchObject({ required: true });
    });

    it('returns a required field to its default on reset or clear', () => {
        const definition = filterControls({ fields: ['group'] });
        definition.filterControls.bindRows(timeUse);
        definition.filterControls.setDefaults({ group: { in: ['All people'] } });
        expect(definition.filterControls.getFilters()).toEqual({ group: { in: ['All people'] } });
        definition.handle({ field: 'group', value: { in: ['Men'] } }, context());
        definition.handle({ field: 'group', value: null }, context());
        expect(definition.filterControls.getFilters()).toEqual({ group: { in: ['All people'] } });
        definition.handle({ field: 'group', value: { in: ['Women'] } }, context());
        definition.handle({ reset: true }, context());
        expect(definition.filterControls.getFilters()).toEqual({ group: { in: ['All people'] } });
    });
});
