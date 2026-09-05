import type { ChartInteractionResolver } from '../../core/interaction-semantics';
import {
    isCanvasInteraction,
    type ChartUpdatePresenter,
    type InteractionContext,
    type InteractionDef,
} from '../../interactive/interactions';
import { toCanvasInteractionEvent } from '../../interactive/canvas-interaction';
import { DEFAULT_DIM_OPACITY } from '../../interactive/presets/utils';
import { INTERACTION_PROVENANCE, type InteractionProvenance } from '../interaction-provenance';
import type {
    HoverStyle,
    SelectionBoundaryStyle,
    ContinuousColorFocusStyle,
    SelectionStyle,
    VegaInteractionPlan,
} from './contracts';
import {
    INTERACTION_KEY,
    INTERACTION_LEGEND_CHANNEL,
    INTERACTION_LEGEND_FIELD,
    INTERACTION_ROLE,
    PATH_KEY_SUFFIX,
} from './hit-adapter';
import {
    HIDDEN_STORE,
    LEGEND_HIDDEN_STORE,
    HOVER_STORE,
    INTERACTION_STORE,
    LEGEND_HOVER_STORE,
    AXIS_HOVER_STORE,
    LEGEND_SELECTION_STORE,
    STYLE_SIGNAL,
} from './stores';

const CLEAR_MARK = '__flint_interaction_clear';
const LEGEND_ENTRY_MARK = '__flint_legend_entry';
const SUPPORTED_SPEC_MARKS = new Set(['arc', 'area', 'bar', 'boxplot', 'circle', 'geoshape', 'line', 'point', 'rect', 'rule', 'tick']);

interface TemplateInteractionSemantics {
    fields: string[];
    sourceRecords?: readonly Record<string, unknown>[];
    provenanceFields?: readonly string[];
    temporalProvenanceFields?: readonly string[];
    rangeProvenance?: readonly { field: string; startField: string; endField: string }[];
    categoryField?: string;
    seriesField?: string;
    resolveGroupValue?: InteractionContext['resolveGroupValue'];
    legendFields?: Record<string, string>;
    axisFields?: Partial<Record<'x' | 'y', { field: string; type: string }>>;
    rangeLegendChannels?: readonly string[];
    selectableMarks: string[];
    annotationMarkType?: string;
    supportedRegionGestures?: ('cartesian' | 'angular')[];
    navigationAxes?: ('x' | 'y')[];
    reorderAxis?: { axis: 'x' | 'y'; field: string; includeConnectiveMarks?: boolean; markTypes?: readonly string[] };
    reorderAxes?: readonly { axis: 'x' | 'y'; field: string; includeConnectiveMarks?: boolean; markTypes?: readonly string[] }[];
    renderHoverStyles?: Record<string, HoverStyle>;
    renderSelectionStyles?: Record<string, SelectionStyle>;
    selectionBoundary?: SelectionBoundaryStyle;
    continuousColorFocus?: ContinuousColorFocusStyle;
    neutralizeContinuousColor?: boolean;
    resolve?: ChartInteractionResolver;
    presentUpdate?: ChartUpdatePresenter;
}

export function withoutSemanticInteractionField(value: unknown): unknown {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
        .filter(([field]) => field !== '_vgsid_' && !field.startsWith('__')));
}

function markType(mark: unknown): string | undefined {
    return typeof mark === 'string'
        ? mark
        : typeof mark === 'object' && mark !== null
            ? (mark as Record<string, unknown>).type as string | undefined
            : undefined;
}

function expandInteractiveLinePoints(spec: Record<string, any>): void {
    const type = markType(spec.mark);
    if (type === 'line' && typeof spec.mark === 'object' && spec.mark.point) {
        const lineMark = { ...spec.mark };
        const point = lineMark.point;
        delete lineMark.point;
        spec.layer = [
            { mark: lineMark },
            { mark: typeof point === 'object' ? { type: 'point', ...point } : { type: 'point', filled: true } },
        ];
        delete spec.mark;
    }
    for (const property of ['layer', 'hconcat', 'vconcat', 'concat'] as const) {
        if (!Array.isArray(spec[property])) continue;
        for (const child of spec[property]) expandInteractiveLinePoints(child);
    }
}

function keyExpression(fields: readonly string[]): string {
    return fields
    .map((field) => `replace(toString(datum[${JSON.stringify(field)}]), '|', '\\|')`)
        .join(` + '|' + `);
}

