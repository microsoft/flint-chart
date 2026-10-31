import { describe, expect, it } from 'vitest';
import { applyAggregation, resolveImplicitAggregation } from '../src/core/aggregate';
import { filterControls, versionFieldsOf } from '../src/interactive/filter-controls';
import { openVegaLiteSession } from '../src/vegalite/assemble';
import { orderWithin } from '../src/vegalite/interactions/runtime';
import { bindLegendDomains, legendDomainOf } from '../src/vegalite/interactions/scene-tween';

const week = (name: string, base: number) => ['Mon', 'Tue'].flatMap((Day, i) => ['9am', '10am'].map((Slot, j) => ({
    Week: name, Day, Slot, Visits: base + 10 * (i + j),
})));

const heatmap = (options?: Record<string, unknown>) => ({
    data: { values: [...week('W1', 10), ...week('W2', 20)] },
    semantic_types: { Week: 'Category', Day: 'Category', Slot: 'Category', Visits: 'Count' },
    chart_spec: { chartType: 'Heatmap', encodings: { x: 'Day', y: 'Slot', color: 'Visits' }, baseSize: { width: 300, height: 200 } },
    ...(options ? { options } : {}),
}) as any;

describe('versions of the same marks', () => {
    it('are the fields a filter control shows one value of at a time', () => {
        expect(versionFieldsOf(heatmap(), [filterControls({ fields: ['Week'] })])).toEqual(['Week']);
        expect(versionFieldsOf(heatmap(), [filterControls({ fields: ['Week'], mode: 'highlight' })])).toEqual([]);
        expect(versionFieldsOf(heatmap(), [])).toEqual([]);
    });

    it('are never aggregated together, implicitly or when asked', () => {
        const encodings = { x: { field: 'Day' }, y: { field: 'Slot' }, color: { field: 'Visits' } } as any;
        const rows = [...week('W1', 10), ...week('W2', 20)];
        expect(resolveImplicitAggregation('Heatmap', encodings, rows, {}).encodings.color.aggregate).toBe('average');
        expect(resolveImplicitAggregation('Heatmap', encodings, rows, {}, ['Week']).encodings.color.aggregate).toBeUndefined();
        const summed = applyAggregation({ ...encodings, color: { field: 'Visits', aggregate: 'sum' } }, rows, ['Week']);
        expect(summed).toHaveLength(8);
        expect(summed[0]).toMatchObject({ Week: 'W1', Day: 'Mon', Slot: '9am', Visits_sum: 10 });
    });

    it('draw a heatmap that names its measure as it is, not as a sum', () => {
        expect(openVegaLiteSession(heatmap()).spec.encoding.color.field).toBe('Visits_sum');
        expect(openVegaLiteSession(heatmap({ versionFields: ['Week'] })).spec.encoding.color.field).toBe('Visits');
    });
});

describe('a continuous legend', () => {
    it('holds its domain in a signal the runtime moves to the rows the chart is given', () => {
        const spec: any = { signals: [], scales: [{ name: 'color', type: 'linear', domain: [10, 40] }, { name: 'x', type: 'band', domain: ['a'] }] };
        const [pin] = bindLegendDomains(spec, [{ channel: 'color', field: 'Visits', descending: false }]);
        expect(spec.scales[0].domain).toEqual({ signal: pin!.signal });
        expect(spec.signals).toEqual([{ name: pin!.signal, value: [10, 40] }]);
        expect(legendDomainOf(pin!, [{ Visits: 30 }, { Visits: 90 }, { Visits: null }])).toEqual([30, 90]);
        expect(legendDomainOf({ ...pin!, descending: true }, [{ Visits: 30 }, { Visits: 90 }])).toEqual([90, 30]);
        expect(legendDomainOf(pin!, [{ Visits: 5 }])).toBeUndefined();
    });
});

describe('rows a chart is sent', () => {
    it('are shaped as the compile shaped the first rows, so an aggregated measure keeps its column', () => {
        const session = openVegaLiteSession({
            data: { values: [...week('W1', 10), ...week('W2', 20)] },
            semantic_types: { Week: 'Category', Day: 'Category', Slot: 'Category', Visits: 'Count' },
            chart_spec: { chartType: 'Heatmap', encodings: { x: 'Day', y: 'Slot', color: 'Visits' }, baseSize: { width: 300, height: 200 } },
        } as any);
        expect(session.spec.encoding.color.field).toBe('Visits_sum');
        const shaped = session.shapeRows(week('W1', 10));
        expect(shaped).toHaveLength(4);
        expect(shaped[0]).toMatchObject({ Day: 'Mon', Slot: '9am', Visits_sum: 10 });
    });
});

describe('a held order', () => {
    it('keeps the categories still drawn in its order and adds new ones in the order the rows bring them', () => {
        expect(orderWithin(['Spain', 'India', 'Japan', 'Chile'], ['India', 'Japan', 'Vietnam', 'India']))
            .toEqual(['India', 'Japan', 'Vietnam']);
    });

    it('matches dates by time and stands as given when no rows name the field', () => {
        const may = new Date(Date.UTC(2025, 4, 1));
        const june = new Date(Date.UTC(2025, 5, 1));
        expect(orderWithin([new Date(june.getTime()), new Date(may.getTime())], [may, june])).toEqual([june, may]);
        expect(orderWithin(['b', 'a'], [undefined, undefined])).toEqual(['b', 'a']);
    });
});
