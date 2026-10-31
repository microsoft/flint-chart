import { describe, expect, it } from 'vitest';
import {
    LINK_LAYER,
    clickHighlight,
    conditionUpdates,
    createLinkState,
    linkCharts,
    linkInput,
    select,
    selectionParts,
    type ChartChange,
    type ChartLink,
    type ChartState,
    type ChartUpdate,
    type InteractiveChartSurface,
    type SemanticElement,
} from '../src/interactive';
import { validateLinks } from '../src/validate';
import type { ChartAssemblyInput } from '../src/core/types';

const marks = (...values: Record<string, unknown>[]) => values.map((value) => ({ value }));
const link = (receives: string[], gestures: ChartLink['gestures'] = {}): ChartLink => ({ sends: [], receives, gestures, notes: [] });

describe('link condition', () => {
    it('reads a brush as the span of its axis field and a click as the values it holds', () => {
        const brushed = marks({ month: 3, region: 'Asia' }, { month: 6, region: 'Europe' }, { month: 4, region: 'Asia' });
        expect(selectionParts(brushed, { preset: 'brush-x', fields: ['month'], hover: false })).toEqual({ month: { range: [3, 6] } });
        expect(selectionParts(brushed, { preset: 'click-highlight', fields: ['month', 'region'], hover: false }))
            .toEqual({ month: { in: [3, 6, 4] }, region: { in: ['Asia', 'Europe'] } });
    });

    it('shows each chart the parts on fields its marks carry, as one where target', () => {
        const condition = { region: { in: ['Asia'] }, month: { range: [3, 6] as [number, number] } };
        const updates = conditionUpdates({ both: link(['month', 'region']), regions: link(['region']), other: link(['product']) }, condition);
        expect(updates.get('both')!.ops[0]).toMatchObject({ targets: [{ select: { where: condition } }] });
        expect(updates.get('regions')!.ops[0]).toMatchObject({ targets: [{ select: { where: { region: { in: ['Asia'] } } } }] });
        expect(updates.has('other')).toBe(false);
    });

    it('reads several marks field by field, so two fields that vary apart admit combinations no mark had', () => {
        const parts = selectionParts(marks({ month: 3, region: 'Asia' }, { month: 6, region: 'Europe' }), { preset: 'select', fields: ['month', 'region'], hover: false });
        expect(parts).toEqual({ month: { in: [3, 6] }, region: { in: ['Asia', 'Europe'] } });
    });
});

describe('validateLinks', () => {
    const rows = [{ country: 'India', region: 'Asia', gdp: 3 }, { country: 'France', region: 'Europe', gdp: 2 }];
    const chart = (encodings: Record<string, unknown>, interactions: unknown[] = []): ChartAssemblyInput => ({
        data: { values: rows },
        chart_spec: { chartType: 'Bar Chart', encodings },
        interaction_spec: { interactions },
    } as ChartAssemblyInput);

    it('sends through each selecting interaction and receives the fields its marks carry', () => {
        const links = validateLinks({
            countries: chart({ x: 'country', y: 'gdp', color: 'region' }, ['click-highlight']),
            regions: chart({ x: 'region', y: 'gdp' }),
        }, { fields: ['country', 'region'] });
        expect(links.countries).toMatchObject({ sends: ['country', 'region'], receives: ['country', 'region'] });
        expect(links.regions.receives).toEqual(['region']);
        expect(links.regions.notes.join()).toContain('leaves out country');
    });

    it('counts presets mounted in code, not only those in the spec', async () => {
        const scatterInput = { data: { values: rows }, chart_spec: { chartType: 'Scatter Plot', encodings: { x: 'gdp', y: 'gdp', detail: 'country' } } } as ChartAssemblyInput;
        const mounted = { ...fakeSurface().surface, interactions: [select(), clickHighlight({ targets: ['mark'] })] } as InteractiveChartSurface;
        const input = linkInput({ input: scatterInput, surface: mounted });
        expect((input.interaction_spec as any).interactions.map((entry: any) => entry.type)).toEqual(['select', 'click-highlight']);
        const links = validateLinks({ scatter: input }, { fields: ['country'] });
        expect(links.scatter.sends).toEqual(['country']);
        expect(Object.keys(links.scatter.gestures)).toEqual(['select', 'click-highlight']);

        // Through linkCharts: a box drawn on the scatter reaches the other chart.
        const scatter = fakeSurface();
        const bars = fakeSurface();
        Object.assign(scatter.surface, { interactions: [select()] });
        const linked = linkCharts({
            scatter: { input: scatterInput, surface: scatter.surface },
            bars: { input: chart({ x: 'country', y: 'gdp' }), surface: bars.surface },
        }, { fields: ['country'] });
        await linked.ready;
        scatter.emit({ interactionId: 'select', state: holding('select', 'retained', marks({ country: 'India' }, { country: 'France' })) });
        expect(linked.condition().condition).toEqual({ country: { in: ['India', 'France'] } });
    });

    it('lists a preset once when it is both in the spec and mounted from it', () => {
        const withSpec = chart({ x: 'country', y: 'gdp' }, ['click-highlight']);
        const mounted = { ...fakeSurface().surface, interactions: [clickHighlight()] } as InteractiveChartSurface;
        expect((linkInput({ input: withSpec, surface: mounted }).interaction_spec as any).interactions).toEqual(['click-highlight']);
    });
});

