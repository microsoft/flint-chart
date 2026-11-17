import { describe, expect, it } from 'vitest';
import { assembleVegaLite } from '../src/index';
import { openVegaLiteSession, vegaLiteStages } from '../src/vegalite/assemble';
import { CANVAS_FIT_LIMITS, judgeCanvas, readingCost, treatmentCost, type CanvasParts } from '../src/core/canvas-fit';
import { LAYOUT_COSTS } from '../src/core/layout-costs';

/** Bubbles coloured by three regions and sized by population: two keys Datawrapper stacks under its title. */
const ROWS = ['Asia', 'Europe', 'Africa'].flatMap((Region, r) => [0, 1, 2, 3].map((k) => ({
    Region, GDP: 2000 + r * 9000 + k * 4000, Life: 55 + r * 6 + k * 3, Population: 10 + r * 40 + k * 25,
})));

/** The chart in a base with its 1.5× allowance: a 300 × 220 base is a 450 × 330 box. */
const bubbles = (options: Record<string, unknown> = {}, baseSize = { width: 300, height: 220 }) => ({
    data: { values: ROWS },
    semantic_types: { Region: 'Category', GDP: 'Amount', Life: 'Quantity', Population: 'Quantity' },
    chart_spec: {
        chartType: 'Scatter Plot', title: 'Money buys years', baseSize,
        canvasSize: { width: baseSize.width * 1.5, height: baseSize.height * 1.5 },
        encodings: { x: 'GDP', y: 'Life', color: 'Region', size: 'Population' },
    },
    theme_spec: 'datawrapper',
    options,
}) as any;

const keyOrients = (spec: any): string[] => (spec._legendLayout?.legends ?? []).map((legend: any) => legend.orient);

