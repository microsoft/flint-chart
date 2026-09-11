import { INTERACTION_PRESET_TYPES, type InteractionPresetType } from '../../core/interaction-spec';
import {
    axisHighlight,
    brushAngle,
    brushX,
    brushY,
    brushZoom,
    clickAnnotate,
    clickGroupFocus,
    clickHighlight,
    contextActivate,
    doubleActivate,
    dragReorder,
    hoverGroupFocus,
    inspect,
    inspectIndex,
    lassoSelect,
    legendToggle,
    linkedBrush,
    longPress,
    navigate,
    select,
    type CanvasInteractionDef,
} from '../interactions';
import type { InteractionPresetOptions } from './types';

/** What a chart must expose for a preset to work; admission checks it against the compiled chart. */
export type InteractionCapability =
    | 'element-semantics'
    | 'cartesian-region'
    | 'angular-region'
    | 'navigation'
    | 'reorder'
    | 'legend'
    | 'discrete-axis';

/** The gesture a preset captures; `drag` presets conflict with `navigate` when pan is on. */
export type InteractionGestureFamily =
    | 'click'
    | 'hover'
    | 'drag'
    | 'navigate'
    | 'inspect'
    | 'context'
    | 'long-press'
    | 'double';

export interface InteractionPresetDefinition<T extends InteractionPresetType = InteractionPresetType> {
    readonly type: T;
    readonly label: string;
    readonly description: string;
    readonly requires: InteractionCapability;
    readonly gesture: InteractionGestureFamily;
    /** Options the factory needs but cannot default; the resolver reports a missing one by name. */
    readonly requiredOptions?: readonly (keyof InteractionPresetOptions[T] & string)[];
    create(options: InteractionPresetOptions[T]): CanvasInteractionDef;
}

/**
 * The registry behind `interaction_spec.presets`: one entry per preset type,
 * mapping the JSON name to the factory that code calls today. The mapped type
 * makes a missing or extra name a compile error.
 */
