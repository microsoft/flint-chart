import type { CategoryViewport, ChartAssemblyInput } from '../core/types';
import type { ExternalInteractionEvent, InteractionDef } from './interactions';
import type { ChartUpdateRequest, ChartUpdateResult } from './updates/request';

export type ViewportChannel = 'x' | 'y';
export type ViewportState = Partial<Record<ViewportChannel, number>>;

export interface ViewportGeometry {
    offset: number;
    extent: number;
}

export interface InteractiveRenderer {
    viewports: CategoryViewport[];
    setViewports(starts: ViewportState): void | Promise<void>;
    getViewportGeometry?(channel: ViewportChannel): ViewportGeometry | undefined;
    resize?(size: { width: number; height: number }): void | Promise<void>;
    dispatchInteraction?(event: ExternalInteractionEvent): void | Promise<void>;
    applyUpdate?(update: ChartUpdateRequest): Promise<ChartUpdateResult>;
    clearUpdate?(updateId: string): Promise<void>;
    destroy(): void;
}

export interface InteractiveRendererAdapter {
    mount(container: HTMLElement, input: ChartAssemblyInput): Promise<InteractiveRenderer>;
}

export interface InteractiveChartSurfaceOptions {
    className?: string;
    ariaLabel?: string;
    chartId?: string;
}

export type InteractiveBackend = 'vegalite' | 'echarts' | 'chartjs' | 'plotly';

export interface BuildInteractiveChartOptions extends InteractiveChartSurfaceOptions {
    backend: InteractiveBackend;
    renderer?: 'canvas' | 'svg';
    /** Semantic interactions to enable. Omit for viewport controls only. */
    interactions?: readonly InteractionDef[];
    /** @deprecated Use `interactions: [clickHighlight()]`. */
    focusOnClick?: boolean;
    expressionInterpreter?: unknown;
    background?: string;
}

export interface InteractiveChartSurface {
    readonly element: HTMLElement;
    readonly chartId: string;
    readonly ready: Promise<void>;
    getViewportState(): ViewportState;
    setViewport(channel: ViewportChannel, start: number): void;
    dispatch(event: ExternalInteractionEvent): void;
    applyUpdate(update: ChartUpdateRequest): Promise<ChartUpdateResult>;
    clearUpdate(updateId: string): Promise<void>;
    destroy(): void;
}