function instrumentNode(
    node: Record<string, any>,
    inherited: Record<string, any>,
    semanticFields: readonly string[],
    dimOpacity: number,
    continuousColorFocus: ContinuousColorFocusStyle | undefined,
    selectableMarks: ReadonlySet<string>,
): boolean {
    const type = markType(node.mark);
    const selectable = !!type && SUPPORTED_SPEC_MARKS.has(type) && selectableMarks.has(type);
    const provenance = node[INTERACTION_PROVENANCE] as InteractionProvenance | undefined;
    if (provenance?.role === 'decorative') return false;
    const textLabel = provenance?.role === 'text-label';
    const legendLabel = provenance?.role === 'legend-label';
    if (!selectable && !textLabel && !legendLabel) return false;
    if (textLabel || legendLabel) {
        const identityFields = provenance.identity === 'inherit'
            ? semanticFields
            : provenance.identity.fields;
        node.transform = [
            ...(Array.isArray(node.transform) ? node.transform : []),
            ...keyTransforms(identityFields),
            { calculate: `'${provenance.role}'`, as: INTERACTION_ROLE },
            ...(legendLabel && provenance.legend ? [
                { calculate: JSON.stringify(provenance.legend.channel), as: INTERACTION_LEGEND_CHANNEL },
                { calculate: JSON.stringify(provenance.legend.field), as: INTERACTION_LEGEND_FIELD },
            ] : []),
        ];
    }
    const encoding = { ...inherited, ...(node.encoding ?? {}) };
    const encodedOpacity = encoding.opacity;
    const encodedColor = encoding.color;
    const continuousColor = continuousColorFocus
        && encodedColor?.field
        && (encodedColor.type === 'quantitative' || encodedColor.type === 'temporal')
        && !encodedColor.condition;
    const dataDrivenOpacity = encodedOpacity?.field && !encodedOpacity.condition;
    if ((textLabel || legendLabel) && provenance.presentation === 'on-mark') return true;
    if ((encodedOpacity && typeof encodedOpacity.value !== 'number' && !dataDrivenOpacity)
        || encoding.fillOpacity || encoding.strokeOpacity) return false;
    const authoredOpacity = typeof encodedOpacity?.value === 'number'
        ? encodedOpacity.value
        : typeof node.mark === 'object' && typeof node.mark.opacity === 'number'
        ? node.mark.opacity
        : 1;
    if (typeof node.mark === 'object' && typeof node.mark.opacity === 'number') {
        node.mark = { ...node.mark };
        delete node.mark.opacity;
    }
    const isPath = type === 'line' || type === 'area';
    const hoverTest = `indata('${HOVER_STORE}', 'key', datum.${INTERACTION_KEY})`;
    const existingDetail = node.encoding?.detail;
    const selectionTest = isPath
        ? `!length(data('${INTERACTION_STORE}'))`
        : `!length(data('${INTERACTION_STORE}')) || indata('${INTERACTION_STORE}', 'key', datum.${INTERACTION_KEY})`;
    node.encoding = {
        ...(node.encoding ?? {}),
        ...(isPath ? {} : {
            detail: existingDetail == null
                ? { field: INTERACTION_KEY, type: 'nominal' }
                : [...(Array.isArray(existingDetail) ? existingDetail : [existingDetail]), { field: INTERACTION_KEY, type: 'nominal' }],
        }),
        ...(continuousColor ? {
            color: {
                ...(encodedColor.legend !== undefined ? { legend: encodedColor.legend } : {}),
                condition: {
                    test: `${selectionTest} || ${hoverTest}`,
                    ...Object.fromEntries(Object.entries(encodedColor).filter(([key]) => key !== 'legend')),
                },
                value: continuousColorFocus.mutedFill,
            },
        } : {}),
        opacity: continuousColor ? { value: authoredOpacity } : dataDrivenOpacity ? {
            condition: { test: selectionTest, ...encodedOpacity },
            value: dimOpacity,
        } : {
            condition: {
                test: `${selectionTest} || ${hoverTest}`,
                value: authoredOpacity,
            },
            value: Math.min(dimOpacity, authoredOpacity),
        },
    };
    return true;
}

function instrumentMarks(
    spec: Record<string, any>,
    inherited: Record<string, any>,
    semanticFields: readonly string[],
    dimOpacity: number,
    continuousColorFocus: ContinuousColorFocusStyle | undefined,
    selectableMarks: ReadonlySet<string>,
): boolean {
    const encoding = { ...inherited, ...(spec.encoding ?? {}) };
    let instrumented = instrumentNode(
        spec,
        inherited,
        semanticFields,
        dimOpacity,
        continuousColorFocus,
        selectableMarks,
    );
    for (const property of ['layer', 'hconcat', 'vconcat', 'concat'] as const) {
        if (!Array.isArray(spec[property])) continue;
        for (const child of spec[property]) {
            instrumented = instrumentMarks(
                child,
                encoding,
                semanticFields,
                dimOpacity,
                continuousColorFocus,
                selectableMarks,
            ) || instrumented;
        }
    }
    if (spec.spec && typeof spec.spec === 'object') {
        instrumented = instrumentMarks(
            spec.spec,
            encoding,
            semanticFields,
            dimOpacity,
            continuousColorFocus,
            selectableMarks,
        ) || instrumented;
    }
    return instrumented;
}

