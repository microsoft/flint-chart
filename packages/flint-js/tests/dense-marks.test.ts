import { describe, expect, it } from 'vitest';
import { assembleVegaLite } from '../src';

/** Each region's countries, every year: the many-series line chart a dashboard draws. */
function lineRows(series: number): Record<string, unknown>[] {
    const rows: Record<string, unknown>[] = [];
    for (let s = 0; s < series; s++) {
        for (let year = 2000; year <= 2010; year++) rows.push({ country: `c${s}`, region: `r${s % 5}`, year, value: 20 + ((s * 7 + year) % 60) });
    }
    return rows;
}

function lineChart(series: number, theme?: string): any {
    return assembleVegaLite({
        data: { values: lineRows(series) },
        semantic_types: { country: 'Country', region: 'Category', year: 'Year', value: 'Quantity' },
        chart_spec: { chartType: 'Line Chart', encodings: { x: 'year', y: 'value', color: 'region', detail: 'country' }, canvasSize: { width: 500, height: 320 } },
        ...(theme ? { theme_spec: theme } : {}),
    } as any);
}

const lineWidthOf = (spec: any) => spec.config?.line?.strokeWidth;

describe('lines thin as their number grows', () => {
    it('keeps a handful of series at the weight they were given', () => {
        expect(lineWidthOf(lineChart(6))).toBeUndefined();
        expect(lineWidthOf(lineChart(6, 'economist'))).toBe(1.6);
    });

    it('thins many series, with or without a theme, to no less than 0.75 px', () => {
        const plain = lineWidthOf(lineChart(160));
        const economist = lineWidthOf(lineChart(160, 'economist'));
        expect(plain).toBe(0.75);
        expect(economist).toBe(0.75);
    });

    it('thins in between in proportion', () => {
        const width = lineWidthOf(lineChart(40));
        expect(width).toBeGreaterThan(0.75);
        expect(width).toBeLessThan(2);
    });

    it('says why in the report', () => {
        const spec = lineChart(160, 'economist');
        expect((spec._theme?.report ?? []).some((entry: any) => entry.code === 'lines-thinned')).toBe(true);
    });
});

/** Dots strung along the diagonal: few enough not to ink 12% of the plot, crowded enough to touch. */
function diagonal(count: number): Record<string, unknown>[] {
    return Array.from({ length: count }, (_, i) => ({ id: `p${i}`, x: 40 + (i % 60) + (i * 0.37) % 1, y: 40 + (i % 60) + ((i * 0.61) % 1) * 2 }));
}

function scatter(rows: Record<string, unknown>[], theme: unknown): any {
    return assembleVegaLite({
        data: { values: rows },
        semantic_types: { id: 'Category', x: 'Quantity', y: 'Quantity' },
        chart_spec: { chartType: 'Scatter Plot', encodings: { x: 'x', y: 'y', detail: 'id' }, canvasSize: { width: 460, height: 360 } },
        ...(theme ? { theme_spec: theme } : {}),
    } as any);
}

describe('dot size answers how full the plot is; crowding is noted, not shrunk', () => {
    it('keeps the house size on dots crowded along a diagonal, and notes the crowding', () => {
        const spec = scatter(diagonal(160), 'economist');
        expect(spec.config.circle.size).toBe(66);
        const note = (spec._warnings ?? []).find((warning: any) => warning.code === 'dots-crowded');
        expect(note?.severity).toBe('info');
        expect(note?.message).toContain('chartProperties.opacity');
    });

    it('notes crowding on a chart with no theme, at Vega-Lite\'s own dot size', () => {
        const spec = scatter(diagonal(160), undefined);
        expect((spec._warnings ?? []).some((warning: any) => warning.code === 'dots-crowded' && warning.message.includes('30px²'))).toBe(true);
    });

    it('says nothing once the chart sets its own opacity', () => {
        const spec = assembleVegaLite({
            data: { values: diagonal(160) },
            semantic_types: { id: 'Category', x: 'Quantity', y: 'Quantity' },
            chart_spec: { chartType: 'Scatter Plot', encodings: { x: 'x', y: 'y', detail: 'id' }, chartProperties: { opacity: 0.5 } },
            theme_spec: 'economist',
        } as any) as any;
        expect((spec._warnings ?? []).some((warning: any) => warning.code === 'dots-crowded')).toBe(false);
    });

    it('shrinks a full plot no further than half the house dot, and never below 30 px²', () => {
        const cloud = Array.from({ length: 1500 }, (_, i) => ({ id: `p${i}`, x: (i * 37) % 997, y: (i * 53) % 991 }));
        expect(scatter(cloud, 'economist').config.circle.size).toBe(33);
        expect(scatter(cloud, 'apple').config.circle?.size ?? 30).toBeGreaterThanOrEqual(30);
    });

    it('keeps the house size on a sparse spread', () => {
        const spread = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, x: (i * 37) % 100, y: (i * 53) % 100 }));
        expect(scatter(spread, 'economist').config.circle.size).toBe(66);
        expect((scatter(spread, 'economist')._warnings ?? []).some((warning: any) => warning.code === 'dots-crowded')).toBe(false);
    });
});

