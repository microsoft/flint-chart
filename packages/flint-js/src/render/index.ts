import type { ChartAssemblyInput } from '../core/types';
import { assembleECharts } from '../echarts/assemble';
import { assembleVegaLite } from '../vegalite/assemble';
import { injectCanvasFurnitureSVG, readCanvasFurniture } from '../vegalite/canvas-furniture';

export type RenderSvgBackend = 'vegalite' | 'echarts';

export interface RenderSvgOptions {
    /** Default `'vegalite'`. Chart.js and Plotly draw through a DOM canvas and have no SVG string path. */
    backend?: RenderSvgBackend;
    background?: string;
    /** A Vega expression interpreter, such as `vega-interpreter`'s, for hosts whose CSP forbids eval. */
    expressionInterpreter?: unknown;
}

const DEFAULT_SIZE = { width: 400, height: 320 };

/** A static SVG of the chart, without a DOM: for export, images and server rendering. */
export async function renderSvg(input: ChartAssemblyInput, options: RenderSvgOptions = {}): Promise<string> {
    const backend = options.backend ?? 'vegalite';
    if (backend === 'echarts') {
        const option = assembleECharts(input) as any;
        const echarts: any = await import('echarts');
        const chart = echarts.init(null, null, {
            renderer: 'svg',
            ssr: true,
            width: option._width ?? input.chart_spec.baseSize?.width ?? DEFAULT_SIZE.width,
            height: option._height ?? input.chart_spec.baseSize?.height ?? DEFAULT_SIZE.height,
        });
        try {
            chart.setOption({
                ...option,
                animation: false,
                ...(options.background ? { backgroundColor: options.background } : {}),
            });
            return chart.renderToSVGString();
        } finally {
            chart.dispose();
        }
    }
    if (backend !== 'vegalite') throw new Error(`renderSvg does not support backend "${backend as string}".`);
    const vlSpec = assembleVegaLite(input);
    const [{ compile }, vega] = await Promise.all([import('vega-lite'), import('vega')]);
    const interpreter = options.expressionInterpreter;
    const runtime = vega.parse(
        compile(vlSpec).spec as any,
        (options.background ? { background: options.background } : {}) as any,
        (interpreter ? { ast: true } : undefined) as any,
    );
    const view = new vega.View(runtime, { renderer: 'none', ...(interpreter ? { expr: interpreter } : {}) } as any);
    view.logLevel(vega.Error);
    try {
        await view.runAsync();
        return injectCanvasFurnitureSVG(await view.toSVG(), readCanvasFurniture(vlSpec));
    } finally {
        view.finalize();
    }
}
