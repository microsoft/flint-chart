import { describe, expect, it } from 'vitest';
import { parse, View } from 'vega';
import { compile } from 'vega-lite';
import { assembleVegaLite } from '../src/vegalite/assemble';
import { vlAllTemplateDefs } from '../src/vegalite/templates';
import { TEST_GENERATORS, type TestCase } from '../src/test-data';
import { accessibleNavigation, clickHighlight } from '../src/interactive/interactions';
import { accessibleNavigationTrigger } from '../src/interactive/triggers';
import { resolveInteractionSpec } from '../src/interactive/spec/resolve';
import { INTERACTION_PRESETS } from '../src/interactive/spec/registry';
import { toCanvasInteractionEvent } from '../src/interactive/canvas-interaction';
import { associateSemanticElementRenderKeys } from '../src/core/interaction-semantics';
import { addVegaLiteInteractions, injectVegaInteractionStore } from '../src/vegalite/interactions/compile';
import {
    ACCESSIBLE_NAVIGATION_HELP,
    AccessibleNavigator,
    accessibleCommandForKey,
    accessibleNodes,
    buildAccessibleTree,
    describeAccessibleNode,
    markNoun,
    type AccessibleNode,
} from '../src/vegalite/interactions/accessible-navigation/model';
import type { ChartAssemblyInput } from '../src/core/types';

function testCaseInput(testCase: TestCase): ChartAssemblyInput {
    const names = new Map(testCase.fields.map((field) => [field.id, field.name]));
    const encodings: Record<string, unknown> = {};
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
    const semanticTypes: Record<string, string> = {};
    for (const [field, meta] of Object.entries(testCase.metadata)) semanticTypes[field] = meta.semanticType;
    return {
        semantic_types: semanticTypes,
        chart_spec: {
            chartType: testCase.chartType,
            encodings,
            baseSize: { width: 350, height: 240 },
            chartProperties: testCase.chartProperties,
            title: testCase.title,
        },
        options: { ...(testCase.assembleOptions ?? {}), addTooltips: true },
        data: { values: testCase.data },
    } as ChartAssemblyInput;
}

async function accessibleTree(input: ChartAssemblyInput): Promise<{ root: AccessibleNode; view: View }> {
    const spec = assembleVegaLite(input) as Record<string, any>;
    const plan = addVegaLiteInteractions(spec, [accessibleNavigation()], true);
    if (!plan) throw new Error(`No interaction plan for ${input.chart_spec.chartType}`);
    const compiled = compile(spec as any).spec as Record<string, any>;
    injectVegaInteractionStore(compiled, plan);
    const view = new View(parse(compiled), { renderer: 'none' });
    await view.runAsync();
    const root = buildAccessibleTree({
        root: (view.scenegraph() as any).root,
        chartType: input.chart_spec.chartType,
        axisFields: plan.axisFields,
        legendFields: plan.legendFields,
        rangeLegendChannels: plan.rangeLegendChannels,
        seriesField: plan.seriesField,
        fields: plan.fields,
        temporalFields: plan.temporalProvenanceFields,
        scaleType: (name) => {
            try {
                return (view.scale(name) as any)?.type;
            } catch {
                return undefined;
            }
        },
    });
    return { root, view };
}

const child = (node: AccessibleNode, kind: string, index = 0): AccessibleNode => {
    const found = node.children.filter((candidate) => candidate.kind === kind)[index];
    if (!found) throw new Error(`No ${kind} under ${node.id}`);
    return found;
};

const stackedBar: ChartAssemblyInput = {
    data: {
        values: [
            { Country: 'US', Source: 'Coal', Sales: 200 },
            { Country: 'US', Source: 'Solar', Sales: 120 },
            { Country: 'France', Source: 'Coal', Sales: 40 },
            { Country: 'France', Source: 'Solar', Sales: 90 },
            { Country: 'Japan', Source: 'Coal', Sales: 150 },
            { Country: 'Japan', Source: 'Solar', Sales: 60 },
        ],
    },
    semantic_types: { Country: 'Country', Source: 'Category', Sales: 'Quantity' },
    chart_spec: {
        chartType: 'Stacked Bar Chart',
        title: 'Sales by country',
        encodings: { x: { field: 'Country' }, y: { field: 'Sales' }, color: { field: 'Source' } },
        baseSize: { width: 320, height: 220 },
    },
    options: { addTooltips: true },
} as ChartAssemblyInput;

