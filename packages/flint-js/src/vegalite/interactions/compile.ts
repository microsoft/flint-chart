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
    SelectionStyle,
    VegaInteractionPlan,
} from './contracts';
import { INTERACTION_KEY, INTERACTION_ROLE, PATH_KEY_SUFFIX } from './hit-adapter';
import {
    HOVER_STORE,
    INTERACTION_STORE,
    LEGEND_HOVER_STORE,
    LEGEND_SELECTION_STORE,
} from './stores';

const CLEAR_MARK = '__flint_interaction_clear';
const SUPPORTED_SPEC_MARKS = new Set(['arc', 'area', 'bar', 'boxplot', 'circle', 'geoshape', 'line', 'point', 'rect', 'rule', 'tick']);

interface TemplateInteractionSemantics {
    fields: string[];
    categoryField?: string;
    seriesField?: string;
    resolveGroupValue?: InteractionContext['resolveGroupValue'];
    legendFields?: Record<string, string>;
    selectableMarks: string[];
    annotationMarkType?: string;
    supportedRegionGestures?: ('cartesian' | 'angular')[];
    navigationAxes?: ('x' | 'y')[];
    reorderAxis?: { axis: 'x' | 'y'; field: string; includeConnectiveMarks?: boolean; markTypes?: readonly string[] };
    reorderAxes?: readonly { axis: 'x' | 'y'; field: string; includeConnectiveMarks?: boolean; markTypes?: readonly string[] }[];
    renderHoverStyles?: Record<string, HoverStyle>;
    renderSelectionStyles?: Record<string, SelectionStyle>;
    selectionBoundary?: SelectionBoundaryStyle;
    resolve?: ChartInteractionResolver;
    presentUpdate?: ChartUpdatePresenter;
}

