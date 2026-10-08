import type {
    ChartUpdate,
    ChartUpdateOp,
    DomainCoordinate,
    SemanticElement,
    SemanticTargetSelector,
    UpdateDomain,
    UpdateTarget,
} from '../../core/interaction-contracts';

export type {
    AnnotationCandidate,
    AnnotationConnection,
    AnnotationConnectorAnchor,
    AnnotationSpec,
    ChartUpdate,
    ChartUpdateOp,
    ChartOverlaySpec,
    FreeformOverlayBody,
    FreeformCloneBody,
    FreeformOverlaySpec,
    FreeformOverlayTransform,
    FreeformSvgBody,
    OverlayFieldEncoding,
    OverlayMark,
    OverlayStyleSpec,
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

/**
 * The update a selection preset writes, for a host that sets the same state:
 * emphasis on the given elements or on the marks matching a key, and every
 * other mark dimmed. `null` or no elements clears the selection.
 */
export function selectionUpdate(
    id: string,
    selection: readonly SemanticElement[] | Readonly<Record<string, unknown>> | null,
    options: { dimOpacity?: number } = {},
): ChartUpdate {
    const keys = selection === null
        ? []
        : Array.isArray(selection)
            ? (selection as readonly SemanticElement[]).map((element) => element.value)
            : [selection as Readonly<Record<string, unknown>>];
    const targets: UpdateTarget[] = keys
        .filter((key) => Object.keys(key).length > 0)
        .map((key) => ({ select: { key: { ...key } } }));
    return {
        id,
        ops: [{
            op: 'set-style',
            targets,
            value: targets.length > 0
                ? { state: 'emphasized', mutedOpacity: options.dimOpacity ?? 0.25 }
                : { state: 'normal' },
        }],
    };
}

function updateDomain(coordinate: DomainCoordinate | UpdateDomain | undefined): UpdateDomain | undefined {
    if (!coordinate) return undefined;
    if (Array.isArray(coordinate)) return coordinate as UpdateDomain;
    const single = coordinate as DomainCoordinate;
    return single.kind === 'interval' ? [single.start, single.end] : undefined;
}

/**
 * The update a navigation preset writes, for a host that sets the same viewport.
 * Takes `[start, end]` per axis or a `ChartState.viewport`; `null` returns home.
 */
export function viewportUpdate(
    id: string,
    viewport: { x?: DomainCoordinate | UpdateDomain; y?: DomainCoordinate | UpdateDomain } | null,
): ChartUpdate {
    const x = updateDomain(viewport?.x);
    const y = updateDomain(viewport?.y);
    const axes = x && y ? 'xy' : y ? 'y' : 'x';
    return {
        id,
        ops: [{
            op: 'set-viewport',
            axes: viewport === null ? 'xy' : axes,
            value: { ...(x ? { x } : {}), ...(y ? { y } : {}) },
        }],
    };
}