function inlineRows(spec: Record<string, any>): Record<string, any>[] {
    if (Array.isArray(spec?.data?.values)) return spec.data.values;
    for (const property of ['layer', 'hconcat', 'vconcat', 'concat'] as const) {
        if (!Array.isArray(spec[property])) continue;
        for (const child of spec[property]) {
            const rows = inlineRows(child);
            if (rows.length > 0) return rows;
        }
    }
    return spec.spec && typeof spec.spec === 'object' ? inlineRows(spec.spec) : [];
}

function pinChannelDomain(
    spec: Record<string, any>,
    channel: string,
    field: string,
    rows: readonly Record<string, any>[],
): void {
    const encoding = spec.encoding?.[channel];
    if (encoding && encoding.field === field && encoding.scale?.domain === undefined) {
        const values = [...new Set(rows.map((row) => row?.[field]).filter((value) => value !== undefined))];
        const sort = encoding.sort;
        if (Array.isArray(sort)) {
            const order = new Map(sort.map((value: unknown, index: number) => [value, index]));
            values.sort((left, right) => (order.get(left) ?? Number.POSITIVE_INFINITY)
                - (order.get(right) ?? Number.POSITIVE_INFINITY));
        } else if (sort && typeof sort === 'object') {
            const grouped = new Map<unknown, number[]>();
            for (const row of rows) {
                const key = row?.[field];
                const value = sort.op === 'count' ? 1 : Number(row?.[sort.field]);
                if (key === undefined || !Number.isFinite(value)) continue;
                grouped.set(key, [...(grouped.get(key) ?? []), value]);
            }
            const aggregate = (key: unknown): number => {
                const entries = grouped.get(key) ?? [];
                if (sort.op === 'count') return entries.length;
                if (sort.op === 'min') return Math.min(...entries);
                if (sort.op === 'max') return Math.max(...entries);
                if (sort.op === 'mean' || sort.op === 'average') {
                    return entries.reduce((sum, value) => sum + value, 0) / entries.length;
                }
                return entries.reduce((sum, value) => sum + value, 0);
            };
            const direction = sort.order === 'ascending' ? 1 : -1;
            values.sort((left, right) => direction * (aggregate(left) - aggregate(right)));
        } else {
            values.sort((left, right) => (left as any) < (right as any) ? -1 : (left as any) > (right as any) ? 1 : 0);
            if (sort === 'descending') values.reverse();
        }
        const continuous = encoding.type === 'quantitative' || encoding.type === 'temporal';
        const domain = continuous && values.length > 1
            ? [values[0], values[values.length - 1]]
            : values;
        encoding.scale = { ...(encoding.scale ?? {}), domain };
    }
    for (const property of ['layer', 'hconcat', 'vconcat', 'concat'] as const) {
        if (!Array.isArray(spec[property])) continue;
        for (const child of spec[property]) pinChannelDomain(child, channel, field, rows);
    }
    if (spec.spec && typeof spec.spec === 'object') pinChannelDomain(spec.spec, channel, field, rows);
}

/**
 * Hiding filters rows, which would otherwise shrink the legend and strand the hidden series
 * with no key left to click. Pinning the domain keeps every series listed.
 */
function pinLegendDomains(
    spec: Record<string, any>,
    legendFields: Readonly<Record<string, string>> | undefined,
): void {
    const rows = inlineRows(spec);
    if (rows.length === 0) return;
    for (const [channel, field] of Object.entries(legendFields ?? {})) {
        if (channel === 'size' || channel === 'opacity') continue;
        const values = [...new Set(rows.map((row) => row?.[field]).filter((value) => value !== undefined))];
        if (values.length === 0 || values.some((value) => typeof value !== 'string' && typeof value !== 'number')) continue;
        pinChannelDomain(spec, channel === 'color' ? 'color' : channel, field, rows);
    }
}

function keyTransforms(fields: readonly string[]): Record<string, any>[] {
    return [
        { calculate: keyExpression(fields), as: INTERACTION_KEY },
        // Hiding filters rows rather than blanking marks, so implicit domains, stacks and
        // aggregates redraw against what is left. Domains Flint pinned explicitly are unaffected.
        { filter: `!(length(data('${HIDDEN_STORE}')) && indata('${HIDDEN_STORE}', 'key', datum.${INTERACTION_KEY}))` },
    ];
}

function addLocalKeyTransforms(
    spec: Record<string, any>,
    fields: readonly string[],
    selectableMarks: ReadonlySet<string>,
): void {
    const type = markType(spec.mark);
    const provenance = spec[INTERACTION_PROVENANCE] as InteractionProvenance | undefined;
    if (provenance?.role === 'decorative') return;
    // A composition can hoist `data` to an ancestor, so a unit is keyed on its
    // own mark rather than on owning a data source.
    if (type && SUPPORTED_SPEC_MARKS.has(type) && selectableMarks.has(type)) {
        spec.transform = [
            ...(Array.isArray(spec.transform) ? spec.transform : []),
            ...keyTransforms(fields),
        ];
    }
    for (const property of ['layer', 'hconcat', 'vconcat', 'concat'] as const) {
        if (!Array.isArray(spec[property])) continue;
        for (const child of spec[property]) addLocalKeyTransforms(child, fields, selectableMarks);
    }
    if (spec.spec && typeof spec.spec === 'object') {
        addLocalKeyTransforms(spec.spec, fields, selectableMarks);
    }
}

