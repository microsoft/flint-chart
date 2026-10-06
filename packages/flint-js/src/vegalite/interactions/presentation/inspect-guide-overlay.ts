import { facetPlotBounds, type RendererCoordinateSpace } from '../hit-adapter';
import { clientToLayoutPoint, plotToClientPoint } from '../../../interactive/geometry/coordinate-space';
import type { GestureGuideController, InspectGestureGuideStyle } from '../../../interactive/guides';

export interface InspectGuideValueLabel {
    text: string;
    color?: string;
}

export interface InspectGuideOverlay extends GestureGuideController {
    renderAxes(
        point: { x: number; y: number },
        axes: 'x' | 'y' | 'xy',
        style: InspectGestureGuideStyle,
    ): void;
    renderSegment(
        start: { x: number; y: number },
        end: { x: number; y: number },
        style: InspectGestureGuideStyle,
    ): void;
    renderValueRules(
        coordinates: readonly number[],
        indexAxis: 'x' | 'y',
        style: InspectGestureGuideStyle,
        labels?: readonly InspectGuideValueLabel[],
    ): void;
}

export interface InspectGuideOverlayOptions {
    view: any;
    container: HTMLElement;
    coordinateSpace(): RendererCoordinateSpace;
    containerLayoutSize(): { width: number; height: number };
}

export function inspectGuideLine(
    mode: 'x' | 'y',
    coordinate: number,
    plotSize: { width: number; height: number },
): { x1: number; y1: number; x2: number; y2: number } {
    const bounded = Math.min(mode === 'x' ? plotSize.width : plotSize.height, Math.max(0, coordinate));
    return mode === 'x'
        ? { x1: bounded, y1: 0, x2: bounded, y2: plotSize.height }
        : { x1: 0, y1: bounded, x2: plotSize.width, y2: bounded };
}

export function inspectGuideValueLabelPosition(
    indexAxis: 'x' | 'y',
    intercept: { x: number; y: number },
    labelSize: { width: number; height: number },
    containerSize: { width: number; height: number; left?: number; top?: number },
    occupied: readonly { left: number; top: number; width: number; height: number }[] = [],
): { left: number; top: number } {
    const minLeft = containerSize.left ?? 0;
    const minTop = containerSize.top ?? 0;
    const maxLeft = minLeft + containerSize.width - labelSize.width;
    const maxTop = minTop + containerSize.height - labelSize.height;
    let left = Math.max(minLeft, Math.min(maxLeft,
        indexAxis === 'x' ? intercept.x + 6 : intercept.x - labelSize.width / 2));
    let top = Math.max(minTop, Math.min(maxTop,
        indexAxis === 'x' ? intercept.y - labelSize.height / 2 : intercept.y - labelSize.height - 6));
    for (const previous of occupied) {
        if (left < previous.left + previous.width && left + labelSize.width > previous.left
            && top < previous.top + previous.height && top + labelSize.height > previous.top) {
            if (indexAxis === 'x') left = Math.max(minLeft, Math.min(maxLeft, previous.left + previous.width + 4));
            else top = Math.max(minTop, Math.min(maxTop, previous.top - labelSize.height - 4));
        }
    }
    return { left, top };
}

