import { facetPlotFrames, type RendererCoordinateSpace } from '../hit-adapter';
import type { PlotFrame } from '../../../interactive/gestures/cartesian-region';
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
        /** Names the position on a single index axis, at that axis's end of the guide. */
        label?: string,
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

const holds = (panel: PlotFrame, axis: 'x' | 'y', coordinate: number): boolean => axis === 'x'
    ? coordinate >= panel.x - 0.5 && coordinate <= panel.x + panel.width + 0.5
    : coordinate >= panel.y - 0.5 && coordinate <= panel.y + panel.height + 0.5;

/**
 * The plot panels a guide at `coordinate` on `mode` runs through, each drawn on its own so the
 * guide never crosses the headers and gaps between facets; the nearest one where it crosses none.
 */
export function inspectGuidePanels(panels: readonly PlotFrame[], mode: 'x' | 'y', coordinate: number): PlotFrame[] {
    const crossed = panels.filter((panel) => holds(panel, mode, coordinate));
    if (crossed.length || panels.length === 0) return crossed;
    const distance = (panel: PlotFrame) => {
        const [start, size] = mode === 'x' ? [panel.x, panel.width] : [panel.y, panel.height];
        return Math.max(start - coordinate, coordinate - start - size, 0);
    };
    return [panels.reduce((best, panel) => distance(panel) < distance(best) ? panel : best)];
}

/** The panel a value read at `index` on the index axis stands in: the one holding both, else one holding the value. */
export function inspectValuePanel(
    panels: readonly PlotFrame[],
    indexAxis: 'x' | 'y',
    index: number | undefined,
    value: number,
): PlotFrame | undefined {
    const valueAxis = indexAxis === 'x' ? 'y' : 'x';
    return panels.find((panel) => (index === undefined || holds(panel, indexAxis, index)) && holds(panel, valueAxis, value))
        ?? panels.find((panel) => holds(panel, valueAxis, value));
}