function stripInteractionProvenance(spec: Record<string, any>): void {
    delete spec[INTERACTION_PROVENANCE];
    for (const property of ['layer', 'hconcat', 'vconcat', 'concat'] as const) {
        if (!Array.isArray(spec[property])) continue;
        for (const child of spec[property]) stripInteractionProvenance(child);
    }
    if (spec.spec && typeof spec.spec === 'object') stripInteractionProvenance(spec.spec);
}

function clipNavigableMarks(spec: Record<string, any>): void {
    if (spec.mark !== undefined) {
        spec.mark = typeof spec.mark === 'string'
            ? { type: spec.mark, clip: true }
            : { ...spec.mark, clip: true };
    }
    for (const property of ['layer', 'hconcat', 'vconcat', 'concat'] as const) {
        if (!Array.isArray(spec[property])) continue;
        for (const child of spec[property]) clipNavigableMarks(child);
    }
}

export function addVegaLiteInteractions(
    spec: Record<string, any>,
    interactions: readonly InteractionDef[],
    enableSemanticUpdates = false,
): VegaInteractionPlan | null {
    if (interactions.length === 0 && !enableSemanticUpdates) return null;
    const canvasInteractions = interactions.filter(isCanvasInteraction);
    const templateSemantics = spec._interactionSemantics as TemplateInteractionSemantics | undefined;
    delete spec._interactionSemantics;
    if (!templateSemantics) {
        const builtInInteraction = canvasInteractions[0];
        if (builtInInteraction) {
            throw new Error(`Interaction "${builtInInteraction.id}" requires chart interaction semantics.`);
        }
        return null;
    }
    const navigationInteraction = canvasInteractions.find(
        (interaction) => interaction.eventSource.type === 'navigation',
    );
    const declaredReorderAxes = templateSemantics.reorderAxes
        ?? (templateSemantics.reorderAxis ? [templateSemantics.reorderAxis] : []);
    const hasElementDrag = canvasInteractions.some(
        (interaction) => interaction.eventSource.type === 'element'
            && interaction.eventSource.gesture === 'drag',
    );
    const semanticGestureInteraction = canvasInteractions.find(
        (interaction) => interaction.eventSource.type === 'element'
            || interaction.eventSource.type === 'region',
    );
    if (semanticGestureInteraction
        && !templateSemantics.resolve
        && templateSemantics.fields.length === 0
        && templateSemantics.selectableMarks.length === 0) {
        throw new Error(`Interaction "${semanticGestureInteraction.id}" requires chart element semantics.`);
    }
    const semanticInteractions = canvasInteractions.filter(
        (interaction) => interaction.eventSource.type !== 'navigation',
    );
    const presentationInteractions = semanticInteractions.filter(
        (interaction) => !interaction.eventSource.viewport,
    );
    const needsSemanticPresentation = enableSemanticUpdates
        || presentationInteractions.length > 0
        || canvasInteractions.length < interactions.length;
    if (navigationInteraction?.eventSource.pan
        && semanticInteractions.some((interaction) => interaction.eventSource.gesture === 'drag')) {
        throw new Error('Pan navigation cannot share an unmodified drag gesture with a region interaction.');
    }
    const availableNavigationAxes = templateSemantics.navigationAxes ?? [];
    // A region interaction can drive the viewport, which still needs domain signals.
    const viewportRegion = canvasInteractions.find((interaction) => interaction.eventSource.viewport);
    const requestedNavigationAxes = navigationInteraction
        ? navigationInteraction.eventSource.axes === 'available'
            ? availableNavigationAxes
            : navigationInteraction.eventSource.axes === 'xy'
            ? ['x', 'y'] as const
            : [navigationInteraction.eventSource.axes as 'x' | 'y']
        : viewportRegion
            ? availableNavigationAxes
            : [];
    const unsupportedNavigationAxes = requestedNavigationAxes.filter(
        (axis) => !availableNavigationAxes.includes(axis),
    );
    if (navigationInteraction && requestedNavigationAxes.length === 0) {
        throw new Error(`Interaction "${navigationInteraction.id}" requires a chart with a navigable continuous axis.`);
    }
    if (unsupportedNavigationAxes.length > 0) {
        throw new Error(
            `Interaction "${navigationInteraction?.id}" requested unsupported navigation axis: ${unsupportedNavigationAxes.join(', ')}.`,
        );
    }
    const angularInteraction = canvasInteractions.find(
        (interaction) => interaction.eventSource.regionGeometry === 'angular',
    );
    if (angularInteraction && !templateSemantics.supportedRegionGestures?.includes('angular')) {
        throw new Error(
            `Interaction "${angularInteraction.id}" requires a polar chart with angular-region support.`,
        );
    }
    const selectableMarks = new Set(templateSemantics.selectableMarks ?? SUPPORTED_SPEC_MARKS);
    const fields = templateSemantics.fields ?? [];
    if (needsSemanticPresentation) expandInteractiveLinePoints(spec);
    if (navigationInteraction || viewportRegion) clipNavigableMarks(spec);

    const dimOpacity = presentationInteractions.reduce((value, interaction) => {
        if (!interaction.handle) return value;
        const semanticEvent = {
            type: 'semantic',
            source: interaction.eventSource.type === 'region' ? 'region' : 'element',
            phase: 'commit',
            target: {
                visual: { kind: 'mark', role: 'probe' },
                elements: [{ value: {} }],
            },
        } as const;
        const interactionContext = { chartType: 'Unknown', selected: [] };
        const update = interaction.handle(toCanvasInteractionEvent(semanticEvent, interaction.eventSource), interactionContext);
        const style = update?.ops.find((op) => op.op === 'set-style');
        return style?.op === 'set-style'
            ? Math.min(value, style.value.mutedOpacity ?? DEFAULT_DIM_OPACITY)
            : value;
    }, DEFAULT_DIM_OPACITY);

    const instrumented = needsSemanticPresentation
        ? instrumentMarks(
            spec, {}, fields, dimOpacity,
            templateSemantics.neutralizeContinuousColor ? templateSemantics.continuousColorFocus : undefined,
            selectableMarks,
        )
        : false;
    if (needsSemanticPresentation && !instrumented) return null;
    if (instrumented) addLocalKeyTransforms(spec, fields, selectableMarks);
    if (instrumented && canvasInteractions.some((interaction) => interaction.claimsLegendActivation)) {
        pinLegendDomains(spec, templateSemantics.legendFields);
    }
    stripInteractionProvenance(spec);
    if (instrumented) {
        spec.transform = [
            ...(Array.isArray(spec.transform) ? spec.transform : []),
            ...keyTransforms(fields),
        ];
    }
    return {
        fields,
        sourceRecords: templateSemantics.sourceRecords ?? inlineRows(spec).map((record) => ({ ...record })),
        provenanceFields: templateSemantics.provenanceFields ?? fields,
        temporalProvenanceFields: templateSemantics.temporalProvenanceFields ?? [],
        rangeProvenance: templateSemantics.rangeProvenance ?? [],
        categoryField: templateSemantics.categoryField,
        seriesField: templateSemantics.seriesField,
        resolveGroupValue: templateSemantics.resolveGroupValue,
        legendFields: templateSemantics.legendFields,
        axisFields: templateSemantics.axisFields,
        rangeLegendChannels: templateSemantics.rangeLegendChannels,
        annotationMarkType: templateSemantics.annotationMarkType,
        semanticStores: instrumented,
        dimOpacity,
        renderHoverStyles: templateSemantics.renderHoverStyles,
        renderSelectionStyles: templateSemantics.renderSelectionStyles,
        selectionBoundary: templateSemantics.selectionBoundary,
        continuousColorFocus: templateSemantics.continuousColorFocus,
        navigationChannels: [...requestedNavigationAxes],
        angularXBrush: templateSemantics.supportedRegionGestures?.includes('angular') ?? false,
        reorderAxis: hasElementDrag && declaredReorderAxes[0]
            ? { ...declaredReorderAxes[0], scale: '', signal: '' }
            : undefined,
        reorderAxes: hasElementDrag
            ? declaredReorderAxes.map((axis) => ({ ...axis, scale: '', signal: '' }))
            : [],
        resolve: templateSemantics.resolve,
        presentUpdate: templateSemantics.presentUpdate,
    };
}