const twoLines: ChartAssemblyInput = {
    data: {
        values: ['2020', '2021', '2022', '2023'].flatMap((Year, index) => [
            { Year, Food: 'Eggs', Price: 2 + index },
            { Year, Food: 'Bread', Price: 1 + index * 0.1 },
        ]),
    },
    semantic_types: { Year: 'Year', Food: 'Category', Price: 'Price' },
    chart_spec: {
        chartType: 'Line Chart',
        encodings: { x: { field: 'Year' }, y: { field: 'Price' }, color: { field: 'Food' } },
        baseSize: { width: 320, height: 220 },
    },
    options: { addTooltips: true },
} as ChartAssemblyInput;

describe('accessible-navigation preset', () => {
    it('is a registered preset that resolves from interaction_spec with its defaults', () => {
        const { interactions } = resolveInteractionSpec({ interactions: [{ type: 'accessible-navigation' }] });
        expect(interactions).toHaveLength(1);
        expect(interactions[0]).toMatchObject({
            id: 'accessible-navigation',
            preset: 'accessible-navigation',
            origin: 'spec',
            eventSource: {
                type: 'element',
                gesture: 'keyboard',
                accessibleNavigation: {
                    emphasis: true,
                    caption: true,
                    sections: ['titles', 'axes', 'legends', 'headers', 'data', 'labels'],
                    maxFields: 8,
                },
            },
        });
        expect(INTERACTION_PRESETS['accessible-navigation'].gesture).toBe('keyboard');
        expect(INTERACTION_PRESETS['accessible-navigation'].supportedReset).toEqual([]);
    });

    it('normalises its options and rejects an unknown section', () => {
        expect(accessibleNavigationTrigger({ sections: ['data', 'titles'], maxFields: 2.4, emphasis: false })
            .accessibleNavigation).toEqual({
            emphasis: false, caption: true, sections: ['titles', 'data'], maxFields: 2,
        });
        expect(() => resolveInteractionSpec({
            interactions: [{ type: 'accessible-navigation', options: { sections: ['footer'] } }],
        })).toThrow(/Unknown accessible navigation section "footer"/);
    });

    it('claims no pointer trigger, so it composes with any click preset', () => {
        const spec = assembleVegaLite(stackedBar) as Record<string, any>;
        const plan = addVegaLiteInteractions(spec, [clickHighlight(), accessibleNavigation()], true);
        expect(plan?.interactions?.map((interaction) => interaction.id)).toEqual(['click-highlight', 'accessible-navigation']);
        expect(plan?.warnings).toEqual([]);
    });

    it('emphasises the data behind a focused element and does nothing else', () => {
        const interaction = accessibleNavigation({ dimOpacity: 0.3 });
        const element = associateSemanticElementRenderKeys({ value: { Country: 'US' } }, ['US|Coal']);
        const focus = (target: any, phase: 'preview' | 'cancel' = 'preview') => interaction.handle!(
            toCanvasInteractionEvent({ type: 'semantic', source: 'element', phase, target }, interaction.eventSource),
            { chartType: 'Bar Chart', selected: [] },
        );
        expect(toCanvasInteractionEvent(
            { type: 'semantic', source: 'element', phase: 'preview', target: null }, interaction.eventSource,
        ).action).toBe('focus-element');
        expect(focus({ visual: { kind: 'mark', role: 'mark' }, elements: [element] })).toEqual({
            id: 'accessible-navigation',
            ops: [{
                op: 'set-style',
                targets: [{ visual: { kind: 'mark', role: 'mark' }, elements: [element] }],
                value: { state: 'emphasized', mutedOpacity: 0.3 },
            }],
        });
        expect(focus({ visual: { kind: 'title', role: 'title' }, elements: [] })).toEqual({
            id: 'accessible-navigation',
            ops: [{ op: 'set-style', targets: [], value: { state: 'normal' } }],
        });
        expect(focus(null, 'cancel')).toBeNull();
        const quiet = accessibleNavigation({ emphasis: false });
        expect(quiet.handle!(toCanvasInteractionEvent({
            type: 'semantic', source: 'element', phase: 'preview',
            target: { visual: { kind: 'mark', role: 'mark' }, elements: [element] },
        }, quiet.eventSource), { chartType: 'Bar Chart', selected: [] })).toBeNull();
    });

    it('carries the description on the canvas event', () => {
        const description = {
            kind: 'mark', type: 'Bar', content: 'Country: US, Sales: 200', childCount: 0,
            path: ['Chart', 'Data', 'Bar'], text: 'Bar 1 of 6. Country: US, Sales: 200.',
        };
        const event = toCanvasInteractionEvent({
            type: 'semantic', source: 'element', phase: 'preview', target: null, description,
        }, accessibleNavigation().eventSource);
        expect(event.description).toEqual(description);
    });
});

