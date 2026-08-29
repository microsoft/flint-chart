import type { CategoryViewport, ChartAssemblyInput } from '../core/types';
import type { InteractionContext, InteractionDef } from './interactions';
import type { ChartUpdate, ChartUpdateResult } from './language/updates';

export type ViewportChannel = 'x' | 'y';
export type ViewportState = Partial<Record<ViewportChannel, number>>;

export interface ViewportGeometry {
    offset: number;
    extent: number;
}

export type ChartUpdateComposition = 'auto';

export interface ChartUpdateApplyOptions {
    composition?: ChartUpdateComposition;
}

export interface InteractiveRenderer {
    viewports: CategoryViewport[];
    setViewports(starts: ViewportState): void | Promise<void>;
    getViewportGeometry?(channel: ViewportChannel): ViewportGeometry | undefined;
    getInteractionContext?(): InteractionContext;
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
    getViewportState(): ViewportState;
    setViewport(channel: ViewportChannel, start: number): void;
    dispatch(interactionId: string, payload: unknown): Promise<ChartUpdateResult | null>;
    applyUpdate(update: ChartUpdate, options?: ChartUpdateApplyOptions): Promise<ChartUpdateResult>;
    setUpdates(updates: readonly ChartUpdate[]): Promise<readonly ChartUpdateResult[]>;
    clearUpdate(id: string): Promise<void>;
    refresh(): void;
    destroy(): void;
}