/**
 * Composed specs (a themed `vconcat`, for example) rename `x` to `concat_0_x`,
 * so an axis is matched by suffix when it is unambiguous.
 */
export function findVegaAxisScale(
    vegaSpec: Record<string, any>,
    axis: 'x' | 'y',
): Record<string, any> | undefined {
    const scales: any[] = vegaSpec.scales ?? [];
    const exact = scales.find((candidate) => candidate.name === axis);
    if (exact) return exact;
    const suffixed = scales.filter((candidate) => typeof candidate.name === 'string'
        && candidate.name.endsWith(`_${axis}`));
    return suffixed.length === 1 ? suffixed[0] : undefined;
}

export function injectVegaReorderSignal(
    vegaSpec: Record<string, any>,
    reorderAxis: { axis: 'x' | 'y'; field: string; includeConnectiveMarks?: boolean; markTypes?: readonly string[] } | undefined,
): import('./contracts').VegaReorderAxis | undefined {
    if (!reorderAxis) return undefined;
    const scale = findVegaAxisScale(vegaSpec, reorderAxis.axis);
    if (!scale || !['band', 'point', 'ordinal'].includes(scale.type)) {
        throw new Error(`Vega category reorder requires a top-level discrete "${reorderAxis.axis}" scale.`);
    }
    const signal = `__flint_reorder_${reorderAxis.axis}_domain`;
    vegaSpec.signals = [...(vegaSpec.signals ?? []), { name: signal, value: null }];
    scale.domainRaw = { signal };
    return { ...reorderAxis, scale: scale.name, signal };
}

