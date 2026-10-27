import type { CategoryViewport, ChartAssemblyInput, ChartWarning } from '../core/types';
import type { ChartState, FlintInteractionEventDetail, InteractionContext, InteractionDef, SemanticTarget } from './interactions';
import type { CanvasInteractionAction, CanvasInteractionEvent } from './language/events';
import type { ChartUpdate, ChartUpdateResult } from './language/updates';
import type { AssistedTargetingOptions } from '../core/interaction-spec';
import type { InteractionResetGesture } from './reset';

export type {
    AssistedTargetingOptions,
    TargetDetailsOptions,
    TargetFeedbackOptions,
} from '../core/interaction-spec';

export type ViewportChannel = 'x' | 'y';
export type ViewportState = Partial<Record<ViewportChannel, number>>;

export interface ViewportGeometry {
    offset: number;
    extent: number;
}

export type ChartUpdateComposition = 'auto';

/** Animates a viewport change over `duration` milliseconds; projected charts honour it. */
export interface ChartUpdateTransition {
    duration: number;
}

export interface ChartUpdateApplyOptions {
    composition?: ChartUpdateComposition;
    transition?: ChartUpdateTransition;
    /** The external interaction behind the update, reported as the change's `interactionId`. */
    interactionId?: string;
    /** Who asked for the update, reported as the change's `source`. Defaults to `host`. */
    source?: ChartChangeSource;
}

export type ChartChangePhase = 'preview' | 'commit' | 'cancel';

/** Who started a change: a reader's gesture on the chart, or the host's code. */
export type ChartChangeSource = 'reader' | 'host';

/** The parts of `ChartState` a change can move. */
export type ChartStateFacet = 'selected' | 'hidden' | 'viewport' | 'windows' | 'categoryOrder' | 'annotations' | 'filters';

/** One change to what the chart shows, reported after the render only when the state differs. */
export interface ChartChange {
    /** `preview` while a gesture runs, `commit` for a committed change, `cancel` when a gesture ends with none. */
    phase: ChartChangePhase;
    /** `host` for `updates`, `applyUpdate`, `clearUpdate` and `dispatch`; always `commit`. */
    source: ChartChangeSource;
    changed: readonly ChartStateFacet[];
    /** The interaction behind the change: a reader's gesture, or an external interaction run by `dispatch`. */
    interactionId?: string;
    action?: CanvasInteractionAction;
    /** The gesture's own hit: the hovered point, or the marks at an inspected index. */
    target?: SemanticTarget | null;
    /** The gesture's geometry: a brushed range, an index value, or the viewport after a move. */
    geometry?: CanvasInteractionEvent['geometry'];
    /**
     * The reset gesture a reader made: a click on nothing, Escape, or a double-click. Reported even
     * when the chart held nothing to reset, so a host that shows a selection of its own can let it go.
     */
    reset?: InteractionResetGesture;
    state: ChartState;
    previous: ChartState;
}

/** What a renderer reports before the state comparison fills in `changed` and `previous`. */
export type ChartChangeReport = Omit<ChartChange, 'changed' | 'previous'>;

/** What the chart's layout plan decided, as far as a host reads it. */
/** A box in pixels from the top left of the drawn chart. */
export interface LayoutBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface ChartLayout {
    /** The plot box in pixels: the data area, inside axes, legend and titles; only on a chart that draws one plot. */
    plot?: { width: number; height: number };
    /**
     * Each view the chart draws, as drawn: a plot, a column of text, a tile or a theme's rule, in
     * draw order (facet panels row by row). Read from the rendered chart, so it follows filters,
     * resizes and zoom.
     */
    views?: Array<{ role: 'plot' | 'text' | 'tile' | 'rule'; box: LayoutBox }>;
    /** The box the views take with their axes and headers, without the title and keys. */
    block?: LayoutBox;
}

