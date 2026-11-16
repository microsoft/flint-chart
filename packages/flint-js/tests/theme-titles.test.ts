import { vegaLiteStages } from '../src/vegalite/assemble';
import { TEST_GENERATORS } from '../src/test-data';
import { titleMeasures } from '../src/core/title-fit';
import { tableTextMeasurer } from '../src/core/text-width';
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { compile } from 'vega-lite';
import { parse, View } from 'vega';
import { assembleVegaLite as assembleWithoutDecisions, THEME_PRESETS } from '../src';

/** Compiles with the theme's full decisions attached, which these tests read. */
const assembleVegaLite = (input: any): any => assembleWithoutDecisions({ ...input, options: { ...input.options, themeDecisions: true } });
import type { ThemeSpec } from '../src/core/theme/types';

/**
 * Who names the numbers.
 *
 * `Jan`, `Cairo`, `Chrome` say what kind of thing they are; `26`, `5300` do
 * not, and something on the page has to. A theme can say where that naming
 * goes — the axis, the subtitle — but it cannot say the naming is unnecessary,
 * and the compiler holds it to that.
 */

const MONTHLY = [
    { Month: 'Jan', Rainfall: 26 },
    { Month: 'Feb', Rainfall: 20 },
    { Month: 'Mar', Rainfall: 31 },
    { Month: 'Apr', Rainfall: 14 },
];

function house(annotation: ThemeSpec['annotation'], legend?: ThemeSpec['legend']): ThemeSpec {
    return {
        id: 'house',
        label: 'House',
        ink: { surface: { canvas: '#ffffff' }, series: { single: '#333333' } },
        annotation,
        ...(legend ? { legend } : {}),
    } as ThemeSpec;
}

function bars(themeSpec: ThemeSpec, headline?: string) {
    return assembleVegaLite({
        data: { values: MONTHLY },
        semantic_types: { Month: 'Month', Rainfall: 'Amount' },
        chart_spec: {
            chartType: 'Bar Chart',
            ...(headline ? { title: headline } : {}),
            encodings: { x: 'Month', y: 'Rainfall' },
        },
        theme_spec: themeSpec,
    } as any) as any;
}

/** `null` = suppressed, `undefined` = left to Vega-Lite (the field name). */
function axisTitle(spec: any, channel: 'x' | 'y'): unknown {
    const enc = (spec.spec?.encoding ?? spec.encoding ?? spec.layer?.[0]?.encoding ?? {})[channel];
    return enc?.axis?.title;
}

