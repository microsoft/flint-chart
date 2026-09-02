import type {
    CanvasInteractionDef,
    NavigationAxes,
    NavigationInteractionEvent,
    PlotPoint,
} from '../../../interactive/interactions';
import { PanSession, PinchSession, wheelZoomFactor } from '../../../interactive/gestures/navigation';
import { clientToPlotPoint, interactionModifiers, type RendererCoordinateSpace } from '../hit-adapter';

export interface VegaNavigationGestureOptions {
    container: HTMLElement;
    interaction: CanvasInteractionDef;
    availableAxes: readonly ('x' | 'y')[];
    coordinateSpace(): RendererCoordinateSpace;
    dispatch(event: NavigationInteractionEvent): Promise<void>;
    setSuppressClick(suppress: boolean): void;
    setDragging(dragging: boolean): void;
}

export interface VegaNavigationGestureController {
    destroy(): void;
}

function resolvedAxes(requested: unknown, available: readonly ('x' | 'y')[]): NavigationAxes {
    const axes = requested === 'available'
        ? available
        : requested === 'xy'
        ? available.filter((axis) => axis === 'x' || axis === 'y')
        : available.filter((axis) => axis === requested);
    return axes.length === 2 ? 'xy' : axes[0] ?? 'xy';
}

export function mountVegaNavigationGesture(
    options: VegaNavigationGestureOptions,
): VegaNavigationGestureController {
    const {
        container,
        interaction,
        availableAxes,
        coordinateSpace,
        dispatch,
        setSuppressClick,
        setDragging,
    } = options;
    const source = interaction.eventSource;
    const axes = resolvedAxes(source.axes, availableAxes);
    let pointerId: number | undefined;
    let session: PanSession | undefined;
    let pendingDelta: PlotPoint = { x: 0, y: 0 };
    let dragged = false;
    const touchPointers = new Map<number, PlotPoint>();
    let pinchSession: PinchSession | undefined;

    const previousCursor = container.style.cursor;
    const previousTouchAction = container.style.touchAction;
    const previousUserSelect = container.style.userSelect;
    if (source.pan || source.zoom) {
        container.style.touchAction = 'none';
        container.style.userSelect = 'none';
    }

    const localPoint = (event: PointerEvent): PlotPoint => clientToPlotPoint(
        { x: event.clientX, y: event.clientY },
        coordinateSpace(),
    );
    const emit = (event: NavigationInteractionEvent): void => { void dispatch(event); };

    const beginPinch = (event: PointerEvent): void => {
        const points = [...touchPointers.values()];
        if (!source.zoom || points.length !== 2) return;
        if (session) {
            emit({
                type: 'navigation', phase: 'cancel', operation: 'pan', axes,
                modifiers: interactionModifiers(event),
            });
            session = undefined;
            pointerId = undefined;
            pendingDelta = { x: 0, y: 0 };
        }
        const space = coordinateSpace();
        pinchSession = new PinchSession(points[0]!, points[1]!, {
            width: space.plotWidth,
            height: space.plotHeight,
        });
        dragged = true;
        setDragging(true);
        setSuppressClick(true);
        emit({
            type: 'navigation', phase: 'start', operation: 'zoom', axes,
            modifiers: interactionModifiers(event),
        });
    };

    const pointerDown = (event: PointerEvent): void => {
        if (event.pointerType === 'touch' && source.zoom) {
            if (pinchSession && touchPointers.size >= 2) return;
            touchPointers.set(event.pointerId, localPoint(event));
            container.setPointerCapture(event.pointerId);
            if (touchPointers.size === 2) beginPinch(event);
            if (pinchSession || !source.pan) return;
        }
        if (!source.pan || event.button !== 0 || session) return;
        const space = coordinateSpace();
        session = new PanSession(localPoint(event), { width: space.plotWidth, height: space.plotHeight });
        pointerId = event.pointerId;
        pendingDelta = { x: 0, y: 0 };
        dragged = false;
        setDragging(true);
        container.style.cursor = 'grabbing';
        container.setPointerCapture(event.pointerId);
        emit({
            type: 'navigation', phase: 'start', operation: 'pan', axes,
            modifiers: interactionModifiers(event),
        });
    };
    const pointerMove = (event: PointerEvent): void => {
        if (event.pointerType === 'touch' && touchPointers.has(event.pointerId)) {
            touchPointers.set(event.pointerId, localPoint(event));
            if (pinchSession) {
                const points = [...touchPointers.values()];
                if (points.length !== 2) return;
                const update = pinchSession.move(points[0]!, points[1]!);
                if (update) emit({
                    type: 'navigation', phase: 'preview', operation: 'zoom', axes,
                    factor: update.factor, anchor: update.anchor,
                    modifiers: interactionModifiers(event),
                });
                return;
            }
        }
        if (!session || pointerId !== event.pointerId) return;
        const delta = session.move(localPoint(event));
        pendingDelta = { x: pendingDelta.x + delta.x, y: pendingDelta.y + delta.y };
        if (session.dragDistance() < 4) return;
        dragged = true;
        setSuppressClick(true);
        emit({
            type: 'navigation', phase: 'preview', operation: 'pan', axes,
            delta: pendingDelta, modifiers: interactionModifiers(event),
        });
        pendingDelta = { x: 0, y: 0 };
    };
    const finish = (event: PointerEvent): void => {
        if (event.pointerType === 'touch' && touchPointers.has(event.pointerId)) {
            touchPointers.delete(event.pointerId);
            if (pinchSession) {
                emit({
                    type: 'navigation', phase: 'commit', operation: 'zoom', axes,
                    modifiers: interactionModifiers(event),
                });
                pinchSession = undefined;
                touchPointers.clear();
                session = undefined;
                pointerId = undefined;
                pendingDelta = { x: 0, y: 0 };
                setDragging(false);
                container.style.cursor = source.pan ? 'grab' : previousCursor;
                if (dragged) window.setTimeout(() => { setSuppressClick(false); }, 0);
                return;
            }
        }
        if (!session || pointerId !== event.pointerId) return;
        if (pendingDelta.x !== 0 || pendingDelta.y !== 0) {
            emit({
                type: 'navigation', phase: 'preview', operation: 'pan', axes,
                delta: pendingDelta, modifiers: interactionModifiers(event),
            });
        }
        emit({
            type: 'navigation', phase: 'commit', operation: 'pan', axes,
            modifiers: interactionModifiers(event),
        });
        session = undefined;
        pointerId = undefined;
        pendingDelta = { x: 0, y: 0 };
        setDragging(false);
        container.style.cursor = source.pan ? 'grab' : previousCursor;
        if (container.hasPointerCapture(event.pointerId)) container.releasePointerCapture(event.pointerId);
        if (dragged) window.setTimeout(() => { setSuppressClick(false); }, 0);
    };
    const cancel = (event: PointerEvent): void => {
        if (event.pointerType === 'touch' && touchPointers.has(event.pointerId)) {
            touchPointers.delete(event.pointerId);
            if (pinchSession) {
                emit({
                    type: 'navigation', phase: 'cancel', operation: 'zoom', axes,
                    modifiers: interactionModifiers(event),
                });
                pinchSession = undefined;
                touchPointers.clear();
                session = undefined;
                pointerId = undefined;
                pendingDelta = { x: 0, y: 0 };
                setDragging(false);
                container.style.cursor = source.pan ? 'grab' : previousCursor;
                setSuppressClick(false);
                return;
            }
        }
        if (!session || pointerId !== event.pointerId) return;
        emit({
            type: 'navigation', phase: 'cancel', operation: 'pan', axes,
            modifiers: interactionModifiers(event),
        });
        session = undefined;
        pointerId = undefined;
        pendingDelta = { x: 0, y: 0 };
        setDragging(false);
        container.style.cursor = source.pan ? 'grab' : previousCursor;
        if (container.hasPointerCapture(event.pointerId)) container.releasePointerCapture(event.pointerId);
    };
    const wheel = (event: WheelEvent): void => {
        if (!source.zoom) return;
        event.preventDefault();
        const space = coordinateSpace();
        const point = clientToPlotPoint({ x: event.clientX, y: event.clientY }, space);
        emit({
            type: 'navigation', phase: 'commit', operation: 'zoom', axes,
            factor: wheelZoomFactor(
                event.deltaY,
                event.deltaMode,
                space.plotHeight,
                source.wheelSensitivity ?? 0.002,
            ),
            anchor: {
                x: space.plotWidth > 0 ? point.x / space.plotWidth : 0.5,
                y: space.plotHeight > 0 ? point.y / space.plotHeight : 0.5,
            },
            modifiers: interactionModifiers(event),
        });
    };
    const doubleClick = (event: MouseEvent): void => {
        event.preventDefault();
        emit({
            type: 'navigation', phase: 'commit', operation: 'reset', axes,
            modifiers: interactionModifiers(event),
        });
    };

    container.addEventListener('pointerdown', pointerDown, true);
    container.addEventListener('pointermove', pointerMove, true);
    container.addEventListener('pointerup', finish, true);
    container.addEventListener('pointercancel', cancel, true);
    container.addEventListener('wheel', wheel, { passive: false });
    container.addEventListener('dblclick', doubleClick);

    return {
        destroy(): void {
            container.removeEventListener('pointerdown', pointerDown, true);
            container.removeEventListener('pointermove', pointerMove, true);
            container.removeEventListener('pointerup', finish, true);
            container.removeEventListener('pointercancel', cancel, true);
            container.removeEventListener('wheel', wheel);
            container.removeEventListener('dblclick', doubleClick);
            container.style.cursor = previousCursor;
            container.style.touchAction = previousTouchAction;
            container.style.userSelect = previousUserSelect;
            touchPointers.clear();
            pinchSession = undefined;
            setDragging(false);
        },
    };
}
