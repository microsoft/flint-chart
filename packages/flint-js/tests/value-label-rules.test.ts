import { describe, expect, it } from 'vitest';
import { assembleVegaLite } from '../src';
import { insideMinValue, measureValueLabels, printValue } from '../src/core/value-label-measure';

const POP = [['India', 1429], ['China', 1426], ['United States', 340], ['Indonesia', 278], ['Pakistan', 241], ['Nigeria', 224], ['Brazil', 216], ['Bangladesh', 173]]
    .map(([Country, Population]) => ({ Country, Population }));

const textLayers = (spec: any): any[] => {
    const out: any[] = [];
    const visit = (n: any) => {
        if (!n || typeof n !== 'object') return;
        if ((typeof n.mark === 'string' ? n.mark : n.mark?.type) === 'text' && !n.__themeRole) out.push(n);
        for (const c of [...(n.layer ?? []), ...(n.vconcat ?? []), n.spec].filter(Boolean)) visit(c);
    };
    visit(spec);
    return out;
};

describe('L1: value labels measured as printed', () => {
    it('prints the format and the unit, a word unit after a space and a currency before', () => {
        expect(printValue(1429, ',')).toBe('1,429');
        expect(printValue(1429, ',', 'm')).toBe('1,429 m');
        expect(printValue(12.5, '.1f', '%')).toBe('12.5%');
        expect(printValue(40, ',', '$')).toBe('$40');
    });

    it('measures in the label’s weight and case: bold is wider, and the widest value sets the room', () => {
        // Arial's digits are as wide in bold as in regular; its letters are not.
        const regular = measureValueLabels([173, 1429], { format: ',', unit: 'people', text: { font: 'Arial', fontSize: 12 } });
        const bold = measureValueLabels([173, 1429], { format: ',', unit: 'people', text: { font: 'Arial', fontSize: 12, fontWeight: 'bold' } });
        expect(bold.widest).toBeGreaterThan(regular.widest);
        expect(regular.widest).toBe(regular.width(1429));
        // Digits are about half an em, not the 0.62 em a character the old estimate used.
        const digits = measureValueLabels([1429], { format: ',', text: { font: 'Arial', fontSize: 12 } });
        expect(digits.widest).toBeLessThan(0.62 * 12 * 5);
        const cased = measureValueLabels([5], { format: ',', unit: 'm', text: { fontSize: 12, textCase: 'upper' } });
        expect(cased.text(5)).toBe('5 M');
    });

    it('finds the shortest bar that still holds its own label, against the drawn axis', () => {
        const labels = measureValueLabels([1429, 340, 173], { format: ',', text: { font: 'Arial', fontSize: 18 } });
        const bar = { horizontal: true, length: 400, domain: [0, 1500] as [number, number] };
        // 173 is 46px long and its label is about 31px plus the inset at both ends.
        expect(insideMinValue([1429, 340, 173], labels, bar)).toBeUndefined();
        expect(insideMinValue([1429, 340, 30], labels, bar)).toBe(340);
        expect(insideMinValue([10, 5], labels, bar)).toBe(Infinity);
        // Along a vertical bar a line of text has to fit, not the label's width.
        // 200 is 40px tall: room for an 18px line and the insets, though not for its 31px width.
        expect(insideMinValue([1429, 200], labels, { ...bar, horizontal: false, length: 300 })).toBeUndefined();
        expect(insideMinValue([1429, 200], labels, { ...bar, length: 300 })).toBe(1429);
    });

    it('keeps short bars’ labels inside where they fit, rather than flipping them by an estimate', () => {
        const spec: any = assembleVegaLite({
            data: { values: POP },
            semantic_types: { Country: 'Country', Population: 'Quantity' },
            chart_spec: { chartType: 'Bar Chart', encodings: { y: 'Country', x: 'Population' }, baseSize: { width: 560, height: 320 }, chartProperties: { showValueLabels: true } },
            theme_spec: {
                id: 'inside', type: { valueLabel: { size: 16, color: '#ffffff' } },
                dataLabels: { show: 'always', placement: 'atMark', inkMode: 'contrastWithMark' },
            },
        } as any);
        const labels = textLayers(spec);
        expect(labels).toHaveLength(1);
        expect(labels[0].mark.align).toBe('right');
        expect(labels[0].transform).toBeUndefined();
    });
});