describe('axis titles', () => {
    it.each([undefined, 'Unknown', 'CustomMeasure', 'Quantity', 'Percentage'].flatMap(semantic =>
        ['datawrapper', 'swiss'].flatMap(theme => [false, true].map(horizontal => ({ semantic, theme, horizontal }))),
    ))('renders the raw measure field without a display name or unit ($semantic / $theme / horizontal: $horizontal)', async ({ semantic, theme, horizontal }) => {
        const measure = semantic === 'Unknown'
            ? { field: 'yoy_year_change', type: 'quantitative' as const } : 'yoy_year_change';
        const spec: any = assembleVegaLite({
            data: { values: [
                { Item: 'Bananas, per lb.', yoy_year_change: 8.8 },
                { Item: 'Bread, white, pan, per lb.', yoy_year_change: -5.6 },
            ] },
            ...(semantic ? { semantic_types: { Item: 'Category', yoy_year_change: semantic } } : {}),
            chart_spec: {
                chartType: 'Bar Chart',
                title: 'Consumer price changes from August 2024 to August 2025',
                subtitle: 'All available items with positive prices in both months',
                encodings: horizontal ? { x: measure, y: 'Item' } : { x: 'Item', y: measure },
            },
            theme_spec: theme,
        });
        const view = new View(parse(compile(spec).spec), { renderer: 'none' });
        try {
            await view.runAsync();
            const subtitles: string[] = [];
            const axisTitles: string[] = [];
            const visit = (item: any): void => {
                if (item.mark?.role === 'title-subtitle' && item.opacity !== 0) subtitles.push(...[item.text].flat());
                if (item.mark?.role === 'axis-title' && item.opacity !== 0) axisTitles.push(...[item.text].flat());
                for (const child of item.items ?? []) visit(child);
            };
            visit((view.scenegraph() as any).root);
            if (theme === 'datawrapper') {
                expect(subtitles.join(' ')).toBe('All available items with positive prices in both months; yoy_year_change');
            } else {
                expect(axisTitles).toContain('yoy_year_change');
                expect(subtitles.join(' ')).toBe('All available items with positive prices in both months');
            }
        } finally {
            view.finalize();
        }
    });

    it('appends an omitted measure and its declared unit after the authored subtitle', () => {
        const spec: any = assembleVegaLite({
            data: { values: [{ Item: 'A', Mass: 10 }, { Item: 'B', Mass: 20 }] },
            semantic_types: { Item: 'Category', Mass: { semanticType: 'Amount', unit: 'kg' } },
            chart_spec: {
                chartType: 'Bar Chart',
                title: 'Shipment comparison',
                subtitle: 'Two shipments in September',
                encodings: { x: 'Mass', y: 'Item' },
            },
            theme_spec: 'mckinsey',
        });

        expect([spec.title.subtitle].flat().join(' ')).toBe('Two shipments in September; Mass (kg)');
        expect(axisTitle(spec, 'x')).toBeNull();
    });

    it.each([240, 640])('appends a shared faceted measure once and fits its subtitle at %i px', async width => {
        const input: any = {
            data: { values: [
                { Year: 2024, Site: 'A', Mass: 10 },
                { Year: 2025, Site: 'A', Mass: 20 },
                { Year: 2024, Site: 'B', Mass: 15 },
                { Year: 2025, Site: 'B', Mass: 25 },
            ] },
            semantic_types: { Year: 'Year', Site: 'Category', Mass: { semanticType: 'Amount', unit: 'kg' } },
            field_display_names: { Mass: 'Shipment mass' },
            chart_spec: {
                chartType: 'Line Chart',
                title: 'Shipment comparison',
                subtitle: 'Recorded at two sites in consecutive years',
                encodings: { x: 'Year', y: 'Mass', column: 'Site' },
                baseSize: { width, height: 320 },
            },
            theme_spec: 'mckinsey',
        };
        const spec: any = assembleVegaLite(input);
        const planned = vegaLiteStages(input).plan.title?.block ?? width;
        const view = new View(parse(compile(spec).spec), { renderer: 'none' });
        try {
            await view.runAsync();
            const subtitles: any[] = [];
            const visit = (item: any): void => {
                if (item.mark?.role === 'title-subtitle' && item.opacity !== 0) subtitles.push(item);
                for (const child of item.items ?? []) visit(child);
            };
            visit((view.scenegraph() as any).root);
            expect(subtitles.flatMap(item => [item.text].flat()).join(' '))
                .toBe('Recorded at two sites in consecutive years; Shipment mass (kg)');
            // Node draws text with Vega's 0.8 em estimate, so each line is measured as title fitting
            // measures it, in the deck's font, against the block the plan fitted it to: both panels and the gap.
            const blockWidth = planned;
            const design = vegaLiteStages(input).plan.design;
            const measure = titleMeasures(design.title, design.font, tableTextMeasurer).deck;
            for (const item of subtitles) {
                for (const line of [item.text].flat()) {
                    expect(measure(String(line), item.fontSize)).toBeLessThanOrEqual(blockWidth);
                }
            }
        } finally {
            view.finalize();
        }
    });

    it.each(Object.keys(THEME_PRESETS).flatMap(theme => [false, true].map(horizontal => ({ theme, horizontal }))))('renders the measure title and unit ($theme / horizontal: $horizontal)', async ({ theme, horizontal }) => {
        const spec: any = assembleVegaLite({
            data: { values: [
                { Item: 'Bananas, per lb.', Change: 8.8 },
                { Item: 'Bread, white, pan, per lb.', Change: -5.6 },
                { Item: 'Eggs, grade A, large, per doz.', Change: 12 },
                { Item: 'Gasoline, unleaded regular, per gallon', Change: -6.4 },
            ] },
            semantic_types: { Item: 'Category', Change: 'Quantity' },
            field_display_names: { Change: 'Price change (%)' },
            chart_spec: {
                chartType: 'Bar Chart',
                title: 'Consumer price changes from August 2024 to August 2025',
                subtitle: 'All available items with positive prices in both months',
                encodings: horizontal ? { x: 'Change', y: 'Item' } : { x: 'Item', y: 'Change' },
                baseSize: { width: 480, height: 320 },
            },
            theme_spec: theme,
        });
        const view = new View(parse(compile(spec).spec), { renderer: 'none' });
        try {
            await view.runAsync();
            const titles: any[] = [];
            const visit = (item: any): void => {
                if (['axis-title', 'title-subtitle'].includes(item.mark?.role) && item.opacity !== 0) titles.push(item);
                for (const child of item.items ?? []) visit(child);
            };
            visit((view.scenegraph() as any).root);
            expect(titles.some(item => [item.text].flat().join(' ').includes('Price change (%)'))).toBe(true);
            const channel = horizontal ? 'x' : 'y';
            if (spec._theme.decisions.axes[channel].title.placement === 'subtitle') {
                expect(titles.some(item => item.mark.role === 'axis-title'
                    && [item.text].flat().join(' ').includes('Price change (%)'))).toBe(false);
                expect(titles.filter(item => item.mark.role === 'title-subtitle')
                    .flatMap(item => [item.text].flat()).join(' ')).toBe('All available items with positive prices in both months; Price change (%)');
            }
        } finally {
            view.finalize();
        }
    });

    it('omits a title over labels that name their own kind', () => {
        const spec = bars(house({ axisTitles: 'whenAmbiguous' }), 'Wetter than it looks');
        expect(axisTitle(spec, 'x')).toBeNull();
    });

    it('keeps a title over a column of bare values', () => {
        const spec = bars(house({ axisTitles: 'whenAmbiguous' }), 'Wetter than it looks');
        expect(axisTitle(spec, 'y')).not.toBeNull();
    });

    it('keeps a measure title even when the headline repeats its field name', () => {
        const spec = bars(house({ axisTitles: 'whenAmbiguous' }), 'Monthly rainfall');
        expect(axisTitle(spec, 'y')).not.toBeNull();
    });

    it('moves an omitted title into the subtitle even when the headline names the measure', () => {
        const spec = bars(house({ axisTitles: 'omit' }), 'Rainfall, month by month');
        expect(axisTitle(spec, 'y')).toBeNull();
        expect(spec.title.subtitle).toEqual(['Rainfall']);
    });

    it('moves an omitted title into the subtitle regardless of headline wording', () => {
        const spec = bars(house({ axisTitles: 'omit' }), 'Wetter than it looks');
        expect(axisTitle(spec, 'y')).toBeNull();
        expect(spec.title.subtitle).toEqual(['Rainfall']);
    });

    it('accepts the measure named by its unit alone', () => {
        const spec = assembleVegaLite({
            data: { values: [{ City: 'Oslo', 'Price (USD)': 6.2 }, { City: 'Cairo', 'Price (USD)': 2.1 }] },
            semantic_types: { City: 'City', 'Price (USD)': 'Amount' },
            chart_spec: {
                chartType: 'Bar Chart',
                title: 'The Big Mac index (price in USD)',
                encodings: { x: 'City', y: 'Price (USD)' },
            },
            theme_spec: house({ axisTitles: 'omit' }),
        } as any) as any;
        expect(axisTitle(spec, 'y')).toBeNull();
        expect(spec.title.subtitle).toEqual(['Price (USD)']);
    });

    it('draws an omitted title as the deck when there is no headline', async () => {
        const spec = bars(house({ axisTitles: 'omit' }));
        expect(axisTitle(spec, 'y')).toBeNull();
        // Vega-Lite drops a title with no text, deck and all, so the deck is drawn as the title, in its own weight.
        expect(spec.title).toMatchObject({ text: 'Rainfall', fontWeight: 'normal' });
        expect(spec.title.subtitle).toBeUndefined();
        const view = new View(parse(compile(spec).spec), { renderer: 'none' });
        try {
            await view.runAsync();
            const svg = await view.toSVG();
            const titleGroup = svg.slice(svg.indexOf('role-title'));
            expect(svg).toContain('role-title');
            expect(titleGroup).toContain('>Rainfall<');
        } finally {
            view.finalize();
        }
    });

    it('draws an author\'s subtitle when the chart has no title', () => {
        const spec = assembleVegaLite({
            data: { values: [{ Month: 'Jan', Rainfall: 3 }, { Month: 'Feb', Rainfall: 5 }] },
            semantic_types: { Month: 'Category', Rainfall: 'Quantity' },
            chart_spec: { chartType: 'Bar Chart', subtitle: 'Two wet months', encodings: { x: 'Month', y: 'Rainfall' } },
        } as any) as any;
        expect(spec.title).toMatchObject({ text: 'Two wet months', fontWeight: 'normal' });
    });

    it('keeps the measure in the subtitle when the ruler is dropped for printed values', () => {
        const spec = bars(
            {
                ...house({ axisTitles: 'omit' }),
                structure: { axis: { measure: { suppressWhenValuesPrinted: true } } },
                dataLabels: { show: 'always' },
            } as ThemeSpec,
            'Wetter than it looks',
        );
        const enc = (spec.spec?.encoding ?? spec.encoding ?? spec.layer?.[0]?.encoding ?? {}).y;
        expect(spec.config.axisY.labels).toBe(false);
        expect(enc?.axis?.title).toBeNull();
        expect(spec.title.subtitle).toEqual(['Rainfall']);
    });

    it('keeps a needed measure title on its own axis, headline or not', () => {
        const withHeadline = bars(house({ axisTitles: 'whenAmbiguous', axisTitlePlacement: 'flatAboveAxis' }), 'Wetter than it looks');
        expect(axisTitle(withHeadline, 'y')).not.toBeNull();
        expect(withHeadline.title.subtitle).toBeUndefined();
        expect(withHeadline._theme.decisions.axes.y.title.placement).toBe('flatAboveAxis');

        const bare = bars(house({ axisTitles: 'whenAmbiguous', axisTitlePlacement: 'flatAboveAxis' }));
        expect(axisTitle(bare, 'y')).not.toBeNull();
        expect(bare.title).toBeUndefined();
    });

    it('lifts a flat y title above column facet headers', () => {
        const spec = assembleVegaLite({
            data: { values: [
                { Year: 2000, Country: 'Germany', Rate: 8 },
                { Year: 2020, Country: 'Germany', Rate: 4 },
                { Year: 2000, Country: 'United States', Rate: 4 },
                { Year: 2020, Country: 'United States', Rate: 8 },
            ] },
            semantic_types: { Year: 'Year', Country: 'Country', Rate: 'Quantity' },
            chart_spec: {
                chartType: 'Line Chart',
                title: 'Out of work',
                encodings: { x: 'Year', y: 'Rate', column: 'Country' },
            },
            theme_spec: {
                ...house({ axisTitles: 'whenAmbiguous', axisTitlePlacement: 'flatAboveAxis', axisTitleGap: 8 }),
                structure: { axis: { measure: { placement: 'opposite' } } },
            },
        } as any) as any;
        const y = spec.encoding?.y ?? spec.spec?.encoding?.y ?? spec.spec?.layer?.[0]?.encoding?.y;
        expect(y.axis.orient).toBe('right');
        expect(y.axis.titleY).toBeLessThanOrEqual(-30);
    });

    it('leaves an authored subtitle untouched and keeps the measure named', () => {
        const spec = assembleVegaLite({
            data: { values: MONTHLY },
            semantic_types: { Month: 'Month', Rainfall: 'Amount' },
            chart_spec: {
                chartType: 'Bar Chart',
                title: 'Wetter than it looks',
                subtitle: 'Four unusually wet months in 2025',
                encodings: { x: 'Month', y: 'Rainfall' },
            },
            theme_spec: house({ axisTitles: 'whenAmbiguous', axisTitlePlacement: 'flatAboveAxis' }),
        } as any) as any;

        expect(axisTitle(spec, 'y')).not.toBeNull();
        // The authored words stand; how they are broken to fit the block is a
        // layout matter, so the content is what is asserted.
        const subtitle = spec.title.subtitle;
        expect([subtitle].flat().join(' ')).toBe('Four unusually wet months in 2025');
    });

    it('keeps rank bound to its axis even when the headline names rank', () => {
        const spec = assembleVegaLite({
            data: { values: [
                { Games: 2012, Country: 'United States', Rank: 1 },
                { Games: 2016, Country: 'United States', Rank: 1 },
                { Games: 2012, Country: 'China', Rank: 2 },
                { Games: 2016, Country: 'China', Rank: 3 },
            ] },
            semantic_types: { Games: 'Year', Country: 'Country', Rank: 'Rank' },
            chart_spec: {
                chartType: 'Bump Chart',
                title: 'Olympic medal-table rank',
                encodings: { x: 'Games', y: 'Rank', color: 'Country' },
            },
            theme_spec: house({ axisTitles: 'whenAmbiguous' }),
        } as any) as any;

        expect(axisTitle(spec, 'y')).not.toBeNull();
    });

    it('moves an authored normalized-share label into the title block', () => {
        const spec = assembleVegaLite({
            data: { values: [
                { Institution: 'Congress', Response: 'Some', 'Share (%)': 38 },
                { Institution: 'Congress', Response: 'Not much', 'Share (%)': 62 },
            ] },
            semantic_types: { Institution: 'Category', Response: 'Category', 'Share (%)': 'Quantity' },
            chart_spec: {
                chartType: 'Stacked Bar Chart',
                title: 'Confidence in US institutions',
                encodings: { x: 'Share (%)', y: 'Institution', color: 'Response' },
                chartProperties: { stackMode: 'normalize' },
            },
            theme_spec: house({ axisTitles: 'whenAmbiguous', axisTitlePlacement: 'flatAboveAxis' }),
        } as any) as any;

        expect(axisTitle(spec, 'x')).not.toBeNull();
        expect(spec.title.subtitle).toBeUndefined();
    });

    it('moves a single share measure into the subtitle for an omission-preferring theme', () => {
        const spec = assembleVegaLite({
            data: { values: [
                { Institution: 'Congress', Response: 'Some', 'Share (%)': 38 },
                { Institution: 'Congress', Response: 'Not much', 'Share (%)': 62 },
            ] },
            semantic_types: { Institution: 'Category', Response: 'Category', 'Share (%)': 'Quantity' },
            chart_spec: {
                chartType: 'Stacked Bar Chart',
                title: 'Confidence in US institutions',
                encodings: { x: 'Share (%)', y: 'Institution', color: 'Response' },
                chartProperties: { stackMode: 'normalize' },
            },
            theme_spec: THEME_PRESETS.economist.spec,
        } as any) as any;

        expect(axisTitle(spec, 'x')).toBeNull();
        expect(spec.title.subtitle).toEqual(['Share (%)']);
    });

    it.each([300, 400])('names both Economist measure axes in the subtitle at %i px', width => {
        const spec = assembleVegaLite({
            data: { values: [
                { Year: 1956, 'Miles/person': 3675, 'Gas price': 2.38 },
                { Year: 1957, 'Miles/person': 3706, 'Gas price': 2.40 },
                { Year: 1958, 'Miles/person': 3766, 'Gas price': 2.26 },
            ] },
            semantic_types: { Year: 'Year', 'Miles/person': 'Quantity', 'Gas price': 'Quantity' },
            chart_spec: {
                chartType: 'Connected Scatter Plot',
                title: 'Driving shifts into reverse',
                encodings: { x: 'Miles/person', y: 'Gas price', order: 'Year' },
                baseSize: { width, height: 300 },
            },
            theme_spec: THEME_PRESETS.economist.spec,
        } as any) as any;

        expect(axisTitle(spec, 'x')).toBeNull();
        expect(axisTitle(spec, 'y')).toBeNull();
        expect([spec.title.subtitle].flat().join(' ')).toBe('X: Miles/person; Y: Gas price');
        const enc = (spec.spec?.encoding ?? spec.encoding ?? spec.layer?.[0]?.encoding ?? {});
        expect(enc.y.axis.orient).toBe('right');
    });

    it('keeps life expectancy named when the headline only describes the story', () => {
        const spec = assembleVegaLite({
            data: { values: [
                { Country: 'Japan', Sex: 'Male', 'Life expectancy (years)': 81.4 },
                { Country: 'Japan', Sex: 'Female', 'Life expectancy (years)': 87.5 },
            ] },
            semantic_types: { Country: 'Country', Sex: 'Category', 'Life expectancy (years)': 'Quantity' },
            chart_spec: {
                chartType: 'Ranged Dot Plot',
                title: 'The female–male life gap',
                encodings: { x: 'Life expectancy (years)', y: 'Country', color: 'Sex' },
            },
            theme_spec: THEME_PRESETS.economist.spec,
        } as any) as any;

        expect(axisTitle(spec, 'x')).toBeNull();
        expect(spec.title.subtitle).toEqual(['Life expectancy (years)']);
    });

    it('keeps rank named in the subtitle', () => {
        const spec = assembleVegaLite({
            data: { values: [
                { Games: 2012, Country: 'United States', Rank: 1 },
                { Games: 2016, Country: 'United States', Rank: 1 },
                { Games: 2012, Country: 'China', Rank: 2 },
                { Games: 2016, Country: 'China', Rank: 3 },
            ] },
            semantic_types: { Games: 'Year', Country: 'Country', Rank: 'Rank' },
            chart_spec: {
                chartType: 'Bump Chart',
                title: 'Olympic medal-table rank',
                encodings: { x: 'Games', y: 'Rank', color: 'Country' },
            },
            theme_spec: THEME_PRESETS.economist.spec,
        } as any) as any;

        expect(axisTitle(spec, 'y')).toBeNull();
        expect(spec.title.subtitle).toEqual(['Rank']);
    });
});

