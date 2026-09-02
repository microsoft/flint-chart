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
    resetViewport?(): void;
}

export interface VegaRegionGestureController {
    sync(): void;
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
        resetViewport,
    } = options;
    const regionAxis: CartesianRegionAxis = interaction.eventSource.axis ?? 'xy';
    const angularBrush = interaction.eventSource.regionGeometry === 'angular';
    const lassoBrush = interaction.eventSource.regionGeometry === 'lasso';
    const statefulBrush = !angularBrush && !lassoBrush
        && interaction.eventSource.mode === 'stateful' && regionAxis !== 'xy';
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
        if (angularBrush) {
            const frame = frameAt(point);
            if (!frame) return;
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
        dragStart = point;
        pointerId = event.pointerId;
        committed = new Set(getSelected());
        setDragging(true);
        container.setPointerCapture(event.pointerId);
    };
    const pointerMove = (event: PointerEvent): void => {
        if (!dragStart || pointerId !== event.pointerId) {
            if (statefulAngular && activeSector) {
                const point = localPoint(event);
                const action = pointInAngularSector(point, activeSector)
                    ? angularEditAction(polarPointerAngle(point, activeSector), activeSector)
                    : undefined;
                container.style.cursor = action?.startsWith('resize') ? 'ew-resize'
                    : action === 'move' ? 'grab' : 'crosshair';
                return;
            }
            if (statefulBrush && activeInterval) {
                const point = localPoint(event);
                const insideFrame = !activePlotFrame
                    || point.x >= activePlotFrame.x && point.x <= activePlotFrame.x + activePlotFrame.width
                        && point.y >= activePlotFrame.y && point.y <= activePlotFrame.y + activePlotFrame.height;
                const value = axisValue(point, intervalAxis());
                const nearEdge = Math.abs(value - activeInterval.leading) <= 8
                    || Math.abs(value - activeInterval.trailing) <= 8;
                container.style.cursor = insideFrame && nearEdge
                    ? regionAxis === 'x' ? 'ew-resize' : 'ns-resize'
                    : insideFrame && value > activeInterval.leading && value < activeInterval.trailing ? 'grab' : 'crosshair';
            }
            return;
        }
        const point = localPoint(event);
        if (lassoBrush) {
            const last = lassoPoints[lassoPoints.length - 1];
            if (last && Math.hypot(point.x - last.x, point.y - last.y) < 2) return;
            lassoPoints.push(point);
            if (lassoPoints.length < 3) return;
            setSuppressClick(true);
            showLasso(lassoPoints);
            dispatchLasso('preview', lassoPoints, event);
            return;
        }
        if (angularBrush) {
            if (initialSector && angularSession) {
                const edited = sectorForEdit(polarPointerAngle(point, angularSession.frame));
                if (!edited) return;
                setSuppressClick(true);
                showAngularSector(edited);
                dispatchAngularRegion('preview', edited, event, angularAction);
                return;
            }
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
        if (interval) showInterval(interval);
        else showRegion(dragStart, point);
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
                const points = interval ? intervalPoints(interval, intervalAxis()) : { start: dragStart, end: point };
                dispatchRegion('commit', points.start, points.end, event, dragAction);
                if (statefulBrush && interval) {
                    activeInterval = interval;
                    activePlotFrame = dragPlotFrame;
                    showInterval(interval);
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
                const clickedOutside = !activeInterval || axisValue(point, intervalAxis()) < activeInterval.leading
                    || axisValue(point, intervalAxis()) > activeInterval.trailing;
                if (!statefulBrush || clickedOutside) {
                    activeInterval = undefined;
                    activePlotFrame = undefined;
                    committed.clear();
                    dispatchRegion('commit', dragStart, point, event, 'clear', null);
                }
            }
        }
        dragStart = undefined;
        pointerId = undefined;
        initialInterval = undefined;
        initialSector = undefined;
        angularAction = 'create';
        angularSession = undefined;
        dragPlotFrame = undefined;
        setDragging(false);
        if (!statefulBrush || !activeInterval) overlay.style.display = 'none';
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
        angularSession = undefined;
        lassoPoints = [];
        dragPlotFrame = undefined;
        lassoOverlay.style.display = 'none';
        setDragging(false);
        if (statefulBrush && activeInterval) showInterval(activeInterval);
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
    const keyDown = (event: KeyboardEvent): void => {
        if (event.key !== 'Escape') return;
        if (interaction.eventSource.viewport) resetViewport?.();
        if (dragStart) {
            setSelected(new Set(committed));
            if (statefulBrush && initialInterval) activeInterval = initialInterval;
        } else {
            setSelected(new Set());
            activeInterval = undefined;
            activePlotFrame = undefined;
            activeSector = undefined;
            clearAnnotation();
        }
        dragStart = undefined;
        pointerId = undefined;
        initialInterval = undefined;
        dragPlotFrame = undefined;
        setDragging(false);
        overlay.style.display = 'none';
        angularOverlay.style.display = 'none';
        void sync();
    };
    const doubleClick = (event: MouseEvent): void => {
        if (!interaction.eventSource.viewport) return;
        event.preventDefault();
        resetViewport?.();
    };

    container.addEventListener('pointerdown', pointerDown, true);
    container.addEventListener('pointermove', pointerMove, true);
    container.addEventListener('pointerup', finishDrag, true);
    container.addEventListener('pointercancel', cancelDrag, true);
    container.addEventListener('keydown', keyDown);
    container.addEventListener('dblclick', doubleClick);

    return {
        sync(): void {
            if (statefulBrush && activeInterval) showInterval(activeInterval);
            if (statefulAngular && activeSector) showAngularSector(activeSector);
        },
        destroy(): void {
            container.removeEventListener('pointerdown', pointerDown, true);
            container.removeEventListener('pointermove', pointerMove, true);
            container.removeEventListener('pointerup', finishDrag, true);
            container.removeEventListener('pointercancel', cancelDrag, true);
            container.removeEventListener('keydown', keyDown);
            container.removeEventListener('dblclick', doubleClick);
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