/** A surface that records the layers the link writes and lets a test report changes. */
function fakeSurface() {
    const listeners = new Set<(change: ChartChange) => void>();
    const applied: ChartUpdate[] = [];
    const cleared: string[] = [];
    const surface = {
        applyUpdate: async (update: ChartUpdate) => {
            applied.push(update);
            return {} as never;
        },
        clearUpdate: async (id: string) => {
            cleared.push(id);
        },
        onChange: (listener: (change: ChartChange) => void) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    } as unknown as InteractiveChartSurface;
    const emit = (change: Partial<ChartChange> & { state?: Partial<ChartState> }) => {
        const state = { chartType: 'Bar Chart', selected: [], ...change.state } as ChartState;
        for (const listener of listeners) listener({ phase: 'commit', source: 'reader', changed: [], previous: state, ...change, state } as ChartChange);
    };
    return { surface, applied, cleared, emit, listeners };
}

const holding = (interaction: string, layer: 'retained' | 'preview', elements: SemanticElement[]): ChartState => ({
    chartType: 'Bar Chart',
    selected: elements,
    entries: new Map([[interaction, { layer, elements }]]),
});

describe('linkCharts', () => {
    const input = {} as ChartAssemblyInput;
    const links: Record<string, ChartLink> = {
        bars: link(['region'], { 'click-highlight': { preset: 'click-highlight', fields: ['region'], hover: false } }),
        trend: link(['region', 'month'], {
            'brush-x': { preset: 'brush-x', fields: ['month'], hover: false },
            'hover-group-focus': { preset: 'hover-group-focus', fields: ['region'], hover: true },
        }),
    };
    const setup = async () => {
        const bars = fakeSurface();
        const trend = fakeSurface();
        const linked = linkCharts({ bars: { input, surface: bars.surface }, trend: { input, surface: trend.surface } }, { fields: ['region', 'month'] }, { links });
        await linked.ready;
        return { bars, trend, linked };
    };
    const whereOf = (update: ChartUpdate | undefined) => (update?.ops[0] as any)?.targets[0].select.where;

    it('applies a commit made before the link is ready once it is', async () => {
        const bars = fakeSurface();
        const trend = fakeSurface();
        const linked = linkCharts({ bars: { input, surface: bars.surface }, trend: { input, surface: trend.surface } }, { fields: ['region', 'month'] }, { links });
        bars.emit({ interactionId: 'click-highlight', state: holding('click-highlight', 'retained', marks({ region: 'Asia' })) });
        await linked.ready;
        expect(linked.condition().condition).toEqual({ region: { in: ['Asia'] } });
        expect(whereOf(trend.applied.at(-1))).toEqual({ region: { in: ['Asia'] } });
    });

    it('shows a committed selection on every chart, and the source drops its own emphasis', async () => {
        const { bars, trend, linked } = await setup();
        bars.emit({ interactionId: 'click-highlight', state: holding('click-highlight', 'retained', marks({ region: 'Asia' })) });
        expect(bars.cleared).toEqual(['click-highlight']);
        expect(whereOf(bars.applied.at(-1))).toEqual({ region: { in: ['Asia'] } });
        expect(whereOf(trend.applied.at(-1))).toEqual({ region: { in: ['Asia'] } });
        expect(linked.condition()).toMatchObject({ condition: { region: { in: ['Asia'] } }, from: { region: 'bars' } });
    });

    it('joins a brush range with AND and clears the layer where a chart reads none of the condition', async () => {
        const { bars, trend, linked } = await setup();
        bars.emit({ interactionId: 'click-highlight', state: holding('click-highlight', 'retained', marks({ region: 'Asia' })) });
        trend.emit({ interactionId: 'brush-x', state: holding('brush-x', 'retained', marks({ month: 3, region: 'Asia' }, { month: 6, region: 'Asia' })) });
        expect(whereOf(trend.applied.at(-1))).toEqual({ region: { in: ['Asia'] }, month: { range: [3, 6] } });
        expect(whereOf(bars.applied.at(-1))).toEqual({ region: { in: ['Asia'] } });
        linked.clear();
        expect(bars.cleared.at(-1)).toBe(LINK_LAYER);
        expect(trend.cleared.at(-1)).toBe(LINK_LAYER);
    });

    it('previews a hover over the condition and lets it go when the pointer leaves', async () => {
        const { bars, trend, linked } = await setup();
        trend.emit({ phase: 'preview', interactionId: 'hover-group-focus', state: holding('hover-group-focus', 'preview', marks({ region: 'Europe' })) });
        expect(whereOf(bars.applied.at(-1))).toEqual({ region: { in: ['Europe'] } });
        expect(linked.condition().condition).toEqual({});
        trend.emit({ phase: 'cancel', interactionId: 'hover-group-focus' });
        expect(bars.cleared.at(-1)).toBe(LINK_LAYER);
    });

    it('clears everywhere on a reader reset, and ignores the host’s own changes', async () => {
        const { bars, trend, linked } = await setup();
        bars.emit({ interactionId: 'click-highlight', state: holding('click-highlight', 'retained', marks({ region: 'Asia' })) });
        const applied = trend.applied.length;
        trend.emit({ source: 'host', interactionId: 'brush-x', state: holding('brush-x', 'retained', marks({ month: 1 })) });
        expect(trend.applied.length).toBe(applied);
        trend.emit({ reset: 'escape' });
        expect(linked.condition().condition).toEqual({});
        expect(bars.cleared.at(-1)).toBe(LINK_LAYER);
    });

    it('reports every change to the condition, and stops listening once destroyed', async () => {
        const { bars, linked } = await setup();
        const seen: unknown[] = [];
        linked.onCondition((snapshot) => seen.push(snapshot.condition));
        bars.emit({ interactionId: 'click-highlight', state: holding('click-highlight', 'retained', marks({ region: 'Asia' })) });
        expect(seen).toEqual([{ region: { in: ['Asia'] } }]);
        linked.destroy();
        expect(bars.listeners.size).toBe(0);
        expect(bars.cleared.at(-1)).toBe(LINK_LAYER);
    });

    it('selects from the host, as a table row or a filter control would, and joins it with a chart selection', async () => {
        const { bars, trend, linked } = await setup();
        await linked.select({ region: { in: ['Oceania'] } });
        expect(whereOf(bars.applied.at(-1))).toEqual({ region: { in: ['Oceania'] } });
        expect(whereOf(trend.applied.at(-1))).toEqual({ region: { in: ['Oceania'] } });
        expect(linked.condition()).toMatchObject({ condition: { region: { in: ['Oceania'] } }, from: { region: 'host' } });

        trend.emit({ interactionId: 'brush-x', state: holding('brush-x', 'retained', marks({ month: 3, region: 'Oceania' }, { month: 6, region: 'Oceania' })) });
        expect(whereOf(trend.applied.at(-1))).toEqual({ region: { in: ['Oceania'] }, month: { range: [3, 6] } });

        await linked.select({ region: null }, { from: 'filter' });
        expect(linked.condition()).toMatchObject({ condition: { month: { range: [3, 6] } }, from: { month: 'trend' } });
        expect(bars.cleared.at(-1)).toBe(LINK_LAYER);
    });

    it('ignores a host part on a field the charts do not connect on', async () => {
        const { bars, linked } = await setup();
        const applied = bars.applied.length;
        await linked.select({ country: { in: ['India'] } });
        expect(linked.condition().condition).toEqual({});
        expect(bars.applied.length).toBe(applied);
    });
});

describe('createLinkState', () => {
    it('carries the condition across a new check of the charts, letting go of fields no chart links', () => {
        const before = createLinkState({ bars: link(['region'], { pick: { preset: 'select', fields: ['region'], hover: false } }) });
        before.read('bars', {
            phase: 'commit', source: 'reader', changed: [], interactionId: 'pick',
            state: holding('pick', 'retained', marks({ region: 'Asia', month: 3 })), previous: {} as ChartState,
        } as ChartChange);
        const carried = createLinkState({ bars: link(['region']) }, { condition: { ...before.snapshot().condition, month: { in: [3] } }, from: { region: 'bars', month: 'bars' } });
        expect(carried.snapshot()).toMatchObject({ condition: { region: { in: ['Asia'] } }, from: { region: 'bars' }, shown: { region: { in: ['Asia'] } } });
    });
});