describe('title block position', () => {
    it('places a title below the chart when the house treats it as a caption', () => {
        const spec = bars({
            ...house({ axisTitles: 'always' }),
            layout: { titleBlock: { position: 'bottom' } },
        }, 'Monthly rainfall');

        expect(spec.config.title.orient).toBe('bottom');
        expect(spec._theme.decisions.title.position).toBe('bottom');
    });

    it('keeps titles above the chart by default', () => {
        const spec = bars(house({ axisTitles: 'always' }), 'Monthly rainfall');

        expect(spec.config.title.orient).toBe('top');
        expect(spec._theme.decisions.title.position).toBe('top');
    });

    it('places the Nature title as a centered caption below the figure', () => {
        const spec = bars(THEME_PRESETS.nature.spec, 'Monthly rainfall');

        expect(spec.config.title.orient).toBe('bottom');
        expect(spec.config.title.anchor).toBe('middle');
    });
});

describe('legend titles', () => {
    const PENGUINS = [
        { Island: 'Biscoe', Species: 'Adelie', Mass: 3400 },
        { Island: 'Dream', Species: 'Gentoo', Mass: 5100 },
        { Island: 'Torgersen', Species: 'Adelie', Mass: 3700 },
        { Island: 'Biscoe', Species: 'Gentoo', Mass: 4900 },
    ];

    function keyed(colorField: string, title = 'Heavier in the west', x = 'Island', species = 'Category', legendTitle = 'whenAmbiguous') {
        return assembleVegaLite({
            data: { values: PENGUINS },
            semantic_types: { Island: 'City', Species: species, Mass: 'Amount' },
            chart_spec: {
                chartType: 'Bar Chart',
                title,
                encodings: { x, y: 'Mass', color: colorField },
            },
            theme_spec: house({ axisTitles: 'omit' }, { title: legendTitle } as any),
        } as any) as any;
    }

    /** A key on a field of its own name and type, with nothing else said about it. */
    function plainKey(field: string, semanticType: string, values: string[]) {
        return assembleVegaLite({
            data: { values: values.map((value, index) => ({ [field]: value, Mass: 3000 + index * 400 })) },
            semantic_types: { [field]: semanticType, Mass: 'Amount' },
            chart_spec: { chartType: 'Bar Chart', title: 'Heavier in the west', encodings: { x: field, y: 'Mass', color: field } },
            theme_spec: house({ axisTitles: 'omit' }, { title: 'whenAmbiguous' }),
        } as any) as any;
    }

    it('leaves a key untitled where the field is plainly a place or a date, named as such', () => {
        expect(plainKey('Country', 'Country', ['France', 'Japan', 'Peru'])._theme.decisions.legend.title).toBe(false);
        expect(plainKey('country_name', 'Country', ['France', 'Japan', 'Peru'])._theme.decisions.legend.title).toBe(false);
        expect(plainKey('Month', 'Month', ['Jan', 'Feb', 'Mar'])._theme.decisions.legend.title).toBe(false);
    });

    it('leaves a key untitled on what its values prove, whatever the field is typed', () => {
        // Typed only a category, the values still prove they are countries.
        expect(plainKey('Country', 'Category', ['France', 'Japan', 'Peru'])._theme.decisions.legend.title).toBe(false);
    });

    it('never drops a title on a semantic type alone', () => {
        // Typed a country, but the values are not countries: a type is a label, not proof.
        expect(plainKey('Country', 'Country', ['Tier A', 'Tier B', 'Tier C'])._theme.decisions.legend.title).toBe(true);
        expect(plainKey('Month', 'Month', ['M1', 'M2', 'M3'])._theme.decisions.legend.title).toBe(true);
    });

    it('leaves a key untitled where an axis on the same field prints its name, and titles it where the axis does not', () => {
        const keyTitle = (x: unknown) => vegaLiteStages({
            data: { values: PENGUINS },
            semantic_types: { Island: 'City', Species: 'Category', Mass: 'Amount' },
            chart_spec: { chartType: 'Bar Chart', title: 'Heavier in the west', encodings: { x, y: 'Mass', color: 'Species' } },
            theme_spec: house({ axisTitles: 'always' }, { title: 'whenAmbiguous' }),
        } as any).plan.legend.keyInputs?.find(Boolean)?.title;
        expect(keyTitle('Species')).toBeNull();
        expect(keyTitle({ field: 'Species', title: null })).toBe('Species');
    });

    it('titles a key of places whose field names their role: `Origin` says which countries these are', () => {
        expect(plainKey('Origin', 'Country', ['France', 'Japan', 'Peru'])._theme.decisions.legend.title).toBe(true);
        // The island field is typed a city, but its name says more than the type does.
        expect(keyed('Island', 'Heavier in the west', 'Species')._theme.decisions.legend.title).toBe(true);
    });

    it('titles a key of a generic category: `Adelie` and `Gentoo` do not say they are species', () => {
        const spec = keyed('Species');
        expect(spec._theme.decisions.legend.show).toBe(true);
        expect(spec._theme.decisions.legend.title).toBe(true);
    });

    it('leaves a key untitled where the headline already names its field', () => {
        const spec = keyed('Species', 'Gentoo are the heaviest species');
        expect(spec._theme.decisions.legend.title).toBe(false);
    });

    it('takes the author\'s name for a key, or none', () => {
        const titled = (color: unknown) => vegaLiteStages({
            data: { values: PENGUINS },
            semantic_types: { Island: 'City', Species: 'Category', Mass: 'Amount' },
            chart_spec: { chartType: 'Bar Chart', title: 'Heavier in the west', encodings: { x: 'Island', y: 'Mass', color } },
            theme_spec: house({ axisTitles: 'omit' }, { title: 'whenAmbiguous' }),
        } as any).plan.legend.keyInputs?.find(Boolean)?.title;
        expect(titled({ field: 'Species', title: null })).toBeNull();
        expect(titled({ field: 'Species', title: 'Penguin' })).toBe('Penguin');
        expect(titled('Species')).toBe('Species');
    });

    it('leaves a key the chart makes itself untitled: a waterfall\'s steps are explained by the chart', () => {
        const steps = [{ Step: 'Start', Value: 100 }, { Step: 'Sales', Value: 40 }, { Step: 'Costs', Value: -25 }, { Step: 'End', Value: 115 }];
        const keyTitle = (legend: Record<string, unknown>) => vegaLiteStages({
            data: { values: steps },
            semantic_types: { Step: 'Category', Value: 'Amount' },
            chart_spec: { chartType: 'Waterfall Chart', title: 'From start to end', encodings: { x: 'Step', y: 'Value' } },
            theme_spec: house({ axisTitles: 'omit' }, legend as any),
        } as any).plan.legend.keyInputs?.find(Boolean)?.title;
        expect(keyTitle({ title: 'whenAmbiguous' })).toBeNull();
        expect(keyTitle({ title: 'always' })).toBe('Type');
        // And the drawn key follows the plan, over the title the template writes.
        const { spec } = vegaLiteStages({
            data: { values: steps },
            semantic_types: { Step: 'Category', Value: 'Amount' },
            chart_spec: { chartType: 'Waterfall Chart', title: 'From start to end', encodings: { x: 'Step', y: 'Value' } },
            theme_spec: 'economist',
        } as any);
        const drawn: unknown[] = [];
        JSON.stringify(spec, (_key, value) => {
            if (value && typeof value === 'object' && value.field === '__wf_color' && value.legend) drawn.push(value.legend.title);
            return value;
        });
        expect(drawn.length).toBeGreaterThan(0);
        expect(drawn.every((title) => title === null)).toBe(true);
    });

    it('titles a key whose tail folds into "Others" with its field, never the working column', () => {
        const recipients = ['Alpha Fund', 'Beta Trust', 'Gamma Works', 'Delta Aid', 'Epsilon Care', 'Zeta Relief', 'Eta Help', 'Theta Hope', 'Iota Rise', 'Kappa Way'];
        const { spec } = vegaLiteStages({
            data: { values: recipients.map((Recipient, index) => ({ Recipient, Share: 20 - index })) },
            semantic_types: { Recipient: 'Category', Share: 'Percentage' },
            chart_spec: { chartType: 'Pie Chart', title: 'Shares of the aid budget', encodings: { color: 'Recipient', size: 'Share' } },
            theme_spec: 'economist',
        } as any);
        const titles: unknown[] = [];
        JSON.stringify(spec, (_key, value) => {
            if (value && typeof value === 'object' && value.field === '__flintColorKey') titles.push(value.legend?.title ?? value.title);
            return value;
        });
        expect(titles.length).toBeGreaterThan(0);
        expect(titles).not.toContain('__flintColorKey');
        expect(titles).toContain('Recipient');
    });

    it('titles a shape that repeats the colours as the colour key is titled, never with a working column', () => {
        const internalTitles = (spec: any) => {
            const out: unknown[] = [];
            JSON.stringify(spec, (key, value) => {
                if (value && typeof value === 'object' && ['color', 'shape', 'strokeDash'].includes(key)
                    && typeof value.field === 'string' && value.field.startsWith('__') && value.legend !== null) {
                    const title = value.legend?.title !== undefined ? value.legend.title : value.title;
                    if (title === undefined || (typeof title === 'string' && title.startsWith('__'))) out.push(`${key}:${value.field}`);
                }
                return value;
            });
            return out;
        };
        const radar = (TEST_GENERATORS as any)['Radar Chart']()[0];
        const many = Array.from({ length: 20 }, (_, index) => ({ X: index, Y: (index * 7) % 13, Group: `Group ${index + 1}` }));
        for (const theme of ['nature', 'apple']) {
            const names = new Map(radar.fields.map((field: any) => [field.id, field.name]));
            const encodings = Object.fromEntries(Object.entries<any>(radar.encodingMap).filter(([, e]) => names.get(e?.fieldID)).map(([channel, e]) => [channel, names.get(e.fieldID)]));
            const semantic = Object.fromEntries(Object.entries<any>(radar.metadata).map(([field, meta]) => [field, meta.semanticType]));
            expect(internalTitles(assembleVegaLite({ data: { values: radar.data }, semantic_types: semantic, chart_spec: { chartType: radar.chartType, encodings, chartProperties: radar.chartProperties }, theme_spec: theme }))).toEqual([]);
            expect(internalTitles(assembleVegaLite({ data: { values: many }, semantic_types: { X: 'Quantity', Y: 'Quantity', Group: 'Category' }, chart_spec: { chartType: 'Scatter Plot', encodings: { x: 'X', y: 'Y', color: 'Group' } }, theme_spec: theme }))).toEqual([]);
        }
    });

    it('reads a theme\'s `omit` as `whenAmbiguous`: the reader gets the name of what a key does not explain', () => {
        const spec = keyed('Species', 'Heavier in the west', 'Island', 'Category', 'omit');
        expect(spec._theme.decisions.legend.title).toBe(true);
        expect(spec._theme.report.some((r: any) => r.code === 'legend-title-omit-read-as-when-ambiguous')).toBe(true);
        // Read as `whenAmbiguous`, it still leaves a key untitled where the headline names the field.
        expect(keyed('Species', 'Gentoo are the heaviest species', 'Island', 'Category', 'omit')._theme.decisions.legend.title).toBe(false);
    });

    it('titles a key of values', () => {
        const spec = keyed('Mass');
        expect(spec._theme.decisions.legend.show).toBe(true);
        expect(spec._theme.decisions.legend.title).toBe(true);
    });
});

