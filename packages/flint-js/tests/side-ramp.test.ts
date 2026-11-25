import { describe, expect, it } from 'vitest';
import { compile } from 'vega-lite';
import { parse, View } from 'vega';
import { vegaLiteStages } from '../src/vegalite/assemble';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PRODUCTS = ['Laptop', 'Phone', 'Tablet', 'Desktop', 'Monitor', 'Keyboard'];
const ROWS = MONTHS.flatMap((Month, m) => PRODUCTS.map((Product, p) => ({ Month, Product, Sales: 100 + ((m * 7 + p * 13) % 9) * 90 })));

describe('a ramp beside a short plot', () => {
    it('runs no longer than the plot is tall, and the key keeps its side', async () => {
        // Twelve months by six products: the plot is twice as wide as it is tall, shorter than a
        // ramp's own 200px, which used to send the key to the bottom.
        const { plan, spec } = vegaLiteStages({
            data: { values: ROWS },
            semantic_types: { Month: 'Month', Product: 'Category', Sales: 'Quantity' },
            chart_spec: { chartType: 'Heatmap', encodings: { x: 'Month', y: 'Product', color: 'Sales' }, canvasSize: { width: 800, height: 800 } },
        } as any);
        const key: any = plan.legend.layout!.keys.find(Boolean);
        expect(key.orient).toBe('right');
        expect(key.height).toBeLessThanOrEqual(plan.plot.height + 1);

        const { _theme, _canvasFit, _legendLayout, ...vl } = spec;
        const view = new View(parse(compile(vl).spec), { renderer: 'none' });
        await view.runAsync();
        let legend: any;
        const walk = (item: any) => { if (!item) return; for (const child of item.items ?? []) walk(child); if (item.marktype === 'group' && item.role === 'legend') legend = item.bounds; };
        walk((view as any).scenegraph().root);
        expect(legend.y2 - legend.y1).toBeLessThanOrEqual(view.height() + 1);
        view.finalize();
    });

    it('labels the shortened ramp at round values, not at its two raw ends', async () => {
        const { spec } = vegaLiteStages({
            data: { values: ROWS.map((row, i) => ({ ...row, Sales: row.Sales + (i % 7) * 13 })) },
            semantic_types: { Month: 'Month', Product: 'Category', Sales: 'Quantity' },
            chart_spec: { chartType: 'Heatmap', encodings: { x: 'Month', y: 'Product', color: 'Sales' }, canvasSize: { width: 800, height: 800 } },
        } as any);
        const { _theme, _canvasFit, _legendLayout, ...vl } = spec;
        expect(vl.encoding.color.legend.gradientLength).toBeLessThan(200);
        const view = new View(parse(compile(vl).spec), { renderer: 'none' });
        await view.runAsync();
        const labels: string[] = [];
        const walk = (item: any) => { if (!item) return; for (const child of item.items ?? []) walk(child); if (item.role === 'legend-label') labels.push(...(item.items ?? []).map((t: any) => t.text)); };
        walk((view as any).scenegraph().root);
        view.finalize();
        expect(labels.length).toBeGreaterThan(2);
        for (const label of labels) expect(Number(String(label).replace(/,/g, '')) % 100).toBe(0);
    });
});