describe('canvas fit', () => {
    it('sets one of the keys stacked under the title beside the plot, the least edit that clears', () => {
        // A 300 × 160 base in its 450 × 240 box: two key rows under the headline make the drawing
        // taller than the box is, and the two keys are too wide to share one row across it.
        const short = { width: 300, height: 160 };
        const off: any = assembleVegaLite(bubbles({ canvasFit: 'off' }, short));
        expect(keyOrients(off)).toEqual(['top', 'top']);

        const fitted: any = assembleVegaLite(bubbles({}, short));
        expect(fitted._canvasFit.before.flags.length).toBeGreaterThan(0);
        // The title keeps its size: it is not what makes the drawing tall. One key beside the plot is
        // enough, and a gentler edit than both.
        expect(fitted._canvasFit.treatment.oneKey).toMatchObject({ to: 'side' });
        expect(fitted._canvasFit.tried.some((tried: any) => tried.treatment.keys === 'side' && !tried.flags.length)).toBe(true);
        expect(fitted._canvasFit.after.flags).toEqual([]);
        expect([...keyOrients(fitted)].sort()).toEqual(['right', 'top']);
        expect(fitted._theme.report.some((r: any) => r.code === 'canvas-fit')).toBe(true);
    });

    it('leaves a chart that reads well in its box as planned', () => {
        // The same chart with room to spare.
        const roomy = bubbles({}, { width: 640, height: 480 });
        const fitted: any = assembleVegaLite(roomy);
        const off: any = assembleVegaLite({ ...roomy, options: { canvasFit: 'off' } });
        expect(fitted._canvasFit).toBeUndefined();
        const { _theme: _a, ...left } = fitted;
        const { _theme: _b, ...right } = off;
        expect(JSON.stringify(left)).toBe(JSON.stringify(right));
    });

    it('holds the treatment when the rows in view change', () => {
        const session = openVegaLiteSession(bubbles({}, { width: 300, height: 160 }));
        expect(session.plan.canvasFit?.treatment?.oneKey).toMatchObject({ to: 'side' });
        const narrowed = session.replan({ keep: (row) => row.Region !== 'Africa' });
        expect(narrowed.plan.canvasFit).toBeUndefined();
        expect(keyOrients(narrowed.spec)).toEqual(keyOrients(session.spec));
    });

    it('draws what it planned', () => {
        const { plan, spec } = vegaLiteStages(bubbles());
        const planned = plan.legend.layout!.keys.filter(Boolean).map((key) => key!.orient);
        expect(keyOrients(spec)).toEqual(planned);
    });

    it('weighs every single edit the culprit calls for before any two together', () => {
        const fitted: any = assembleVegaLite(bubbles({ canvasFit: 'auto' }, { width: 300, height: 160 }));
        // The keys make the drawing tall and the house's headline is large, so both parts' edits are
        // weighed — one row on their edge, one key beside the plot, every key beside it, the title a
        // size or two down — each alone, gentlest first, before any two together. One key beside the
        // plot clears, so the title keeps its size.
        // The culprit's edits; a refit of the plot, once they are settled, comes after them.
        const tried = fitted._canvasFit.tried.map((t: any) => t.treatment).filter((t: any) => !t.plotSpace);
        const pairs = (t: any) => Object.keys(t).length > 1;
        expect(tried[0]).toEqual({ keys: 'top' });
        const firstPair = tried.findIndex(pairs);
        if (firstPair >= 0) expect(tried.slice(firstPair).every(pairs)).toBe(true);
        expect(tried.some((t: any) => t.keys === 'side')).toBe(true);
        expect(tried.some((t: any) => t.oneKey?.to === 'side')).toBe(true);
        expect(fitted._canvasFit.treatment.titleScale).toBeUndefined();
    });

    it('does not move both keys above the plot, where that trades one problem for another', () => {
        // Two keys beside a plot in a box a little wider than tall, the regions' names long: too wide
        // to show legibly. Both in a row above or below make the drawing too tall instead; the edit
        // the fit takes only helps.
        const regions = ['East Asia and Pacific', 'Europe and Central Asia', 'Sub-Saharan Africa', 'Latin America and Caribbean'].flatMap((Region, r) => [0, 1, 2, 3].map((k) => ({
            Region, GDP: 1000 * 10 ** (r * 0.6 + k * 0.4), Life: 50 + r * 6 + k * 3, Population: 3 + r * 300 + k * 120,
        })));
        const spec: any = assembleVegaLite({
            data: { values: regions },
            semantic_types: { Region: 'Category', GDP: 'Amount', Life: 'Quantity', Population: 'Quantity' },
            chart_spec: {
                chartType: 'Scatter Plot', title: 'Gapminder — life expectancy vs income per capita (2018)',
                baseSize: { width: 300, height: 280 }, canvasSize: { width: 300, height: 280 },
                encodings: { x: 'GDP', y: 'Life', color: 'Region', size: 'Population' },
            },
        } as any);
        const fit = spec._canvasFit;
        expect(fit.tried.some((tried: any) => tried.treatment.keys === 'top' && tried.flags.some((flag: string) => /taller/.test(flag)))).toBe(true);
        expect(fit.treatment.keys).not.toBe('top');
        expect(fit.after.kinds.every((kind: string) => fit.before.kinds.includes(kind))).toBe(true);
        expect(fit.after.scale).toBeGreaterThan(fit.before.scale);
    });

    it('moves a key beside the plot only where a row on their edge is not enough', () => {
        // A shorter box: one row of keys above the plot still leaves the drawing too tall.
        const fitted: any = assembleVegaLite(bubbles({}, { width: 300, height: 160 }));
        expect(fitted._canvasFit.tried[0]).toMatchObject({ treatment: { keys: 'top' } });
        expect(fitted._canvasFit.tried[0].flags.length).toBeGreaterThan(0);
        expect(fitted._canvasFit.treatment.oneKey).toMatchObject({ to: 'side' });
        expect(fitted._canvasFit.after.flags).toEqual([]);
    });

    it('sets a long headline smaller, never below a legible floor', () => {
        const spec: any = assembleVegaLite({
            data: { values: [{ Group: 'Before', Score: 41 }, { Group: 'After', Score: 67 }] },
            semantic_types: { Group: 'Category', Score: 'Score' },
            chart_spec: {
                chartType: 'Bar Chart', encodings: { x: 'Group', y: 'Score' }, baseSize: { width: 300, height: 300 }, canvasSize: { width: 300, height: 300 },
                title: 'After the redesign, the share of first-time visitors who completed the sign-up flow rose from forty-one to sixty-seven per cent',
                subtitle: 'Completion rate of the sign-up flow, %, before and after the September redesign',
            },
            theme_spec: 'pop',
            options: { themeDecisions: true },
        } as any);
        // The headline is what makes it tall: the fit sets it smaller, never laying the chart out larger.
        const treatment = spec._canvasFit?.treatment;
        expect(treatment?.titleScale).toBeDefined();
        // A smaller headline is never set below 13px; the headline's own fit may then set it a size down.
        expect(spec._theme.decisions.title.headline.fontSize).toBeGreaterThanOrEqual(13);
    });

    it('wraps long names down the y axis rather than let them take the chart’s width', () => {
        const names = ['Department of Health', 'Ministry of Transport', 'Office of the Budget', 'Bureau of Statistics', 'Agency for Housing', 'Council of the Arts'];
        const spec: any = assembleVegaLite({
            data: { values: names.map((Office, i) => ({ Office, Staff: 120 + i * 35 })) },
            semantic_types: { Office: 'Category', Staff: 'Count' },
            chart_spec: {
                chartType: 'Bar Chart', encodings: { x: 'Staff', y: 'Office' }, title: 'Staff by office',
                baseSize: { width: 200, height: 200 }, canvasSize: { width: 230, height: 230 },
            },
        } as any);
        // The names wrap at their cap as planned, or where the fit gives them less room; either way
        // whole on their lines, and they no longer take the chart's width.
        const fit = spec._canvasFit;
        const after = fit?.after ?? fit?.before;
        expect(spec.config.axisY.labelExpr).toBeDefined();
        expect(after?.kinds ?? []).not.toContain('yLabels');
    });

    it('never makes text already too small smaller still', () => {
        for (const width of [160, 200, 240]) {
            const spec: any = assembleVegaLite(bubbles({}, { width, height: width * 0.7 }));
            const fit = spec._canvasFit;
            if (fit?.treatment && fit.before.scale < CANVAS_FIT_LIMITS.scale) {
                expect(fit.after.scale).toBeGreaterThanOrEqual(fit.before.scale - 0.005);
            }
        }
    });

    it('sets a headline smaller where its lines squeeze the plot, though the drawing fits its box', () => {
        // Six lines of a big headline over two bars in a 450 × 300 box: the drawing fits, because the
        // lines came out of the plot — which is left a strip.
        const spec: any = assembleVegaLite({
            data: { values: [{ Group: 'Before', Score: 41 }, { Group: 'After', Score: 67 }] },
            semantic_types: { Group: 'Category', Score: 'Score' },
            chart_spec: {
                chartType: 'Bar Chart', encodings: { x: 'Group', y: 'Score' }, baseSize: { width: 300, height: 200 }, canvasSize: { width: 450, height: 300 },
                title: 'After the redesign, the share of first-time visitors who completed the sign-up flow rose from forty-one to sixty-seven per cent',
                subtitle: 'Completion rate of the sign-up flow, %, before and after the September redesign',
            },
            theme_spec: 'pop',
        } as any);
        const fit = spec._canvasFit;
        expect(fit.before.scale).toBeGreaterThanOrEqual(0.99);
        expect(fit.before.panel.height).toBeLessThan(fit.before.designed.height * 0.9);
        expect(fit.treatment?.titleScale).toBeDefined();
        expect(fit.after.panel.height).toBeGreaterThan(fit.before.panel.height);
    });

    it('never trades a squeeze for text too small to read', () => {
        for (const width of [200, 240, 300]) {
            const spec: any = assembleVegaLite(bubbles({}, { width, height: width * 0.7 }));
            const fit = spec._canvasFit;
            if (fit?.treatment && fit.before.scale >= CANVAS_FIT_LIMITS.scale) {
                expect(fit.after.scale).toBeGreaterThanOrEqual(CANVAS_FIT_LIMITS.scale);
            }
        }
    });
});