/**
 * A masthead tab is canvas furniture — branding anchored to the graphic frame.
 *
 * The Economist's red tab sits at the very top-left of the graphic, flush with
 * the title's own margin, and has nothing to do with the plot. So it is not a
 * concat child (which would pin to the plot's data rectangle and drift right on
 * a wide axis gutter) — it is recorded in `usermeta` for the renderer to draw
 * onto the SVG, and a strip of top padding is reserved so it opens the graphic
 * above the headline.
 */
describe('masthead furniture', () => {
    function withTab(): any {
        const themeSpec = {
            id: 'tabbed',
            label: 'Tabbed',
            ink: { surface: { canvas: '#ffffff' }, series: { single: '#333333' } },
            annotation: { axisTitles: 'always' },
            furniture: [{ kind: 'mastheadTab', anchor: 'topLeft', color: '#e3120b', width: 26, height: 3 }],
        } as unknown as ThemeSpec;
        return assembleVegaLite({
            data: { values: MONTHLY },
            semantic_types: { Month: 'Month', Rainfall: 'Amount' },
            chart_spec: {
                chartType: 'Bar Chart',
                title: 'Rain keeps falling',
                encodings: { x: 'Month', y: 'Rainfall' },
            },
            theme_spec: themeSpec,
        } as any) as any;
    }

    it('records the tab as canvas furniture, flush with the title, and keeps the title on the graphic', () => {
        const spec = withTab();
        // The tab is not wrapped into a concat — it draws onto the canvas.
        expect(spec.vconcat).toBeUndefined();
        const tabs = spec.usermeta?.flintCanvasFurniture;
        expect(Array.isArray(tabs)).toBe(true);
        expect(tabs).toHaveLength(1);
        const tab = tabs[0];
        expect(tab.kind).toBe('rect');
        expect(tab.color).toBe('#e3120b');
        expect(tab.width).toBe(26);
        expect(tab.height).toBe(3);
        // The tab anchors to the same left margin the title anchors to.
        const pad = spec.padding;
        const left = typeof pad === 'number' ? pad : pad.left;
        expect(tab.left).toBe(left);
        // A band of top padding is reserved so the tab opens above the headline.
        const top = typeof pad === 'number' ? pad : pad.top;
        expect(top).toBeGreaterThanOrEqual(tab.y + tab.height);
        // The headline stays on the graphic frame.
        expect(spec.title).toBeTruthy();
    });
});

