import type { CategoryViewport, ChartAssemblyInput, ChartWarning } from '../core/types';
import type { ChartState, FlintInteractionEventDetail, InteractionContext, InteractionDef, SemanticTarget } from './interactions';
import type { CanvasInteractionAction, CanvasInteractionEvent } from './language/events';
import type { ChartUpdate, ChartUpdateResult } from './language/updates';
import type { AssistedTargetingOptions } from '../core/interaction-spec';

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
    state: ChartState;
    previous: ChartState;
}

/** What a renderer reports before the state comparison fills in `changed` and `previous`. */
export type ChartChangeReport = Omit<ChartChange, 'changed' | 'previous'>;

export interface InteractiveRenderer {
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

export type InteractiveBackend = 'vegalite' | 'echarts' | 'chartjs' | 'plotly';

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
}

export interface InteractiveChartSurface {
    readonly element: HTMLElement;
    readonly chartId: string;
    readonly ready: Promise<void>;
    /** Every warning about this chart's interactions, once the mount has settled. Never rejects. */
    readonly warnings: Promise<readonly ChartWarning[]>;
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
    destroy(): void;
}