describe('a declared halo rings a scatter\'s dots', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, x: (i * 37) % 100, y: (i * 53) % 100 }));
    const withHalo = (point: Record<string, unknown>) => ({ extends: 'economist', geometry: { point: { size: 40, ...point } } });

    it('draws no ring where the house declares none', () => {
        expect(scatter(rows, 'economist').config.circle?.stroke).toBeUndefined();
    });

    it('rings dots in the plot colour, thinner than the house width on small dots, on solid dots', () => {
        const spec = scatter(rows, withHalo({ halo: { presence: 'full', width: 1.5 } }));
        expect(spec.config.circle.stroke).toBeTruthy();
        expect(spec.config.circle.strokeWidth).toBeGreaterThanOrEqual(0.5);
        expect(spec.config.circle.strokeWidth).toBeLessThan(1.5);
        // Vega-Lite would draw the dots at 0.7; a ringed dot is solid.
        expect(spec.config.circle.opacity).toBe(1);
        expect(spec.config.circle.fillOpacity).toBeUndefined();
    });

    it('drops the ring where the house fades its dots: the two answers to overlap cancel', () => {
        const spec = scatter(rows, withHalo({ halo: { presence: 'full' }, opacity: 0.5 }));
        expect(spec.config.circle.stroke).toBeUndefined();
        expect(spec.config.circle.opacity).toBe(0.5);
        expect((spec._theme?.report ?? []).some((entry: any) => entry.code === 'halo-yields-to-opacity')).toBe(true);
    });

    it('drops the ring on a chart that sets its own opacity', () => {
        const spec = assembleVegaLite({
            data: { values: rows },
            semantic_types: { id: 'Category', x: 'Quantity', y: 'Quantity' },
            chart_spec: { chartType: 'Scatter Plot', encodings: { x: 'x', y: 'y', detail: 'id' }, chartProperties: { opacity: 0.5 } },
            theme_spec: withHalo({ halo: { presence: 'full' } }),
        } as any) as any;
        const marks: any[] = [];
        const walk = (node: any) => {
            if (!node || typeof node !== 'object') return;
            if (node.mark) marks.push(node.mark);
            Object.values(node).forEach(walk);
        };
        walk(spec);
        const dot = marks.find((mark) => typeof mark === 'object' && mark.opacity === 0.5);
        expect(dot?.strokeWidth).toBe(0);
    });

    it('leaves hollow dots alone, since a ring in the page colour would erase them', () => {
        const spec = scatter(rows, withHalo({ halo: { presence: 'full' }, fill: 'hollow' }));
        expect(spec.config.circle?.stroke).toBeUndefined();
    });
});