export interface InteractiveRenderer {
    /** The layout the chart was drawn with, where the backend plans one. */
    readonly layout?: ChartLayout;
    viewports: CategoryViewport[];
    /** Admission warnings from the mount: spec interactions the chart could not honour. */
    readonly warnings?: readonly ChartWarning[];
    /** The windows over the rows now shown; a renderer that has it lets a filter narrow what the rail scrolls. */
    getViewports?(): CategoryViewport[];
    setViewports(starts: ViewportState): void | Promise<void>;
    getViewportGeometry?(channel: ViewportChannel): ViewportGeometry | undefined;
    getInteractionContext?(): InteractionContext;
    getState?(): ChartState;
    onChange?(listener: (change: ChartChange) => void): () => void;
    resize?(size: { width: number; height: number }): void | Promise<void>;
    /** Lays the chart out again for the room in place; false when the new layout needs a new mount. */
    relayout?(size: { width?: number; height?: number }): Promise<boolean>;
    /** Re-project overlays after the host rescales the chart in a way CSS cannot report. */
    refresh?(): void;
    applyUpdate?(update: ChartUpdate, options?: ChartUpdateApplyOptions): Promise<ChartUpdateResult>;
    setUpdates?(updates: readonly ChartUpdate[]): Promise<readonly ChartUpdateResult[]>;
    clearUpdate?(id: string): Promise<void>;
    destroy(): void;
}

export interface InteractiveRendererAdapter {
    mount(container: HTMLElement, input: ChartAssemblyInput): Promise<InteractiveRenderer>;
}

export interface InteractiveChartSurfaceOptions {
    className?: string;
    ariaLabel?: string;
    chartId?: string;
    updates?: readonly ChartUpdate[];
    interactions?: readonly InteractionDef[];
    /** Presets assist by default; false disables it and maxDistance overrides eligible presets. */
    assistedTargeting?: boolean | AssistedTargetingOptions;
    keyboardTargeting?: boolean;
    /** Warnings known before the mount; the surface reports them with the mount's own. */
    warnings?: readonly ChartWarning[];
}

export type InteractiveBackend = 'vegalite' | 'echarts' | 'chartjs' | 'plotly' | 'highcharts';

export interface BuildInteractiveChartOptions extends InteractiveChartSurfaceOptions {
    backend: InteractiveBackend;
    renderer?: 'canvas' | 'svg';
    expressionInterpreter?: unknown;
    background?: string;
    /**
     * Whether a chart with no interactions and no updates still mounts the update runtime,
     * so `applyUpdate` and `setUpdates` work later. Default `true`. With `false` such a chart
     * renders static and its updates resolve as `unsupported`. Any interaction or update mounts it.
     */
    semanticUpdates?: boolean;
    /**
     * The room the host gives the chart, in pixels. It becomes the spec's `canvasSize`
     * ceiling on the sides given, so the chart lays out for that room.
     */
    availableSize?: { width?: number; height?: number };
}

export interface InteractiveChartSurface {
    readonly element: HTMLElement;
    readonly chartId: string;
    readonly ready: Promise<void>;
    /** The interactions mounted on the chart: those of its `interaction_spec`, then those passed in code. */
    readonly interactions?: readonly InteractionDef[];
    /** Every warning about this chart's interactions, once the mount has settled. Never rejects. */
    readonly warnings: Promise<readonly ChartWarning[]>;
    /**
     * The layout the chart is drawn with now, following filters and resizes. `plot` is the planned
     * plot on a chart that draws one plot at that size; `views` and `block` are read from what the
     * chart drew. Undefined before the mount, on a chart with a category rail, and on backends that
     * do not report one; a static compile reports sizes only, in its plan.
     */
    readonly layout: ChartLayout | undefined;
    getViewportState(): ViewportState;
    setViewport(channel: ViewportChannel, start: number): void;
    dispatch(interactionId: string, payload: unknown): Promise<ChartUpdateResult | null>;
    applyUpdate(update: ChartUpdate, options?: ChartUpdateApplyOptions): Promise<ChartUpdateResult>;
    setUpdates(updates: readonly ChartUpdate[]): Promise<readonly ChartUpdateResult[]>;
    clearUpdate(id: string): Promise<void>;
    /** What the chart shows now, previews included; undefined before the mount or after destroy. */
    getState(): ChartState | undefined;
    /** Hears every change to what the chart shows, after the render; returns the unsubscribe. */
    onChange(callback: (change: ChartChange) => void): () => void;
    /** Hears every gesture event, whether or not it changes the chart; returns the unsubscribe. */
    onInteraction(callback: (detail: FlintInteractionEventDetail) => void): () => void;
    refresh(): void;
    /**
     * Lays the chart out again for the room it is given, keeping what it shows: selections,
     * filters, zoom and updates. Resolves false when the layout for that room is built
     * differently (more or fewer marks, axes or keys) or the backend cannot lay out in place;
     * the host then mounts the chart again with `availableSize`.
     */
    relayout(size: { width?: number; height?: number }): Promise<boolean>;
    destroy(): void;
}