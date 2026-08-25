import { changeset } from 'vega';
import type { ChartInteractionResolver } from '../core/interaction-semantics';
import type {
    ChartUpdate,
    ChartUpdateProcessor,
    ExternalInteractionEvent,
    FlintInteractionEventDetail,
    InteractionDef,
    NormalizedInteractionEvent,
    PlotPoint,
    RenderHit,
    SemanticTarget,
    SemanticInteractionEvent,
} from '../interactive/interactions';
import { DEFAULT_DIM_OPACITY } from '../interactive/emphasis-update';
import {
    INTERACTION_KEY,
    PATH_KEY_SUFFIX,
    arcIntersectsRect,
    boundsIntersectRect,
    clientRectToLayoutRect,
    clientToLayoutPoint,
    clientToPlotPoint,
    interactionModifiers,
    normalizeVegaElementEvent,
    normalizeVegaRegionEvent,
    plotToClientPoint,
    renderHit,
    sceneItems,
    type RendererCoordinateSpace,
} from '../interactive/triggers/vega';

export {
    INTERACTION_KEY,
    arcIntersectsRect,
    boundsIntersectRect,
    clientRectToLayoutRect,
    clientToLayoutPoint,
    clientToPlotPoint,
    plotToClientPoint,
    sceneItems,
} from '../interactive/triggers/vega';

export const INTERACTION_STORE = '__flint_interaction_store';
export const HOVER_STORE = '__flint_hover_store';
export const LEGEND_HOVER_STORE = '__flint_legend_hover_store';
export const LEGEND_SELECTION_STORE = '__flint_legend_selection_store';
const CLEAR_MARK = '__flint_interaction_clear';
const SUPPORTED_SPEC_MARKS = new Set(['arc', 'area', 'bar', 'boxplot', 'circle', 'line', 'point', 'rect', 'rule', 'tick']);

interface TemplateInteractionSemantics {
    fields: string[];
    categoryField?: string;
    seriesField?: string;
    legendFields?: Record<string, string>;
    selectableMarks: string[];
    renderHoverStyles?: Record<string, HoverStyle>;
    resolve?: ChartInteractionResolver;
    presentUpdate?: ChartUpdateProcessor;
}

interface HoverStyle {
    fill?: string;
    fillOpacity?: number;
    opacity?: 'contrast';
    stroke?: string;
    strokeWidth?: number;
}

