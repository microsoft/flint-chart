import type { PlotPoint } from '../language/events';

export interface PlotSize {
    width: number;
    height: number;
}

export class PanSession {
    private previous: PlotPoint;
    private totalDistance = 0;

    constructor(start: PlotPoint, private readonly plotSize: PlotSize) {
        this.previous = start;
    }

    move(point: PlotPoint): PlotPoint {
        const pixelDelta = { x: point.x - this.previous.x, y: point.y - this.previous.y };
        this.previous = point;
        this.totalDistance += Math.hypot(pixelDelta.x, pixelDelta.y);
        return {
            x: this.plotSize.width > 0 ? pixelDelta.x / this.plotSize.width : 0,
            y: this.plotSize.height > 0 ? pixelDelta.y / this.plotSize.height : 0,
        };
    }

    dragDistance(): number {
        return this.totalDistance;
    }
}

export function wheelZoomFactor(
    deltaY: number,
    deltaMode: number,
    viewportHeight: number,
    sensitivity: number,
): number {
    const pixels = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * viewportHeight : deltaY;
    return Math.exp(-pixels * sensitivity);
}
