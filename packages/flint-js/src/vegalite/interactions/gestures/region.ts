import type {
    CanvasInteractionDef,
    PlotAngularSector,
    PlotPoint,
    RenderHit,
    SemanticInteractionEvent,
    SemanticTarget,
} from '../../../interactive/interactions';
import { angularSectorPath } from '../../../interactive/geometry/angular';
import { normalizeRegionGuideOptions } from '../../../interactive/guides';
import { AngularRegionSession, polarPointerAngle, type PolarFrame } from '../../../interactive/gestures/angular-region';
import {
    axisValue,
    cartesianDragDistance,
    constrainCartesianRegion,
    intervalPoints,
    updateInterval,
    type CartesianRegionAxis,
    type Interval,
    type IntervalOperation,
    type PlotFrame,
} from '../../../interactive/gestures/cartesian-region';
import {
    clientRectToLayoutRect,
    clientToLayoutPoint,
    clientToPlotPoint,
    interactionModifiers,
    facetPlotFrameAt,
    normalizeVegaAngularRegionEvent,
    normalizeVegaLassoEvent,
    normalizeVegaRegionEvent,
    polarFrameFromRadarGrid,
    plotToClientPoint,
    sceneItems,
    type RendererCoordinateSpace,
} from '../hit-adapter';

export interface VegaRegionGestureOptions {
    view: any;
    container: HTMLElement;
    interaction: CanvasInteractionDef;
    getSelected(): ReadonlySet<string>;
    setSelected(selected: Set<string>): void;
    coordinateSpace(): RendererCoordinateSpace;
    containerLayoutSize(): { width: number; height: number };
    resolveTarget(
        gesture: 'rectangle' | 'angular',
        role: 'region',
        hits: readonly RenderHit[],
    ): SemanticTarget | null;
    dispatch(event: SemanticInteractionEvent): Promise<void>;
    clearHover(): void;
    clearAnnotation(): void;
    sync(): Promise<void>;
    setSuppressClick(suppress: boolean): void;
    setDragging(dragging: boolean): void;
}

export interface VegaRegionGestureController {
    sync(): void;
    cursorAt(point: PlotPoint): string | undefined;
    /** Returns the gesture to its neutral state: no selection, no interval, no sector. A drag in progress is left alone. */
    reset(): void;
    destroy(): void;
}

export function isInteractiveControlTarget(target: EventTarget | null): boolean {
    const closest = (target as { closest?: (selector: string) => unknown } | null)?.closest;
    return typeof closest === 'function'
        && Boolean(closest.call(target, 'button, input, select, textarea, a[href], [role="button"]'));
}

const circularAngleDistance = (left: number, right: number): number =>
    Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right)));

function angleInAngularSector(angle: number, sector: PlotAngularSector): boolean {
    const sweep = sector.endAngle - sector.startAngle;
    if (Math.abs(sweep) >= Math.PI * 2) return true;
    const directedDistance = sweep >= 0
        ? (angle - sector.startAngle + Math.PI * 2) % (Math.PI * 2)
        : (sector.startAngle - angle + Math.PI * 2) % (Math.PI * 2);
    return directedDistance <= Math.abs(sweep);
}

export function angularEditAction(
    angle: number,
    sector: PlotAngularSector,
    edgeTolerance = 0.1,
): IntervalOperation | undefined {
    if (circularAngleDistance(angle, sector.startAngle) <= edgeTolerance) return 'resize-leading';
    if (circularAngleDistance(angle, sector.endAngle) <= edgeTolerance) return 'resize-trailing';
    return angleInAngularSector(angle, sector) ? 'move' : undefined;
}

export function pointInAngularSector(point: PlotPoint, sector: PlotAngularSector): boolean {
    const radius = Math.hypot(point.x - sector.center.x, point.y - sector.center.y);
    if (radius < sector.innerRadius || radius > sector.outerRadius) return false;
    return angleInAngularSector(polarPointerAngle(point, sector), sector);
}