describe('a headline wider than its block', () => {
    const LONG = 'Driving Shifts Into Reverse — miles driven per person against the price of gas, 1956 to 2010';
    const PENGUINS = 'Palmer Penguins — flipper length vs body mass';

    function titled(headline: string): any {
        return assembleVegaLite({
            data: { values: MONTHLY },
            semantic_types: { Month: 'Month', Rainfall: 'Amount' },
            chart_spec: {
                chartType: 'Bar Chart',
                title: headline,
                encodings: { x: 'Month', y: 'Rainfall' },
            },
            theme_spec: THEME_PRESETS.nyt.spec,
        } as any) as any;
    }

    /** A wide plot, where a headline of ordinary length only just overhangs. */
    function scatteredInput(headline: string, themeId: string): any {
        const rows = Array.from({ length: 40 }, (_, i) => ({
            flipper: 178 + (i % 20) * 3,
            mass: 3200 + ((i * 137) % 2800),
            species: ['Adelie', 'Chinstrap', 'Gentoo'][i % 3],
        }));
        return {
            data: { values: rows },
            semantic_types: { flipper: 'Amount', mass: 'Amount', species: 'Category' },
            chart_spec: {
                chartType: 'Scatter Plot',
                title: headline,
                encodings: { x: 'flipper', y: 'mass', color: 'species' },
            },
            theme_spec: (THEME_PRESETS as any)[themeId].spec,
        };
    }

    function scattered(headline: string, themeId: string): any {
        return assembleVegaLite(scatteredInput(headline, themeId)) as any;
    }

    it('leaves a headline that fits alone', () => {
        expect(titled('Rain keeps falling').title.text).toBe('Rain keeps falling');
    });

    it('keeps every headline line inside its block, in every house', () => {
        for (const id of Object.keys(THEME_PRESETS)) {
            const { plan, spec } = vegaLiteStages(scatteredInput(PENGUINS, id));
            const measure = titleMeasures(plan.design.title, plan.design.font, tableTextMeasurer).headline;
            const size = spec.title.fontSize ?? spec.config?.title?.fontSize ?? plan.design.title.headline.fontSize ?? 14;
            for (const line of [spec.title.text].flat()) {
                expect(measure(String(line), size), `${id}: "${line}"`).toBeLessThanOrEqual(plan.title!.block);
            }
        }
    });

    it('breaks a headline that will not fit even set down a size', () => {
        const spec = titled(LONG);
        expect(Array.isArray(spec.title.text)).toBe(true);
        expect(spec.title.text.length).toBeGreaterThan(1);
        // Nothing is lost or reordered in the break.
        expect(spec.title.text.join(' ')).toBe(LONG);
    });

    it('breaks over full lines, with no orphan at the end', () => {
        const lines: string[] = scattered(LONG, 'economist').title.text;
        expect(lines.length).toBeGreaterThan(1);
        const lengths = lines.map((l) => l.length);
        expect(lengths[lengths.length - 1]).toBeGreaterThan(Math.max(...lengths) / 4);
    });

    it('takes the lines it gains out of the plot, not out of the canvas', () => {
        const plot = (s: any) => s.config?.view?.continuousHeight;
        expect(plot(titled(LONG))).toBeLessThan(plot(titled('Rain keeps falling')));
    });
});