export function withoutSemanticInteractionField(value: unknown): unknown {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const filtered = { ...(value as Record<string, unknown>) };
    delete filtered[INTERACTION_KEY];
    return filtered;
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
    selectableMarks: ReadonlySet<string>,
    clickCursor: boolean,
): boolean {
    const type = markType(node.mark);
    const selectable = !!type && SUPPORTED_SPEC_MARKS.has(type) && selectableMarks.has(type);
    const provenance = node[INTERACTION_PROVENANCE] as InteractionProvenance | undefined;
    if (provenance?.role === 'decorative') return false;
    const textLabel = provenance?.role === 'text-label';
    if (!selectable && !textLabel) return false;
    if (textLabel) {
        const identityFields = provenance.identity === 'inherit'
            ? semanticFields
            : provenance.identity.fields;
        node.transform = [
            ...(Array.isArray(node.transform) ? node.transform : []),
            { calculate: keyExpression(identityFields), as: INTERACTION_KEY },
            { calculate: "'text-label'", as: INTERACTION_ROLE },
        ];
    }
    const encoding = { ...inherited, ...(node.encoding ?? {}) };
    const encodedOpacity = encoding.opacity;
    const dataDrivenOpacity = encodedOpacity?.field && !encodedOpacity.condition;
    if (textLabel && provenance.presentation === 'on-mark') return true;
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
    if (clickCursor && selectable) {
        node.mark = typeof node.mark === 'string'
            ? { type: node.mark, cursor: 'pointer' }
            : { ...node.mark, cursor: node.mark.cursor ?? 'pointer' };
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
        opacity: dataDrivenOpacity ? {
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
    selectableMarks: ReadonlySet<string>,
    clickCursor: boolean,
): boolean {
    const encoding = { ...inherited, ...(spec.encoding ?? {}) };
    let instrumented = instrumentNode(
        spec,
        inherited,
        semanticFields,
        dimOpacity,
        selectableMarks,
        clickCursor,
    );
    for (const property of ['layer', 'hconcat', 'vconcat', 'concat'] as const) {
        if (!Array.isArray(spec[property])) continue;
        for (const child of spec[property]) {
            instrumented = instrumentMarks(
                child,
                encoding,
                semanticFields,
                dimOpacity,
                selectableMarks,
                clickCursor,
            ) || instrumented;
        }
    }
    if (spec.spec && typeof spec.spec === 'object') {
        instrumented = instrumentMarks(
            spec.spec,
            encoding,
            semanticFields,
            dimOpacity,
            selectableMarks,
            clickCursor,
        ) || instrumented;
    }
    return instrumented;
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
            { calculate: keyExpression(fields), as: INTERACTION_KEY },
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
    const reorderInteraction = canvasInteractions.find(
        (interaction) => interaction.eventSource.gesture === 'drag-element',
    );
    if (!templateSemantics) {
        if (reorderInteraction) {
            throw new Error(`Interaction "${reorderInteraction.id}" requires a chart with a reorderable category axis.`);
        }
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
    if (reorderInteraction && declaredReorderAxes.length === 0) {
        throw new Error(`Interaction "${reorderInteraction.id}" requires a chart with a reorderable category axis.`);
    }
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
    const needsSemanticPresentation = enableSemanticUpdates
        || semanticInteractions.length > 0
        || canvasInteractions.length < interactions.length;
    if (navigationInteraction?.eventSource.pan
        && semanticInteractions.some((interaction) => interaction.eventSource.gesture === 'drag')) {
        throw new Error('Pan navigation cannot share an unmodified drag gesture with a region interaction.');
    }
    const availableNavigationAxes = templateSemantics.navigationAxes ?? [];
    const requestedNavigationAxes = navigationInteraction
        ? navigationInteraction.eventSource.axes === 'available'
            ? availableNavigationAxes
            : navigationInteraction.eventSource.axes === 'xy'
            ? ['x', 'y'] as const
            : [navigationInteraction.eventSource.axes as 'x' | 'y']
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
    if (navigationInteraction) clipNavigableMarks(spec);

    const dimOpacity = semanticInteractions.reduce((value, interaction) => {
        if (!interaction.handle) return value;
        const semanticEvent = {
            type: 'semantic',
            source: interaction.eventSource.type === 'region' ? 'region' : 'element',
            phase: 'commit',
            target: {
                visual: { kind: 'mark', role: 'probe' },
                elements: [{ key: {} }],
            },
        } as const;
        const interactionContext = { chartType: 'Unknown', selected: [] };
        const update = interaction.handle(toCanvasInteractionEvent(semanticEvent, interaction.eventSource), interactionContext);
        const presentation = update?.ops.find((op) => op.op === 'set-presentation');
        return presentation?.op === 'set-presentation'
            ? Math.min(value, presentation.value.mutedOpacity ?? DEFAULT_DIM_OPACITY)
            : value;
    }, DEFAULT_DIM_OPACITY);

    const clickCursor = semanticInteractions.some((interaction) => interaction.eventSource.gesture === 'click')
        && !semanticInteractions.some((interaction) => interaction.eventSource.gesture === 'drag');
    const instrumented = needsSemanticPresentation
        ? instrumentMarks(spec, {}, fields, dimOpacity, selectableMarks, clickCursor)
        : false;
    if (needsSemanticPresentation && !instrumented) return null;
    if (instrumented) addLocalKeyTransforms(spec, fields, selectableMarks);
    stripInteractionProvenance(spec);
    if (instrumented) {
        spec.transform = [
            ...(Array.isArray(spec.transform) ? spec.transform : []),
            { calculate: keyExpression(fields), as: INTERACTION_KEY },
        ];
    }
    return {
        fields,
        categoryField: templateSemantics.categoryField,
        seriesField: templateSemantics.seriesField,
        resolveGroupValue: templateSemantics.resolveGroupValue,
        legendFields: templateSemantics.legendFields,
        annotationMarkType: templateSemantics.annotationMarkType,
        semanticStores: instrumented,
        dimOpacity,
        renderHoverStyles: templateSemantics.renderHoverStyles,
        renderSelectionStyles: templateSemantics.renderSelectionStyles,
        selectionBoundary: templateSemantics.selectionBoundary,
        navigationChannels: [...requestedNavigationAxes],
        reorderAxis: reorderInteraction && declaredReorderAxes[0]
            ? { ...declaredReorderAxes[0], scale: '', signal: '' }
            : undefined,
        reorderAxes: reorderInteraction
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
                        test: `!length(data('${INTERACTION_STORE}')) && ${hoverTest}`,
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

export function injectVegaInteractionStore(
    vegaSpec: Record<string, any>,
    plan?: Pick<VegaInteractionPlan, 'dimOpacity' | 'renderHoverStyles'>,
): void {
    vegaSpec.data = [
        ...(Array.isArray(vegaSpec.data) ? vegaSpec.data : []),
        { name: INTERACTION_STORE, values: [] },
        { name: HOVER_STORE, values: [] },
        { name: LEGEND_HOVER_STORE, values: [] },
        { name: LEGEND_SELECTION_STORE, values: [] },
    ];
    for (const legend of vegaSpec.legends ?? []) {
        const scaleChannel = ['fill', 'stroke', 'size', 'shape', 'opacity']
            .find((channel) => legend[channel] !== undefined);
        const channel = scaleChannel === 'fill' || scaleChannel === 'stroke' ? 'color' : scaleChannel;
        const peerOfSelectedLegend = channel
            ? `length(data('${LEGEND_SELECTION_STORE}')) && ` +
                `data('${LEGEND_SELECTION_STORE}')[0].channel === ${JSON.stringify(channel)} && ` +
                `data('${LEGEND_SELECTION_STORE}')[0].value !== datum.value`
            : undefined;
        const interactiveItem = (encode: Record<string, any> | undefined): Record<string, any> => {
            const existingOpacity = encode?.update?.opacity ?? encode?.enter?.opacity ?? { value: 1 };
            return {
                ...(encode ?? {}),
                interactive: true,
                update: {
                    ...(encode?.update ?? {}),
                    cursor: { value: 'pointer' },
                    opacity: peerOfSelectedLegend ? [
                        { test: peerOfSelectedLegend, value: plan?.dimOpacity ?? DEFAULT_DIM_OPACITY },
                        ...(Array.isArray(existingOpacity) ? existingOpacity : [existingOpacity]),
                    ] : existingOpacity,
                },
            };
        };
        legend.encode = {
            ...(legend.encode ?? {}),
            symbols: interactiveItem(legend.encode?.symbols),
            labels: interactiveItem(legend.encode?.labels),
        };
    }
    if (!Array.isArray(vegaSpec.marks)) return;
    if (plan?.renderHoverStyles) applyCompiledHoverStyles(vegaSpec.marks, plan.renderHoverStyles);
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
