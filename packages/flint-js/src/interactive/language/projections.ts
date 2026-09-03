import type { SemanticElement } from '../../core/interaction-semantics';
import type { PlotPoint } from './geometry';

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

/** Backend-neutral projection supplied by the visual acquired for a gesture. */
export type VisualProjection = PathProjection;