export function mountVegaRegionGesture(options: VegaRegionGestureOptions): VegaRegionGestureController {
    const {
        view,
        container,
        interaction,
        getSelected,
        setSelected,
        coordinateSpace,
        containerLayoutSize,
        resolveTarget,
        dispatch,
        clearHover,
        clearAnnotation,
        sync,
        setSuppressClick,
        setDragging,
    } = options;
    const regionAxis: CartesianRegionAxis = interaction.eventSource.axis ?? 'xy';
    const angularBrush = interaction.eventSource.regionGeometry === 'angular';
    const lassoBrush = interaction.eventSource.regionGeometry === 'lasso';
    const statefulBrush = !angularBrush && !lassoBrush
        && interaction.eventSource.mode === 'stateful' && regionAxis !== 'xy';
    const statefulRectangle = !angularBrush && !lassoBrush
        && interaction.eventSource.mode === 'stateful' && regionAxis === 'xy';
    const statefulAngular = angularBrush && interaction.eventSource.mode === 'stateful';
    const guide = interaction.eventSource.regionGuide ?? normalizeRegionGuideOptions(undefined);
    let activeSector: PlotAngularSector | undefined;
    let initialSector: PlotAngularSector | undefined;
    let angularAction: IntervalOperation = 'create';
    let angularGrabAngle = 0;
    let committed = new Set<string>();
    let dragStart: PlotPoint | undefined;
    let pointerId: number | undefined;
    let dragAction: IntervalOperation = 'create';
    let activeInterval: Interval | undefined;
    let initialInterval: Interval | undefined;
    let activeRectangle: { start: PlotPoint; end: PlotPoint } | undefined;
    let initialRectangle: typeof activeRectangle;
    let rectangleActions: { x?: IntervalOperation; y?: IntervalOperation } = {};
    let angularSession: AngularRegionSession | undefined;
    let lassoPoints: PlotPoint[] = [];
    let activePlotFrame: PlotFrame | undefined;
    let dragPlotFrame: PlotFrame | undefined;

    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
        position: 'absolute', display: 'none', zIndex: '5', pointerEvents: 'none',
        boxSizing: 'border-box',
        border: `${guide.style.strokeWidth}px solid ${guide.style.stroke}`,
        borderColor: `color-mix(in srgb, ${guide.style.stroke} ${guide.style.strokeOpacity * 100}%, transparent)`,
        background: `color-mix(in srgb, ${guide.style.fill} ${guide.style.fillOpacity * 100}%, transparent)`,
    });
    const angularOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const angularPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    angularPath.setAttribute('fill', guide.style.fill);
    angularPath.setAttribute('fill-opacity', `${guide.style.fillOpacity}`);
    angularPath.setAttribute('stroke', guide.style.stroke);
    angularPath.setAttribute('stroke-opacity', `${guide.style.strokeOpacity}`);
    angularPath.setAttribute('stroke-width', `${guide.style.strokeWidth}`);
    angularPath.setAttribute('vector-effect', 'non-scaling-stroke');
    angularOverlay.append(angularPath);
    Object.assign(angularOverlay.style, {
        position: 'absolute', display: 'none', zIndex: '5', pointerEvents: 'none', overflow: 'visible',
    });

    const lassoOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const lassoFill = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    // The region is filled as if closed because that is what gets captured, but the
    // closing chord is never stroked while the path is still being drawn.
    lassoFill.setAttribute('fill', guide.style.fill);
    lassoFill.setAttribute('fill-opacity', `${guide.style.fillOpacity}`);
    lassoFill.setAttribute('fill-rule', 'evenodd');
    lassoFill.setAttribute('stroke', 'none');
    const lassoPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    lassoPath.setAttribute('fill', 'none');
    lassoPath.setAttribute('stroke', guide.style.stroke);
    lassoPath.setAttribute('stroke-opacity', `${guide.style.strokeOpacity}`);
    lassoPath.setAttribute('stroke-width', `${guide.style.strokeWidth}`);
    lassoPath.setAttribute('stroke-linejoin', 'round');
    lassoPath.setAttribute('stroke-linecap', 'round');
    lassoPath.setAttribute('vector-effect', 'non-scaling-stroke');
    lassoOverlay.append(lassoFill, lassoPath);
    Object.assign(lassoOverlay.style, {
        position: 'absolute', display: 'none', zIndex: '5', pointerEvents: 'none', overflow: 'visible',
    });

    const previousPosition = container.style.position;
    const previousUserSelect = container.style.userSelect;
    const previousCursor = container.style.cursor;
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.style.userSelect = 'none';
    container.append(angularBrush ? angularOverlay : lassoBrush ? lassoOverlay : overlay);
    container.tabIndex = container.tabIndex >= 0 ? container.tabIndex : 0;

    const localPoint = (event: PointerEvent): PlotPoint => {
        return clientToPlotPoint({ x: event.clientX, y: event.clientY }, coordinateSpace());
    };
    const rootPlotFrame = (): PlotFrame => {
        const space = coordinateSpace();
        return { x: 0, y: 0, width: space.plotWidth, height: space.plotHeight };
    };
    const brushPlotFrame = (): PlotFrame => dragPlotFrame ?? activePlotFrame ?? rootPlotFrame();
    const intervalAxis = (): 'x' | 'y' => regionAxis === 'y' ? 'y' : 'x';
    const intervalForDrag = (point: PlotPoint): Interval => {
        const frame = brushPlotFrame();
        const axis = intervalAxis();
        const origin = axis === 'y' ? frame.y : frame.x;
        const limit = axis === 'y' ? frame.height : frame.width;
        const localPoint = { ...point, [axis]: axisValue(point, axis) - origin };
        const localStart = { ...dragStart!, [axis]: axisValue(dragStart!, axis) - origin };
        const localInitial = initialInterval && {
            leading: initialInterval.leading - origin,
            trailing: initialInterval.trailing - origin,
        };
        const interval = updateInterval(localPoint, localStart, axis, limit, dragAction, localInitial);
        return { leading: interval.leading + origin, trailing: interval.trailing + origin };
    };
    const rectangleEditActions = (point: PlotPoint): typeof rectangleActions => {
        if (!activeRectangle) return {};
        const { start, end } = activeRectangle;
        if (point.x < start.x - 8 || point.x > end.x + 8 || point.y < start.y - 8 || point.y > end.y + 8) return {};
        const horizontal = Math.abs(point.x - start.x) <= 8 ? 'resize-leading'
            : Math.abs(point.x - end.x) <= 8 ? 'resize-trailing' : undefined;
        const vertical = Math.abs(point.y - start.y) <= 8 ? 'resize-leading'
            : Math.abs(point.y - end.y) <= 8 ? 'resize-trailing' : undefined;
        return horizontal || vertical ? { x: horizontal, y: vertical } : { x: 'move', y: 'move' };
    };
    const rectangleForDrag = (point: PlotPoint): NonNullable<typeof activeRectangle> => {
        const frame = brushPlotFrame();
        const updateAxis = (axis: 'x' | 'y'): Interval => {
            const origin = axis === 'x' ? frame.x : frame.y;
            const initial = initialRectangle && {
                leading: initialRectangle.start[axis] - origin,
                trailing: initialRectangle.end[axis] - origin,
            };
            const action = rectangleActions[axis];
            const interval = initial && dragAction !== 'create' && !action ? initial : updateInterval(
                { ...point, [axis]: point[axis] - origin },
                { ...dragStart!, [axis]: dragStart![axis] - origin },
                axis, axis === 'x' ? frame.width : frame.height, action ?? 'create', initial,
            );
            return { leading: interval.leading + origin, trailing: interval.trailing + origin };
        };
        const horizontal = updateAxis('x');
        const vertical = updateAxis('y');
        return { start: { x: horizontal.leading, y: vertical.leading }, end: { x: horizontal.trailing, y: vertical.trailing } };
    };
    const showRegion = (a: PlotPoint, b: PlotPoint): void => {
        if (!guide.visible) return;
        const constrained = constrainCartesianRegion(a, b, regionAxis, brushPlotFrame());
        const space = coordinateSpace();
        const leading = plotToClientPoint({
            x: Math.min(constrained.start.x, constrained.end.x),
            y: Math.min(constrained.start.y, constrained.end.y),
        }, space);
        const trailing = plotToClientPoint({
            x: Math.max(constrained.start.x, constrained.end.x),
            y: Math.max(constrained.start.y, constrained.end.y),
        }, space);
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
    const showInterval = (interval: Interval): void => {
        const points = intervalPoints(interval, intervalAxis());
        showRegion(points.start, points.end);
    };
    const frameAt = (point: PlotPoint, plotFrame: PlotFrame): PolarFrame => {
        const frames = new Map<string, PolarFrame>();
        for (const item of sceneItems(view)) {
            if (item.mark?.marktype !== 'arc' || typeof item.x !== 'number' || typeof item.y !== 'number'
                || typeof item.innerRadius !== 'number' || typeof item.outerRadius !== 'number') continue;
            const key = `${item.x}\u0000${item.y}`;
            const existing = frames.get(key);
            frames.set(key, existing ? {
                center: existing.center,
                innerRadius: Math.min(existing.innerRadius, item.innerRadius),
                outerRadius: Math.max(existing.outerRadius, item.outerRadius),
            } : {
                center: { x: item.x, y: item.y },
                innerRadius: item.innerRadius,
                outerRadius: item.outerRadius,
            });
        }
        const arcFrame = [...frames.values()].sort((left, right) =>
            Math.hypot(point.x - left.center.x, point.y - left.center.y)
            - Math.hypot(point.x - right.center.x, point.y - right.center.y))[0];
        return arcFrame ?? polarFrameFromRadarGrid(view, point) ?? {
            center: {
                x: plotFrame.x + plotFrame.width / 2,
                y: plotFrame.y + plotFrame.height / 2,
            },
            innerRadius: 0,
            outerRadius: Math.min(plotFrame.width, plotFrame.height) / 2,
        };
    };
    const showAngularSector = (sector: PlotAngularSector): void => {
        if (!guide.visible) return;
        const space = coordinateSpace();
        const renderer = container.querySelector('svg') as SVGSVGElement | null;
        const containerRect = container.getBoundingClientRect();
        const rendererRect = renderer?.getBoundingClientRect() ?? space.rect;
        const rendererLayout = clientRectToLayoutRect(rendererRect, containerRect, containerLayoutSize());
        Object.assign(angularOverlay.style, {
            display: 'block',
            left: `${rendererLayout.left}px`,
            top: `${rendererLayout.top}px`,
            width: `${rendererLayout.width}px`,
            height: `${rendererLayout.height}px`,
        });
        angularOverlay.setAttribute('viewBox', `0 0 ${space.logicalWidth} ${space.logicalHeight}`);
        angularPath.setAttribute('d', angularSectorPath({
            ...sector,
            center: { x: sector.center.x + space.originX, y: sector.center.y + space.originY },
        }));
    };
    const angleDelta = (from: number, to: number): number =>
        Math.atan2(Math.sin(from - to), Math.cos(from - to));
    const sectorForEdit = (angle: number): PlotAngularSector | undefined => {
        if (!initialSector) return undefined;
        const delta = angleDelta(angle, angularGrabAngle);
        if (angularAction === 'move') {
            return {
                ...initialSector,
                startAngle: initialSector.startAngle + delta,
                endAngle: initialSector.endAngle + delta,
            };
        }
        if (angularAction === 'resize-leading') {
            return { ...initialSector, startAngle: initialSector.startAngle + delta };
        }
        if (angularAction === 'resize-trailing') {
            return { ...initialSector, endAngle: initialSector.endAngle + delta };
        }
        return undefined;
    };
    const dispatchAngularRegion = (
        phase: 'preview' | 'commit',
        sector: PlotAngularSector,
        event: PointerEvent,
        operation: IntervalOperation | 'clear' = 'create',
        target: SemanticTarget | null | undefined = undefined,
    ): void => {
        const normalized = normalizeVegaAngularRegionEvent(
            view, sector, phase, interaction.eventSource.match ?? 'intersect',
            interactionModifiers(event), operation,
        );
        setSelected(new Set(committed));
        void dispatch({
            type: 'semantic', source: 'region', phase,
            target: target === undefined ? resolveTarget('angular', 'region', normalized.hits) : target,
            region: normalized.region, axis: normalized.axis, operation: normalized.operation,
            modifiers: normalized.modifiers,
        });
    };
    const showLasso = (points: readonly PlotPoint[]): void => {
        if (!guide.visible) return;
        const space = coordinateSpace();
        const renderer = container.querySelector('svg') as SVGSVGElement | null;
        const containerRect = container.getBoundingClientRect();
        const rendererRect = renderer?.getBoundingClientRect() ?? space.rect;
        const rendererLayout = clientRectToLayoutRect(rendererRect, containerRect, containerLayoutSize());
        Object.assign(lassoOverlay.style, {
            display: 'block',
            left: `${rendererLayout.left}px`,
            top: `${rendererLayout.top}px`,
            width: `${rendererLayout.width}px`,
            height: `${rendererLayout.height}px`,
        });
        lassoOverlay.setAttribute('viewBox', `0 0 ${space.logicalWidth} ${space.logicalHeight}`);
        const outline = points
            .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x + space.originX} ${point.y + space.originY}`)
            .join(' ');
        lassoFill.setAttribute('d', `${outline} Z`);
        lassoPath.setAttribute('d', outline);
    };
    const dispatchLasso = (
        phase: 'preview' | 'commit',
        points: readonly PlotPoint[],
        event: PointerEvent,
    ): void => {
        const normalized = normalizeVegaLassoEvent(
            view, points, phase, interaction.eventSource.match ?? 'intersect', interactionModifiers(event),
        );
        setSelected(new Set(committed));
        void dispatch({
            type: 'semantic', source: 'region', phase,
            target: resolveTarget('rectangle', 'region', normalized.hits),
            region: normalized.region, axis: normalized.axis, operation: normalized.operation,
            modifiers: normalized.modifiers,
        });
    };
    const dispatchRegion = (
        phase: 'preview' | 'commit',
        start: PlotPoint,
        end: PlotPoint,
        event: PointerEvent,
        operation: IntervalOperation | 'clear',
        target: SemanticTarget | null | undefined = undefined,
    ): void => {
        const normalized = normalizeVegaRegionEvent(
            view, start, end, phase, interaction.eventSource.match ?? 'intersect',
            interactionModifiers(event), regionAxis, brushPlotFrame(), operation,
            !interaction.eventSource.viewport,
        );
        setSelected(new Set(committed));
        void dispatch({
            type: 'semantic', source: 'region', phase,
            target: target === undefined
                ? interaction.eventSource.viewport ? null : resolveTarget('rectangle', 'region', normalized.hits)
                : target,
            region: normalized.region, axis: normalized.axis, operation: normalized.operation,
            modifiers: normalized.modifiers,
        });
    };
    const pointerDown = (event: PointerEvent): void => {
        if (event.button !== 0 || isInteractiveControlTarget(event.target)) return;
        clearHover();
        const point = localPoint(event);
        const candidateFrame = facetPlotFrameAt(view, point, rootPlotFrame());
        if (!candidateFrame) return;
        if (angularBrush) {
            const frame = frameAt(point, candidateFrame);
            angularSession = new AngularRegionSession(point, frame);
            angularAction = 'create';
            initialSector = undefined;
            if (statefulAngular && activeSector) {
                const angle = polarPointerAngle(point, frame);
                angularAction = pointInAngularSector(point, activeSector)
                    ? angularEditAction(angle, activeSector) ?? 'create'
                    : 'create';
                if (angularAction !== 'create') {
                    initialSector = { ...activeSector };
                    angularGrabAngle = angle;
                }
            }
        }
        dragAction = 'create';
        initialInterval = activeInterval ? { ...activeInterval } : undefined;
        initialRectangle = activeRectangle;
        rectangleActions = {};
        const insideActiveFrame = !activePlotFrame
            || point.x >= activePlotFrame.x && point.x <= activePlotFrame.x + activePlotFrame.width
                && point.y >= activePlotFrame.y && point.y <= activePlotFrame.y + activePlotFrame.height;
        dragPlotFrame = candidateFrame;
        if (lassoBrush) lassoPoints = [point];
        if (statefulBrush && activeInterval && insideActiveFrame) {
            const value = axisValue(point, intervalAxis());
            const edgeTolerance = 8;
            if (Math.abs(value - activeInterval.leading) <= edgeTolerance) dragAction = 'resize-leading';
            else if (Math.abs(value - activeInterval.trailing) <= edgeTolerance) dragAction = 'resize-trailing';
            else if (value > activeInterval.leading && value < activeInterval.trailing) dragAction = 'move';
            if (dragAction !== 'create') dragPlotFrame = activePlotFrame;
        }
        if (statefulRectangle && activeRectangle && insideActiveFrame) {
            rectangleActions = rectangleEditActions(point);
            dragAction = rectangleActions.x ?? rectangleActions.y ?? 'create';
            if (dragAction !== 'create') dragPlotFrame = activePlotFrame;
        }
        dragStart = point;
        pointerId = event.pointerId;
        committed = new Set(getSelected());
        setDragging(true);
    };
    // Capture only once the pointer has actually moved into a drag. Capturing on
    // pointerdown would redirect the following click to the container, so a plain
    // click on a mark, legend entry, or axis label would never reach the renderer.
    const beginDragCapture = (event: PointerEvent): void => {
        setSuppressClick(true);
        const horizontalEdge = rectangleActions.x?.startsWith('resize');
        const verticalEdge = rectangleActions.y?.startsWith('resize');
        container.style.cursor = dragAction === 'move' || angularAction === 'move' ? 'move'
            : horizontalEdge && verticalEdge ? rectangleActions.x === rectangleActions.y ? 'nwse-resize' : 'nesw-resize'
                : horizontalEdge ? 'ew-resize' : verticalEdge ? 'ns-resize'
            : dragAction.startsWith('resize') ? regionAxis === 'y' ? 'ns-resize' : 'ew-resize'
                : angularAction.startsWith('resize') ? 'ew-resize' : 'crosshair';
        if (!container.hasPointerCapture(event.pointerId)) {
            try {
                container.setPointerCapture(event.pointerId);
            } catch {
                // Synthetic pointer events have no active pointer to capture.
            }
        }
    };
    const cursorAt = (point: PlotPoint): string | undefined => {
        if (activePlotFrame && (point.x < activePlotFrame.x || point.x > activePlotFrame.x + activePlotFrame.width
            || point.y < activePlotFrame.y || point.y > activePlotFrame.y + activePlotFrame.height)) return undefined;
        if (statefulRectangle && activeRectangle) {
            const actions = rectangleEditActions(point);
            const horizontalEdge = actions.x?.startsWith('resize');
            const verticalEdge = actions.y?.startsWith('resize');
            return horizontalEdge && verticalEdge ? actions.x === actions.y ? 'nwse-resize' : 'nesw-resize'
                : horizontalEdge ? 'ew-resize' : verticalEdge ? 'ns-resize'
                    : actions.x === 'move' ? 'grab' : undefined;
        }
        if (statefulBrush && activeInterval) {
            const value = axisValue(point, intervalAxis());
            if (Math.abs(value - activeInterval.leading) <= 8 || Math.abs(value - activeInterval.trailing) <= 8) {
                return regionAxis === 'x' ? 'ew-resize' : 'ns-resize';
            }
            return value > activeInterval.leading && value < activeInterval.trailing ? 'grab' : undefined;
        }
        if (statefulAngular && activeSector && pointInAngularSector(point, activeSector)) {
            const action = angularEditAction(polarPointerAngle(point, activeSector), activeSector);
            return action?.startsWith('resize') ? 'ew-resize' : action === 'move' ? 'grab' : undefined;
        }
        return undefined;
    };
    const pointerMove = (event: PointerEvent): void => {
        if (!dragStart || pointerId !== event.pointerId) {
            if (activeRectangle || activeInterval || activeSector) container.style.cursor = cursorAt(localPoint(event)) ?? 'crosshair';
            return;
        }
        const point = localPoint(event);
        if (lassoBrush) {
            const last = lassoPoints[lassoPoints.length - 1];
            if (last && Math.hypot(point.x - last.x, point.y - last.y) < 2) return;
            lassoPoints.push(point);
            if (lassoPoints.length < 3) return;
            beginDragCapture(event);
            showLasso(lassoPoints);
            dispatchLasso('preview', lassoPoints, event);
            return;
        }
        if (angularBrush) {
            if (initialSector && angularSession) {
                const edited = sectorForEdit(polarPointerAngle(point, angularSession.frame));
                if (!edited) return;
                beginDragCapture(event);
                showAngularSector(edited);
                dispatchAngularRegion('preview', edited, event, angularAction);
                return;
            }
            angularSession?.move(point);
            if (!angularSession || angularSession.dragDistance() < 4) return;
            beginDragCapture(event);
            const sector = angularSession.sector();
            showAngularSector(sector);
            dispatchAngularRegion('preview', sector, event);
            return;
        }
        if (cartesianDragDistance(dragStart, point, regionAxis) < 4) return;
        beginDragCapture(event);
        const interval = regionAxis === 'xy' ? undefined : intervalForDrag(point);
        const points = statefulRectangle ? rectangleForDrag(point)
            : interval ? intervalPoints(interval, intervalAxis()) : { start: dragStart, end: point };
        if (interval) showInterval(interval);
        else showRegion(points.start, points.end);
        dispatchRegion('preview', points.start, points.end, event, dragAction);
    };
    const finishDrag = (event: PointerEvent): void => {
        if (!dragStart || pointerId !== event.pointerId) return;
        const point = localPoint(event);
        if (lassoBrush) {
            if (lassoPoints.length >= 3) dispatchLasso('commit', lassoPoints, event);
            else {
                committed.clear();
                dispatchLasso('commit', [], event);
            }
            lassoPoints = [];
            lassoOverlay.style.display = 'none';
            dragStart = undefined;
            pointerId = undefined;
            setDragging(false);
            if (container.hasPointerCapture(event.pointerId)) container.releasePointerCapture(event.pointerId);
            window.setTimeout(() => { setSuppressClick(false); }, 0);
            return;
        }
        if (angularBrush && !initialSector) angularSession?.move(point);
        const editedSector = initialSector && angularSession
            ? sectorForEdit(polarPointerAngle(point, angularSession.frame))
            : undefined;
        const dragged = editedSector
            ? true
            : angularBrush && angularSession
                ? angularSession.dragDistance() >= 4
                : cartesianDragDistance(dragStart, point, regionAxis) >= 4;
        if (dragged) {
            if (angularBrush) {
                const sector = editedSector ?? angularSession!.sector();
                dispatchAngularRegion('commit', sector, event, editedSector ? angularAction : 'create');
                if (statefulAngular) {
                    activeSector = sector;
                    showAngularSector(sector);
                }
            } else {
                const interval = regionAxis === 'xy' ? undefined : intervalForDrag(point);
                const points = statefulRectangle ? rectangleForDrag(point)
                    : interval ? intervalPoints(interval, intervalAxis()) : { start: dragStart, end: point };
                dispatchRegion('commit', points.start, points.end, event, dragAction);
                if (statefulBrush && interval) {
                    activeInterval = interval;
                    activePlotFrame = dragPlotFrame;
                    showInterval(interval);
                }
                if (statefulRectangle) {
                    activeRectangle = points;
                    activePlotFrame = dragPlotFrame;
                    showRegion(points.start, points.end);
                }
            }
        } else if (!interaction.eventSource.viewport) {
            if (statefulAngular) {
                const clickedOutside = !activeSector || !pointInAngularSector(point, activeSector);
                if (clickedOutside) {
                    const clearSector = activeSector ?? angularSession?.sector();
                    activeSector = undefined;
                    committed.clear();
                    if (clearSector) dispatchAngularRegion('commit', clearSector, event, 'clear', null);
                }
            } else {
                const clickedOutside = statefulRectangle
                    ? !activeRectangle || point.x < activeRectangle.start.x || point.x > activeRectangle.end.x
                        || point.y < activeRectangle.start.y || point.y > activeRectangle.end.y
                    : !activeInterval || axisValue(point, intervalAxis()) < activeInterval.leading
                        || axisValue(point, intervalAxis()) > activeInterval.trailing;
                if ((!statefulBrush && !statefulRectangle) || clickedOutside) {
                    activeInterval = undefined;
                    activeRectangle = undefined;
                    activePlotFrame = undefined;
                    committed.clear();
                    dispatchRegion('commit', dragStart, point, event, 'clear', null);
                }
            }
        }
        dragStart = undefined;
        pointerId = undefined;
        initialInterval = undefined;
        initialRectangle = undefined;
        initialSector = undefined;
        angularAction = 'create';
        angularSession = undefined;
        dragPlotFrame = undefined;
        setDragging(false);
        if (!(statefulBrush && activeInterval) && !(statefulRectangle && activeRectangle)) overlay.style.display = 'none';
        if (!statefulAngular || !activeSector) angularOverlay.style.display = 'none';
        if (container.hasPointerCapture(event.pointerId)) container.releasePointerCapture(event.pointerId);
        if (dragged) window.setTimeout(() => { setSuppressClick(false); }, 0);
    };
    const cancelDrag = (event: PointerEvent): void => {
        if (!dragStart || pointerId !== event.pointerId) return;
        setSelected(new Set(committed));
        dragStart = undefined;
        pointerId = undefined;
        initialInterval = undefined;
        initialRectangle = undefined;
        angularSession = undefined;
        lassoPoints = [];
        dragPlotFrame = undefined;
        lassoOverlay.style.display = 'none';
        setDragging(false);
        if (statefulBrush && activeInterval) showInterval(activeInterval);
        else if (statefulRectangle && activeRectangle) showRegion(activeRectangle.start, activeRectangle.end);
        else overlay.style.display = 'none';
        if (statefulAngular && initialSector) {
            activeSector = initialSector;
            showAngularSector(activeSector);
        } else if (!statefulAngular || !activeSector) {
            angularOverlay.style.display = 'none';
        }
        initialSector = undefined;
        angularAction = 'create';
        if (container.hasPointerCapture(event.pointerId)) container.releasePointerCapture(event.pointerId);
        void sync();
    };
    const reset = (): void => {
        if (dragStart) return;
        setSelected(new Set());
        activeInterval = undefined;
        activeRectangle = undefined;
        activePlotFrame = undefined;
        activeSector = undefined;
        clearAnnotation();
        overlay.style.display = 'none';
        angularOverlay.style.display = 'none';
        void sync();
    };
    const keyDown = (event: KeyboardEvent): void => {
        // Escape during a drag cancels the drag. Committed state resets through the runtime's dispatcher.
        if (event.key !== 'Escape' || !dragStart) return;
        setSelected(new Set(committed));
        if (statefulBrush && initialInterval) activeInterval = initialInterval;
        if (statefulRectangle && initialRectangle) activeRectangle = initialRectangle;
        dragStart = undefined;
        pointerId = undefined;
        initialInterval = undefined;
        initialRectangle = undefined;
        dragPlotFrame = undefined;
        setDragging(false);
        overlay.style.display = 'none';
        if (statefulRectangle && activeRectangle) showRegion(activeRectangle.start, activeRectangle.end);
        angularOverlay.style.display = 'none';
        void sync();
    };

    container.addEventListener('pointerdown', pointerDown, true);
    container.addEventListener('pointermove', pointerMove, true);
    container.addEventListener('pointerup', finishDrag, true);
    container.addEventListener('pointercancel', cancelDrag, true);
    container.addEventListener('keydown', keyDown);

    return {
        reset,
        cursorAt,
        sync(): void {
            if (statefulBrush && activeInterval) showInterval(activeInterval);
            if (statefulRectangle && activeRectangle) showRegion(activeRectangle.start, activeRectangle.end);
            if (statefulAngular && activeSector) showAngularSector(activeSector);
        },
        destroy(): void {
            container.removeEventListener('pointerdown', pointerDown, true);
            container.removeEventListener('pointermove', pointerMove, true);
            container.removeEventListener('pointerup', finishDrag, true);
            container.removeEventListener('pointercancel', cancelDrag, true);
            container.removeEventListener('keydown', keyDown);
            overlay.remove();
            angularOverlay.remove();
            lassoOverlay.remove();
            setDragging(false);
            container.style.position = previousPosition;
            container.style.userSelect = previousUserSelect;
            container.style.cursor = previousCursor;
        },
    };
}