describe('accessible navigation tree', () => {
    it('describes a stacked bar chart: title, both axes, the legend, and every bar', async () => {
        const { root, view } = await accessibleTree(stackedBar);
        expect(root.children.map((node) => node.kind)).toEqual(['title', 'axis', 'axis', 'legend', 'data']);
        expect(describeAccessibleNode(root).text).toBe(
            'Stacked Bar Chart: Sales by country. X axis Country; Y axis Sales; color legend Source. 6 bars. '
            + 'Press Enter to explore 5 parts, or H for help.',
        );
        expect(describeAccessibleNode(child(root, 'title')).text).toBe('Title 1 of 5. Sales by country.');

        const xAxis = child(root, 'axis');
        expect(xAxis.content).toBe('Country. Categorical, 3 labels, from US to Japan');
        expect(xAxis.children.map((node) => node.kind)).toEqual(['axis-title', 'axis-label', 'axis-label', 'axis-label']);
        const us = xAxis.children[1];
        expect(describeAccessibleNode(us).text).toBe('X axis label 2 of 4. US. 2 bars.');
        // Reading order runs top to bottom within a stack.
        expect(us.children.map((node) => node.content)).toEqual([
            'Country: US, Sales: 200, Source: Coal',
            'Country: US, Sales: 120, Source: Solar',
        ]);

        const yAxis = child(root, 'axis', 1);
        expect(yAxis.type).toBe('Y axis');
        expect(yAxis.content).toMatch(/^Sales\. Numeric, \d+ labels, from 0 to /);
        expect(yAxis.children.slice(1).every((node) => node.children.length === 0)).toBe(true);

        const legend = child(root, 'legend');
        expect(legend.content).toBe('Source. 2 items: Coal, Solar');
        expect(legend.children.map((node) => describeAccessibleNode(node).text)).toEqual([
            'Legend title 1 of 3. Source.',
            'Legend item 2 of 3. Source: Coal. 3 bars.',
            'Legend item 3 of 3. Source: Solar. 3 bars.',
        ]);
        expect(legend.children[1].legend).toMatchObject({ field: 'Source', domain: { kind: 'value', value: 'Coal' } });

        const data = child(root, 'data');
        expect(data.content).toBe('6 bars, Sales from 40 to 200');
        expect(data.children).toHaveLength(6);
        expect(data.children.every((node) => node.kind === 'mark' && node.type === 'Bar')).toBe(true);
        expect(describeAccessibleNode(data.children[0]).text).toBe('Bar 1 of 6. Country: US, Sales: 200, Source: Coal.');
        view.finalize();
    });

    it('groups points on lines into series and names them the way the legend does', async () => {
        const { root, view } = await accessibleTree(twoLines);
        const data = child(root, 'data');
        expect(data.content).toBe('8 points on line in 2 series, Price from 1 to 5');
        expect(data.children.map((node) => node.kind)).toEqual(['series', 'series']);
        const series = data.children.map((node) => node.content);
        expect(series).toContain('Food: Eggs. 4 points on line, Price from 2 to 5');
        expect(series).toContain('Food: Bread. 4 points on line, Price from 1 to 1.3');
        const eggs = data.children.find((node) => node.content.startsWith('Food: Eggs'))!;
        expect(eggs.children.map((node) => node.type)).toEqual(Array(4).fill('Point on line'));
        expect(eggs.children.every((node) => node.shape === 'point')).toBe(true);
        view.finalize();
    });

    it('walks facet headers and panels', async () => {
        const facet = TEST_GENERATORS['Facet: Cols+Rows']()[0];
        const { root, view } = await accessibleTree(testCaseInput(facet));
        const kinds = root.children.map((node) => node.type);
        expect(kinds).toEqual(expect.arrayContaining(['Column headers', 'Row headers', 'Data']));
        const columns = root.children.find((node) => node.type === 'Column headers')!;
        expect(columns.children.map((node) => node.type)).toEqual(['Column header', 'Column header']);
        expect(columns.children[0].content).toMatch(/^Col: \w+\. 2 panels, \d+ points$/);
        expect(columns.children[0].children.every((node) => node.kind === 'panel')).toBe(true);
        const data = child(root, 'data');
        expect(data.children).toHaveLength(4);
        expect(data.children[0].content).toMatch(/^Row: \w+, Col: \w+\. \d+ points/);
        view.finalize();
    });

    it('reaches every Vega-Lite chart type, with a type and content on every element', async () => {
        const chartTypes = [...new Set(vlAllTemplateDefs.map((definition) => definition.chart))];
        let covered = 0;
        for (const chartType of chartTypes) {
            const testCase = Object.values(TEST_GENERATORS).flatMap((generate) => generate())
                .find((candidate) => candidate.chartType === chartType);
            if (!testCase) continue;
            covered += 1;
            const { root, view } = await accessibleTree(testCaseInput(testCase));
            const nodes = accessibleNodes(root);
            expect(root.children.length, chartType).toBeGreaterThan(0);
            expect(new Set(nodes.map((node) => node.id)).size, chartType).toBe(nodes.length);
            for (const node of nodes) {
                const description = describeAccessibleNode(node);
                expect(description.type, `${chartType} ${node.id}`).not.toBe('');
                expect(description.content.trim(), `${chartType} ${node.id}`).not.toBe('');
                expect(description.text, `${chartType} ${node.id}`).toContain(node.content.split('.')[0]);
                expect(node.bounds, `${chartType} ${node.id}`).toBeDefined();
            }
            const data = root.children.find((node) => node.kind === 'data');
            expect(data, chartType).toBeDefined();
            const marks = accessibleNodes(data!).filter((node) => node.kind === 'mark');
            expect(marks.length, chartType).toBeGreaterThan(0);
            for (const mark of marks) {
                expect(mark.members, `${chartType} ${mark.id}`).toHaveLength(1);
                expect(mark.type, chartType).toBe(mark.type.trim());
            }
            view.finalize();
        }
        expect(covered).toBe(chartTypes.length);
    });
});

