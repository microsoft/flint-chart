import type { SemanticElement } from '../../core/interaction-semantics';
import type { PlotPoint } from './geometry';
import type { PlotRect } from './geometry';

/** Projection supplied by a rendered path visual for a freeform pointer position. */
export interface PathProjection {
    kind: 'path';
    point: PlotPoint;
    distance: number;
    segment: {
        start: SemanticElement;
        end: SemanticElement;
        t: number;
    };
}

/** Projection of a pointer and semantic drop target onto one chart axis. */
export interface AxisProjection {
    kind: 'axis';
    axis: 'x' | 'y';
    point: PlotPoint;
    targetBounds: PlotRect;
    plotBounds: PlotRect;
}

/** Backend-neutral projection supplied by the visual acquired for a gesture. */
export type VisualProjection = PathProjection | AxisProjection;