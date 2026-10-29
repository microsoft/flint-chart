import { resampleStops, roundBinEdges, type AuthoredColorScale } from '../core/color-controls';
import { getPaletteForScheme } from './colormap';

/**
 * The author's colour controls, laid over the visual maps the template and defaults chose: they win.
 * A scheme name ECharts has no palette for leaves the palette as chosen; stops always apply.
 */
export function applyAuthoredColorScaleEC(option: any, ctl: AuthoredColorScale): void {
    const maps = Array.isArray(option?.visualMap) ? option.visualMap : option?.visualMap ? [option.visualMap] : [];
    for (const vm of maps) {
        const current = vm.inRange?.color;
        if (!Array.isArray(current)) continue;
        let colors: string[] = ctl.stops
            ?? (ctl.scheme ? getPaletteForScheme(ctl.scheme as any) : undefined)
            ?? current;
        if (ctl.bins !== undefined && ctl.bins > 0) {
            vm.type = 'piecewise';
            delete vm.calculable;
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
