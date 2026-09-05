import type { PlotAngularSector, PlotPoint } from '../language/events';
import { TAU } from '../geometry/angular';

export interface PolarFrame {
    center: PlotPoint;
    innerRadius: number;
    outerRadius: number;
}

export function polarPointerAngle(point: PlotPoint, frame: PolarFrame): number {
    return Math.atan2(point.x - frame.center.x, frame.center.y - point.y);
}

export class AngularRegionSession {
    private previousAngle: number;
    private sweep = 0;
    private readonly startAngle: number;

    constructor(
        start: PlotPoint,
        readonly frame: PolarFrame,
    ) {
        this.startAngle = polarPointerAngle(start, frame);
        this.previousAngle = this.startAngle;
    }

    move(point: PlotPoint): void {
        const angle = polarPointerAngle(point, this.frame);
        this.sweep = Math.min(TAU, Math.max(-TAU, this.sweep + Math.atan2(
            Math.sin(angle - this.previousAngle),
            Math.cos(angle - this.previousAngle),
        )));
        this.previousAngle = angle;
    }

    dragDistance(): number {
        return Math.abs(this.sweep) * this.frame.outerRadius;
    }

    sector(): PlotAngularSector {
        return {
            center: this.frame.center,
            innerRadius: this.frame.innerRadius,
            outerRadius: this.frame.outerRadius,
            startAngle: this.startAngle,
            endAngle: this.startAngle + this.sweep,
        };
    }
}
