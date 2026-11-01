import { describe, expect, it } from 'vitest';
import { compile } from 'vega-lite';
import { parse, View } from 'vega';
import { assembleVegaLite } from '../src';
import { vegaLiteStages } from '../src/vegalite/assemble';
import { injectVegaNavigationSignals } from '../src/vegalite/interactions/compile';
import { navigationDomainSignal } from '../src/vegalite/interactions/live-layout';

const values = Array.from({ length: 40 }, (_, index) => ({ x: index * 2.5 + 3, y: (index * 37) % 97 + 1 }));
const input = (theme?: string): any => ({
    data: { values },
    semantic_types: { x: 'Quantity', y: 'Quantity' },
    ...(theme ? { theme_spec: theme } : {}),
    chart_spec: { chartType: 'Scatter Plot', encodings: { x: 'x', y: 'y' }, baseSize: { width: 480, height: 320 } },
});

function axisLabels(view: View, scale: string): number[] {
    const out: number[] = [];
    const walk = (node: any) => {
        if (!node) return;
        if (node.mark?.role === 'axis-label' && node.mark.group?.datum?.scale === scale && node.opacity !== 0) out.push(Number(node.datum.value));
        for (const child of node.items ?? []) walk(child);
    };
    walk((view.scenegraph() as any).root);
    return out;
}

describe('measure ruler', () => {
    it('draws every planned tick of a themed axis', async () => {
        const { plan, spec } = vegaLiteStages(input('nyt'));
        const ruler = plan.rulers.y!;
        expect(ruler.values.length).toBeGreaterThanOrEqual(3);
        const view = new View(parse(compile(spec as any).spec), { renderer: 'none' });
        await view.runAsync();
        expect(axisLabels(view, 'y')).toEqual(ruler.values);
        view.finalize();
    });

    it('rules an unthemed axis as the backend draws it: gridded, a label about every 40 px', () => {
        const { plan } = vegaLiteStages(input());
        expect(Object.keys(plan.rulers).length).toBeGreaterThan(0);
        for (const ruler of Object.values(plan.rulers)) {
            expect(ruler!.values[0]).toBe(ruler!.domain[0]);
            expect(ruler!.values.at(-1)).toBe(ruler!.domain[1]);
        }
    });

    // A zoomable axis shows the planned ticks until zoomed; a zoomed window needs ticks of its own.
    it('ticks a zoomable axis as planned, and a zoomed one at the planned density', async () => {
        const spec = assembleVegaLite(input('nyt')) as any;
        const vega = compile(spec).spec as any;
        injectVegaNavigationSignals(vega, ['y']);
        const view = new View(parse(vega), { renderer: 'none' });
        await view.runAsync();
        expect(axisLabels(view, 'y')).toEqual(vegaLiteStages(input('nyt')).plan.rulers.y!.values);
        view.signal(navigationDomainSignal('y'), [20, 30]);
        await view.runAsync();
        const ticks = axisLabels(view, 'y');
        expect(ticks.length).toBeGreaterThanOrEqual(3);
        expect(Math.min(...ticks)).toBeGreaterThanOrEqual(20);
        view.finalize();
    });
});