export function createInspectGuideOverlay({
    view,
    container,
    coordinateSpace,
    containerLayoutSize,
}: InspectGuideOverlayOptions): InspectGuideOverlay {
    const previousPosition = container.style.position;
    // One guide segment per facet panel the guide crosses.
    const guideLines: HTMLDivElement[] = [];
    const crossLine = document.createElement('div');
    const valueLines: HTMLDivElement[] = [];
    const valueLabels: HTMLDivElement[] = [];
    const indexLabel = document.createElement('div');
    let indexLabelBox: { left: number; top: number; width: number; height: number } | null = null;
    // Where the index guide stands, so each value rule is drawn in the panel it was read in.
    let indexAt: { axis: 'x' | 'y'; coordinate: number } | null = null;
    const baseStyle = {
        position: 'absolute', display: 'none', zIndex: '4', pointerEvents: 'none',
    } as const;
    Object.assign(crossLine.style, baseStyle);
    Object.assign(indexLabel.style, baseStyle);
    indexLabel.setAttribute('data-flint-inspect-index', '');
    indexLabel.setAttribute('aria-hidden', 'true');
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.append(crossLine, indexLabel);

    const guideLine = (index: number): HTMLDivElement => {
        while (guideLines.length <= index) {
            const element = document.createElement('div');
            Object.assign(element.style, baseStyle);
            guideLines.push(element);
            container.append(element);
        }
        return guideLines[index];
    };
    const hideGuideLines = (from = 0): void => {
        guideLines.forEach((element, index) => { if (index >= from) element.style.display = 'none'; });
    };
    const hideValueGuides = (): void => {
        valueLines.forEach((valueLine) => { valueLine.style.display = 'none'; });
        valueLabels.forEach((valueLabel) => { valueLabel.style.display = 'none'; });
    };
    const hideIndexLabel = (): void => {
        indexLabel.style.display = 'none';
        indexLabelBox = null;
    };

    /** The chart's plot panels in plot px: its facet cells, or the one plot. */
    const plotPanels = (): PlotFrame[] => {
        const frames = facetPlotFrames(view);
        if (frames.length) return frames;
        const space = coordinateSpace();
        return [{ x: 0, y: 0, width: space.plotWidth, height: space.plotHeight }];
    };

    const frameInContainer = (frame: PlotFrame) => {
        const space = coordinateSpace();
        const containerRect = container.getBoundingClientRect();
        const layoutSize = containerLayoutSize();
        const start = clientToLayoutPoint(plotToClientPoint({ x: frame.x, y: frame.y }, space), containerRect, layoutSize);
        const end = clientToLayoutPoint(plotToClientPoint({ x: frame.x + frame.width, y: frame.y + frame.height }, space), containerRect, layoutSize);
        return { left: start.x, top: start.y, width: end.x - start.x, height: end.y - start.y };
    };

    const haloShadow = (style: InspectGestureGuideStyle): string =>
        style.haloWidth > 0 && style.haloOpacity > 0
            ? `0 0 0 ${style.haloWidth}px color-mix(in srgb, ${style.haloColor} ${style.haloOpacity * 100}%, transparent)`
            : 'none';

    /** A guide across one plot panel at `coordinate` on `mode`, kept inside that panel. */
    const renderLine = (
        element: HTMLDivElement,
        mode: 'x' | 'y',
        coordinate: number,
        style: InspectGestureGuideStyle,
        frame: PlotFrame,
    ): void => {
        const space = coordinateSpace();
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
        label?: string,
    ): void => {
        hideValueGuides();
        hideIndexLabel();
        const mode = axes === 'y' ? 'y' : 'x';
        const coordinate = mode === 'y' ? point.y : point.x;
        const panels = plotPanels();
        // A crosshair stays in the panel under the pointer; an index guide reads the same position in
        // every panel it crosses.
        const own = panels.find((panel) => holds(panel, 'x', point.x) && holds(panel, 'y', point.y));
        const crossed = axes === 'xy' && own ? [own] : inspectGuidePanels(panels, mode, coordinate);
        crossed.forEach((frame, index) => renderLine(guideLine(index), mode, coordinate, style, frame));
        hideGuideLines(crossed.length);
        indexAt = axes === 'xy' ? null : { axis: mode, coordinate };
        if (axes === 'xy') renderLine(crossLine, 'y', point.y, style, own ?? crossed[0]);
        else crossLine.style.display = 'none';
        if (!label || axes === 'xy' || crossed.length === 0) return;
        indexLabel.textContent = label;
        Object.assign(indexLabel.style, {
            ...baseStyle, display: 'block', fontFamily: 'inherit', fontSize: '10px',
            lineHeight: '14px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
            padding: '1px 4px', borderRadius: '2px', background: style.haloColor,
            color: style.color, boxShadow: haloShadow(style),
        });
        // On the axis the guide reads: centred at the foot of the lowest panel for x, at the left
        // edge of the leftmost for y.
        const end = crossed.reduce((best, frame) => axes === 'x'
            ? (frame.y + frame.height > best.y + best.height ? frame : best)
            : (frame.x < best.x ? frame : best));
        const plot = frameInContainer(end);
        const element = guideLines[crossed.indexOf(end)];
        const size = { width: indexLabel.offsetWidth, height: indexLabel.offsetHeight };
        const along = axes === 'x' ? parseFloat(element.style.left) + style.width / 2 : parseFloat(element.style.top) + style.width / 2;
        const left = axes === 'x'
            ? Math.max(plot.left, Math.min(plot.left + plot.width - size.width, along - size.width / 2))
            : plot.left + 2;
        const top = axes === 'x'
            ? plot.top + plot.height - size.height - 2
            : Math.max(plot.top, Math.min(plot.top + plot.height - size.height, along - size.height / 2));
        indexLabel.style.left = `${left}px`;
        indexLabel.style.top = `${top}px`;
        indexLabelBox = { left, top, ...size };
    };

    const renderSegment = (
        segmentStart: { x: number; y: number },
        segmentEnd: { x: number; y: number },
        style: InspectGestureGuideStyle,
    ): void => {
        hideValueGuides();
        hideGuideLines(1);
        crossLine.style.display = 'none';
        indexAt = null;
        const space = coordinateSpace();
        const containerRect = container.getBoundingClientRect();
        const layoutSize = containerLayoutSize();
        const start = clientToLayoutPoint(plotToClientPoint(segmentStart, space), containerRect, layoutSize);
        const end = clientToLayoutPoint(plotToClientPoint(segmentEnd, space), containerRect, layoutSize);
        const length = Math.hypot(end.x - start.x, end.y - start.y);
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        Object.assign(guideLine(0).style, {
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
        const occupied: { left: number; top: number; width: number; height: number }[] = indexLabelBox ? [indexLabelBox] : [];
        const panels = plotPanels();
        const index = indexAt?.axis === indexAxis ? indexAt.coordinate : undefined;
        while (valueLines.length < coordinates.length) {
            const valueLine = document.createElement('div');
            Object.assign(valueLine.style, baseStyle);
            valueLines.push(valueLine);
            container.append(valueLine);
        }
        valueLines.forEach((valueLine, at) => {
            if (at >= coordinates.length) {
                valueLine.style.display = 'none';
                return;
            }
            const panel = inspectValuePanel(panels, indexAxis, index, coordinates[at]) ?? panels[0];
            const label = labels?.[at];
            const ruleStyle = label?.color ? { ...style, color: label.color } : style;
            renderLine(valueLine, indexAxis === 'x' ? 'y' : 'x', coordinates[at], ruleStyle, panel);
            const text = label?.text;
            if (!text) return;
            if (coordinates.some((coordinate, previous) => previous < at
                && Math.abs(coordinate - coordinates[at]) < 0.5 && labels?.[previous]?.text === text)) return;
            let valueLabel = valueLabels[at];
            if (!valueLabel) {
                valueLabel = document.createElement('div');
                valueLabel.setAttribute('data-flint-inspect-value', '');
                valueLabel.setAttribute('aria-hidden', 'true');
                valueLabels[at] = valueLabel;
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
            const position = inspectGuideValueLabelPosition(indexAxis, intercept, labelSize, frameInContainer(panel), occupied);
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
            hideGuideLines();
            crossLine.style.display = 'none';
            hideValueGuides();
            hideIndexLabel();
            indexAt = null;
        },
        destroy(): void {
            guideLines.forEach((element) => element.remove());
            crossLine.remove();
            indexLabel.remove();
            valueLines.forEach((valueLine) => valueLine.remove());
            valueLabels.forEach((valueLabel) => valueLabel.remove());
            container.style.position = previousPosition;
        },
    };
}