export function injectVegaNavigationSignals(
    vegaSpec: Record<string, any>,
    channels: readonly ('x' | 'y')[] = [],
): Partial<Record<'x' | 'y', import('./contracts').VegaNavigationAxis>> {
    const result: Partial<Record<'x' | 'y', import('./contracts').VegaNavigationAxis>> = {};
    for (const channel of channels) {
        const scale = findVegaAxisScale(vegaSpec, channel);
        if (!scale || !['linear', 'log', 'time', 'utc'].includes(scale.type)) {
            throw new Error(`Vega navigation requires a top-level continuous "${channel}" scale.`);
        }
        const signal = `__flint_navigation_${channel}_domain`;
        vegaSpec.signals = [...(vegaSpec.signals ?? []), { name: signal, value: null }];
        scale.domainRaw = { signal };
        result[channel] = { scale: scale.name, signal, type: scale.type };
    }
    return result;
}

export function collectVegaAxisTargets(
    vegaSpec: Record<string, any>,
    axisFields: VegaInteractionPlan['axisFields'],
    reorderAxes: readonly Pick<import('./contracts').VegaReorderAxis, 'axis' | 'field'>[] = [],
    hoverColor?: string,
): Record<string, import('./contracts').VegaAxisTarget> {
    const targets: Record<string, import('./contracts').VegaAxisTarget> = {};
    const visit = (scope: Record<string, any>): void => {
        for (const axis of scope.axes ?? []) {
            const channel = axis.orient === 'top' || axis.orient === 'bottom' ? 'x'
                : axis.orient === 'left' || axis.orient === 'right' ? 'y' : undefined;
            const field = channel ? axisFields?.[channel] : undefined;
            if (!channel || !field || typeof axis.scale !== 'string') continue;
            targets[axis.scale] = { axis: channel, ...field };
            const hoveredAxisLabel = hoverColor
                ? `length(data('${AXIS_HOVER_STORE}')) && `
                    + `data('${AXIS_HOVER_STORE}')[0].scale === ${JSON.stringify(axis.scale)} && `
                    + `data('${AXIS_HOVER_STORE}')[0].value === datum.value`
                : undefined;
            const existingLabelFill = hoverColor
                ? axis.encode?.labels?.update?.fill ?? axis.encode?.labels?.enter?.fill ?? { value: '#4a4a4a' }
                : undefined;
            const existingFontWeight = hoverColor
                ? axis.encode?.labels?.update?.fontWeight ?? axis.encode?.labels?.enter?.fontWeight ?? { value: 'normal' }
                : undefined;
            axis.encode = {
                ...(axis.encode ?? {}),
                labels: {
                    ...(axis.encode?.labels ?? {}),
                    interactive: true,
                    update: {
                        ...(axis.encode?.labels?.update ?? {}),
                        ...(hoveredAxisLabel && existingLabelFill && existingFontWeight ? {
                            fill: [
                            { test: hoveredAxisLabel, value: hoverColor },
                            ...(Array.isArray(existingLabelFill) ? existingLabelFill : [existingLabelFill]),
                            ],
                            fontWeight: [
                            { test: hoveredAxisLabel, value: 600 },
                            ...(Array.isArray(existingFontWeight) ? existingFontWeight : [existingFontWeight]),
                            ],
                        } : {}),
                    },
                },
                ticks: {
                    ...(axis.encode?.ticks ?? {}),
                    interactive: true,
                    update: { ...(axis.encode?.ticks?.update ?? {}) },
                },
            };
        }
        for (const mark of scope.marks ?? []) visit(mark);
    };
    visit(vegaSpec);
    return targets;
}

