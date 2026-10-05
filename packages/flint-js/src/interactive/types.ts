import type { CategoryViewport, ChartAssemblyInput, ChartWarning } from '../core/types';
import type { ChartState, InteractionContext, InteractionDef, SemanticTarget } from './interactions';
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
}

export type ChartChangePhase = 'preview' | 'commit' | 'cancel';

/** One change to what the chart shows, reported after the render with the state it produced. */
export interface ChartChange {
    /** `preview` while a gesture runs, `commit` for a committed change, `cancel` when a gesture ends with none. */
    phase: ChartChangePhase;
    /** The interaction behind the change; absent for a host call or a reset. */
    interactionId?: string;
    action?: CanvasInteractionAction;
    /** The gesture's own hit: the hovered point, or the marks at an inspected index. */
    target?: SemanticTarget | null;
    /** The gesture's geometry: a brushed range, an index value, or the viewport after a move. */
    geometry?: CanvasInteractionEvent['geometry'];
    state: ChartState;
}

export interface InteractiveRenderer {
    viewports: CategoryViewport[];
    /** Admission warnings from the mount: spec interactions the chart could not honour. */
    readonly warnings?: readonly ChartWarning[];
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
    refresh(): void;
    destroy(): void;
}