export interface VegaInteractionPlan {
    fields: readonly string[];
    categoryField?: string;
    seriesField?: string;
    legendFields?: Readonly<Record<string, string>>;
    dimOpacity: number;
    renderHoverStyles?: Readonly<Record<string, HoverStyle>>;
    resolve?: ChartInteractionResolver;
    presentUpdate?: ChartUpdateProcessor;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
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
    dimOpacity: number,
    selectableMarks: ReadonlySet<string>,
    clickCursor: boolean,
): boolean {
    const type = markType(node.mark);
    if (!type || !SUPPORTED_SPEC_MARKS.has(type) || !selectableMarks.has(type)) return false;
    const encoding = { ...inherited, ...(node.encoding ?? {}) };
    const encodedOpacity = encoding.opacity;
    const dataDrivenOpacity = encodedOpacity?.field && !encodedOpacity.condition;
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
    if (clickCursor) {
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
    dimOpacity: number,
    selectableMarks: ReadonlySet<string>,
    clickCursor: boolean,
): boolean {
    const encoding = { ...inherited, ...(spec.encoding ?? {}) };
    let instrumented = instrumentNode(spec, inherited, dimOpacity, selectableMarks, clickCursor);
    for (const property of ['layer', 'hconcat', 'vconcat', 'concat'] as const) {
        if (!Array.isArray(spec[property])) continue;
        for (const child of spec[property]) {
            instrumented = instrumentMarks(child, encoding, dimOpacity, selectableMarks, clickCursor) || instrumented;
        }
    }
    return instrumented;
}

function addLocalKeyTransforms(
    spec: Record<string, any>,
    fields: readonly string[],
    selectableMarks: ReadonlySet<string>,
): void {
    const type = markType(spec.mark);
    if (type && SUPPORTED_SPEC_MARKS.has(type) && selectableMarks.has(type) && spec.data) {
        spec.transform = [
            ...(Array.isArray(spec.transform) ? spec.transform : []),
            { calculate: keyExpression(fields), as: INTERACTION_KEY },
        ];
    }
    for (const property of ['layer', 'hconcat', 'vconcat', 'concat'] as const) {
        if (!Array.isArray(spec[property])) continue;
        for (const child of spec[property]) addLocalKeyTransforms(child, fields, selectableMarks);
    }
}

export function addVegaLiteInteractions(
    spec: Record<string, any>,
    interactions: readonly InteractionDef[],
): VegaInteractionPlan | null {
    if (interactions.length === 0) return null;
    const templateSemantics = spec._interactionSemantics as TemplateInteractionSemantics | undefined;
    delete spec._interactionSemantics;
    if (!templateSemantics || templateSemantics.fields.length === 0) return null;
    const selectableMarks = new Set(templateSemantics?.selectableMarks ?? SUPPORTED_SPEC_MARKS);
    const fields = templateSemantics.fields;
    expandInteractiveLinePoints(spec);

    const dimOpacity = interactions.reduce((value, interaction) => {
        if (interaction.eventSource.type === 'external') return value;
        const update = interaction.update({
            type: 'semantic',
            source: interaction.eventSource.type === 'region' ? 'region' : 'element',
            phase: 'commit',
            target: {
                visual: { kind: 'mark', role: 'probe' },
                elements: [{ key: {} }],
            },
        }, { chartType: 'Unknown', selected: [] });
        const emphasize = update?.ops.find((op) => op.op === 'emphasize');
        return emphasize?.op === 'emphasize' ? Math.min(value, emphasize.dimOpacity) : value;
    }, DEFAULT_DIM_OPACITY);

    const clickCursor = interactions.some((interaction) => interaction.eventSource.gesture === 'click')
        && !interactions.some((interaction) => interaction.eventSource.gesture === 'drag');
    const instrumented = instrumentMarks(spec, {}, dimOpacity, selectableMarks, clickCursor);
    if (!instrumented) return null;
    addLocalKeyTransforms(spec, fields, selectableMarks);
    spec.transform = [
        ...(Array.isArray(spec.transform) ? spec.transform : []),
        { calculate: keyExpression(fields), as: INTERACTION_KEY },
    ];
    return {
        fields,
        categoryField: templateSemantics.categoryField,
        seriesField: templateSemantics.seriesField,
        legendFields: templateSemantics.legendFields,
        dimOpacity,
        renderHoverStyles: templateSemantics.renderHoverStyles,
        resolve: templateSemantics.resolve,
        presentUpdate: templateSemantics.presentUpdate,
    };
}

function applyCompiledHoverStyles(
    marks: Record<string, any>[],
    renderHoverStyles: Readonly<Record<string, HoverStyle>>,
): void {
    const hoverTest = `indata('${HOVER_STORE}', 'key', datum.${INTERACTION_KEY})`;
    for (const mark of marks) {
        if (Array.isArray(mark.marks)) applyCompiledHoverStyles(mark.marks, renderHoverStyles);
        const style = renderHoverStyles[mark.type];
        const update = mark.encode?.update;
        if (!style || !update || !JSON.stringify(mark.encode).includes(INTERACTION_KEY)) continue;
        for (const [channel, value] of Object.entries(style)) {
            if (channel === 'opacity' && value === 'contrast') {
                const numericValues = (Array.isArray(update.opacity) ? update.opacity : [update.opacity])
                    .map((entry: any) => entry?.value)
                    .filter((entry: unknown): entry is number => typeof entry === 'number');
                const authoredOpacity = numericValues.length > 0 ? Math.max(...numericValues) : 1;
                update.opacity = [
                    {
                        test: `!length(data('${INTERACTION_STORE}')) && ${hoverTest}`,
                        value: authoredOpacity < 1 ? 1 : 0.9,
                    },
                    ...(Array.isArray(update.opacity) ? update.opacity : [update.opacity]),
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

function keyOfDatum(datum: unknown): string | undefined {
    if (!datum || typeof datum !== 'object') return undefined;
    const key = (datum as Record<string, unknown>)[INTERACTION_KEY];
    return typeof key === 'string' ? key : undefined;
}

export interface VegaInteractionController {
    dispatch(event: ExternalInteractionEvent): Promise<void>;
    destroy(): void;
}

export function mountVegaInteractions(
    view: any,
    container: HTMLElement,
    chartType: string,
    plan: VegaInteractionPlan,
    interactions: readonly InteractionDef[],
    resolve: ChartInteractionResolver,
    presentUpdate: ChartUpdateProcessor,
): VegaInteractionController {
    const clickInteraction = interactions.find((interaction) => interaction.eventSource.gesture === 'click');
    const rectangleInteraction = interactions.find((interaction) => interaction.eventSource.gesture === 'drag');
    let selected = new Set<string>();
    let selectedLegend: { channel: string; value: unknown } | null = null;
    let hoveredPathKeys = new Set<string>();
    let committed = new Set<string>();
    let suppressClick = false;
    let dragStart: { x: number; y: number } | undefined;
    let pointerId: number | undefined;
    let syncRunning = false;
    let syncRequested = false;

    const containerLayoutSize = (): { width: number; height: number } => {
        const rect = container.getBoundingClientRect();
        return {
            width: container.offsetWidth || rect.width,
            height: container.offsetHeight || rect.height,
        };
    };

    const coordinateSpace = (): RendererCoordinateSpace => {
        const renderer = container.querySelector('canvas, svg') as HTMLElement | null;
        const rect = (renderer ?? container).getBoundingClientRect();
        const [viewOriginX, viewOriginY] = view.origin();
        const svg = renderer instanceof SVGSVGElement ? renderer : undefined;
        // SVG autosize/padding can make View#origin differ from the renderer's
        // final plot translation. The rendered root-frame CTM is authoritative.
        const rootFrame = svg?.querySelector<SVGGraphicsElement>('.mark-group.role-frame.root');
        const rootMatrix = rootFrame?.getCTM();
        const originX = rootMatrix?.e ?? viewOriginX;
        const originY = rootMatrix?.f ?? viewOriginY;
        const logicalWidth = svg?.viewBox.baseVal.width || rect.width;
        const logicalHeight = svg?.viewBox.baseVal.height || rect.height;
        const viewWidth = view.width();
        const viewHeight = view.height();
        return {
            rect,
            logicalWidth,
            logicalHeight,
            originX,
            originY,
            plotWidth: viewWidth > 0 ? viewWidth : Math.max(0, logicalWidth - originX),
            plotHeight: viewHeight > 0 ? viewHeight : Math.max(0, logicalHeight - originY),
        };
    };

    const focusLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const pathVisuals = new Map<string, {
        fill?: string;
        fillOpacity: number;
        stroke?: string;
        strokeWidth: number;
    }>();
    Object.assign(focusLayer.style, {
        position: 'absolute', inset: '0', zIndex: '3', width: '100%', height: '100%',
        pointerEvents: 'none', overflow: 'hidden',
    });
    const renderPathFocus = (): void => {
        focusLayer.replaceChildren();
        const scene = sceneItems(view);
        for (const item of scene) {
            if (!item.interactionGeometry) continue;
            const hit = renderHit(item);
            const key = hit?.datum[INTERACTION_KEY];
            if (typeof key !== 'string' || pathVisuals.has(key)) continue;
            pathVisuals.set(key, {
                fill: item.fill,
                fillOpacity: (typeof item.opacity === 'number' ? item.opacity : 1)
                    * (typeof item.fillOpacity === 'number' ? item.fillOpacity : 1),
                stroke: item.stroke,
                strokeWidth: typeof item.strokeWidth === 'number' ? item.strokeWidth : 2,
            });
        }
        const items = scene.filter((item) => {
            const hit = renderHit(item);
            const key = String(hit?.datum[INTERACTION_KEY]);
            return hit && (selected.has(key) || hoveredPathKeys.has(key)) && item.interactionGeometry;
        });
        if (items.length === 0) {
            focusLayer.remove();
            return;
        }
        if (!focusLayer.isConnected) container.append(focusLayer);
        if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
        const space = coordinateSpace();
        const renderer = container.querySelector('svg') as SVGSVGElement | null;
        const containerRect = container.getBoundingClientRect();
        const rendererRect = renderer?.getBoundingClientRect() ?? space.rect;
        const rendererLayout = clientRectToLayoutRect(rendererRect, containerRect, containerLayoutSize());
        Object.assign(focusLayer.style, {
            inset: 'auto',
            left: `${rendererLayout.left}px`,
            top: `${rendererLayout.top}px`,
            width: `${rendererLayout.width}px`,
            height: `${rendererLayout.height}px`,
        });
        focusLayer.setAttribute('viewBox', `0 0 ${space.logicalWidth} ${space.logicalHeight}`);
        for (const item of items) {
            const key = renderHit(item)?.datum[INTERACTION_KEY];
            const visual = typeof key === 'string' ? pathVisuals.get(key) : undefined;
            const hovered = typeof key === 'string' && hoveredPathKeys.has(key);
            const hoverStyle = hovered ? plan.renderHoverStyles?.[item.mark.marktype] : undefined;
            const basePath = renderer
                ? [...renderer.querySelectorAll<SVGGraphicsElement>('[role="graphics-symbol"]')]
                    .find((candidate) => (candidate as any).__data__?.mark === item.mark)
                : undefined;
            const matrix = basePath?.getCTM();
            const points = item.interactionGeometry.points.map((plotPoint: PlotPoint) => {
                if (!matrix || !renderer) {
                    return { x: plotPoint.x + space.originX, y: plotPoint.y + space.originY };
                }
                const local = renderer.createSVGPoint();
                local.x = plotPoint.x - item.interactionGeometry.offset.x;
                local.y = plotPoint.y - item.interactionGeometry.offset.y;
                const transformed = local.matrixTransform(matrix);
                return { x: transformed.x, y: transformed.y };
            });
            const segment = item.interactionGeometry.kind === 'segment';
            const shape = document.createElementNS('http://www.w3.org/2000/svg', segment ? 'path' : 'polygon');
            if (segment) {
                shape.setAttribute('d', `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`);
                shape.setAttribute('fill', 'none');
                shape.setAttribute('stroke', hoverStyle?.stroke ?? visual?.stroke ?? item.stroke ?? '#4c78a8');
                shape.setAttribute('stroke-width', String(hoverStyle?.strokeWidth ?? visual?.strokeWidth ?? item.strokeWidth ?? 2));
                shape.setAttribute('stroke-linecap', 'round');
            } else {
                shape.setAttribute('points', points.map((plotPoint: PlotPoint) => `${plotPoint.x},${plotPoint.y}`).join(' '));
                shape.setAttribute('fill', hoverStyle?.fill ?? visual?.fill ?? item.fill ?? '#4c78a8');
                shape.setAttribute('fill-opacity', String(hoverStyle?.fillOpacity ?? visual?.fillOpacity ?? 1));
                if (hoverStyle?.stroke) shape.setAttribute('stroke', hoverStyle.stroke);
                if (hoverStyle?.strokeWidth !== undefined) shape.setAttribute('stroke-width', String(hoverStyle.strokeWidth));
            }
            focusLayer.append(shape);
        }
    };
    renderPathFocus();

    const annotationLayer = document.createElement('div');
    Object.assign(annotationLayer.style, {
        position: 'absolute', inset: '0', zIndex: '4', pointerEvents: 'none', overflow: 'hidden',
    });
    const annotationSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    Object.assign(annotationSvg.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    const annotationPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    annotationPath.setAttribute('fill', 'none');
    annotationPath.setAttribute('stroke', '#176f58');
    annotationPath.setAttribute('stroke-width', '1.5');
    annotationPath.setAttribute('stroke-linecap', 'round');
    const annotationDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    annotationDot.setAttribute('r', '3');
    annotationDot.setAttribute('fill', '#176f58');
    annotationDot.setAttribute('stroke', '#ffffff');
    annotationDot.setAttribute('stroke-width', '1.5');
    annotationSvg.append(annotationPath, annotationDot);
    const annotationCard = document.createElement('div');
    Object.assign(annotationCard.style, {
        position: 'absolute', color: '#176f58', fontFamily: 'ui-sans-serif, sans-serif',
        fontSize: '11px', fontWeight: '700', lineHeight: '1', whiteSpace: 'nowrap',
        textShadow: '-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff',
    });
    annotationLayer.append(annotationSvg, annotationCard);

    const clearAnnotation = (): void => annotationLayer.remove();
    const renderAnnotation = (
        element: import('../core/interaction-semantics').SemanticElement,
        annotation: import('../interactive/interactions').AnnotationRenderPlan,
        point?: PlotPoint,
    ): void => {
        const key = element.key[INTERACTION_KEY];
        const item = typeof key === 'string'
            ? sceneItems(view).find((candidate) => keyOfDatum(candidate.datum) === key)
            : undefined;
        if (!item?.bounds) {
            clearAnnotation();
            return;
        }
        if (!annotationLayer.isConnected) container.append(annotationLayer);
        if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

        annotationCard.textContent = annotation.text;

        const containerRect = container.getBoundingClientRect();
        const space = coordinateSpace();
        const arcAngle = typeof item.startAngle === 'number' && typeof item.endAngle === 'number'
            ? (item.startAngle + item.endAngle) / 2
            : undefined;
        const arcRadius = typeof item.innerRadius === 'number' && typeof item.outerRadius === 'number'
            ? (item.innerRadius + item.outerRadius) / 2
            : undefined;
        const arcAnchor = annotation.anchor === 'arc-centroid' && arcAngle !== undefined && arcRadius !== undefined
            ? { x: item.x + arcRadius * Math.sin(arcAngle), y: item.y - arcRadius * Math.cos(arcAngle) }
            : undefined;
        type Placement = 'above' | 'below' | 'left' | 'right';
        let outward: Placement | undefined;
        let markEnd: PlotPoint | undefined;
        if (annotation.anchor === 'mark-end') {
            const horizontal = item.bounds.x2 - item.bounds.x1 >= item.bounds.y2 - item.bounds.y1;
            const items = sceneItems(view);
            const countAt = (edge: 'x1' | 'x2' | 'y1' | 'y2', value: number): number => items
                .filter((candidate) => Math.abs(candidate.bounds[edge] - value) < 0.5)
                .length;
            if (horizontal) {
                const leftIsBaseline = countAt('x1', item.bounds.x1) >= countAt('x2', item.bounds.x2);
                outward = leftIsBaseline ? 'right' : 'left';
                markEnd = {
                    x: leftIsBaseline ? item.bounds.x2 : item.bounds.x1,
                    y: (item.bounds.y1 + item.bounds.y2) / 2,
                };
            } else {
                const topIsBaseline = countAt('y1', item.bounds.y1) > countAt('y2', item.bounds.y2);
                outward = topIsBaseline ? 'below' : 'above';
                markEnd = {
                    x: (item.bounds.x1 + item.bounds.x2) / 2,
                    y: topIsBaseline ? item.bounds.y2 : item.bounds.y1,
                };
            }
        } else if (annotation.anchor === 'arc-centroid' && arcAnchor) {
            const deltaX = arcAnchor.x - item.x;
            const deltaY = arcAnchor.y - item.y;
            outward = Math.abs(deltaX) >= Math.abs(deltaY)
                ? deltaX >= 0 ? 'right' : 'left'
                : deltaY >= 0 ? 'below' : 'above';
        } else if (annotation.anchor === 'top') outward = 'above';
        else if (annotation.anchor === 'bottom') outward = 'below';
        else if (annotation.anchor === 'left') outward = 'left';
        else if (annotation.anchor === 'right') outward = 'right';
        const exactPoint = annotation.anchor === 'center' ? point : undefined;
        const anchorPlotX = exactPoint?.x ?? markEnd?.x ?? arcAnchor?.x ?? (annotation.anchor === 'left' ? item.bounds.x1
            : annotation.anchor === 'right' ? item.bounds.x2
            : (item.bounds.x1 + item.bounds.x2) / 2);
        const anchorPlotY = exactPoint?.y ?? markEnd?.y ?? arcAnchor?.y ?? (annotation.anchor === 'top' ? item.bounds.y1
            : annotation.anchor === 'bottom' ? item.bounds.y2
            : (item.bounds.y1 + item.bounds.y2) / 2);
        const anchorClient = plotToClientPoint({ x: anchorPlotX, y: anchorPlotY }, space);
        const anchorLayout = clientToLayoutPoint(anchorClient, containerRect, containerLayoutSize());
        const anchorX = anchorLayout.x;
        const anchorY = anchorLayout.y;
        const width = container.clientWidth;
        const height = container.clientHeight;
        const cardWidth = annotationCard.offsetWidth;
        const cardHeight = annotationCard.offsetHeight;
        let placement = annotation.placement === 'auto' || !annotation.placement
            ? (outward ?? (anchorX < width * 0.58 ? 'right' : 'left'))
            : annotation.placement;
        if (placement === 'above' && anchorY < cardHeight + 34) placement = 'below';
        if (placement === 'below' && anchorY + cardHeight + 34 > height) placement = 'above';
        if (placement === 'right' && anchorX + cardWidth + 38 > width) placement = 'left';
        if (placement === 'left' && anchorX - cardWidth - 38 < 0) placement = 'right';
        let cardX = anchorX + 34;
        let cardY = anchorY - cardHeight / 2;
        if (placement === 'left') cardX = anchorX - cardWidth - 38;
        if (placement === 'above') {
            cardX = anchorX - cardWidth / 2;
            cardY = anchorY - cardHeight - 28;
        } else if (placement === 'below') {
            cardX = anchorX - cardWidth / 2;
            cardY = anchorY + 28;
        }
        cardX = clamp(cardX, 8, Math.max(8, width - cardWidth - 8));
        cardY = clamp(cardY, 8, Math.max(8, height - cardHeight - 8));
        annotationCard.style.left = `${cardX}px`;
        annotationCard.style.top = `${cardY}px`;

        const vertical = placement === 'above' || placement === 'below';
        const endX = vertical ? clamp(anchorX, cardX, cardX + cardWidth) : placement === 'right' ? cardX : cardX + cardWidth;
        const endY = vertical ? placement === 'above' ? cardY + cardHeight : cardY : clamp(anchorY, cardY, cardY + cardHeight);
        const control1X = vertical ? anchorX : anchorX + (placement === 'right' ? 18 : -18);
        const control1Y = vertical ? anchorY + (placement === 'below' ? 14 : -14) : anchorY;
        const control2X = vertical ? endX : endX + (placement === 'right' ? -18 : 18);
        const control2Y = vertical ? endY + (placement === 'below' ? -14 : 14) : endY;
        annotationSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        annotationPath.setAttribute(
            'd',
            `M ${anchorX} ${anchorY} C ${control1X} ${control1Y}, ${control2X} ${control2Y}, ${endX} ${endY}`,
        );
        annotationDot.setAttribute('cx', String(anchorX));
        annotationDot.setAttribute('cy', String(anchorY));
    };

    const allHits = (): RenderHit[] => sceneItems(view)
        .map(renderHit)
        .filter((hit): hit is RenderHit => hit !== null);
    const resolveContext = (hits: readonly RenderHit[]) => ({
        allHits: hits,
        keyField: INTERACTION_KEY,
        categoryField: plan.categoryField,
        seriesField: plan.seriesField,
    });
    const context = () => {
        const hits = allHits();
        const available = resolve(
            { gesture: 'rectangle', role: 'region', hits },
            resolveContext(hits),
        )?.elements;
        return {
            chartType,
            selected: [...selected].map((key) => ({ key: { [INTERACTION_KEY]: key } })),
            available,
            categoryField: plan.categoryField,
            seriesField: plan.seriesField,
        };
    };
    const sync = async (): Promise<void> => {
        syncRequested = true;
        if (syncRunning) return;
        syncRunning = true;
        try {
            while (syncRequested) {
                syncRequested = false;
                const keys = [...selected];
                view.change(
                    INTERACTION_STORE,
                    changeset().remove(() => true).insert(keys.map((key) => ({ key }))),
                );
                view.change(
                    LEGEND_SELECTION_STORE,
                    changeset().remove(() => true).insert(selectedLegend ? [selectedLegend] : []),
                );
                await view.runAsync();
                renderPathFocus();
            }
        } finally {
            syncRunning = false;
        }
    };
    const applyUpdate = async (
        update: ChartUpdate | null,
        legendSelection: { channel: string; value: unknown } | null = null,
    ): Promise<void> => {
        if (!update) return;
        for (const op of update.ops) {
            if (op.op === 'reset') {
                selected.clear();
                selectedLegend = null;
                clearAnnotation();
            } else if (op.op === 'clear-annotation') {
                clearAnnotation();
            } else if (op.op === 'render-annotation') {
                renderAnnotation(op.element, op.annotation, op.point);
            } else if (op.op === 'emphasize') {
                const keys = op.elements
                    .map((element) => element.key[INTERACTION_KEY])
                    .filter((key): key is string => typeof key === 'string');
                if (op.mode === 'replace') selected = new Set(keys);
                else {
                    const allSelected = keys.every((key) => selected.has(key));
                    for (const key of keys) allSelected ? selected.delete(key) : selected.add(key);
                }
                selectedLegend = legendSelection && keys.some((key) => selected.has(key))
                    ? legendSelection
                    : null;
            }
        }
        await sync();
    };
    const emitSemanticEvent = (
        interaction: InteractionDef,
        event: SemanticInteractionEvent,
        transactionId?: string,
    ): void => {
        const root = container.closest<HTMLElement>('[data-flint-chart-id]');
        const detail: FlintInteractionEventDetail = {
            chartId: root?.dataset.flintChartId ?? '',
            interactionId: interaction.id,
            timestamp: Date.now(),
            transactionId,
            event,
        };
        container.dispatchEvent(new CustomEvent<FlintInteractionEventDetail>('flint-interaction', {
            detail,
            bubbles: true,
            composed: true,
        }));
    };
    const dispatch = async (
        interaction: InteractionDef,
        event: SemanticInteractionEvent,
        legendSelection: { channel: string; value: unknown } | null = null,
    ): Promise<void> => {
        const interactionContext = context();
        emitSemanticEvent(interaction, event);
        const update = interaction.update(event, interactionContext);
        await applyUpdate(update ? presentUpdate(update, interactionContext) : null, legendSelection);
    };
    const dispatchExternal = async (event: ExternalInteractionEvent): Promise<void> => {
        for (const interaction of interactions) {
            const configuredSource = interaction.eventSource.source;
            const acceptsSource = interaction.eventSource.type === 'external';
            if (configuredSource && configuredSource !== event.source) continue;
            if (!acceptsSource) continue;
            const interactionContext = context();
            const update = interaction.update(event, interactionContext);
            await applyUpdate(update ? presentUpdate(update, interactionContext) : null);
        }
    };
    const resolveTarget = (
        gesture: 'click' | 'hover' | 'rectangle',
        role: string,
        hits: readonly RenderHit[],
        legendValue?: unknown,
        legendField?: string,
    ): SemanticTarget | null => {
        const availableHits = allHits();
        return resolve(
            { gesture, role, hits, legendValue, legendField },
            resolveContext(availableHits),
        );
    };

    let hoveredKeys = '';
    const setHover = async (
        keys: readonly string[],
        legend: { channel: string; value: unknown } | null = null,
    ): Promise<void> => {
        const next = [...new Set(keys)].sort();
        const signature = `${next.join('\u0000')}\u0001${legend?.channel ?? ''}\u0000${String(legend?.value ?? '')}`;
        if (signature === hoveredKeys) return;
        hoveredKeys = signature;
        hoveredPathKeys = new Set(next.filter((key) => key.endsWith(PATH_KEY_SUFFIX)));
        view.change(
            HOVER_STORE,
            changeset().remove(() => true).insert(next.map((key) => ({ key }))),
        );
        view.change(
            LEGEND_HOVER_STORE,
            changeset().remove(() => true).insert(legend ? [legend] : []),
        );
        await view.runAsync();
        renderPathFocus();
    };
    const clearHover = (): void => {
        void setHover([]);
        if (!rectangleInteraction) container.style.cursor = previousCursor;
    };
    const hoverHandler = (event: MouseEvent, item: any): void => {
        if (!clickInteraction || dragStart) return;
        const point = localPoint(event as unknown as PointerEvent);
        const normalized = normalizeVegaElementEvent(
            view, item, point, 'preview', interactionModifiers(event), plan.legendFields,
        );
        const legend = normalized.legend;
        if (legend) {
            if (!rectangleInteraction) container.style.cursor = 'pointer';
            void setHover([],
                legend.channel ? { channel: legend.channel, value: legend.value } : null);
            return;
        }
        const hovered = normalized.event.hits[0];
        if (!hovered) {
            clearHover();
            return;
        }
        if (!rectangleInteraction) container.style.cursor = 'pointer';
        const resolved = resolveTarget('hover', normalized.role, normalized.event.hits);
        const target = clickInteraction.actOn?.(resolved, context()) ?? resolved;
        emitSemanticEvent(clickInteraction, {
            type: 'semantic', source: 'element', phase: 'preview', target, point,
            modifiers: normalized.event.modifiers,
        });
        void setHover(target?.elements
            .map((element) => element.key[INTERACTION_KEY])
            .filter((key): key is string => typeof key === 'string') ?? []);
    };

    const clickHandler = (event: MouseEvent, item: any): void => {
        if (!clickInteraction || suppressClick) return;
        const point = localPoint(event as unknown as PointerEvent);
        const normalized = normalizeVegaElementEvent(
            view, item, point, 'commit', interactionModifiers(event), plan.legendFields,
        );
        const { legend } = normalized;
        const target = resolveTarget(
            'click', normalized.role, normalized.event.hits, legend?.value, legend?.field,
        );
        void dispatch(clickInteraction, {
            type: 'semantic', source: 'element', phase: 'commit', target, point,
            modifiers: normalized.event.modifiers,
        }, legend?.channel ? { channel: legend.channel, value: legend.value } : null);
    };
    view.addEventListener('click', clickHandler);
    view.addEventListener('mousemove', hoverHandler);
    view.addEventListener('mouseout', clearHover);

    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
        position: 'absolute', display: 'none', pointerEvents: 'none',
        boxSizing: 'border-box',
        border: '1px solid rgba(37, 99, 235, 0.85)', background: 'rgba(37, 99, 235, 0.12)',
    });
    const previousPosition = container.style.position;
    const previousUserSelect = container.style.userSelect;
    const previousCursor = container.style.cursor;
    if (rectangleInteraction) {
        if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
        container.style.userSelect = 'none';
        container.style.cursor = 'crosshair';
        container.append(overlay);
        container.tabIndex = container.tabIndex >= 0 ? container.tabIndex : 0;
    }

    const localPoint = (event: PointerEvent): { x: number; y: number } => {
        return clientToPlotPoint({ x: event.clientX, y: event.clientY }, coordinateSpace());
    };
    const showRegion = (a: { x: number; y: number }, b: { x: number; y: number }): void => {
        const space = coordinateSpace();
        const leading = plotToClientPoint({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }, space);
        const trailing = plotToClientPoint({ x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) }, space);
        const containerRect = container.getBoundingClientRect();
        const layoutSize = containerLayoutSize();
        const localLeading = clientToLayoutPoint(leading, containerRect, layoutSize);
        const localTrailing = clientToLayoutPoint(trailing, containerRect, layoutSize);
        Object.assign(overlay.style, {
            display: 'block',
            left: `${localLeading.x}px`,
            top: `${localLeading.y}px`,
            width: `${localTrailing.x - localLeading.x}px`,
            height: `${localTrailing.y - localLeading.y}px`,
        });
    };
    const pointerDown = (event: PointerEvent): void => {
        if (!rectangleInteraction || event.button !== 0) return;
        clearHover();
        dragStart = localPoint(event);
        pointerId = event.pointerId;
        committed = new Set(selected);
        container.setPointerCapture(event.pointerId);
    };
    const pointerMove = (event: PointerEvent): void => {
        if (!rectangleInteraction || !dragStart || pointerId !== event.pointerId) return;
        const point = localPoint(event);
        if (Math.hypot(point.x - dragStart.x, point.y - dragStart.y) < 4) return;
        suppressClick = true;
        showRegion(dragStart, point);
        const normalized = normalizeVegaRegionEvent(
            view, dragStart, point, 'preview', rectangleInteraction.eventSource.match ?? 'intersect',
            interactionModifiers(event),
        );
        selected = new Set(committed);
        void dispatch(rectangleInteraction, {
            type: 'semantic', source: 'region', phase: 'preview',
            target: resolveTarget('rectangle', 'region', normalized.hits),
            region: normalized.region, modifiers: normalized.modifiers,
        });
    };
    const finishDrag = (event: PointerEvent): void => {
        if (!rectangleInteraction || !dragStart || pointerId !== event.pointerId) return;
        const point = localPoint(event);
        const dragged = Math.hypot(point.x - dragStart.x, point.y - dragStart.y) >= 4;
        if (dragged) {
            const normalized = normalizeVegaRegionEvent(
                view, dragStart, point, 'commit', rectangleInteraction.eventSource.match ?? 'intersect',
                interactionModifiers(event),
            );
            selected = new Set(committed);
            void dispatch(rectangleInteraction, {
                type: 'semantic', source: 'region', phase: 'commit',
                target: resolveTarget('rectangle', 'region', normalized.hits),
                region: normalized.region, modifiers: normalized.modifiers,
            });
        } else {
            const normalized = normalizeVegaRegionEvent(
                view, dragStart, point, 'commit', rectangleInteraction.eventSource.match ?? 'intersect',
                interactionModifiers(event),
            );
            selected = new Set(committed);
            void dispatch(rectangleInteraction, {
                type: 'semantic', source: 'region', phase: 'commit', target: null,
                region: normalized.region, modifiers: normalized.modifiers,
            });
        }
        dragStart = undefined;
        pointerId = undefined;
        overlay.style.display = 'none';
        if (container.hasPointerCapture(event.pointerId)) container.releasePointerCapture(event.pointerId);
        if (dragged) window.setTimeout(() => { suppressClick = false; }, 0);
    };
    const cancelDrag = (event: PointerEvent): void => {
        if (!rectangleInteraction || !dragStart || pointerId !== event.pointerId) return;
        selected = new Set(committed);
        dragStart = undefined;
        pointerId = undefined;
        overlay.style.display = 'none';
        if (container.hasPointerCapture(event.pointerId)) container.releasePointerCapture(event.pointerId);
        void sync();
    };
    const keyDown = (event: KeyboardEvent): void => {
        if (event.key !== 'Escape') return;
        if (dragStart) selected = new Set(committed);
        else {
            selected.clear();
            clearAnnotation();
        }
        dragStart = undefined;
        pointerId = undefined;
        overlay.style.display = 'none';
        void sync();
    };
    container.addEventListener('pointerdown', pointerDown);
    container.addEventListener('pointermove', pointerMove);
    container.addEventListener('pointerup', finishDrag);
    container.addEventListener('pointercancel', cancelDrag);
    container.addEventListener('keydown', keyDown);

    const customSourceCleanups = interactions.flatMap((interaction) => {
        if (!interaction.eventSource?.mount) return [];
        const cleanup = interaction.eventSource.mount({
            container,
            emit(event: NormalizedInteractionEvent) {
                if (event.type === 'external') {
                    void dispatchExternal(event);
                    return;
                }
                const gesture = event.type === 'region' ? 'rectangle' : 'click';
                const role = event.type === 'region' ? 'region' : 'mark';
                const target = resolveTarget(gesture, role, event.hits);
                void dispatch(interaction, {
                    type: 'semantic',
                    source: event.type,
                    phase: event.phase,
                    target,
                    point: event.type === 'element' ? event.point : undefined,
                    region: event.type === 'region' ? event.region : undefined,
                    modifiers: event.modifiers,
                });
            },
        });
        return cleanup ? [cleanup] : [];
    });

    const destroy = (): void => {
        view.removeEventListener('click', clickHandler);
        view.removeEventListener('mousemove', hoverHandler);
        view.removeEventListener('mouseout', clearHover);
        container.removeEventListener('pointerdown', pointerDown);
        container.removeEventListener('pointermove', pointerMove);
        container.removeEventListener('pointerup', finishDrag);
        container.removeEventListener('pointercancel', cancelDrag);
        container.removeEventListener('keydown', keyDown);
        overlay.remove();
        focusLayer.remove();
        annotationLayer.remove();
        container.style.position = previousPosition;
        container.style.userSelect = previousUserSelect;
        container.style.cursor = previousCursor;
        for (const cleanup of customSourceCleanups) cleanup();
    };
    return { dispatch: dispatchExternal, destroy };
}