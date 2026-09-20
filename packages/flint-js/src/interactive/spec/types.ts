import type { InteractionPresetType } from '../../core/interaction-spec';
import type {
    AngularBrushOptions,
    AxisHighlightOptions,
    BrushOptions,
    BrushZoomOptions,
    ClickAnnotateOptions,
    ClickGroupFocusOptions,
    ClickHighlightOptions,
    ContextActivateOptions,
    DoubleActivateOptions,
    DragReorderOptions,
    HoverGroupFocusOptions,
    InspectIndexOptions,
    InspectOptions,
    LassoSelectOptions,
    LegendToggleOptions,
    LinkedBrushOptions,
    LongPressOptions,
    NavigateOptions,
    SelectOptions,
} from '../interactions';

/**
 * The options each preset type accepts in a spec. They are the factory option
 * types, so the JSON shape and the code shape cannot drift apart. The one
 * difference: `click-annotate` loses `format`, which is a function.
 */
export interface InteractionPresetOptions {
    'click-highlight': ClickHighlightOptions;
    'axis-highlight': AxisHighlightOptions;
    'click-group-focus': ClickGroupFocusOptions;
    'hover-group-focus': HoverGroupFocusOptions;
    'click-annotate': Omit<ClickAnnotateOptions, 'format'>;
    'select': SelectOptions;
    'lasso-select': LassoSelectOptions;
    'brush-x': BrushOptions;
    'brush-y': BrushOptions;
    'brush-angle': AngularBrushOptions;
    'brush-zoom': BrushZoomOptions;
    'linked-brush': LinkedBrushOptions;
    'legend-toggle': LegendToggleOptions;
    'context-activate': ContextActivateOptions;
    'long-press': LongPressOptions;
    'double-activate': DoubleActivateOptions;
    'inspect': InspectOptions;
    'inspect-index': InspectIndexOptions;
    'navigate': NavigateOptions;
    'drag-reorder': DragReorderOptions;
}

/**
 * A preset entry with its precise options, for TypeScript authors of a spec:
 * the name, an optional id, and the factory options under `options`. The id
 * lives on the entry, so it is removed from the nested options.
 */
export type InteractionPresetSpec = {
    [T in InteractionPresetType]: {
        type: T;
        id?: string;
        options?: Omit<InteractionPresetOptions[T], 'id'>;
    };
}[InteractionPresetType];