describe('AccessibleNavigator', () => {
    it('maps keys to commands and leaves modified keys to the page', () => {
        expect(accessibleCommandForKey({ key: 'ArrowRight' })).toBe('next');
        expect(accessibleCommandForKey({ key: 'Enter' })).toBe('enter');
        expect(accessibleCommandForKey({ key: ' ' })).toBe('activate');
        expect(accessibleCommandForKey({ key: 'Backspace' })).toBe('exit');
        expect(accessibleCommandForKey({ key: 'X' })).toBe('jump-x');
        expect(accessibleCommandForKey({ key: '?' })).toBe('help');
        expect(accessibleCommandForKey({ key: 'Tab' })).toBeUndefined();
        expect(accessibleCommandForKey({ key: 'ArrowRight', ctrlKey: true })).toBeUndefined();
    });

    it('enters, steps, and leaves levels, and reports the edges', async () => {
        const { root, view } = await accessibleTree(stackedBar);
        const navigator = new AccessibleNavigator(() => root);
        expect(navigator.run('previous')).toMatchObject({ moved: false, message: 'Top of the chart. Press Enter to explore.' });
        expect(navigator.run('enter').node.kind).toBe('title');
        expect(navigator.run('previous')).toMatchObject({ moved: false, message: 'Start of the chart.' });
        expect(navigator.run('last').node.kind).toBe('data');
        expect(navigator.run('next')).toMatchObject({ moved: false, message: 'End of the chart.' });
        expect(navigator.run('enter').node.type).toBe('Bar');
        expect(navigator.run('last').node).toBe(child(root, 'data').children[5]);
        expect(navigator.run('activate')).toMatchObject({ moved: false, activate: true });
        expect(navigator.run('exit').node.kind).toBe('data');
        expect(navigator.run('exit').node.kind).toBe('chart');
        expect(navigator.run('exit')).toMatchObject({ exited: true });
        expect(navigator.run('help').message).toBe(ACCESSIBLE_NAVIGATION_HELP);
        expect(navigator.run('jump-legend').node.kind).toBe('legend');
        expect(navigator.run('jump-y').node.type).toBe('Y axis');
        expect(navigator.run('jump-x').node.type).toBe('X axis');
        expect(navigator.run('jump-title').node.kind).toBe('title');
        expect(navigator.run('enter')).toMatchObject({ moved: false, message: 'Title has nothing inside.' });
        view.finalize();
    });

    it('moves up and down through a stack, and across series on a line', async () => {
        const bars = await accessibleTree(stackedBar);
        const navigator = new AccessibleNavigator(() => bars.root);
        navigator.run('jump-data');
        const top = navigator.run('enter').node;
        expect(navigator.run('up')).toMatchObject({ moved: false, message: 'No mark above.' });
        const below = navigator.run('down');
        expect(below.moved).toBe(true);
        expect(below.node.content.split(',')[0]).toBe(top.content.split(',')[0]);
        expect(navigator.run('down')).toMatchObject({ moved: false, message: 'No mark below.' });
        bars.view.finalize();

        const lines = await accessibleTree(twoLines);
        const walk = new AccessibleNavigator(() => lines.root);
        walk.run('jump-data');
        walk.run('enter');
        const first = walk.run('enter').node;
        const switched = walk.run(first.content.includes('Eggs') ? 'down' : 'up');
        expect(switched.moved).toBe(true);
        expect(switched.node.parent).not.toBe(first.parent);
        expect(switched.node.content.split(',')[0]).toBe(first.content.split(',')[0]);
        lines.view.finalize();
    });

    it('keeps the reader in place across a rebuild', async () => {
        let { root, view } = await accessibleTree(stackedBar);
        const navigator = new AccessibleNavigator(() => root);
        navigator.run('jump-legend');
        navigator.run('enter');
        const item = navigator.run('next').node;
        const rebuilt = await accessibleTree(stackedBar);
        view.finalize();
        ({ root, view } = rebuilt);
        navigator.refresh();
        expect(navigator.current.id).toBe(item.id);
        expect(navigator.current).not.toBe(item);
        view.finalize();
    });
});

describe('markNoun', () => {
    it('names marks the way the chart type does', () => {
        expect(markNoun('rect', 'Bar Chart')).toEqual(['Bar', 'Bars']);
        expect(markNoun('rect', 'Heatmap')).toEqual(['Cell', 'Cells']);
        expect(markNoun('arc', 'Pie Chart')).toEqual(['Slice', 'Slices']);
        expect(markNoun('line', 'Line Chart')).toEqual(['Point on line', 'Points on line']);
        expect(markNoun('area', 'Violin Plot', true)).toEqual(['Violin', 'Violins']);
        expect(markNoun('shape', 'Choropleth')).toEqual(['Region', 'Regions']);
    });
});
