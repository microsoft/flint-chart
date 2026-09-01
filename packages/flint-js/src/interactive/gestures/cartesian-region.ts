import type { PlotPoint, RegionAxis, RegionOperation } from '../language/events';

export type CartesianRegionAxis = Extract<RegionAxis, 'x' | 'y' | 'xy'>;
export type IntervalOperation = Exclude<RegionOperation, 'clear'>;

export interface PlotSize {
    width: number;
    height: number;
}

export interface Interval {
    leading: number;
    trailing: number;
}

export function constrainCartesianRegion(
    start: PlotPoint,
    end: PlotPoint,
    axis: CartesianRegionAxis,
    plotSize: PlotSize,
): { start: PlotPoint; end: PlotPoint } {
    return {
        start: { x: axis === 'y' ? 0 : start.x, y: axis === 'x' ? 0 : start.y },
        end: { x: axis === 'y' ? plotSize.width : end.x, y: axis === 'x' ? plotSize.height : end.y },
    };
}

export function cartesianDragDistance(start: PlotPoint, end: PlotPoint, axis: CartesianRegionAxis): number {
    if (axis === 'x') return Math.abs(end.x - start.x);
    if (axis === 'y') return Math.abs(end.y - start.y);
    return Math.hypot(end.x - start.x, end.y - start.y);
}

export function axisValue(point: PlotPoint, axis: Exclude<CartesianRegionAxis, 'xy'>): number {
    return axis === 'y' ? point.y : point.x;
}

export function intervalPoints(
    interval: Interval,
    axis: Exclude<CartesianRegionAxis, 'xy'>,
): { start: PlotPoint; end: PlotPoint } {
    return axis === 'y'
        ? { start: { x: 0, y: interval.leading }, end: { x: 0, y: interval.trailing } }
        : { start: { x: interval.leading, y: 0 }, end: { x: interval.trailing, y: 0 } };
}

export function updateInterval(
    point: PlotPoint,
    start: PlotPoint,
    axis: Exclude<CartesianRegionAxis, 'xy'>,
    limit: number,
    operation: IntervalOperation,
    initial?: Interval,
): Interval {
    const value = axisValue(point, axis);
    if (!initial || operation === 'create') {
        const anchor = axisValue(start, axis);
        return { leading: Math.min(anchor, value), trailing: Math.max(anchor, value) };
    }
    if (operation === 'move') {
        const width = initial.trailing - initial.leading;
        const delta = value - axisValue(start, axis);
        const leading = Math.max(0, Math.min(limit - width, initial.leading + delta));
        return { leading, trailing: leading + width };
    }
    const leading = operation === 'resize-leading' ? value : initial.leading;
    const trailing = operation === 'resize-trailing' ? value : initial.trailing;
    return {
        leading: Math.max(0, Math.min(limit, Math.min(leading, trailing))),
        trailing: Math.max(0, Math.min(limit, Math.max(leading, trailing))),
    };
}