describe('the plot laid out again in the room left', () => {
    const institutions = ['Small business', 'Scientists', 'The military', 'The police', 'The Supreme Court', 'The press', 'Congress'];
    const answers = ['A great deal', 'Some', 'Not much', 'None at all'];
    // Answers in a key row under a two-line deck, in a small square tile: the header makes the
    // drawing tall, so the box, shown at the scale its height asks, has width to spare. Material, whose
    // key keeps its text beside the rows' names, so moving the key does not win over lengthening the bars.
    const likert = (options: Record<string, unknown> = {}) => ({
        data: { values: institutions.flatMap((Institution, i) => answers.map((Answer, k) => ({ Institution, Answer, Share: 10 + ((i + k) % 4) * 10 }))) },
        semantic_types: { Institution: 'Category', Answer: 'Category', Share: 'Percentage' },
        chart_spec: {
            chartType: 'Stacked Bar Chart', encodings: { x: 'Share', y: 'Institution', color: 'Answer' },
            title: 'Confidence in US institutions (% of adults)',
            subtitle: 'Share of adults, by how much they trust each institution',
            baseSize: { width: 200, height: 200 }, canvasSize: { width: 230, height: 230 },
        },
        theme_spec: 'material',
        options,
    }) as any;

    it('lengthens the bars into the width the box leaves, the text no smaller', () => {
        const without = vegaLiteStages(likert({ canvasRefit: false })).plan;
        const refit = vegaLiteStages(likert()).plan;
        expect(refit.canvasFit?.treatment?.plotSpace?.width).toBeDefined();
        expect(refit.plot.width).toBeGreaterThan(without.plot.width);
        // Banded rows keep their steps.
        expect(refit.layout.yStep).toBe(without.layout.yStep);
        const before = without.canvasFit?.after ?? without.canvasFit!.before;
        expect(refit.canvasFit!.after!.scale).toBeGreaterThanOrEqual(before.scale - 0.005);
        // Nearer its box's shape for it.
        const drift = (e: any) => Math.abs(Math.log(e.drawing.width / e.drawing.height));
        expect(drift(refit.canvasFit!.after)).toBeLessThan(drift(before));
    });

    it('never grows a side past its stretch cap', () => {
        const refit = vegaLiteStages(likert()).plan;
        expect(refit.plot.width).toBeLessThanOrEqual(230);
        expect(refit.plot.height).toBeLessThanOrEqual(230);
    });

    it('is left out where the caller turns it off', () => {
        const { plan } = vegaLiteStages(likert({ canvasRefit: false }));
        expect(plan.canvasFit?.treatment?.plotSpace).toBeUndefined();
        expect(plan.canvasFit?.tried.some((tried) => tried.treatment.plotSpace)).toBe(false);
    });
});

