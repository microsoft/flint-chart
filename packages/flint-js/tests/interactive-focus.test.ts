import { describe, expect, it } from 'vitest';
import {
    addInteractiveFocus,
    injectFocusClearMark,
    withoutInteractiveFocusField,
} from '../src/vegalite/interactive-focus';

describe('Vega-Lite interactive focus', () => {
    it('adds point selection and dimming to a discrete unit mark', () => {
        const spec: Record<string, any> = {
            mark: 'bar',
            encoding: {
                x: { field: 'category', type: 'nominal' },
                y: { field: 'value', type: 'quantitative' },
            },
        };

        expect(addInteractiveFocus(spec)).toBe(true);
        expect(spec.params[0].select).toMatchObject({
            type: 'point',
            fields: ['__flint_focus_key'],
            toggle: 'event.shiftKey || event.ctrlKey || event.metaKey',
        });
        expect(spec.transform).toContainEqual({
            calculate: 'datum["category"]',
            as: '__flint_focus_key',
        });
        expect(spec.encoding.detail).toEqual({ field: '__flint_focus_key', type: 'nominal' });
        expect(spec.encoding.opacity).toEqual({
            condition: { param: '__flint_focus', value: 1 },
            value: 0.3,
        });
    });

    it('preserves authored selections and opacity encodings', () => {
        const withParams: Record<string, any> = {
            mark: 'bar',
            params: [{ name: 'authored', select: 'point' }],
            encoding: { x: { field: 'category', type: 'nominal' } },
        };
        const withOpacity: Record<string, any> = {
            mark: 'bar',
            encoding: {
                x: { field: 'category', type: 'nominal' },
                opacity: { field: 'weight', type: 'quantitative' },
            },
        };

        expect(addInteractiveFocus(withParams)).toBe(false);
        expect(addInteractiveFocus(withOpacity)).toBe(false);
    });

    it('skips unsupported continuous marks', () => {
        const spec: Record<string, any> = {
            mark: 'line',
            encoding: {
                x: { field: 'date', type: 'temporal' },
                y: { field: 'value', type: 'quantitative' },
            },
        };

        expect(addInteractiveFocus(spec)).toBe(false);
        expect(spec).not.toHaveProperty('params');
    });

    it('adds focus to the first eligible layer', () => {
        const spec: Record<string, any> = {
            encoding: { x: { field: 'category', type: 'nominal' } },
            layer: [
                { mark: 'line', encoding: { y: { field: 'value', type: 'quantitative' } } },
                { mark: 'point', encoding: { y: { field: 'value', type: 'quantitative' } } },
            ],
        };

        expect(addInteractiveFocus(spec)).toBe(true);
        expect(spec.layer[0]).not.toHaveProperty('params');
        expect(spec.layer[1].params[0].name).toBe('__flint_focus');
        expect(spec.layer[1].encoding.detail).toEqual({ field: '__flint_focus_key', type: 'nominal' });
    });

    it('injects a transparent clear catcher below compiled marks', () => {
        const spec: Record<string, any> = { marks: [{ type: 'rect', name: 'marks' }] };

        injectFocusClearMark(spec);

        expect(spec.marks[0]).toMatchObject({
            type: 'rect',
            name: '__flint_focus_clear',
            encode: { enter: { opacity: { value: 0 } } },
        });
    });

    it('removes the internal focus key from tooltip objects', () => {
        expect(withoutInteractiveFocusField({
            category: 'A',
            value: 10,
            __flint_focus_key: 'A',
        })).toEqual({ category: 'A', value: 10 });
        expect(withoutInteractiveFocusField('label')).toBe('label');
    });
});