describe('L2: the room past a bar’s end, in px', () => {
    const yScale = (spec: any) => {
        let found: any;
        const visit = (n: any) => {
            if (!n || typeof n !== 'object' || found) return;
            if ((n.mark?.type ?? n.mark) === 'bar' && n.encoding?.y?.scale) found = n.encoding.y.scale;
            for (const c of [...(n.layer ?? []), n.spec].filter(Boolean)) visit(c);
        };
        visit(spec);
        return found ?? spec.encoding?.y?.scale;
    };
    const columns = (height: number) => assembleVegaLite({
        data: { values: POP.slice(0, 6) },
        semantic_types: { Country: 'Country', Population: 'Quantity' },
        chart_spec: { chartType: 'Bar Chart', encodings: { x: 'Country', y: 'Population' }, baseSize: { width: 480, height }, chartProperties: { showValueLabels: true } },
    } as any) as any;

    it('extends a vertical scale by a line of text, not by 15% of the range', () => {
        const tall = yScale(columns(600));
        const short = yScale(columns(200));
        // On a tall plot a line of text is a small share of the height, so the headroom shrinks;
        // on a short one it grows; either way it is the same px.
        expect(tall.domainMax).toBeLessThan(1429 * 1.15);
        expect(short.domainMax).toBeGreaterThan(tall.domainMax);
        const room = (scale: any, height: number) => ((scale.domainMax - 1429) / scale.domainMax) * height;
        expect(room(tall, 600)).toBeGreaterThan(10 + 4);
    });

    it('keeps exactly the measured label clear past the end of a horizontal bar, inside the plot', () => {
        const spec: any = assembleVegaLite({
            data: { values: POP },
            semantic_types: { Country: 'Country', Population: 'Quantity' },
            chart_spec: { chartType: 'Bar Chart', encodings: { y: 'Country', x: 'Population' }, baseSize: { width: 500, height: 300 }, chartProperties: { showValueLabels: true } },
            theme_spec: { id: 'outside', type: { valueLabel: { size: 12, family: 'Arial' } }, dataLabels: { show: 'always', placement: 'outsideMark' } },
        } as any);
        const bar = [spec, ...(spec.layer ?? [])].find((n: any) => (n.mark?.type ?? n.mark) === 'bar');
        const scale = bar.encoding.x.scale;
        // The room runs on the axis: the domain extends past the longest bar's rounded end (1,500)
        // by the share of the plot the labels take, the range left whole.
        expect(scale.rangeMax).toBeUndefined();
        expect(scale.domainMax).toBeGreaterThan(1500);
        const inset = spec._width * (1 - 1500 / scale.domainMax);
        const widest = measureValueLabels([1429], { format: ',', text: { font: 'Arial', fontSize: 13 } }).widest;
        expect(inset).toBeGreaterThan(widest);
        // The old 0.8em a character kept 60px for "1,429" at 13px, and grew the canvas instead.
        expect(inset).toBeLessThan(0.8 * 13 * 5 + 8);
        expect(spec.padding?.right ?? 0).toBeLessThan(20);
    });

    it('grows the margin only by what the moved labels overrun', () => {
        const spec: any = assembleVegaLite({
            data: { values: [{ C: 'A', V: 1400 }, { C: 'B', V: 1300 }, { C: 'C', V: 30 }] },
            semantic_types: { C: 'Category', V: 'Quantity' },
            chart_spec: { chartType: 'Bar Chart', encodings: { y: 'C', x: 'V' }, baseSize: { width: 500, height: 200 }, chartProperties: { showValueLabels: true } },
            theme_spec: { id: 'inside', dataLabels: { show: 'always', placement: 'atMark' } },
        } as any);
        const labels = textLayers(spec);
        expect(labels).toHaveLength(2);
        // "30" moves past its short bar, far from the plot's edge: nothing to grow.
        expect(typeof spec.padding === 'object' ? spec.padding.right ?? 0 : spec.padding ?? 0).toBeLessThanOrEqual(12);
    });
});