export function createInspectGuideOverlay({
    view,
    container,
    coordinateSpace,
    containerLayoutSize,
}: InspectGuideOverlayOptions): InspectGuideOverlay {
    const previousPosition = container.style.position;
    const line = document.createElement('div');
    const crossLine = document.createElement('div');
    const valueLines: HTMLDivElement[] = [];
    const valueLabels: HTMLDivElement[] = [];
    const baseStyle = {
        position: 'absolute', display: 'none', zIndex: '4', pointerEvents: 'none',
    } as const;
    Object.assign(line.style, baseStyle);
    Object.assign(crossLine.style, baseStyle);
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.append(line, crossLine);

    const hideValueGuides = (): void => {
        valueLines.forEach((valueLine) => { valueLine.style.display = 'none'; });
        valueLabels.forEach((valueLabel) => { valueLabel.style.display = 'none'; });
    };

    const haloShadow = (style: InspectGestureGuideStyle): string =>
        style.haloWidth > 0 && style.haloOpacity > 0
            ? `0 0 0 ${style.haloWidth}px color-mix(in srgb, ${style.haloColor} ${style.haloOpacity * 100}%, transparent)`
            : 'none';

    const renderLine = (
        element: HTMLDivElement,
        mode: 'x' | 'y',
        coordinate: number,
        style: InspectGestureGuideStyle,
    ): void => {
        const space = coordinateSpace();
        const frame = facetPlotBounds(view, { x: 0, y: 0, width: space.plotWidth, height: space.plotHeight });
        const localCoordinate = coordinate - (mode === 'x' ? frame.x : frame.y);
        const localGuide = inspectGuideLine(mode, localCoordinate, frame);
        const guide = {
            x1: localGuide.x1 + frame.x,
            y1: localGuide.y1 + frame.y,
            x2: localGuide.x2 + frame.x,
            y2: localGuide.y2 + frame.y,
        };
        const containerRect = container.getBoundingClientRect();
        const layoutSize = containerLayoutSize();
        const start = clientToLayoutPoint(plotToClientPoint({ x: guide.x1, y: guide.y1 }, space), containerRect, layoutSize);
        const end = clientToLayoutPoint(plotToClientPoint({ x: guide.x2, y: guide.y2 }, space), containerRect, layoutSize);
        const halo = haloShadow(style);
        Object.assign(element.style, mode === 'x' ? {
            display: 'block', left: `${start.x - style.width / 2}px`, top: `${start.y}px`,
            width: `${style.width}px`, height: `${end.y - start.y}px`, transform: 'none',
            transformOrigin: '50% 50%', background: style.color, opacity: `${style.opacity}`, boxShadow: halo,
        } : {
            display: 'block', left: `${start.x}px`, top: `${start.y - style.width / 2}px`,
            width: `${end.x - start.x}px`, height: `${style.width}px`, transform: 'none',
            transformOrigin: '50% 50%', background: style.color, opacity: `${style.opacity}`, boxShadow: halo,
        });
    };

    const renderAxes = (
        point: { x: number; y: number },
        axes: 'x' | 'y' | 'xy',
        style: InspectGestureGuideStyle,
    ): void => {
        hideValueGuides();
        renderLine(line, axes === 'y' ? 'y' : 'x', axes === 'y' ? point.y : point.x, style);
        if (axes === 'xy') renderLine(crossLine, 'y', point.y, style);
        else crossLine.style.display = 'none';
    };

    const renderSegment = (
        segmentStart: { x: number; y: number },
        segmentEnd: { x: number; y: number },
        style: InspectGestureGuideStyle,
    ): void => {
        hideValueGuides();
        crossLine.style.display = 'none';
        const space = coordinateSpace();
        const containerRect = container.getBoundingClientRect();
        const layoutSize = containerLayoutSize();
        const start = clientToLayoutPoint(plotToClientPoint(segmentStart, space), containerRect, layoutSize);
        const end = clientToLayoutPoint(plotToClientPoint(segmentEnd, space), containerRect, layoutSize);
        const length = Math.hypot(end.x - start.x, end.y - start.y);
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        Object.assign(line.style, {
            display: 'block', left: `${start.x}px`, top: `${start.y - style.width / 2}px`,
            width: `${length}px`, height: `${style.width}px`, transformOrigin: '0 50%',
            transform: `rotate(${angle}rad)`, background: style.color, opacity: `${style.opacity}`,
            boxShadow: haloShadow(style),
        });
    };

    const renderValueRules = (
        coordinates: readonly number[],
        indexAxis: 'x' | 'y',
        style: InspectGestureGuideStyle,
        labels?: readonly InspectGuideValueLabel[],
    ): void => {
        crossLine.style.display = 'none';
        valueLabels.forEach((valueLabel) => { valueLabel.style.display = 'none'; });
        const occupied: { left: number; top: number; width: number; height: number }[] = [];
        const space = coordinateSpace();
        const frame = facetPlotBounds(view, { x: 0, y: 0, width: space.plotWidth, height: space.plotHeight });
        const containerRect = container.getBoundingClientRect();
        const layoutSize = containerLayoutSize();
        const plotStart = clientToLayoutPoint(plotToClientPoint({ x: frame.x, y: frame.y }, space), containerRect, layoutSize);
        const plotEnd = clientToLayoutPoint(plotToClientPoint({ x: frame.x + frame.width, y: frame.y + frame.height }, space), containerRect, layoutSize);
        const plotBounds = {
            left: plotStart.x, top: plotStart.y,
            width: plotEnd.x - plotStart.x, height: plotEnd.y - plotStart.y,
        };
        while (valueLines.length < coordinates.length) {
            const valueLine = document.createElement('div');
            Object.assign(valueLine.style, baseStyle);
            valueLines.push(valueLine);
            container.append(valueLine);
        }
        valueLines.forEach((valueLine, index) => {
            if (index >= coordinates.length) {
                valueLine.style.display = 'none';
                return;
            }
            const label = labels?.[index];
            const ruleStyle = label?.color ? { ...style, color: label.color } : style;
            renderLine(valueLine, indexAxis === 'x' ? 'y' : 'x', coordinates[index], ruleStyle);
            const text = label?.text;
            if (!text) return;
            if (coordinates.some((coordinate, previous) => previous < index
                && Math.abs(coordinate - coordinates[index]) < 0.5 && labels?.[previous]?.text === text)) return;
            let valueLabel = valueLabels[index];
            if (!valueLabel) {
                valueLabel = document.createElement('div');
                valueLabel.setAttribute('data-flint-inspect-value', '');
                valueLabel.setAttribute('aria-hidden', 'true');
                valueLabels[index] = valueLabel;
                container.append(valueLabel);
            }
            valueLabel.textContent = text;
            Object.assign(valueLabel.style, {
                ...baseStyle, display: 'block', fontFamily: 'inherit', fontSize: '10px',
                lineHeight: '14px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                padding: '1px 3px', borderRadius: '2px', background: style.haloColor,
                color: ruleStyle.color, boxShadow: haloShadow(ruleStyle),
            });
            const intercept = indexAxis === 'x'
                ? { x: parseFloat(valueLine.style.left), y: parseFloat(valueLine.style.top) + style.width / 2 }
                : {
                    x: parseFloat(valueLine.style.left) + style.width / 2,
                    y: parseFloat(valueLine.style.top) + parseFloat(valueLine.style.height),
                };
            const labelSize = { width: valueLabel.offsetWidth, height: valueLabel.offsetHeight };
            const position = inspectGuideValueLabelPosition(indexAxis, intercept, labelSize, plotBounds, occupied);
            occupied.push({ ...position, ...labelSize });
            valueLabel.style.left = `${position.left}px`;
            valueLabel.style.top = `${position.top}px`;
        });
    };

    return {
        renderAxes,
        renderSegment,
        renderValueRules,
        clear(): void {
            line.style.display = 'none';
            crossLine.style.display = 'none';
            hideValueGuides();
        },
        destroy(): void {
            line.remove();
            crossLine.remove();
            valueLines.forEach((valueLine) => valueLine.remove());
            valueLabels.forEach((valueLabel) => valueLabel.remove());
            container.style.position = previousPosition;
        },
    };
}