describe('a chart that reads well but runs past its box', () => {
    const segments = ['Residential customers on fixed tariffs', 'Small and medium-sized businesses', 'Large industrial and commercial accounts'];
    const grouped = (options: Record<string, unknown> = {}) => ({
        data: { values: ['North', 'East', 'South'].flatMap((Region, r) => segments.map((Segment, k) => ({ Region, Segment, Revenue: 30 + r * 12 + k * 9 }))) },
        semantic_types: { Region: 'Category', Segment: 'Category', Revenue: 'Amount' },
        chart_spec: {
            chartType: 'Grouped Bar Chart', encodings: { x: 'Region', y: 'Revenue', group: 'Segment' }, title: 'Revenue by region and segment',
            baseSize: { width: 480, height: 300 }, canvasSize: { width: 576, height: 360 },
        },
        theme_spec: 'swiss',
        options,
    }) as any;

    it('wraps the key names, the gentlest edit, to bring the drawing nearer its box', () => {
        const { plan } = vegaLiteStages(grouped());
        const fit = plan.canvasFit!;
        expect(fit.before.flags).toEqual([]);
        expect(fit.before.scale).toBeLessThan(0.97);
        expect(fit.treatment?.names).toBeDefined();
        expect(fit.after!.flags).toEqual([]);
        expect(fit.after!.scale).toBeGreaterThan(fit.before.scale + 0.03);
    });

    it('spends nothing larger than wrapped names on it', () => {
        const { plan } = vegaLiteStages(grouped());
        const { plotSpace: _refit, ...edit } = plan.canvasFit!.treatment ?? {};
        expect(treatmentCost(edit, 'right')).toBeLessThanOrEqual(LAYOUT_COSTS.edit.names + LAYOUT_COSTS.edit.namesNarrow);
    });
});

