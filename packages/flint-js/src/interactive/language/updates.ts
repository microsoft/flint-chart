import type {
    ChartUpdateOp,
    SemanticTargetSelector,
    UpdateTarget,
} from '../../core/interaction-contracts';

export type {
    AnnotationCandidate,
    AnnotationConnection,
    AnnotationConnectorAnchor,
    AnnotationSpec,
    ChartUpdate,
    ChartUpdateOp,
    StyleSpec,
    SemanticTargetRef,
    SemanticTargetSelector,
    UpdateDomain,
    UpdateTarget,
} from '../../core/interaction-contracts';

export interface ChartUpdateResult {
    status: 'applied' | 'partially-applied' | 'unsupported';
    resolvedTargets: number;
    unresolvedTargets: readonly UpdateTarget[];
    unsupportedOps: readonly ChartUpdateOp['op'][];
}

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