describe('L3: the band holds its label', () => {
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const SEPARATOR = { id: 'separator', dataLabels: { show: 'always', placement: 'outsideMark' }, annotation: { numberFormat: { thousands: 'separator', precision: 'integer' } } };
    const OPEN = { id: 'open', dataLabels: { show: 'always', placement: 'outsideMark' }, annotation: { numberFormat: { precision: 'integer' } } };
    const revenue = (width: number, theme: unknown, base: number, labels = true) => assembleVegaLite({
        data: { values: MONTHS.map((Month, i) => ({ Month, Revenue: base + i * (base / 11) })) },
        semantic_types: { Month: 'Month', Revenue: 'Amount' },
        chart_spec: { chartType: 'Bar Chart', encodings: { x: 'Month', y: 'Revenue' }, baseSize: { width, height: 240 }, chartProperties: { showValueLabels: labels } },
        theme_spec: theme,
    } as any) as any;
    const codes = (spec: any): string[] => spec._theme.report.map((r: any) => r.code);

    it('widens the bands into the canvas’s spare room so the labels fit', () => {
        const before = revenue(640, SEPARATOR, 120_000, false);
        const spec = revenue(640, SEPARATOR, 120_000);
        expect(codes(spec)).toContain('band-widened-for-labels');
        expect(textLayers(spec)).toHaveLength(1);
        expect(spec.width.step).toBeGreaterThan(before.width.step);
        const widest = measureValueLabels([240_000], { format: ',.0f', text: { fontSize: 12 } }).widest;
        expect(spec.width.step).toBeGreaterThanOrEqual(widest);
    });

    it('withholds the labels, and says how wide the bands would have to be, when the canvas cannot hold them', () => {
        const spec = revenue(560, SEPARATOR, 1_200_000);
        expect(textLayers(spec)).toHaveLength(0);
        const full = spec._theme.report.find((r: any) => r.code === 'value-labels-band-full');
        expect(full.message).toMatch(/need \d+px bands/);
    });

    it('shortens a number whose thousands the house left open, keeping the bands', () => {
        const spec = revenue(640, OPEN, 1_200_000);
        expect(codes(spec)).toContain('value-labels-shortened');
        expect(codes(spec)).not.toContain('band-widened-for-labels');
        expect(textLayers(spec)[0].encoding.text.format).toMatch(/s$/);
    });

    it('never shortens a house’s thousands separator', () => {
        const spec = revenue(640, SEPARATOR, 1_200_000);
        expect(codes(spec)).not.toContain('value-labels-shortened');
    });
});