describe('the chart’s own shape', () => {
    it('never changes a chart’s own shape to rescue it', () => {
        // Four teams, one with a long name, in a 240 × 320 base: the names stand upright and the
        // drawing runs taller than its box. Widening the plot would lay them flat, but would change
        // the chart's shape; the fit rebalances what is around the chart, not the chart.
        const labels = ['United States of America Olympic delegation', 'China', 'Japan', 'France'];
        const spec: any = assembleVegaLite({
            data: { values: labels.map((Team, index) => ({ Team, Total: 100 - index })) },
            semantic_types: { Team: 'Category', Total: 'Quantity' },
            chart_spec: { chartType: 'Bar Chart', encodings: { x: 'Team', y: 'Total' }, baseSize: { width: 240, height: 320 } },
            theme_spec: 'mckinsey',
        } as any);
        const fit = spec._canvasFit;
        const shape = (size: { width: number; height: number }) => size.width / size.height;
        if (fit?.after) expect(Math.abs(Math.log(shape(fit.after.designed) / shape(fit.before.designed)))).toBeLessThan(Math.log(1.15));
    });

    it('does not reflow a chart its box already holds', () => {
        // A narrow boxplot of three bands is narrow by design, and fits its box.
        const data = ['A', 'B', 'C'].flatMap((Grade, i) => Array.from({ length: 10 }, (_, k) => ({ Grade, Score: 50 + i * 5 + k })));
        const spec: any = assembleVegaLite({
            data: { values: data }, semantic_types: { Grade: 'Category', Score: 'Quantity' },
            chart_spec: { chartType: 'Boxplot', encodings: { x: 'Grade', y: 'Score' }, baseSize: { width: 300, height: 300 } },
        } as any);
        expect(spec._canvasFit).toBeUndefined();
    });
});

describe('the canvas judge', () => {
    const parts = (overrides: Partial<CanvasParts> = {}): CanvasParts => ({
        panel: { width: 300, height: 200 },
        grid: { columns: 1, rows: 1, gapX: 0, gapY: 0 },
        reserve: { width: 0, height: 0, parts: { yLabels: 30, xLabels: 20, title: 30 } },
        chrome: { top: 0, bottom: 0 },
        box: { width: 450, height: 300 },
        base: { width: 300, height: 200 },
        ...overrides,
    });

    it('finds nothing wrong with a chart that fits its box', () => {
        expect(judgeCanvas(parts()).flags).toEqual([]);
    });

    it('flags furniture that makes the drawing taller than its box', () => {
        const judged = judgeCanvas(parts({ reserve: { width: 0, height: 0, parts: { yLabels: 30, xLabels: 20, title: 60, stackedKeys: 90 } } }));
        expect(judged.scale).toBeLessThan(1);
        expect(judged.stretch).toBeLessThan(1);
        expect(judged.flags.some((flag) => /taller/.test(flag))).toBe(true);
    });

    it('lets a drawing with room to spare keep its shape', () => {
        // A key beside a square pie in a wide, roomy box: not squeezed, only centred.
        const judged = judgeCanvas(parts({
            panel: { width: 280, height: 280 },
            reserve: { width: 0, height: 0, parts: { sideKeys: 120 } },
            box: { width: 600, height: 480 }, base: { width: 400, height: 320 },
        }));
        expect(judged.flags).toEqual([]);
    });
});

