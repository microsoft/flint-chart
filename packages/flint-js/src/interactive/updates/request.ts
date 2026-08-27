import type { SemanticTarget } from '../../core/interaction-semantics';
import type {
    InteractionPhase,
    NavigationAxes,
    NavigationDomainGuard,
    NavigationOperation,
    PlotPoint,
    SelectionMode,
} from '../interactions';

export interface SemanticTargetRef {
    visual: SemanticTarget['visual'];
    elements: readonly { key: Record<string, unknown> }[];
}

export interface SemanticTargetSelector {
    select: {
        key: Record<string, unknown>;
        visual?: Partial<SemanticTarget['visual']>;
    };
}

export type UpdateTarget = SemanticTargetRef | SemanticTargetSelector;

export function matchesSemanticTargetSelector(
    selector: SemanticTargetSelector,
    declaredFields: readonly string[],
    value: Readonly<Record<string, unknown>>,
): boolean {
    const entries = Object.entries(selector.select.key);
    return entries.length > 0
        && entries.every(([field]) => declaredFields.includes(field))
        && entries.every(([field, expected]) => Object.is(value[field], expected));
}

export type ChartUpdateRequestOp =
    | {
        op: 'emphasize';
        targets: readonly UpdateTarget[];
        mode: SelectionMode;
        dimOpacity: number;
    }
    | { op: 'annotate'; target: UpdateTarget; text?: string }
    | { op: 'clear-annotation' }
    | {
        op: 'navigate-viewport';
        operation: NavigationOperation;
        axes: NavigationAxes;
        delta?: PlotPoint;
        factor?: number;
        anchor?: PlotPoint;
        domainGuard: NavigationDomainGuard;
    }
    | { op: 'reorder-category'; axis: 'x' | 'y'; field: string; orderedValues: readonly unknown[] }
    | { op: 'reset' };

export interface ChartUpdateRequest {
    updateId: string;
    phase?: InteractionPhase;
    transactionId?: string;
    ops: readonly ChartUpdateRequestOp[];
}

export interface ChartUpdateResult {
    status: 'applied' | 'partially-applied' | 'unsupported';
    resolvedTargets: number;
    unresolvedTargets: readonly UpdateTarget[];
    unsupportedOps: readonly ChartUpdateRequestOp['op'][];
}

export function emphasize(
    options: Omit<Extract<ChartUpdateRequestOp, { op: 'emphasize' }>, 'op' | 'mode' | 'dimOpacity'> & {
        mode?: SelectionMode;
        dimOpacity?: number;
    },
): ChartUpdateRequestOp {
    return {
        op: 'emphasize',
        mode: options.mode ?? 'replace',
        dimOpacity: options.dimOpacity ?? 0.25,
        targets: options.targets,
    };
}

export function annotate(options: Omit<Extract<ChartUpdateRequestOp, { op: 'annotate' }>, 'op'>): ChartUpdateRequestOp {
    return { op: 'annotate', ...options };
}

export function clearAnnotation(): ChartUpdateRequestOp {
    return { op: 'clear-annotation' };
}

export function navigateViewport(
    options: Omit<Extract<ChartUpdateRequestOp, { op: 'navigate-viewport' }>, 'op' | 'domainGuard'> & {
        domainGuard?: NavigationDomainGuard;
    },
): ChartUpdateRequestOp {
    return {
        op: 'navigate-viewport',
        ...options,
        domainGuard: options.domainGuard ?? {
            minVisibleFraction: 0.02,
            maxVisibleFraction: 1,
            overscrollFraction: 0,
        },
    };
}

export function resetUpdate(): ChartUpdateRequestOp {
    return { op: 'reset' };
}