describe('L4: inside placement', () => {
    const rows = [{ C: 'A', V: 1400 }, { C: 'B', V: 1300 }, { C: 'C', V: 20 }];
    const hbars = (dataLabels: Record<string, unknown>, extra: Record<string, unknown> = {}, values = rows) => assembleVegaLite({
        data: { values },
        semantic_types: { C: 'Category', V: 'Quantity' },
        chart_spec: { chartType: 'Bar Chart', encodings: { y: 'C', x: 'V' }, baseSize: { width: 500, height: 200 }, chartProperties: { showValueLabels: true } },
        theme_spec: { id: 'l4', ink: { surface: { canvas: '#ffffff' } }, type: { valueLabel: { color: '#ffffff' } }, dataLabels: { show: 'always', placement: 'atMark', ...dataLabels }, ...extra },
    } as any) as any;

    it('prints a label moved past its bar in an ink that reads on the plot, not the white it had inside', () => {
        const labels = textLayers(hbars({}));
        expect(labels).toHaveLength(2);
        const moved = labels.find((l: any) => l.mark.align === 'left');
        expect(moved.mark.color.toLowerCase()).not.toBe('#ffffff');
        expect(moved.encoding.color).toBeUndefined();
    });

    it('drops the per-series inside ink from labels moved past their bars', () => {
        const spec: any = assembleVegaLite({
            data: { values: [{ C: 'A', S: 'x', V: 1400 }, { C: 'A', S: 'y', V: 20 }, { C: 'B', S: 'x', V: 1300 }, { C: 'B', S: 'y', V: 900 }] },
            semantic_types: { C: 'Category', S: 'Category', V: 'Quantity' },
            chart_spec: { chartType: 'Grouped Bar Chart', encodings: { y: 'C', x: 'V', group: 'S' }, baseSize: { width: 500, height: 260 }, chartProperties: { showValueLabels: true } },
            theme_spec: { id: 'l4g', ink: { series: { categorical: ['#2b5e88', '#db771a'] } }, dataLabels: { show: 'always', placement: 'atMark', inkMode: 'contrastWithMark' } },
        } as any);
        const labels = textLayers(spec);
        const inside = labels.find((l: any) => l.encoding.color?.field);
        const moved = labels.find((l: any) => l !== inside);
        expect(inside).toBeDefined();
        expect(moved?.encoding.color).toBeUndefined();
    });

    it('raises the contrast an inside label keeps with its bar when the house asks', () => {
        const ink = (minContrast?: number) => {
            const spec: any = assembleVegaLite({
                data: { values: [{ C: 'A', S: 'x', V: 1400 }, { C: 'A', S: 'y', V: 1300 }] },
                semantic_types: { C: 'Category', S: 'Category', V: 'Quantity' },
                chart_spec: { chartType: 'Grouped Bar Chart', encodings: { y: 'C', x: 'V', group: 'S' }, baseSize: { width: 500, height: 200 }, chartProperties: { showValueLabels: true } },
                theme_spec: { id: 'mc', ink: { series: { categorical: ['#2b5e88', '#db771a'] } }, dataLabels: { show: 'always', placement: 'atMark', inkMode: 'contrastWithMark', ...(minContrast ? { minContrast } : {}) } },
            } as any);
            return textLayers(spec)[0].encoding.color.scale.range[1].toLowerCase();
        };
        // White on #db771a is 3.15:1: enough by default, not at 4.5.
        expect(ink()).toBe('#ffffff');
        expect(ink(4.5)).not.toBe('#ffffff');
    });

    it('anchors inside labels at the bar’s base, so they read as one column', () => {
        const [label] = textLayers(hbars({ anchor: 'start' }, {}, [{ C: 'A', V: 1400 }, { C: 'B', V: 900 }]));
        expect(label.encoding.x.field).toBe('__flintLabelAt');
        // The shared axis keeps the bar's title, not the working column's.
        expect(label.encoding.x.title).toBe('V');
        expect(label.transform?.[0] ?? label.transform).toBeDefined();
        expect(JSON.stringify(label.transform)).toContain('"calculate":"0"');
        expect(label.mark.align).toBe('left');
        const [middle] = textLayers(hbars({ anchor: 'middle' }, {}, [{ C: 'A', V: 1400 }, { C: 'B', V: 900 }]));
        expect(middle.mark.align).toBe('center');
    });

    it('prints every label past its bar once one bar is too short, when the house wants them alike', () => {
        const spec = hbars({ fallback: 'allOutside', inkMode: 'contrastWithMark' });
        const labels = textLayers(spec);
        expect(labels).toHaveLength(1);
        expect(labels[0].mark.align).toBe('left');
        expect(labels[0].mark.color.toLowerCase()).not.toBe('#ffffff');
        expect(spec._theme.report.map((r: any) => r.code)).toContain('value-labels-all-outside');
        // With every bar long enough, the labels stay inside.
        expect(textLayers(hbars({ fallback: 'allOutside' }, {}, [{ C: 'A', V: 1400 }, { C: 'B', V: 900 }]))[0].mark.align).toBe('right');
    });
});

describe('L5: stacked segments and donut rings', () => {
    const donut = (inner: number, outer = 73) => {
        const spec: any = assembleVegaLite({
            data: { values: [{ B: 'Same day', S: 46 }, { B: 'Next day', S: 31 }, { B: '2–3 days', S: 15 }, { B: '4+ days', S: 8 }] },
            semantic_types: { B: 'Category', S: 'Percentage' },
            chart_spec: { chartType: 'Donut Chart', encodings: { color: 'B', size: 'S' }, baseSize: { width: 250, height: 250 }, chartProperties: { showValueLabels: true, innerRadius: inner } },
            theme_spec: { id: 'ring', type: { valueLabel: { size: 12.5 } }, dataLabels: { show: 'always', placement: 'atMark', inkMode: 'contrastWithMark' } },
        } as any);
        const arcs: any[] = [];
        const texts: any[] = [];
        const visit = (n: any) => {
            if (!n || typeof n !== 'object') return;
            const t = n.mark?.type ?? n.mark;
            if (t === 'arc') arcs.push(n);
            if (t === 'text' && n.__themeSynthetic) texts.push(n);
            for (const c of [...(n.layer ?? []), n.spec].filter(Boolean)) visit(c);
        };
        visit(spec);
        return { spec, arc: arcs[0].mark, text: texts[0] };
    };

    it('sets a donut’s labels in the middle of a ring thick enough for them', () => {
        const { arc, text } = donut(30);
        if (typeof arc.innerRadius === 'number' && typeof arc.outerRadius === 'number') {
            expect(text.mark.radius).toBeCloseTo((arc.innerRadius + arc.outerRadius) / 2, 0);
        }
    });

    it('moves a thin ring’s labels outside it, in the plot’s ink', () => {
        // A 121px pie with a 110px hole: an 11px ring.
        const { spec, arc, text } = donut(110);
        const outer = typeof arc.outerRadius === 'number' ? arc.outerRadius : 125;
        expect(text.mark.radius).toBeGreaterThan(outer);
        expect(text.encoding.color?.field).toBeUndefined();
        expect(spec._theme.report.some((r: any) => /ring is \d+px thick/.test(r.message))).toBe(true);
    });

    it('keeps a horizontal segment’s label only where the segment is as long as the label is wide', () => {
        const rows = ['A', 'B', 'C'].flatMap((C) => [{ C, S: 'big', V: 1400 }, { C, S: 'small', V: 60 }]);
        const spec: any = assembleVegaLite({
            data: { values: rows },
            semantic_types: { C: 'Category', S: 'Category', V: 'Quantity' },
            chart_spec: { chartType: 'Stacked Bar Chart', encodings: { y: 'C', x: 'V', color: 'S' }, baseSize: { width: 400, height: 220 }, chartProperties: { showValueLabels: true } },
            theme_spec: { id: 'seg', type: { valueLabel: { size: 14 } }, dataLabels: { show: 'always', placement: 'atMark' } },
        } as any);
        const [label] = textLayers(spec);
        // A 60 segment is ~16px long: tall enough for a line of 14px text, too short for “60” across it.
        const keep = label.encoding.opacity.condition.test as string;
        const threshold = Number(keep.match(/>= ([\d.]+)/)?.[1]);
        expect(threshold).toBeGreaterThan(60);
        expect(threshold).toBeLessThanOrEqual(1400);
    });
});