describe('a row of keys above the plot', () => {
    it('stacks two keys rather than wrap one into a grid beside the other', () => {
        // Side by side, the size key would wrap into rows as tall as its largest bubbles; one above
        // the other, neither wraps its entries, and the edge takes less of the drawing.
        const { plan } = vegaLiteStages(bubbles({ canvasFit: 'off' }, { width: 330, height: 240 }));
        const layout = plan.legend.layout!;
        expect(layout.edges.find((edge) => edge.orient === 'top')?.direction).toBe('vertical');
        const keys = layout.keys.filter(Boolean);
        expect(keys).toHaveLength(2);
        expect(keys.every((key) => key!.columns === undefined)).toBe(true);
        const top = layout.footprint.find((edge) => edge.orient === 'top')!;
        expect(top.height).toBeLessThanOrEqual(keys.reduce((sum, key) => sum + key!.height, 0) + 12);
    });

    it('keeps several keys at the house anchor, seating a title above, rather than run them back over the y labels', () => {
        // With its title inline the size key's line runs just past the plot: anchored at the plot's
        // end, the stack would start out over the y labels, in line with nothing. The title stands
        // above the entries instead, and the keys stay at the plot's start.
        const spec: any = assembleVegaLite(bubbles({ canvasFit: 'off' }, { width: 420, height: 240 }));
        const top = spec.config.legend.layout.top;
        expect(top.anchor ?? 'start').toBe('start');
        expect(spec._theme.report.some((r: any) => r.code === 'keys-anchor-moved')).toBe(false);
        const plan = vegaLiteStages(bubbles({ canvasFit: 'off' }, { width: 420, height: 240 })).plan;
        const footprint = plan.legend.layout!.footprint.find((edge) => edge.orient === 'top')!;
        expect(footprint.width).toBeLessThanOrEqual(plan.legend.layout!.plot.width);
    });
});

describe('what an edit costs', () => {
    it('orders edits as a reader would least notice them', () => {
        const cost = (treatment: any, edge?: string) => treatmentCost(treatment, edge);
        const ladder = [
            cost({ keys: 'top' }, 'top'),
            cost({ names: { keyWidth: 200 } }),
            cost({ titleScale: 0.85 }),
            cost({ oneKey: { index: 0, to: 'side' } }, 'top'),
            cost({ keys: 'side' }, 'top'),
            cost({ titleScale: 0.72 }),
            cost({ plotScale: 0.9 }),
        ];
        expect([...ladder].sort((a, b) => a - b)).toEqual(ladder);
        // Keys kept beside the plot, where the house sets them, are the gentler edit too.
        expect(cost({ keys: 'side' }, 'right')).toBeLessThan(cost({ keys: 'top' }, 'right'));
        expect(cost({ names: { keyWidth: 120 } })).toBeGreaterThan(cost({ names: { keyWidth: 200 } }));
        // Names down the y axis wrapped cost as key names do.
        expect(cost({ rowNames: 80 })).toBe(LAYOUT_COSTS.edit.names);
    });

    it('lets how a result reads choose among edits alike, never a larger edit over a gentler one', () => {
        const edits = LAYOUT_COSTS.edit;
        const steps = [edits.keysRowOnEdge, edits.names, edits.title, edits.keyMoved, edits.keysOtherEdge, edits.titleDeep];
        const smallestStep = Math.min(...steps.slice(1).map((step, index) => step - steps[index]));
        // No difference in reading outweighs the step between two kinds of edit.
        expect(LAYOUT_COSTS.reading).toBeLessThanOrEqual(smallestStep + 1e-9);
    });

    it('reads a drawing at its limits as 1 and a relaxed one as near 0', () => {
        const at = (estimate: any) => readingCost({ stretch: 1, around: { height: 0, width: 0 }, scale: 1, ...estimate } as any);
        expect(at({})).toBe(0);
        expect(at({ stretch: CANVAS_FIT_LIMITS.stretch, around: { height: CANVAS_FIT_LIMITS.around, width: 0 }, scale: CANVAS_FIT_LIMITS.scale })).toBeCloseTo(1);
        expect(at({ stretch: 1.2 })).toBeGreaterThan(at({ stretch: 1.1 }));
    });
});