function applyCompiledHoverStyles(
    marks: Record<string, any>[],
    renderHoverStyles: Readonly<Record<string, HoverStyle>>,
): void {
    for (const mark of marks) {
        if (Array.isArray(mark.marks)) applyCompiledHoverStyles(mark.marks, renderHoverStyles);
        const style = renderHoverStyles[mark.type];
        const update = mark.encode?.update;
        if (!style || !update || !JSON.stringify(mark.encode).includes(INTERACTION_KEY)) continue;
        if (mark.type === 'line') continue;
        const hoverKey = mark.type === 'line' || mark.type === 'area'
            ? `datum.${INTERACTION_KEY} + '${PATH_KEY_SUFFIX}'`
            : `datum.${INTERACTION_KEY}`;
        const hoverTest = `indata('${HOVER_STORE}', 'key', ${hoverKey})`;
        for (const [channel, value] of Object.entries(style)) {
            if (channel === 'opacity' && (value === 'contrast' || value === 'spotlight')) {
                const currentOpacity = Array.isArray(update.opacity) ? update.opacity : [update.opacity];
                if (value === 'spotlight' && currentOpacity.some((entry: any) =>
                    entry?.field !== undefined || entry?.signal !== undefined || entry?.condition?.field !== undefined
                )) continue;
                const numericValues = currentOpacity
                    .map((entry: any) => entry?.value)
                    .filter((entry: unknown): entry is number => typeof entry === 'number');
                const authoredOpacity = numericValues.length > 0 ? Math.max(...numericValues) : 1;
                update.opacity = [
                    {
                        test: value === 'spotlight' && mark.type === 'area'
                            ? `!length(data('${INTERACTION_STORE}')) && ${hoverTest}`
                            : hoverTest,
                        value: value === 'spotlight'
                            ? Math.min(authoredOpacity, 0.9)
                            : authoredOpacity < 1 ? 1 : 0.9,
                    },
                    ...currentOpacity,
                ];
                continue;
            }
            const existing = update[channel] ?? mark.encode?.enter?.[channel] ?? (
                channel === 'stroke'
                    ? { value: mark.type === 'line' || mark.type === 'rule' ? 'black' : 'transparent' }
                    : channel === 'strokeWidth'
                    ? { value: mark.type === 'line' ? 2 : mark.type === 'rule' ? 1 : mark.type === 'symbol' ? 1.5 : 0 }
                    : undefined
            );
            if (existing === undefined) continue;
            update[channel] = [
                { test: hoverTest, value },
                ...(Array.isArray(existing) ? existing : [existing]),
            ];
        }
    }
}

function applyCompiledStyleChannels(marks: Record<string, any>[]): void {
    for (const mark of marks) {
        if (Array.isArray(mark.marks)) applyCompiledStyleChannels(mark.marks);
        const update = mark.encode?.update;
        if (!update || !JSON.stringify(mark.encode).includes(INTERACTION_KEY)) continue;
        const key = `datum.${INTERACTION_KEY}`;
        for (const channel of ['opacity', 'fill', 'stroke', 'strokeWidth'] as const) {
            const existing = update[channel] ?? mark.encode?.enter?.[channel];
            if (existing === undefined) continue;
            const styleValue = `${STYLE_SIGNAL}[${key}] && ${STYLE_SIGNAL}[${key}].${channel}`;
            update[channel] = [
                { test: `isValid(${styleValue})`, signal: styleValue },
                ...(Array.isArray(existing) ? existing : [existing]),
            ];
        }
    }
}