describe('subtitle fitting', () => {
    it.each([
        { shortLabels: false, extra: '', fits: true },
        { shortLabels: true, extra: '', fits: false },
        { shortLabels: false, extra: ', including the complete set of comparable observations recorded in both survey periods', fits: false },
    ])('uses the category-label gutter before wrapping a horizontal bar subtitle ($shortLabels / fits: $fits)', ({ shortLabels, extra, fits }) => {
        const subtitle = `All available items with positive prices in both months${extra}`;
        const spec: any = assembleVegaLite({
            data: { values: [
                { Item: 'Bananas, per lb.', yoy_change_pct: 8.8 },
                { Item: 'Bread, white, pan, per lb.', yoy_change_pct: -5.6 },
                { Item: 'Chicken, fresh, whole, per lb.', yoy_change_pct: 4.4 },
                { Item: 'Eggs, grade A, large, per doz.', yoy_change_pct: 12 },
                { Item: 'Electricity per KWH', yoy_change_pct: 7.3 },
                { Item: 'Gasoline, unleaded regular, per gallon', yoy_change_pct: -6.4 },
                { Item: 'Ground chuck, 100% beef, per lb.', yoy_change_pct: 17.5 },
                { Item: 'Milk, fresh, whole, fortified, per gal.', yoy_change_pct: 3.1 },
                { Item: 'Oranges, Navel, per lb.', yoy_change_pct: 3.9 },
                { Item: 'Tomatoes, field grown, per lb.', yoy_change_pct: -3.6 },
                { Item: 'Utility (piped) gas per therm', yoy_change_pct: 16.6 },
            ].map((row, index) => shortLabels ? { ...row, Item: `Item ${index + 1}` } : row) },
            chart_spec: {
                chartType: 'Bar Chart',
                title: 'Consumer price changes from August 2024 to August 2025',
                subtitle,
                encodings: { x: 'yoy_change_pct', y: 'Item' },
                baseSize: { width: shortLabels ? 180 : 300, height: 400 },
                ...(shortLabels ? { canvasSize: { width: 180, height: 600 } } : {}),
            },
            // The names stand beside their bars, in the gutter the subtitle may run over.
            theme_spec: { extends: 'datawrapper', labels: { truncation: 'never', rowNames: 'beside' } },
        });
        expect(spec.title.subtitle.join(' ')).toBe(`${subtitle}; yoy_change_pct`);
        if (fits) expect(spec.title.subtitle).toHaveLength(1);
        else expect(spec.title.subtitle.length).toBeGreaterThan(1);
    });
});

