import type { CategoryViewport, ChartAssemblyInput } from '../core/types';

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
    destroy(): void;
}

export interface InteractiveRendererAdapter {
    mount(container: HTMLElement, input: ChartAssemblyInput): Promise<InteractiveRenderer>;
}

export interface InteractiveChartSurfaceOptions {
    className?: string;
    ariaLabel?: string;
}

export type InteractiveBackend = 'vegalite' | 'echarts' | 'chartjs' | 'plotly';

export interface BuildInteractiveChartOptions extends InteractiveChartSurfaceOptions {
    backend: InteractiveBackend;
    renderer?: 'canvas' | 'svg';
    /** Enable local click focus where supported. Defaults to true for Vega-Lite. */
    focusOnClick?: boolean;
    expressionInterpreter?: unknown;
    background?: string;
}

export interface InteractiveChartSurface {
    readonly element: HTMLElement;
    readonly ready: Promise<void>;
    getViewportState(): ViewportState;
    setViewport(channel: ViewportChannel, start: number): void;
    destroy(): void;
}