export function injectVegaInteractionStore(
    vegaSpec: Record<string, any>,
    plan?: Pick<VegaInteractionPlan, 'dimOpacity' | 'renderHoverStyles' | 'selectionBoundary'>,
): void {
    // Stores go first: transforms are parsed in data order, so a filter that reads a store
    // cannot resolve one declared after it.
    vegaSpec.data = [
        { name: INTERACTION_STORE, values: [] },
        { name: HOVER_STORE, values: [] },
        { name: HIDDEN_STORE, values: [] },
        { name: LEGEND_HIDDEN_STORE, values: [] },
        { name: LEGEND_HOVER_STORE, values: [] },
        { name: AXIS_HOVER_STORE, values: [] },
        { name: LEGEND_SELECTION_STORE, values: [] },
        ...(Array.isArray(vegaSpec.data) ? vegaSpec.data : []),
    ];
    vegaSpec.signals = [
        ...(Array.isArray(vegaSpec.signals) ? vegaSpec.signals : []),
        { name: STYLE_SIGNAL, value: {} },
    ];
    const instrumentLegends = (scope: Record<string, any>): void => {
        for (const legend of scope.legends ?? []) {
            const scaleChannel = ['fill', 'stroke', 'size', 'shape', 'opacity']
                .find((channel) => legend[channel] !== undefined);
            const channel = scaleChannel === 'fill' || scaleChannel === 'stroke' ? 'color' : scaleChannel;
            const peerOfSelectedLegend = channel
                ? `isValid(datum.value) && length(data('${LEGEND_SELECTION_STORE}')) && ` +
                    `data('${LEGEND_SELECTION_STORE}')[0].channel === ${JSON.stringify(channel)} && ` +
                    `data('${LEGEND_SELECTION_STORE}')[0].value !== datum.value`
                : undefined;
            const selectedLegendItem = channel
                ? `isValid(datum.value) && length(data('${LEGEND_SELECTION_STORE}')) && ` +
                    `data('${LEGEND_SELECTION_STORE}')[0].channel === ${JSON.stringify(channel)} && ` +
                    `data('${LEGEND_SELECTION_STORE}')[0].value === datum.value`
                : undefined;
            const hoveredLegendItem = channel
                ? `isValid(datum.value) && length(data('${LEGEND_HOVER_STORE}')) && ` +
                    `data('${LEGEND_HOVER_STORE}')[0].channel === ${JSON.stringify(channel)} && ` +
                    `data('${LEGEND_HOVER_STORE}')[0].value === datum.value`
                : undefined;
            const hiddenLegendItem = channel
                ? `isValid(datum.value) && length(data('${LEGEND_HIDDEN_STORE}')) && ` +
                    `indata('${LEGEND_HIDDEN_STORE}', 'identity', ${JSON.stringify(channel)} + ':' + datum.value)`
                : undefined;
            const interactiveItem = (
                encode: Record<string, any> | undefined,
                kind: 'gradient' | 'symbol' | 'label',
            ): Record<string, any> => {
                const existingOpacity = encode?.update?.opacity ?? encode?.enter?.opacity ?? { value: 1 };
                const existingStroke = encode?.update?.stroke ?? encode?.enter?.stroke ?? { value: null };
                const existingStrokeWidth = encode?.update?.strokeWidth ?? encode?.enter?.strokeWidth ?? { value: 0 };
                const existingStrokeOpacity = encode?.update?.strokeOpacity ?? encode?.enter?.strokeOpacity ?? { value: 1 };
                const existingFill = encode?.update?.fill ?? encode?.enter?.fill;
                const existingFontWeight = encode?.update?.fontWeight ?? encode?.enter?.fontWeight ?? { value: 'normal' };
                const selectionBoundary = plan?.selectionBoundary;
                return {
                    ...(encode ?? {}),
                    interactive: true,
                    update: {
                        ...(encode?.update ?? {}),
                        opacity: hiddenLegendItem ? [
                            { test: hiddenLegendItem, signal: `data('${LEGEND_HIDDEN_STORE}')[0].opacity` },
                            ...(peerOfSelectedLegend ? [
                            { test: peerOfSelectedLegend, value: plan?.dimOpacity ?? DEFAULT_DIM_OPACITY },
                            ] : []),
                            ...(kind === 'symbol' && hoveredLegendItem
                                ? [{ test: hoveredLegendItem, value: 0.72 }]
                                : []),
                            ...(Array.isArray(existingOpacity) ? existingOpacity : [existingOpacity]),
                        ] : kind === 'symbol' && hoveredLegendItem ? [
                            { test: hoveredLegendItem, value: 0.72 },
                            ...(Array.isArray(existingOpacity) ? existingOpacity : [existingOpacity]),
                        ] : existingOpacity,
                        ...(kind === 'gradient' && selectedLegendItem ? {
                            stroke: [
                                { test: selectedLegendItem, value: selectionBoundary?.color ?? '#20262c' },
                                ...(Array.isArray(existingStroke) ? existingStroke : [existingStroke]),
                            ],
                            strokeWidth: [
                                { test: selectedLegendItem, value: selectionBoundary?.width ?? 1.25 },
                                ...(Array.isArray(existingStrokeWidth) ? existingStrokeWidth : [existingStrokeWidth]),
                            ],
                            strokeOpacity: [
                                { test: selectedLegendItem, value: selectionBoundary?.opacity ?? 0.68 },
                                ...(Array.isArray(existingStrokeOpacity) ? existingStrokeOpacity : [existingStrokeOpacity]),
                            ],
                        } : {}),
                        ...(kind === 'label' && hoveredLegendItem ? {
                            ...(existingFill ? {
                                fill: [
                                    { test: hoveredLegendItem, value: selectionBoundary?.color ?? '#20262c' },
                                    ...(Array.isArray(existingFill) ? existingFill : [existingFill]),
                                ],
                            } : {}),
                            fontWeight: [
                                { test: hoveredLegendItem, value: 600 },
                                ...(Array.isArray(existingFontWeight) ? existingFontWeight : [existingFontWeight]),
                            ],
                        } : {}),
                    },
                };
            };
            legend.encode = {
                ...(legend.encode ?? {}),
                entries: {
                    ...(legend.encode?.entries ?? {}),
                    name: legend.encode?.entries?.name ?? LEGEND_ENTRY_MARK,
                    interactive: true,
                    update: {
                        ...(legend.encode?.entries?.update ?? {}),
                    },
                },
                gradient: interactiveItem(legend.encode?.gradient, 'gradient'),
                symbols: interactiveItem(legend.encode?.symbols, 'symbol'),
                labels: interactiveItem(legend.encode?.labels, 'label'),
            };
        }
        for (const mark of scope.marks ?? []) instrumentLegends(mark);
    };
    instrumentLegends(vegaSpec);
    if (!Array.isArray(vegaSpec.marks)) return;
    if (plan?.renderHoverStyles) applyCompiledHoverStyles(vegaSpec.marks, plan.renderHoverStyles);
    applyCompiledStyleChannels(vegaSpec.marks);
    vegaSpec.marks.unshift({
        type: 'rect',
        name: CLEAR_MARK,
        encode: {
            enter: {
                x: { value: 0 }, x2: { signal: 'width' },
                y: { value: 0 }, y2: { signal: 'height' },
                opacity: { value: 0 }, tooltip: { value: null },
            },
        },
    });
}