describe('a closing rule at the foot', () => {
    /** The rule a footerRule is drawn as on the canvas, if one was drawn. */
    function closingRule(spec: any): any {
        return (spec.usermeta?.flintCanvasFurniture ?? []).find((item: any) => item.kind === 'rule');
    }

    function ruled(source?: string): any {
        const themeSpec = {
            id: 'ruled',
            label: 'Ruled',
            ink: { surface: { canvas: '#ffffff' }, series: { single: '#333333' } },
            furniture: [{ kind: 'footerRule', anchor: 'bottomLeft', color: '#dcdcdc', height: 1 }],
        } as unknown as ThemeSpec;
        return assembleVegaLite({
            data: { values: MONTHLY },
            semantic_types: { Month: 'Month', Rainfall: 'Amount' },
            chart_spec: {
                chartType: 'Bar Chart',
                title: 'Rain keeps falling',
                encodings: { x: 'Month', y: 'Rainfall' },
                ...(source ? { source } : {}),
            },
            theme_spec: themeSpec,
        } as any) as any;
    }

    it('runs across the drawn graphic, the width the title spans, not a concatenated block', () => {
        const spec = ruled();
        expect(spec.vconcat).toBeUndefined();
        const rule = closingRule(spec);
        expect(rule).toBeTruthy();
        const padding = typeof spec.padding === 'number' ? { left: spec.padding, right: spec.padding, bottom: spec.padding } : spec.padding;
        expect(rule.left).toBe(padding.left);
        expect(rule.right).toBe(padding.right);
        expect(rule.width).toBeUndefined();
        // Seated in the padding under the chart, a gap clear of it.
        expect(rule.bottom + rule.height).toBeLessThan(padding.bottom);
    });

    it('sits above a source line, which takes the foot', () => {
        const spec = ruled('Met Office');
        const items = spec.usermeta.flintCanvasFurniture;
        const rule = closingRule(spec);
        const text = items.find((item: any) => item.kind === 'text');
        expect(text).toBeTruthy();
        expect(rule.bottom).toBeGreaterThan(text.bottom + text.height);
    });
});
