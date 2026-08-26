import type {
    InteractionDef,
    PlotAngularSector,
    PlotPoint,
    RenderHit,
    SemanticInteractionEvent,
    SemanticTarget,
} from '../../../interactive/interactions';
import { angularSectorPath } from '../../../interactive/geometry/angular';
import { AngularRegionSession, type PolarFrame } from '../../../interactive/gestures/angular-region';
import {
    axisValue,
    cartesianDragDistance,
    constrainCartesianRegion,
    intervalPoints,
    updateInterval,
    type CartesianRegionAxis,
    type Interval,
    type IntervalOperation,
} from '../../../interactive/gestures/cartesian-region';
import {
    clientRectToLayoutRect,
    clientToLayoutPoint,
    clientToPlotPoint,
    interactionModifiers,
    normalizeVegaAngularRegionEvent,
    normalizeVegaRegionEvent,
    plotToClientPoint,
    sceneItems,
    type RendererCoordinateSpace,
} from '../hit-adapter';

export interface VegaRegionGestureOptions {
    view: any;
    container: HTMLElement;
    interaction: InteractionDef;
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
    destroy(): void;
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
    const statefulBrush = interaction.eventSource.mode === 'stateful' && regionAxis !== 'xy';
    let committed = new Set<string>();
    let dragStart: PlotPoint | undefined;
    let pointerId: number | undefined;
    let dragAction: IntervalOperation = 'create';
    let activeInterval: Interval | undefined;
    let initialInterval: Interval | undefined;
    let angularSession: AngularRegionSession | undefined;

    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
        position: 'absolute', display: 'none', zIndex: '5', pointerEvents: 'none',
        boxSizing: 'border-box',
        border: '1px solid rgba(37, 99, 235, 0.85)', background: 'rgba(37, 99, 235, 0.12)',
    });
    const angularOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const angularPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    angularPath.setAttribute('fill', 'rgba(37, 99, 235, 0.12)');
    angularPath.setAttribute('stroke', 'rgba(37, 99, 235, 0.85)');
    angularPath.setAttribute('stroke-width', '1');
    angularPath.setAttribute('vector-effect', 'non-scaling-stroke');
    angularOverlay.append(angularPath);
    Object.assign(angularOverlay.style, {
        position: 'absolute', display: 'none', zIndex: '5', pointerEvents: 'none', overflow: 'visible',
    });

    const previousPosition = container.style.position;
    const previousUserSelect = container.style.userSelect;
    const previousCursor = container.style.cursor;
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.style.userSelect = 'none';
    container.style.cursor = 'crosshair';
    container.append(angularBrush ? angularOverlay : overlay);
    container.tabIndex = container.tabIndex >= 0 ? container.tabIndex : 0;

    const localPoint = (event: PointerEvent): PlotPoint => {
        return clientToPlotPoint({ x: event.clientX, y: event.clientY }, coordinateSpace());
    };
    const brushPlotSize = (): { width: number; height: number } => {
        const space = coordinateSpace();
        return { width: space.plotWidth, height: space.plotHeight };
    };
    const intervalAxis = (): 'x' | 'y' => regionAxis === 'y' ? 'y' : 'x';
    const axisLimit = (): number => intervalAxis() === 'y' ? brushPlotSize().height : brushPlotSize().width;
    const intervalForDrag = (point: PlotPoint): Interval => {
        return updateInterval(point, dragStart!, intervalAxis(), axisLimit(), dragAction, initialInterval);
    };
    const showRegion = (a: PlotPoint, b: PlotPoint): void => {
        const constrained = constrainCartesianRegion(a, b, regionAxis, brushPlotSize());
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
    const frameAt = (point: PlotPoint): PolarFrame | undefined => {
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
        return [...frames.values()].sort((left, right) =>
            Math.hypot(point.x - left.center.x, point.y - left.center.y)
            - Math.hypot(point.x - right.center.x, point.y - right.center.y))[0];
    };
    const showAngularSector = (sector: PlotAngularSector): void => {
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
    const dispatchAngularRegion = (
        phase: 'preview' | 'commit',
        sector: PlotAngularSector,
        event: PointerEvent,
    ): void => {
        const normalized = normalizeVegaAngularRegionEvent(
            view, sector, phase, interaction.eventSource.match ?? 'intersect',
            interactionModifiers(event), 'create',
        );
        setSelected(new Set(committed));
        void dispatch({
            type: 'semantic', source: 'region', phase,
            target: resolveTarget('angular', 'region', normalized.hits),
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
            interactionModifiers(event), regionAxis, brushPlotSize(), operation,
        );
        setSelected(new Set(committed));
        void dispatch({
            type: 'semantic', source: 'region', phase,
            target: target === undefined ? resolveTarget('rectangle', 'region', normalized.hits) : target,
            region: normalized.region, axis: normalized.axis, operation: normalized.operation,
            modifiers: normalized.modifiers,
        });
    };
    const pointerDown = (event: PointerEvent): void => {
        if (event.button !== 0) return;
        clearHover();
        const point = localPoint(event);
        if (angularBrush) {
            const frame = frameAt(point);
            if (!frame) return;
            angularSession = new AngularRegionSession(point, frame);
        }
        dragAction = 'create';
        initialInterval = activeInterval ? { ...activeInterval } : undefined;
        if (statefulBrush && activeInterval) {
            const value = axisValue(point, intervalAxis());
            const edgeTolerance = 8;
            if (Math.abs(value - activeInterval.leading) <= edgeTolerance) dragAction = 'resize-leading';
            else if (Math.abs(value - activeInterval.trailing) <= edgeTolerance) dragAction = 'resize-trailing';
            else if (value > activeInterval.leading && value < activeInterval.trailing) dragAction = 'move';
        }
        dragStart = point;
        pointerId = event.pointerId;
        committed = new Set(getSelected());
        setDragging(true);
        container.setPointerCapture(event.pointerId);
    };
    const pointerMove = (event: PointerEvent): void => {
        if (!dragStart || pointerId !== event.pointerId) {
            if (statefulBrush && activeInterval) {
                const value = axisValue(localPoint(event), intervalAxis());
                const nearEdge = Math.abs(value - activeInterval.leading) <= 8
                    || Math.abs(value - activeInterval.trailing) <= 8;
                container.style.cursor = nearEdge
                    ? regionAxis === 'x' ? 'ew-resize' : 'ns-resize'
                    : value > activeInterval.leading && value < activeInterval.trailing ? 'grab' : 'crosshair';
            }
            return;
        }
        const point = localPoint(event);
        if (angularBrush) {
            angularSession?.move(point);
            if (!angularSession || angularSession.dragDistance() < 4) return;
            setSuppressClick(true);
            const sector = angularSession.sector();
            showAngularSector(sector);
            dispatchAngularRegion('preview', sector, event);
            return;
        }
        if (cartesianDragDistance(dragStart, point, regionAxis) < 4) return;
        setSuppressClick(true);
        const interval = regionAxis === 'xy' ? undefined : intervalForDrag(point);
        const points = interval ? intervalPoints(interval, intervalAxis()) : { start: dragStart, end: point };
        interval ? showInterval(interval) : showRegion(dragStart, point);
        dispatchRegion('preview', points.start, points.end, event, dragAction);
    };
    const finishDrag = (event: PointerEvent): void => {
        if (!dragStart || pointerId !== event.pointerId) return;
        const point = localPoint(event);
        if (angularBrush) angularSession?.move(point);
        const dragged = angularBrush && angularSession
            ? angularSession.dragDistance() >= 4
            : cartesianDragDistance(dragStart, point, regionAxis) >= 4;
        if (dragged) {
            if (angularBrush) {
                dispatchAngularRegion('commit', angularSession!.sector(), event);
            } else {
                const interval = regionAxis === 'xy' ? undefined : intervalForDrag(point);
                const points = interval ? intervalPoints(interval, intervalAxis()) : { start: dragStart, end: point };
                dispatchRegion('commit', points.start, points.end, event, dragAction);
                if (statefulBrush && interval) {
                    activeInterval = interval;
                    showInterval(interval);
                }
            }
        } else {
            const clickedOutside = !activeInterval || axisValue(point, intervalAxis()) < activeInterval.leading
                || axisValue(point, intervalAxis()) > activeInterval.trailing;
            if (!statefulBrush || clickedOutside) {
                activeInterval = undefined;
                committed.clear();
                dispatchRegion('commit', dragStart, point, event, 'clear', null);
            }
        }
        dragStart = undefined;
        pointerId = undefined;
        initialInterval = undefined;
        angularSession = undefined;
        setDragging(false);
        if (!statefulBrush || !activeInterval) overlay.style.display = 'none';
        angularOverlay.style.display = 'none';
        if (container.hasPointerCapture(event.pointerId)) container.releasePointerCapture(event.pointerId);
        if (dragged) window.setTimeout(() => { setSuppressClick(false); }, 0);
    };
    const cancelDrag = (event: PointerEvent): void => {
        if (!dragStart || pointerId !== event.pointerId) return;
        setSelected(new Set(committed));
        dragStart = undefined;
        pointerId = undefined;
        initialInterval = undefined;
        angularSession = undefined;
        setDragging(false);
        if (statefulBrush && activeInterval) showInterval(activeInterval);
        else overlay.style.display = 'none';
        angularOverlay.style.display = 'none';
        if (container.hasPointerCapture(event.pointerId)) container.releasePointerCapture(event.pointerId);
        void sync();
    };
    const keyDown = (event: KeyboardEvent): void => {
        if (event.key !== 'Escape') return;
        if (dragStart) {
            setSelected(new Set(committed));
            if (statefulBrush && initialInterval) activeInterval = initialInterval;
        } else {
            setSelected(new Set());
            activeInterval = undefined;
            clearAnnotation();
        }
        dragStart = undefined;
        pointerId = undefined;
        initialInterval = undefined;
        setDragging(false);
        overlay.style.display = 'none';
        angularOverlay.style.display = 'none';
        void sync();
    };

    container.addEventListener('pointerdown', pointerDown, true);
    container.addEventListener('pointermove', pointerMove, true);
    container.addEventListener('pointerup', finishDrag, true);
    container.addEventListener('pointercancel', cancelDrag, true);
    container.addEventListener('keydown', keyDown);

    return {
        destroy(): void {
            container.removeEventListener('pointerdown', pointerDown, true);
            container.removeEventListener('pointermove', pointerMove, true);
            container.removeEventListener('pointerup', finishDrag, true);
            container.removeEventListener('pointercancel', cancelDrag, true);
            container.removeEventListener('keydown', keyDown);
            overlay.remove();
            angularOverlay.remove();
            setDragging(false);
            container.style.position = previousPosition;
            container.style.userSelect = previousUserSelect;
            container.style.cursor = previousCursor;
        },
    };
}