describe('a ring follows its dot\'s size', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, x: (i * 37) % 100, y: (i * 53) % 100 }));
    const withHalo = (size: number) => ({ extends: 'economist', geometry: { point: { size, halo: { presence: 'full', width: 2 } } } });

    it('rings a dot at a quarter of its radius, up to the house width', () => {
        // 40 px² is 3.57 px across the radius; a quarter of it is 0.89 px.
        expect(scatter(rows, withHalo(40)).config.circle.strokeWidth).toBe(0.89);
        expect(scatter(rows, withHalo(400)).config.circle.strokeWidth).toBe(2);
    });

    it('drops the ring on dots under about 6 px across, and keeps them solid', () => {
        const spec = scatter(rows, withHalo(20));
        expect(spec.config.circle.stroke).toBeUndefined();
        expect(spec.config.circle.opacity).toBe(1);
        expect((spec._theme?.report ?? []).some((entry: any) => entry.code === 'halo-dropped-small-dots')).toBe(true);
    });

    it('rings a line\'s dots by their own size', () => {
        const theme = { extends: 'economist', geometry: { point: { presence: 'full', size: 24, halo: { presence: 'full', width: 2 } } } };
        const ring = lineChart(3, theme as any).config?.line?.point?.strokeWidth;
        expect(ring).toBeGreaterThan(0.5);
        expect(ring).toBeLessThan(1);
    });
});

describe('a fading house\'s shrunk dots rise toward solid', () => {
    const cloud = Array.from({ length: 1500 }, (_, i) => ({ id: `p${i}`, x: (i * 37) % 997, y: (i * 53) % 991 }));
    const spread = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, x: (i * 37) % 100, y: (i * 53) % 100 }));
    const faded = { extends: 'economist', geometry: { point: { opacity: 0.5 } } };

    it('holds diameter × opacity: half the area lifts 0.5 to 0.71', () => {
        const spec = scatter(cloud, faded);
        expect(spec.config.circle.size).toBe(33);
        expect(spec.config.circle.opacity).toBe(0.71);
        expect((spec._theme?.report ?? []).some((entry: any) => entry.code === 'fade-follows-shrink')).toBe(true);
    });

    it('keeps the house opacity on dots at the house size', () => {
        expect(scatter(spread, faded).config.circle.opacity).toBe(0.5);
    });

    it('lets the chart\'s own opacity win', () => {
        const spec = assembleVegaLite({
            data: { values: cloud },
            semantic_types: { id: 'Category', x: 'Quantity', y: 'Quantity' },
            chart_spec: { chartType: 'Scatter Plot', encodings: { x: 'x', y: 'y', detail: 'id' }, chartProperties: { opacity: 0.3 } },
            theme_spec: faded,
        } as any) as any;
        const mark = typeof spec.mark === 'object' ? spec.mark : spec.layer?.find((l: any) => typeof l.mark === 'object' && l.mark.opacity != null)?.mark;
        expect(mark?.opacity).toBe(0.3);
    });
});

describe('a dot scale pads only where the dots need it', () => {
    const yScale = (rows: Record<string, unknown>[]) => scatter(rows, 'economist').encoding.y.scale;

    it('leaves a rounded domain clear of the data unpadded, so the axis line stays on its end tick', () => {
        // Readings from 9 to about 46 round out to the house's ticks: the dots stand well clear of
        // both ends, and padding would only push the baseline below the lowest tick.
        const rows = Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, x: 50 + i * 4, y: 9 + (i * 0.94) }));
        const scale = yScale(rows);
        const [min, max] = scale.domain ?? [scale.domainMin, scale.domainMax];
        expect(min).toBeLessThan(9);
        expect(max).toBeGreaterThan(9 + 39 * 0.94);
        expect(scale.padding ?? 0).toBe(0);
    });

    it('states its planned ends as domainMin and domainMax, padded or not, so rows sent later re-plan the same form', () => {
        const roomy = yScale(Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, x: 50 + i * 4, y: 9 + (i * 0.94) })));
        const tight = yScale(Array.from({ length: 41 }, (_, i) => ({ id: `p${i}`, x: 50 + i * 4, y: 10 + i })));
        for (const scale of [roomy, tight]) {
            expect(scale.domain).toBeUndefined();
            expect([typeof scale.domainMin, typeof scale.domainMax]).toEqual(['number', 'number']);
            expect(typeof scale.padding).toBe('number');
        }
    });

    it('still pads where a reading sits on the domain\'s end', () => {
        const rows = Array.from({ length: 41 }, (_, i) => ({ id: `p${i}`, x: 50 + i * 4, y: 10 + i }));
        expect(yScale(rows).padding).toBeGreaterThan(0);
    });
});
