import { describe, expect, it } from 'vitest';
import {
    INTERACTION_PRESET_TYPES,
    declaredInteractionCapabilities,
    supportedInteractionPresets,
} from '../src/core/interaction-spec';
import { vlAllTemplateDefs } from '../src/vegalite/templates';

const def = (chart: string) => vlAllTemplateDefs.find((candidate) => candidate.chart === chart)!;

describe('declaredInteractionCapabilities', () => {
    it('reads the template block key by key and names nothing for an absent block', () => {
        expect(declaredInteractionCapabilities(undefined)).toEqual([]);
        expect(declaredInteractionCapabilities(def('KPI Card').interactionSupport)).toEqual(['elements']);
        expect(declaredInteractionCapabilities(def('Pie Chart').interactionSupport))
            .toEqual(['elements', 'cartesian-region', 'angular-region', 'legend']);
        expect(declaredInteractionCapabilities(def('Bar Chart').interactionSupport))
            .toEqual(['elements', 'cartesian-region', 'navigation', 'reorder', 'legend', 'discrete-axis']);
    });
});

describe('supportedInteractionPresets', () => {
    it('lists the presets whose requirements sit inside the declaration', () => {
        expect(supportedInteractionPresets(def('KPI Card').interactionSupport)).toEqual([
            'click-highlight', 'click-group-focus', 'hover-group-focus', 'click-annotate',
            'context-activate', 'long-press', 'double-activate', 'inspect',
        ]);
        const pie = supportedInteractionPresets(def('Pie Chart').interactionSupport);
        expect(pie).toContain('brush-angle');
        expect(pie).toContain('brush-x');
        expect(pie).toContain('legend-toggle');
        expect(pie).not.toContain('navigate');
        expect(pie).not.toContain('axis-highlight');
        expect(pie).not.toContain('drag-reorder');
        const bar = supportedInteractionPresets(def('Bar Chart').interactionSupport);
        expect(bar).not.toContain('brush-angle');
        expect(bar).not.toContain('inspect-index');
        expect(bar).toContain('drag-reorder');
        expect(supportedInteractionPresets(undefined)).toEqual([]);
    });

    it('every preset is supported by at least one chart type, and every chart type supports at least one preset', () => {
        const union = new Set(vlAllTemplateDefs.flatMap((template) => supportedInteractionPresets(template.interactionSupport)));
        expect([...INTERACTION_PRESET_TYPES].filter((type) => !union.has(type))).toEqual([]);
        const empty = vlAllTemplateDefs.filter((template) => supportedInteractionPresets(template.interactionSupport).length === 0);
        expect(empty.map((template) => template.chart)).toEqual([]);
    });
});
