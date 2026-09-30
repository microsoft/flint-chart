import { describe, expect, it } from 'vitest';
import { isSelectionEvent, toChartSelection } from '../src/interactive/selection';
import type { FlintInteractionEventDetail } from '../src/interactive/interactions';
import type { CanvasInteractionEvent } from '../src/interactive/language/events';
import type { ChartAssemblyInput } from '../src/core/types';

const input: ChartAssemblyInput = {
    data: { values: [] },
    chart_spec: { chartType: 'Scatter Plot', title: 'Weight and mileage', encodings: { x: 'weight', y: { field: 'mpg' } } },
};

const rowA = { car: 'A', weight: 2000, mpg: 30 };
const rowB = { car: 'B', weight: 2500, mpg: 25 };

function detail(event: Partial<CanvasInteractionEvent>): FlintInteractionEventDetail {
    return {
        chartId: 'cars',
        interactionId: 'brush',
        timestamp: 0,
        event: { action: 'brush-x', phase: 'commit', geometry: {}, target: null, ...event } as CanvasInteractionEvent,
    };
}

describe('toChartSelection', () => {
    it('reads the rows under a clicked mark', () => {
        const selection = toChartSelection(detail({
            action: 'click-element',
            target: { visual: { kind: 'mark', role: 'point' }, elements: [{ value: { car: 'A' }, records: [rowA] }] },
        }), input);
        expect(selection).toEqual({ chartId: 'cars', interactionId: 'brush', action: 'click-element', rows: [rowA] });
    });

    it('names the brushed field and range, and lists each row once', () => {
        const selection = toChartSelection(detail({
            geometry: { domain: { x: { kind: 'interval', start: 1900, end: 2600 } } },
            target: {
                visual: { kind: 'region', role: 'brush' },
                elements: [
                    { value: { car: 'A' }, records: [rowA] },
                    { value: { car: 'B' }, records: [rowB, rowA] },
                ],
            },
        }), input);
        expect(selection.range).toEqual({ x: { field: 'weight', start: 1900, end: 2600 } });
        expect(selection.rows).toEqual([rowA, rowB]);
    });

    it('keeps only the brushed axis of a rectangle brush', () => {
        const selection = toChartSelection(detail({
            geometry: {
                plot: { kind: 'rect', axis: 'x', rect: { x: 0, y: 0, width: 10, height: 10 } },
                domain: { x: { kind: 'interval', start: 1900, end: 2600 }, y: { kind: 'interval', start: 0, end: 40 } },
            },
        }), input);
        expect(selection.range).toEqual({ x: { field: 'weight', start: 1900, end: 2600 } });
    });

    it('falls back to the mark value when no records are traced', () => {
        const selection = toChartSelection(detail({
            target: { visual: { kind: 'mark', role: 'bar' }, elements: [{ value: { continent: 'Asia', total: 12 } }] },
        }));
        expect(selection.rows).toEqual([{ continent: 'Asia', total: 12 }]);
        expect(selection.range).toBeUndefined();
    });

    it('gives empty rows for a cleared brush', () => {
        const selection = toChartSelection(detail({ operation: 'clear' }), input);
        expect(selection.rows).toEqual([]);
        expect(selection.range).toBeUndefined();
    });
});

describe('isSelectionEvent', () => {
    it('accepts a committed gesture and rejects previews and viewport moves', () => {
        expect(isSelectionEvent(detail({}))).toBe(true);
        expect(isSelectionEvent(detail({ phase: 'preview' }))).toBe(false);
        expect(isSelectionEvent(detail({ action: 'pan-viewport' }))).toBe(false);
    });
});
