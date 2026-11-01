import { classColors, resampleStops, roundBinEdges, roundColorClasses, type AuthoredColorScale, type NeutralBand } from '../core/color-controls';
import { exactFormat, printFormatted } from '../core/sample-format';
import { getPaletteForScheme } from './colormap';

/**
 * The author's colour controls, laid over the visual maps the template and defaults chose: they win.
 * A scheme name ECharts has no palette for leaves the palette as chosen; stops always apply. Bins
 * over the data step at round values ({@link roundColorClasses}), breaking at a diverging field's
 * `pivot`, or centring a `neutral` class on it; over a domain the author stated, at round edges inside it.
 */
export function applyAuthoredColorScaleEC(
    option: any, ctl: AuthoredColorScale, rows: readonly any[] = [], pivot?: number, neutral?: NeutralBand,
): void {
    const maps = Array.isArray(option?.visualMap) ? option.visualMap : option?.visualMap ? [option.visualMap] : [];
    const values = rows.map((row) => row?.[ctl.field]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    for (const vm of maps) {
        const current = vm.inRange?.color;
        if (!Array.isArray(current)) continue;
        let colors: string[] = ctl.stops
            ?? (ctl.scheme ? getPaletteForScheme(ctl.scheme as any) : undefined)
            ?? current;
        if (ctl.bins !== undefined && ctl.bins > 0) {
            vm.type = 'piecewise';
            delete vm.calculable;
            const classes = ctl.domain ? undefined : roundColorClasses(values, ctl.bins, pivot, { exact: true, neutral });
            if (classes) {
                const ramp = ctl.reverse ? [...colors].reverse() : colors;
                const inks = classColors(ramp, classes);
                delete vm.splitNumber;
                if (classes.lo !== undefined && classes.hi !== undefined) {
                    vm.pieces = classPieces(classes.breaks, classes.lo, classes.hi, inks);
                    vm.min = classes.lo;
                    vm.max = classes.hi;
                } else vm.pieces = binPieces(classes.breaks, inks);
                vm.inRange = { ...vm.inRange, color: inks };
                continue;
            }
            colors = resampleStops(colors, ctl.bins);
            // Bins edged at round values, the outer two open, rather than the extent cut into equal parts.
            const lo = Number(ctl.domain?.[0] ?? vm.min);
            const hi = Number(ctl.domain?.[1] ?? vm.max);
            const edges = roundBinEdges(lo, hi, ctl.bins);
            if (edges) {
                delete vm.splitNumber;
                vm.pieces = binPieces(edges, ctl.reverse ? [...colors].reverse() : colors);
                vm.inRange = { ...vm.inRange, color: ctl.reverse ? [...colors].reverse() : colors };
                if (ctl.domain) { vm.min = ctl.domain[0]; vm.max = ctl.domain[1]; }
                continue;
            }
            vm.splitNumber = ctl.bins;
        } else if (ctl.bins === 0 && vm.type === 'piecewise') {
            vm.type = 'continuous';
            delete vm.splitNumber;
        }
        if (ctl.reverse) colors = [...colors].reverse();
        vm.inRange = { ...vm.inRange, color: colors };
        if (ctl.domain) {
            vm.min = ctl.domain[0];
            vm.max = ctl.domain[1];
        }
    }
}

const fmt = (value: number): string => value.toLocaleString('en-US').replace('-', '\u2212');

/** ECharts pieces for bins edged at `edges`, the outer two open, each with its colour and a label in round numbers. */
function binPieces(edges: number[], colors: string[]): any[] {
    const pieces: any[] = [{ lt: edges[0], label: `< ${fmt(edges[0])}`, color: colors[0] }];
    for (let i = 1; i < edges.length; i++) {
        pieces.push({ gte: edges[i - 1], lt: edges[i], label: `${fmt(edges[i - 1])} \u2013 ${fmt(edges[i])}`, color: colors[i] });
    }
    pieces.push({ gte: edges[edges.length - 1], label: `\u2265 ${fmt(edges[edges.length - 1])}`, color: colors[edges.length] });
    return pieces;
}

/** ECharts pieces for classes closed at `lo` and `hi` with `breaks` between, each labelled with its bounds as they are. */
function classPieces(breaks: number[], lo: number, hi: number, colors: string[]): any[] {
    const edges = [lo, ...breaks, hi];
    const exact = exactFormat(edges);
    const print = (value: number) => printFormatted(value, exact).replace('-', '\u2212');
    return colors.map((color, i) => ({
        gte: edges[i],
        ...(i === colors.length - 1 ? { lte: edges[i + 1] } : { lt: edges[i + 1] }),
        label: `${print(edges[i])} \u2013 ${print(edges[i + 1])}`,
        color,
    }));
}
