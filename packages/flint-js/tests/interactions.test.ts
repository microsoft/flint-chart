import { describe, expect, it } from 'vitest';
import { clickAnnotate, clickGroupHighlight, clickHighlight, normalizeInteractions, select } from '../src/interactive/interactions';
import {
    ClickAnnotateInteraction,
    ClickGroupHighlightInteraction,
    ClickHighlightInteraction,
    SelectInteraction,
} from '../src/interactive/presets';
import { presentInteractionUpdate } from '../src/interactive/chart-update';
import { clickTrigger, externalTrigger, hoverTrigger, rectangleTrigger } from '../src/interactive/triggers';
import type {
    InteractionContext,
    InteractionDef,
    InteractionModifiers,
    InteractionPhase,
    SemanticTarget,
} from '../src/interactive/interactions';

function semanticUpdate(
    interaction: InteractionDef,
    target: SemanticTarget | null,
    context: InteractionContext,
    options: {
        source?: 'element' | 'region';
        phase?: InteractionPhase;
        modifiers?: InteractionModifiers;
    } = {},
) {
    return interaction.update({
        type: 'semantic',
        source: options.source ?? 'element',
        phase: options.phase ?? 'commit',
        target,
        modifiers: options.modifiers,
    }, context);
}

describe('interaction definitions', () => {
    it('declares normalized event sources for built-in presets', () => {
        expect(clickHighlight().eventSource).toBe(clickTrigger);
        expect(clickGroupHighlight().eventSource).toBe(clickTrigger);
        expect(clickAnnotate().eventSource).toBe(clickTrigger);
        expect(select().eventSource).toEqual(rectangleTrigger('intersect'));
    });

    it('provides reusable trigger descriptors', () => {
        expect(clickTrigger).toEqual({ type: 'element', gesture: 'click' });
        expect(hoverTrigger).toEqual({ type: 'element', gesture: 'hover' });
        expect(rectangleTrigger('contain')).toEqual({ type: 'region', gesture: 'drag', match: 'contain' });
        expect(externalTrigger('story-scroll')).toEqual({ type: 'external', source: 'story-scroll' });
    });

    it('processes resolved semantic events through normalized update policies', () => {
        const context = { chartType: 'Bar Chart', selected: [] };
        const target = {
            visual: { kind: 'mark' as const, role: 'bar' },
            elements: [{ key: { category: 'A' }, records: [{ category: 'A', value: 4 }] }],
        };

        expect(clickHighlight().update?.({
            type: 'semantic', source: 'element', phase: 'commit', target,
        }, context)).toEqual({
            ops: [{ op: 'emphasize', elements: target.elements, mode: 'replace', dimOpacity: 0.25 }],
        });
        expect(select().update?.({
            type: 'semantic', source: 'region', phase: 'preview', target,
        }, context)).toEqual({
            ops: [{ op: 'emphasize', elements: target.elements, mode: 'replace', dimOpacity: 0.25 }],
        });
    });

    it('creates preset definitions with stable defaults', () => {
        expect(clickHighlight()).toBeInstanceOf(ClickHighlightInteraction);
        expect(clickHighlight()).toMatchObject({ id: 'click-highlight', eventSource: clickTrigger });
        expect(clickGroupHighlight()).toBeInstanceOf(ClickGroupHighlightInteraction);
        expect(clickGroupHighlight()).toMatchObject({ id: 'click-group-highlight', eventSource: clickTrigger });
        expect(clickAnnotate()).toBeInstanceOf(ClickAnnotateInteraction);
        expect(clickAnnotate()).toMatchObject({ id: 'click-annotate', eventSource: clickTrigger });
        expect(select()).toBeInstanceOf(SelectInteraction);
        expect(select()).toMatchObject({
            id: 'select',
            eventSource: rectangleTrigger('intersect'),
        });
    });

    it('clears selection for an empty rectangle commit', () => {
        const interaction = select();
        const context = { chartType: 'Waterfall Chart', selected: [{ key: { Step: 'Revenue' } }] };
        expect(semanticUpdate(interaction, null, context, { source: 'region' }))
            .toEqual({ ops: [{ op: 'reset' }] });
    });

    it('maps the deprecated focusOnClick alias without duplicating an explicit definition', () => {
        expect(normalizeInteractions(undefined, undefined)).toEqual([]);
        expect(normalizeInteractions(undefined, true).map((interaction) => interaction.id)).toEqual(['click-highlight']);
        expect(normalizeInteractions([clickHighlight()], true).map((interaction) => interaction.id)).toEqual(['click-highlight']);
    });

    it('rejects duplicate interaction ids', () => {
        expect(() => normalizeInteractions([
            clickHighlight({ id: 'selection' }),
            select({ id: 'selection' }),
        ], false)).toThrow('Duplicate interaction id: "selection".');
    });

    it('produces replace and toggle emphasis updates', () => {
        const interaction = clickHighlight({ dimOpacity: 0.2 });
        const target = {
            visual: { kind: 'mark' as const, role: 'bar' },
            elements: [{ key: { Region: 'West' } }],
        };
        const context = { chartType: 'Bar Chart', selected: [] };
        const replace = semanticUpdate(interaction, target, context, {
            modifiers: { shift: false, ctrl: false, meta: false },
        });
        const toggle = semanticUpdate(interaction, target, context, {
            modifiers: { shift: true, ctrl: false, meta: false },
        });

        expect(replace?.ops[0]).toMatchObject({ op: 'emphasize', mode: 'replace', dimOpacity: 0.2 });
        expect(toggle?.ops[0]).toMatchObject({ op: 'emphasize', mode: 'toggle' });
    });

    it('keeps basic clicks local and lets group clicks propagate to the series', () => {
        const target = {
            visual: { kind: 'mark' as const, role: 'bar' },
            elements: [{ key: { key: 'west-consumer' }, records: [{ Segment: 'Consumer' }] }],
        };
        const context = {
            chartType: 'Grouped Bar Chart',
            selected: [],
            seriesField: 'Segment',
            available: [
                { key: { key: 'west-consumer' }, records: [{ Segment: 'Consumer' }] },
                { key: { key: 'east-consumer' }, records: [{ Segment: 'Consumer' }] },
                { key: { key: 'west-corporate' }, records: [{ Segment: 'Corporate' }] },
            ],
        };

        expect(semanticUpdate(clickHighlight(), target, context)?.ops[0]).toMatchObject({
            elements: [{ key: { key: 'west-consumer' } }],
        });
        expect(semanticUpdate(clickGroupHighlight(), target, context)?.ops[0]).toMatchObject({
            elements: [
                { key: { key: 'west-consumer' } },
                { key: { key: 'east-consumer' } },
            ],
        });
    });

    it('expands a Ranged Dot Plot unit to its complete interval in element mode', () => {
        const interaction = clickHighlight();
        const target = {
            visual: { kind: 'mark' as const, role: 'mark' },
            elements: [{ key: { key: 'us-male' }, records: [{ Country: 'United States', Sex: 'Male' }] }],
        };
        const context = {
            chartType: 'Ranged Dot Plot',
            selected: [],
            categoryField: 'Country',
            seriesField: 'Sex',
            available: [
                ...target.elements,
                { key: { key: 'us-female' }, records: [{ Country: 'United States', Sex: 'Female' }] },
                { key: { key: 'us-connector' }, records: [{ Country: 'United States' }] },
                { key: { key: 'japan-male' }, records: [{ Country: 'Japan', Sex: 'Male' }] },
            ],
        };

        expect(interaction.actOn?.(target, context)?.elements).toEqual(context.available.slice(0, 3));
        expect(semanticUpdate(interaction, target, context)?.ops[0]).toMatchObject({
            elements: context.available.slice(0, 3),
        });
    });

    it('uses implicit rendered color for Waterfall grouping', () => {
        const interaction = clickGroupHighlight();
        const target = {
            visual: { kind: 'mark' as const, role: 'bar' },
            elements: [{ key: { key: 'asia' }, records: [{ Type: 'delta', __wf_color: 'increase' }] }],
        };
        const context = {
            chartType: 'Waterfall Chart',
            selected: [],
            seriesField: 'Type',
            available: [
                ...target.elements,
                { key: { key: 'africa' }, records: [{ Type: 'delta', __wf_color: 'increase' }] },
                { key: { key: 'oceania' }, records: [{ Type: 'delta', __wf_color: 'decrease' }] },
            ],
        };

        expect(semanticUpdate(interaction, target, context)?.ops[0]).toMatchObject({
            elements: [
                { key: { key: 'asia' } },
                { key: { key: 'africa' } },
            ],
        });
    });

    it('does not infer Waterfall grouping from a field name on another chart', () => {
        const interaction = clickGroupHighlight();
        const target = {
            visual: { kind: 'mark' as const, role: 'bar' },
            elements: [{
                key: { key: 'west-consumer' },
                records: [{ Segment: 'Consumer', __wf_color: 'increase' }],
            }],
        };
        const context = {
            chartType: 'Grouped Bar Chart',
            selected: [],
            seriesField: 'Segment',
            available: [
                ...target.elements,
                { key: { key: 'east-consumer' }, records: [{ Segment: 'Consumer', __wf_color: 'decrease' }] },
                { key: { key: 'west-corporate' }, records: [{ Segment: 'Corporate', __wf_color: 'increase' }] },
            ],
        };

        expect(semanticUpdate(interaction, target, context)?.ops[0]).toMatchObject({
            elements: [
                { key: { key: 'west-consumer' } },
                { key: { key: 'east-consumer' } },
            ],
        });
    });

    it('keeps an already-resolved legend cohort in group mode', () => {
        const interaction = clickGroupHighlight();
        const target = {
            visual: { kind: 'mark' as const, role: 'legend-item' },
            elements: [
                { key: { key: 'blue-circle' }, records: [{ Color: 'Blue', Shape: 'Circle' }] },
                { key: { key: 'orange-circle' }, records: [{ Color: 'Orange', Shape: 'Circle' }] },
            ],
        };
        const context = {
            chartType: 'Scatter Plot',
            selected: [],
            seriesField: 'Color',
            available: [
                ...target.elements,
                { key: { key: 'blue-square' }, records: [{ Color: 'Blue', Shape: 'Square' }] },
            ],
        };

        expect(semanticUpdate(interaction, target, context)?.ops[0]).toMatchObject({
            elements: target.elements,
        });
    });

    it('groups Strip Plot points by their categorical jitter lane', () => {
        const interaction = clickGroupHighlight();
        const target = {
            visual: { kind: 'mark' as const, role: 'circle' },
            elements: [{ key: { key: 'control-4.1' }, records: [{ Group: 'Control', Value: 4.1, Color: 'Low' }] }],
        };
        const context = {
            chartType: 'Strip Plot',
            selected: [],
            categoryField: 'Group',
            seriesField: 'Color',
            available: [
                ...target.elements,
                { key: { key: 'control-5.2' }, records: [{ Group: 'Control', Value: 5.2, Color: 'High' }] },
                { key: { key: 'treatment-4.1' }, records: [{ Group: 'Treatment', Value: 4.1, Color: 'Low' }] },
            ],
        };

        expect(semanticUpdate(interaction, target, context)?.ops[0]).toMatchObject({
            elements: [
                { key: { key: 'control-4.1' } },
                { key: { key: 'control-5.2' } },
            ],
        });
    });

    it('allows callers to override how a group is interpreted', () => {
        const interaction = clickGroupHighlight({
            groupBy: (element) => element.records?.[0]?.Region,
        });
        const target = {
            visual: { kind: 'mark' as const, role: 'bar' },
            elements: [{ key: { key: 'west-a' }, records: [{ Region: 'West', Segment: 'A' }] }],
        };
        const context = {
            chartType: 'Grouped Bar Chart',
            selected: [],
            seriesField: 'Segment',
            available: [
                ...target.elements,
                { key: { key: 'west-b' }, records: [{ Region: 'West', Segment: 'B' }] },
                { key: { key: 'east-a' }, records: [{ Region: 'East', Segment: 'A' }] },
            ],
        };

        expect(semanticUpdate(interaction, target, context)?.ops[0]).toMatchObject({
            elements: [
                { key: { key: 'west-a' } },
                { key: { key: 'west-b' } },
            ],
        });
    });

    it('creates element-level annotation content without selecting the mark', () => {
        const interaction = clickAnnotate();
        const target = {
            visual: { kind: 'mark' as const, role: 'circle' },
            elements: [{
                key: { key: 'setosa-1.4' },
                records: [{ Species: 'Setosa', Length: 1.4, __jitter: -2.1 }],
            }],
        };
        const context = { chartType: 'Strip Plot', selected: [] };

        expect(semanticUpdate(interaction, target, context)).toEqual({
            ops: [
                { op: 'annotate', element: target.elements[0], text: '1.4', point: undefined },
                { op: 'emphasize', elements: target.elements, mode: 'replace', dimOpacity: 0.25 },
            ],
        });
        expect(semanticUpdate(interaction, null, context)).toEqual({
            ops: [{ op: 'clear-annotation' }, { op: 'reset' }],
        });
    });

    it('lets the chart turn annotation intent into a render plan', () => {
        const element = {
            key: { key: 'setosa-1.4' },
            records: [{ Species: 'Setosa', Length: 1.4, __jitter: -2.1 }],
        };
        const presentUpdate = presentInteractionUpdate(() => ({
            anchor: 'center',
            placement: 'above',
        }));

        expect(presentUpdate(
            { ops: [{ op: 'annotate', element, text: '1.4' }] },
            { chartType: 'Strip Plot', selected: [] },
        )).toEqual({
            ops: [{
                op: 'render-annotation',
                element,
                point: undefined,
                annotation: {
                    text: '1.4',
                    placement: 'above',
                    anchor: 'center',
                },
            }],
        });
    });
});