describe('L6: printed values replace the axis, title included', () => {
    it('counts a title as named only with its unit', async () => {
        const { alreadyNamed } = await import('../src/core/title-plan');
        expect(alreadyNamed('Population (m)', 'Population, millions, 2023')).toBe(true);
        expect(alreadyNamed('People (million)', 'People displaced across borders | 2020')).toBe(false);
        expect(alreadyNamed('Population', 'Population, 2023')).toBe(true);
        expect(alreadyNamed('Revenue', 'Population, 2023')).toBe(false);
    });

    const labelled = ({ text, subtitle }: { text: string; subtitle?: string }) => assembleVegaLite({
        data: { values: POP },
        semantic_types: { Country: 'Country', Population: 'Quantity' },
        chart_spec: { chartType: 'Bar Chart', encodings: { y: 'Country', x: 'Population' }, baseSize: { width: 480, height: 300 }, title: text, ...(subtitle ? { subtitle } : {}), chartProperties: { showValueLabels: true } },
        theme_spec: { id: 'nolabels', dataLabels: { show: 'always', placement: 'outsideMark' }, structure: { axis: { measure: { suppressWhenValuesPrinted: true } } } },
    } as any) as any;
    const xTitles = (spec: any): unknown[] => {
        const out: unknown[] = [];
        const visit = (n: any) => {
            if (!n || typeof n !== 'object') return;
            const x = n.encoding?.x;
            if (x?.type === 'quantitative' && x.axis !== undefined) out.push(x.axis?.title === undefined ? x.title ?? x.field : x.axis.title);
            for (const c of [...(n.layer ?? []), n.spec].filter(Boolean)) visit(c);
        };
        visit(spec);
        return out;
    };
    const deck = (spec: any) => [spec.title?.subtitle ?? []].flat().join(' ');

    it('moves the measure title into the deck instead of leaving it under the bars', () => {
        const spec = labelled({ text: 'The most populous countries' });
        expect(xTitles(spec).length).toBeGreaterThan(0);
        expect(xTitles(spec).every((t) => t === null)).toBe(true);
        expect(deck(spec)).toContain('Population');
        expect(spec._theme.report.map((r: any) => r.code)).toContain('axis-title-to-deck');
    });

    it('drops it where the headline or deck already names the quantity', () => {
        const spec = labelled({ text: 'India and China lead', subtitle: 'Population, millions, 2023' });
        expect(xTitles(spec).every((t) => t === null)).toBe(true);
        expect(deck(spec)).toBe('Population, millions, 2023');
    });
});