export const INTERACTION_PRESETS: { readonly [T in InteractionPresetType]: InteractionPresetDefinition<T> } = {
    'click-highlight': {
        type: 'click-highlight',
        label: 'Click highlight',
        description: 'Click a mark, legend item, or discrete axis label to emphasise it and mute the rest.',
        requires: 'element-semantics',
        gesture: 'click',
        create: clickHighlight,
    },
    'axis-highlight': {
        type: 'axis-highlight',
        label: 'Axis highlight',
        description: 'Hover or click a discrete axis label to emphasise its category.',
        requires: 'discrete-axis',
        gesture: 'click',
        create: axisHighlight,
    },
    'click-group-focus': {
        type: 'click-group-focus',
        label: 'Click group focus',
        description: 'Click a mark to emphasise every mark that shares its group.',
        requires: 'element-semantics',
        gesture: 'click',
        create: clickGroupFocus,
    },
    'hover-group-focus': {
        type: 'hover-group-focus',
        label: 'Hover group focus',
        description: 'Hover a mark to preview its group; leaving the mark restores the chart.',
        requires: 'element-semantics',
        gesture: 'hover',
        requiredOptions: ['groupBy'],
        create: hoverGroupFocus,
    },
    'click-annotate': {
        type: 'click-annotate',
        label: 'Click annotate',
        description: 'Click a mark to pin an annotation on it.',
        requires: 'element-semantics',
        gesture: 'click',
        create: clickAnnotate,
    },
    'select': {
        type: 'select',
        label: 'Rectangle select',
        description: 'Drag a rectangle to emphasise the marks inside it.',
        requires: 'cartesian-region',
        gesture: 'drag',
        create: select,
    },
    'lasso-select': {
        type: 'lasso-select',
        label: 'Lasso select',
        description: 'Draw a freehand region to emphasise the marks inside it.',
        requires: 'cartesian-region',
        gesture: 'drag',
        create: lassoSelect,
    },
    'brush-x': {
        type: 'brush-x',
        label: 'Brush x',
        description: 'Drag an interval along x; a stateful brush stays editable after the drag.',
        requires: 'cartesian-region',
        gesture: 'drag',
        create: brushX,
    },
    'brush-y': {
        type: 'brush-y',
        label: 'Brush y',
        description: 'Drag an interval along y; a stateful brush stays editable after the drag.',
        requires: 'cartesian-region',
        gesture: 'drag',
        create: brushY,
    },
    'brush-angle': {
        type: 'brush-angle',
        label: 'Brush angle',
        description: 'Drag an angular sector on a polar chart such as a pie, donut, rose, or radar.',
        requires: 'angular-region',
        gesture: 'drag',
        create: brushAngle,
    },
    'brush-zoom': {
        type: 'brush-zoom',
        label: 'Brush zoom',
        description: 'Drag a rectangle to zoom the viewport to it.',
        requires: 'navigation',
        gesture: 'drag',
        create: brushZoom,
    },
    'linked-brush': {
        type: 'linked-brush',
        label: 'Linked brush',
        description: 'Brush marks and emphasise every mark that shares their group, across views.',
        requires: 'element-semantics',
        gesture: 'drag',
        requiredOptions: ['groupBy'],
        create: linkedBrush,
    },
    'legend-toggle': {
        type: 'legend-toggle',
        label: 'Legend toggle',
        description: 'Click a legend item to hide or restore its series.',
        requires: 'legend',
        gesture: 'click',
        create: legendToggle,
    },
    'context-activate': {
        type: 'context-activate',
        label: 'Context activate',
        description: 'Right-click a mark; emits the event for the host and applies no built-in update.',
        requires: 'element-semantics',
        gesture: 'context',
        create: contextActivate,
    },
    'long-press': {
        type: 'long-press',
        label: 'Long press',
        description: 'Hold on a mark to emphasise it; the touch equivalent of a context request.',
        requires: 'element-semantics',
        gesture: 'long-press',
        create: longPress,
    },
    'double-activate': {
        type: 'double-activate',
        label: 'Double activate',
        description: 'Double-click a mark to emphasise it.',
        requires: 'element-semantics',
        gesture: 'double',
        create: doubleActivate,
    },
    'inspect': {
        type: 'inspect',
        label: 'Inspect',
        description: 'Move the pointer to read values with x, y, or xy guides.',
        requires: 'element-semantics',
        gesture: 'inspect',
        create: inspect,
    },
    'inspect-index': {
        type: 'inspect-index',
        label: 'Inspect index',
        description: 'Move along one axis to read every series at that position.',
        requires: 'element-semantics',
        gesture: 'inspect',
        create: inspectIndex,
    },
    'navigate': {
        type: 'navigate',
        label: 'Navigate',
        description: 'Drag to pan, wheel or pinch to zoom, and a reset gesture to return to the full frame.',
        requires: 'navigation',
        gesture: 'navigate',
        create: navigate,
    },
    'drag-reorder': {
        type: 'drag-reorder',
        label: 'Drag reorder',
        description: 'Drag a mark or an axis label to reorder the categories.',
        requires: 'reorder',
        gesture: 'drag',
        create: dragReorder,
    },
};

/** A registry entry without its factory: what a catalogue or an agent needs to choose. */
export interface InteractionPresetSummary {
    readonly type: InteractionPresetType;
    readonly label: string;
    readonly description: string;
    readonly requires: InteractionCapability;
    readonly gesture: InteractionGestureFamily;
    readonly requiredOptions?: readonly string[];
}

export function listInteractionPresets(): readonly InteractionPresetSummary[] {
    return INTERACTION_PRESET_TYPES.map((type) => {
        const definition = INTERACTION_PRESETS[type] as InteractionPresetDefinition;
        return {
            type,
            label: definition.label,
            description: definition.description,
            requires: definition.requires,
            gesture: definition.gesture,
            ...(definition.requiredOptions ? { requiredOptions: definition.requiredOptions } : {}),
        };
    });
}
