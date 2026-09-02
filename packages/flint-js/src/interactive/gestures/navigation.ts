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

export class PinchSession {
    private previousDistance: number;

    constructor(
        first: PlotPoint,
        second: PlotPoint,
        private readonly plotSize: PlotSize,
    ) {
        this.previousDistance = Math.hypot(second.x - first.x, second.y - first.y);
    }

    move(first: PlotPoint, second: PlotPoint): { factor: number; anchor: PlotPoint } | null {
        const distance = Math.hypot(second.x - first.x, second.y - first.y);
        if (distance <= 0 || this.previousDistance <= 0) {
            this.previousDistance = distance;
            return null;
        }
        const factor = distance / this.previousDistance;
        this.previousDistance = distance;
        const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
        return {
            factor,
            anchor: {
                x: this.plotSize.width > 0 ? midpoint.x / this.plotSize.width : 0.5,
                y: this.plotSize.height > 0 ? midpoint.y / this.plotSize.height : 0.5,
            },
        };
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