describe('pie value labels follow the wedges', () => {
    const BROWSERS = [['Chrome', 65], ['Safari', 12], ['Edge', 12], ['Firefox', 6], ['Other', 5]].map(([Browser, Share]) => ({ Browser, Share }));
    const pie = (chartProperties?: Record<string, unknown>) => assembleVegaLite({
        theme_spec: 'nyt',
        chart_spec: { chartType: 'Pie Chart', encodings: { size: 'Share', color: 'Browser' }, ...(chartProperties ? { chartProperties } : {}) },
        semantic_types: { Browser: 'Category', Share: 'Quantity' },
        data: { values: BROWSERS },
    } as any) as any;
    const layered = (n: any): any => (n?.layer ? n : n?.spec ? layered(n.spec) : undefined);

    it('labels and wedges stack in the data order, not alphabetically', () => {
        const host = layered(pie());
        expect(host.encoding.order.field).toBe('__flintArcOrder');
        expect(host.transform.some((t: any) => t.as === '__flintArcOrder')).toBe(true);
        for (const l of host.layer) expect(l.encoding?.order).toBeUndefined();
    });

    it('labels and wedges share a value sort', () => {
        const host = layered(pie({ sortSlices: 'descending' }));
        expect(host.encoding.order).toMatchObject({ field: 'Share', sort: 'descending' });
        for (const l of host.layer) expect(l.encoding?.order).toBeUndefined();
    });
});

describe('a compact unit belongs to the printed value', () => {
    const SHARE = [{ Region: 'North', Share: 36.7 }, { Region: 'South', Share: 22.1 }, { Region: 'East', Share: 48.3 }];
    const chart = (rows: Record<string, unknown>[], annotation: Record<string, unknown>, theme?: string) => assembleVegaLite({
        data: { values: rows },
        semantic_types: { Share: annotation },
        chart_spec: { chartType: 'Bar Chart', encodings: { x: { field: 'Region' }, y: { field: 'Share' } }, chartProperties: { showValueLabels: true } },
        ...(theme ? { theme_spec: theme } : {}),
    } as any);
    const printed = (spec: any): string => JSON.stringify(spec.transform ?? []) + JSON.stringify(textLayers(spec).map((layer) => layer.encoding?.text));
    const yAxis = (spec: any): any => (spec.layer ?? [spec]).find((layer: any) => layer.encoding?.y?.axis)?.encoding.y.axis;

    it.each([undefined, 'swiss', 'nature', 'economist'])('prints % on 0–100 labels whatever the ruler states (%s)', (theme) => {
        expect(printed(chart(SHARE, { semanticType: 'Percentage', unit: '%', intrinsicDomain: [0, 100] }, theme))).toContain('+ \\"%\\"');
    });

    it('prints 0–1 labels in the field’s percent format, and adds no second % to the ticks', () => {
        const rows = SHARE.map((row) => ({ ...row, Share: row.Share / 100 }));
        const spec = chart(rows, { semanticType: 'Percentage', unit: '%', intrinsicDomain: [0, 1] }, 'economist');
        expect(textLayers(spec)[0].encoding.text.format).toMatch(/%$/);
        expect(yAxis(spec).labelExpr ?? '').not.toContain('%');
    });

    it('prints a currency sign before each label, once', () => {
        const rows = SHARE.map((row) => ({ ...row, Share: row.Share * 1000 }));
        const text = printed(chart(rows, { semanticType: 'Revenue', unit: 'USD' }, 'economist'));
        expect(text).toContain('\\"$\\" + format(');
        expect(text).not.toContain('\\"$\\" + \\"$\\"');
    });

    it('keeps a word unit beside the field name, off the labels', () => {
        expect(printed(chart(SHARE, { semanticType: 'Quantity', unit: 'years' }))).not.toContain('years');
    });
});

describe('an axis shared by several layers', () => {
    it('takes the tick unit once, however many ridges draw on it', () => {
        const rows = ['Jan', 'Feb', 'Mar'].flatMap((Month, m) => [12, 18, 25, 31, 22].map((v, i) => ({ Month, Share: v + m * 3 + i })));
        const spec = assembleVegaLite({
            data: { values: rows },
            semantic_types: { Month: 'Month', Share: { semanticType: 'Percentage', unit: '%' } },
            chart_spec: { chartType: 'Ridgeline Plot', encodings: { x: { field: 'Share' }, color: { field: 'Month' } }, chartProperties: { colorBy: 'x' } },
            theme_spec: 'economist',
        } as any);
        const exprs = JSON.stringify(spec).match(/"labelExpr":"(?:[^"\\]|\\.)*"/g) ?? [];
        const tagged = exprs.filter((expr) => expr.includes('\\"%\\"'));
        expect(tagged.length).toBeGreaterThan(0);
        for (const expr of tagged) expect(expr.split('\\"%\\"').length - 1).toBe(1);
    });
});
