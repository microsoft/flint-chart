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
import { INTERACTION_KEY } from '../src/vegalite/interactions/hit-adapter';
import {
    ACCESSIBLE_NAVIGATION_HELP,
    AccessibleNavigator,
    accessibleCommandForKey,
    accessibleNodes,
    buildAccessibleTree,
    describeAccessibleNode,
    formatNumber,
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

async function accessibleTree(input: ChartAssemblyInput): Promise<{ root: AccessibleNode; view: View; buildTree(): AccessibleNode }> {
    const spec = assembleVegaLite(input) as Record<string, any>;
    const plan = addVegaLiteInteractions(spec, [accessibleNavigation()], true);
    if (!plan) throw new Error(`No interaction plan for ${input.chart_spec.chartType}`);
    const compiled = compile(spec as any).spec as Record<string, any>;
    injectVegaInteractionStore(compiled, plan);
    const view = new View(parse(compiled), { renderer: 'none' });
    await view.runAsync();
    const buildTree = () => buildAccessibleTree({
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
    return { root: buildTree(), view, buildTree };
}

const child = (node: AccessibleNode, kind: string, index = 0): AccessibleNode => {
    const found = node.children.filter((candidate) => candidate.kind === kind)[index];
    if (!found) throw new Error(`No ${kind} under ${node.id}`);
    return found;
};

function expectCanonicalTraversal(root: AccessibleNode): void {
    const navigator = new AccessibleNavigator(() => root);
    for (const parent of accessibleNodes(root).filter((node) => node.children.length > 0)) {
        expect(parent.readingDirection, parent.id).toMatch(/^(horizontal|vertical)$/);
        const vertical = parent.readingDirection === 'vertical';
        const forward = accessibleCommandForKey({ key: vertical ? 'ArrowDown' : 'ArrowRight' })!;
        const backward = accessibleCommandForKey({ key: vertical ? 'ArrowUp' : 'ArrowLeft' })!;
        navigator.focus(parent.id);
        expect(navigator.run('enter').node.id, parent.id).toBe(parent.children[0].id);
        for (const sibling of parent.children.slice(1)) expect(navigator.run(forward).node.id, parent.id).toBe(sibling.id);
        expect(navigator.run(forward).moved, parent.id).toBe(false);
        for (const sibling of parent.children.slice(0, -1).reverse()) expect(navigator.run(backward).node.id, parent.id).toBe(sibling.id);
        expect(navigator.run(backward).moved, parent.id).toBe(false);
        const starts = parent.children.map((node) => {
            const bounds = node.readingBounds ?? node.bounds!;
            return vertical ? bounds.y1 : bounds.x1;
        });
        expect(starts, parent.id).toEqual([...starts].sort((left, right) => left - right));
        expect(navigator.run('exit').node.id, parent.id).toBe(parent.id);
        const canonicalIds = parent.children.map((node) => node.id);
        for (const direction of ['horizontal', 'vertical'] as const) {
            const ordered = [...parent.children].sort((left, right) => {
                const leftBounds = left.readingBounds ?? left.bounds!;
                const rightBounds = right.readingBounds ?? right.bounds!;
                return direction === 'vertical'
                    ? leftBounds.y1 - rightBounds.y1 || leftBounds.x1 - rightBounds.x1
                    : leftBounds.x1 - rightBounds.x1 || leftBounds.y1 - rightBounds.y1;
            });
            navigator.focus(ordered[0].id);
            for (const sibling of ordered.slice(1)) {
                expect(navigator.run(direction === 'vertical' ? 'down' : 'right').node.id, parent.id).toBe(sibling.id);
            }
            expect(navigator.run(direction === 'vertical' ? 'down' : 'right').moved, parent.id).toBe(false);
            for (const sibling of ordered.slice(0, -1).reverse()) {
                expect(navigator.run(direction === 'vertical' ? 'up' : 'left').node.id, parent.id).toBe(sibling.id);
            }
            expect(navigator.run(direction === 'vertical' ? 'up' : 'left').moved, parent.id).toBe(false);
            expect(parent.children.map((node) => node.id)).toEqual(canonicalIds);
        }
    }
}

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
        expect(root.children.map((node) => node.type)).toEqual(['Y axis', 'Title', 'X axis', 'Data', 'Color legend']);
        expect(describeAccessibleNode(root).text).toBe(
            'Stacked Bar Chart: Sales by country. X axis Country; Y axis Sales; color legend Source. 6 bars. '
            + 'Press Enter to explore 5 parts, or H for help.',
        );
        expect(describeAccessibleNode(child(root, 'title')).text).toBe('Title 2 of 5. Sales by country.');

        const xAxis = root.children.find((node) => node.axis?.channel === 'x')!;
        expect(xAxis.content).toBe('Country. Categorical, 3 labels, from US to Japan');
        expect(xAxis.children.filter((node) => node.kind === 'axis-title')).toHaveLength(1);
        expect(xAxis.children.filter((node) => node.kind === 'axis-label')).toHaveLength(3);
        const us = xAxis.children.find((node) => node.axis?.value === 'US')!;
        expect(describeAccessibleNode(us).text).toMatch(/^X axis label \d of 4\. US\. 2 bars\.$/);
        // Reading order runs top to bottom within a stack.
        expect(us.children.map((node) => node.content)).toEqual([
            'Country: US, Sales: 200, Source: Coal',
            'Country: US, Sales: 120, Source: Solar',
        ]);

        const yAxis = root.children.find((node) => node.axis?.channel === 'y')!;
        expect(yAxis.type).toBe('Y axis');
        expect(yAxis.content).toMatch(/^Sales\. Numeric, \d+ labels, from \S+ to 0$/);
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
            expectCanonicalTraversal(root);
            const nodes = accessibleNodes(root);
            expect(root.children.length, chartType).toBeGreaterThan(0);
            expect(new Set(nodes.map((node) => node.id)).size, chartType).toBe(nodes.length);
            for (const node of nodes) {
                const description = describeAccessibleNode(node);
                expect(description.type, `${chartType} ${node.id}`).not.toBe('');
                expect(description.content.trim(), `${chartType} ${node.id}`).not.toBe('');
                expect(description.text, `${chartType} ${node.id}`).not.toMatch(/undefined|NaN|\[object|Untitled|items omitted/);
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
    it.each(['horizontal', 'vertical'] as const)('uses a complete %s primary traversal at every level', async (direction) => {
        const { root, view } = await accessibleTree({
            data: { values: [{ Group: 'Alpha', Value: 100 }, { Group: 'Beta', Value: 2 }, { Group: 'Gamma', Value: 40 }] },
            semantic_types: { Group: 'Category', Value: 'Quantity' },
            chart_spec: {
                chartType: 'Bar Chart',
                encodings: direction === 'vertical'
                    ? { x: { field: 'Value' }, y: { field: 'Group' } }
                    : { x: { field: 'Group' }, y: { field: 'Value' } },
            },
        });
        try {
            expect(root.readingDirection).toBe(direction);
            expectCanonicalTraversal(root);
        } finally {
            view.finalize();
        }
    });

    it('maps keys to commands and leaves modified keys to the page', () => {
        expect(accessibleCommandForKey({ key: 'ArrowRight' })).toBe('right');
        expect(accessibleCommandForKey({ key: 'ArrowLeft' })).toBe('left');
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
        expect(navigator.run('enter').node.type).toBe('Y axis');
        expect(navigator.run('previous')).toMatchObject({ moved: false, message: 'Start of the chart.' });
        expect(navigator.run('last').node.kind).toBe('legend');
        expect(navigator.run('next')).toMatchObject({ moved: false, message: 'End of the chart.' });
        navigator.run('jump-data');
        expect(navigator.run('enter').node.type).toBe('Bar');
        expect(navigator.run('last').node).toBe(child(root, 'data').children[5]);
        expect(navigator.run('activate')).toMatchObject({ moved: false, activate: true });
        expect(navigator.run('exit').node.kind).toBe('data');
        expect(navigator.run('exit').node.kind).toBe('chart');
        expect(navigator.run('exit')).toMatchObject({ exited: true });
        expect(navigator.run('help').message).toContain(ACCESSIBLE_NAVIGATION_HELP);
        expect(navigator.run('jump-legend').node.kind).toBe('legend');
        expect(navigator.run('jump-y').node.type).toBe('Y axis');
        expect(navigator.run('jump-x').node.type).toBe('X axis');
        expect(navigator.run('jump-title').node.kind).toBe('title');
        expect(navigator.run('enter')).toMatchObject({ moved: false, message: 'Title has nothing inside.' });
        view.finalize();
    });

    it('uses vertical order without leaving the current sibling set', async () => {
        const bars = await accessibleTree(stackedBar);
        expectCanonicalTraversal(bars.root);
        bars.view.finalize();

        const lines = await accessibleTree(twoLines);
        const walk = new AccessibleNavigator(() => lines.root);
        const eggs = child(lines.root, 'data').children.find((node) => node.content.startsWith('Food: Eggs'))!;
        const ordered = [...eggs.children].sort((left, right) => left.readingBounds!.y1 - right.readingBounds!.y1);
        expect(ordered.map((node) => node.id)).not.toEqual(eggs.children.map((node) => node.id));
        walk.focus(ordered[0].id);
        for (const point of ordered.slice(1)) {
            const move = walk.run('down');
            expect(move.node.id).toBe(point.id);
            expect(move.node.parent).toBe(eggs);
        }
        expect(walk.run('down').moved).toBe(false);
        lines.view.finalize();
    });

    it('moves to the adjacent horizontal bar regardless of its length', async () => {
        const groups = ['Laptop', 'Phone', 'Tablet', 'Desktop', 'Monitor', 'Keyboard', 'Mouse', 'Headphones', 'Speaker', 'Camera'];
        const values = [890, 870, 460, 180, 406, 950, 300, 420, 100, 880];
        const { root, view } = await accessibleTree({
            data: { values: groups.map((Group, index) => ({ Group, X: values[index] })) },
            semantic_types: { Group: 'Category', X: 'Quantity' },
            chart_spec: {
                chartType: 'Bar Chart',
                encodings: { x: { field: 'X' }, y: { field: 'Group' } },
                baseSize: { width: 600, height: 400 },
            },
            options: { addTooltips: true },
        });
        try {
            const marks = child(root, 'data').children;
            const navigator = new AccessibleNavigator(() => root);
            navigator.focus(marks[4].id);
            expect(navigator.current.content).toContain('Group: Monitor');
            expect(navigator.run('up').node.id).toBe(marks[3].id);
            expect(navigator.run('down').node.id).toBe(marks[4].id);
            navigator.focus(marks[0].id);
            for (const mark of marks.slice(1)) expect(navigator.run('down').node.id).toBe(mark.id);
            expect(navigator.run('down').moved).toBe(false);
            for (const mark of marks.slice(0, -1).reverse()) expect(navigator.run('up').node.id).toBe(mark.id);
            expect(navigator.run('up').moved).toBe(false);
        } finally {
            view.finalize();
        }
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

    it.each([false, true])('keeps map traversal and numbering stable through Vega emphasis (identical: %s)', async (identical) => {
        const keys = ['first', 'second', 'third'];
        const view = new View(parse({
            signals: [{ name: 'active', value: null }],
            projections: [{ name: 'projection', type: 'mercator', scale: 30, translate: [100, 100] }],
            data: [{ name: 'regions', values: keys.map((key, index) => ({
                [INTERACTION_KEY]: key, type: 'Feature',
                geometry: { type: 'Point', coordinates: identical ? [0, 0] : [index, -index] },
            })) }],
            marks: [{
                type: 'shape', from: { data: 'regions' },
                transform: [{ type: 'geoshape', projection: 'projection' }],
                encode: { update: {
                    fill: { value: '#ccc' }, stroke: { value: '#000' },
                    strokeWidth: { signal: `datum.${INTERACTION_KEY} === active ? 7 : 0.3` },
                } },
            }],
        }), { renderer: 'none' });
        try {
            await view.runAsync();
            const buildTree = () => buildAccessibleTree({ root: (view.scenegraph() as any).root, chartType: 'Choropleth' });
            const navigator = new AccessibleNavigator(buildTree);
            const original = child(navigator.root, 'data').children;
            expect(original).toHaveLength(3);
            const originalDescriptions = original.map(describeAccessibleNode);
            const emphasizeAndRefresh = async () => {
                await view.signal('active', navigator.current.members[0].key).runAsync();
                navigator.refresh();
                const rebuilt = child(navigator.root, 'data').children;
                expect(rebuilt.map((node) => node.id)).toEqual(original.map((node) => node.id));
                expect(rebuilt.map(describeAccessibleNode)).toEqual(originalDescriptions);
                expect(rebuilt.map((node) => node.readingBounds)).toEqual(original.map((node) => node.readingBounds));
            };
            for (const [forward, backward] of [['right', 'left'], ['down', 'up']] as const) {
                navigator.focus(original[0].id);
                for (const expected of original) {
                    expect(navigator.current.id).toBe(expected.id);
                    await emphasizeAndRefresh();
                    navigator.run(forward);
                }
                expect(navigator.run(forward).moved).toBe(false);
                for (const expected of [...original].reverse()) {
                    expect(navigator.current.id).toBe(expected.id);
                    await emphasizeAndRefresh();
                    navigator.run(backward);
                }
                expect(navigator.run(backward).moved).toBe(false);
            }
        } finally {
            view.finalize();
        }
    });

    it.each([false, true])('keeps aligned bump series reachable while emphasis changes their stroke bounds (identical: %s)', async (identical) => {
        const input = testCaseInput(namedCase('Bump Chart', 'Olympic'));
        if (identical) input.data = { values: (input.data.values ?? []).map((row) => ({ ...row, Rank: 2 })) };
        const { root, view, buildTree } = await accessibleTree(input);
        try {
            const series = child(root, 'data').children;
            expect(series).toHaveLength(4);
            if (identical) expect(series.every((node) => JSON.stringify(node.readingBounds) === JSON.stringify(series[0].readingBounds))).toBe(true);
            const original = series.flatMap((node) => node.members).map((member) => ({
                item: member.item,
                bounds: { ...member.item.bounds },
                strokeWidth: member.item.strokeWidth,
            }));
            const navigator = new AccessibleNavigator(buildTree);
            navigator.run('jump-data');
            navigator.run('enter');
            const emphasizeAndRefresh = () => {
                for (const snapshot of original) {
                    Object.assign(snapshot.item.bounds, snapshot.bounds);
                    snapshot.item.strokeWidth = snapshot.strokeWidth;
                }
                for (const member of navigator.current.members) {
                    member.item.strokeWidth = (member.item.strokeWidth ?? 0) + 2;
                    member.item.bounds.expand(1);
                }
                navigator.refresh();
                expect(child(navigator.root, 'data').children.map((node) => node.id)).toEqual(series.map((node) => node.id));
            };
            for (const vertical of [false, true]) {
                const ordered = [...series].sort((left, right) => {
                    const leftBounds = left.readingBounds!;
                    const rightBounds = right.readingBounds!;
                    return vertical
                        ? leftBounds.y1 - rightBounds.y1 || leftBounds.x1 - rightBounds.x1
                        : leftBounds.x1 - rightBounds.x1 || leftBounds.y1 - rightBounds.y1;
                });
                navigator.focus(ordered[0].id);
                for (const expected of ordered) {
                    expect(navigator.current.id).toBe(expected.id);
                    emphasizeAndRefresh();
                    navigator.run(vertical ? 'down' : 'right');
                }
                expect(navigator.run(vertical ? 'down' : 'right').moved).toBe(false);
                for (const expected of [...ordered].reverse()) {
                    expect(navigator.current.id).toBe(expected.id);
                    emphasizeAndRefresh();
                    navigator.run(vertical ? 'up' : 'left');
                }
                expect(navigator.run(vertical ? 'up' : 'left').moved).toBe(false);
            }
        } finally {
            view.finalize();
        }
    });
});

function namedCase(chartType: string, title: string): TestCase {
    const found = Object.values(TEST_GENERATORS).flatMap((generate) => generate())
        .find((candidate) => candidate.chartType === chartType && candidate.title.includes(title));
    if (!found) throw new Error(`No test case ${chartType} :: ${title}`);
    return found;
}

describe('accessible navigation readings', () => {
    it('reads small and long numbers at a spoken precision', () => {
        expect(formatNumber(1234.5678)).toBe('1,234.57');
        expect(formatNumber(0.0049)).toBe('0.0049');
        expect(formatNumber(0.00769231)).toBe('0.00769');
        expect(formatNumber(8.919391822062482e-7)).toBe('8.92e-7');
        expect(formatNumber(0)).toBe('0');
    });

    it('reads tied values on one path as separate points, not as extra lines', async () => {
        const { root, view } = await accessibleTree(testCaseInput(namedCase('ECDF Plot', '')));
        const data = child(root, 'data');
        const series = data.children.filter((node) => node.kind === 'series');
        for (const node of series) expect(node.members.length, node.content).toBeGreaterThan(2);
        expect(accessibleNodes(root).some((node) => /\b\d+ lines\b/.test(node.content))).toBe(false);
        view.finalize();
    });

    it('reads an overflow placeholder as a count, not as a legend item', async () => {
        const { root, view } = await accessibleTree(testCaseInput(namedCase('Scatter Plot', 'color(N,50)')));
        const legend = child(root, 'legend');
        expect(legend.content).toMatch(/, and \d+ more not shown$/);
        const placeholder = legend.children.find((node) => /more items not shown/.test(node.content));
        expect(placeholder).toBeDefined();
        expect(placeholder!.members).toHaveLength(0);
        expect(describeAccessibleNode(placeholder!).text).not.toContain('..');
        view.finalize();
    });

    it('reads a time axis with full dates', async () => {
        const { root, view } = await accessibleTree(testCaseInput(namedCase('Line Chart', 'T×Q (30 pts)')));
        const axis = root.children.find((node) => node.kind === 'axis' && node.axis?.channel === 'x')!;
        expect(axis.content).toMatch(/from January 2020 to [A-Z][a-z]+ \d{4}/);
        const labels = axis.children.filter((node) => node.kind === 'axis-label').map((node) => node.content);
        expect(new Set(labels).size).toBe(labels.length);
        expect(labels).toEqual(expect.arrayContaining(['January 2020', 'July 2020', 'January 2021']));
        expect(labels.every((label) => /\d{4}/.test(label))).toBe(true);
        view.finalize();
    });

    it('keeps the marks of each facet panel apart when their keys agree', async () => {
        const { root, view } = await accessibleTree(testCaseInput(namedCase('Radar Chart', 'Faceted')));
        const panels = child(root, 'data').children.filter((node) => node.kind === 'panel');
        expect(panels.length).toBeGreaterThan(1);
        const readings = panels.map((panel) => panel.children.map((mark) => mark.content).join(' | '));
        for (const panel of panels) expect(panel.children.every((node) => node.kind === 'mark'), panel.content).toBe(true);
        expect(new Set(readings).size).toBe(panels.length);
        view.finalize();
    });

    it('matches legend values to aggregated marks, and says nothing of labels that are not categories', async () => {
        const { root, view } = await accessibleTree(testCaseInput(namedCase('Calendar Heatmap', 'Daily Activity')));
        const items = child(root, 'legend').children.filter((node) => node.kind === 'legend-item');
        expect(items.some((node) => node.members.length > 0)).toBe(true);
        const monthLabels = root.children.find((node) => node.kind === 'axis' && node.axis?.channel === 'x')!
            .children.filter((node) => node.kind === 'axis-label');
        for (const label of monthLabels) expect(label.content).not.toMatch(/\. No /);
        view.finalize();
    });

    it('names a series drawn apart only by stroke dash', async () => {
        const { root, view } = await accessibleTree(testCaseInput(namedCase('Line Chart', 'Forecast — single series')));
        const series = child(root, 'data').children.filter((node) => node.kind === 'series');
        expect(series.map((node) => node.content.split('.')[0])).toEqual(['Type: actual', 'Type: forecast']);
        expect(root.content).toContain('stroke dash legend');
        view.finalize();
    });

    it.each(['datum', 'tooltip'] as const)('refreshes changed %s readings with unchanged geometry and keys', async (source) => {
        const { view, buildTree } = await accessibleTree(stackedBar);
        try {
            const navigator = new AccessibleNavigator(buildTree);
            navigator.run('jump-data');
            const before = navigator.run('enter').node;
            const item = before.members[0].item;
            const key = item.datum.__flint_interaction_key;
            const bounds = { ...before.bounds };
            if (source === 'datum') {
                item.tooltip = null;
                item.datum.Sales = 400;
            } else {
                item.tooltip = { ...item.tooltip, Sales: '400' };
            }

            expect(navigator.refresh()).toBe(true);
            expect(navigator.current.id).toBe(before.id);
            expect(navigator.current.bounds).toEqual(bounds);
            expect(item.datum.__flint_interaction_key).toBe(key);
            expect(navigator.current.content).toContain('Sales: 400');
            expect(navigator.current.content).not.toBe(before.content);
        } finally {
            view.finalize();
        }
    });

    it('refreshes legend membership even when mark keys and geometry do not change', async () => {
        const { root, view, buildTree } = await accessibleTree(stackedBar);
        try {
            const navigator = new AccessibleNavigator(buildTree);
            const coal = child(root, 'legend').children.find((node) => node.legend?.value === 'Coal')!;
            navigator.focus(coal.id);
            expect(navigator.current.members).toHaveLength(3);
            const item = coal.members[0].item;
            item.datum.Source = 'Solar';

            navigator.refresh();
            expect(navigator.current.id).toBe(coal.id);
            expect(navigator.current.members).toHaveLength(2);
            expect(navigator.current.content).toContain('2 bars');
            const solar = child(navigator.root, 'legend').children.find((node) => node.legend?.value === 'Solar')!;
            expect(solar.members).toHaveLength(4);
        } finally {
            view.finalize();
        }
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
