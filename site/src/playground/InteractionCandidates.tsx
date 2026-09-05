import { useCallback, useMemo, useRef, useState } from 'react';
import { pointer, polygonContains, select } from 'd3';
import { assembleVegaLite } from 'flint-chart';
import { FlaskConical } from 'lucide-react';
import { VegaLiteView } from '../components/VegaLiteView';
import { ScaleToFit } from '../components/ScaleToFit';
import { PREVIEW_CASES, type PreviewCase } from '../shared/preview-cases';
import { FlintDimpVisStage } from './FlintDimpVisStage';
import { PureD3DimpVisStage } from './PureD3DimpVisStage';
import './interaction-candidates.css';

type InteractionKind =
  | 'hover-points'
  | 'brush-points'
  | 'click-bars'
  | 'click-arcs'
  | 'hover-cells'
  | 'lasso-points';

type Example =
  | {
    kind: 'single';
    id: string;
    caseId: string;
    label: string;
    note: string;
    interaction: InteractionKind;
  }
  | {
    kind: 'overview-detail';
    id: string;
    label: string;
    note: string;
  }
  | {
    kind: 'flint-dimpvis';
    id: string;
    label: string;
    note: string;
  }
  | {
    kind: 'dimpvis';
    id: string;
    label: string;
    note: string;
  }
  | {
    kind: 'drilldown';
    id: string;
    label: string;
    note: string;
  };

interface CompileOptions {
  data: Record<string, unknown>[];
  semanticTypes: Record<string, string>;
  chartType: string;
  title: string;
  encodings: Record<string, unknown>;
  chartProperties?: Record<string, unknown>;
  baseSize?: { width: number; height: number };
}

type RangeSelection = [number, number] | null;

type DrillLevel = 'year' | 'month' | 'day';

interface DrillState {
  year?: number;
  month?: number;
}

interface DrillLevelView {
  level: DrillLevel;
  title: string;
  hint: string;
  rows: Record<string, unknown>[];
  xField: string;
}

const EXAMPLES: Example[] = [
  {
    kind: 'single',
    id: 'point-hover',
    caseId: 'driving',
    label: 'Point hover + tooltip',
    note: 'Candidate for compiler-owned hover targeting, emphasis, and semantic tooltip content.',
    interaction: 'hover-points',
  },
  {
    kind: 'single',
    id: 'brush-feedback',
    caseId: 'penguins',
    label: 'Brush selection feedback',
    note: 'Reference treatment for the supported rectangle primitive: live count, outline, and brush styling.',
    interaction: 'brush-points',
  },
  {
    kind: 'single',
    id: 'bar-focus',
    caseId: 'population',
    label: 'Bar focus + details',
    note: 'Reference treatment for click focus with a contextual detail readout and double-click reset.',
    interaction: 'click-bars',
  },
  {
    kind: 'single',
    id: 'arc-focus',
    caseId: 'mobile-donut',
    label: 'Arc focus + details',
    note: 'Reference treatment for semantic arc focus, stronger boundaries, and contextual values.',
    interaction: 'click-arcs',
  },
  {
    kind: 'single',
    id: 'cell-hover',
    caseId: 'temp-heatmap',
    label: 'Cell hover + tooltip',
    note: 'Candidate for semantic cell hover with field-aware tooltip content.',
    interaction: 'hover-cells',
  },
  {
    kind: 'single',
    id: 'point-lasso',
    caseId: 'penguins',
    label: 'Point lasso + selection hull',
    note: 'Reference treatment for freeform cluster picking that stays entirely in a D3 overlay above the Flint scatterplot.',
    interaction: 'lasso-points',
  },
  {
    kind: 'flint-dimpvis',
    id: 'flint-discrete-dimpvis',
    label: 'Flint discrete DimpVis',
    note: 'A first Flint-native approximation: use the country legend to switch the expanded trajectory, then click points on that trajectory to move the shared background year.',
  },
  {
    kind: 'dimpvis',
    id: 'pure-d3-dimpvis',
    label: 'Pure D3 DimpVis',
    note: 'Reference treatment for trajectory-constrained dragging: one country drives continuous interpolation of the full scatterplot state between yearly snapshots.',
  },
  {
    kind: 'overview-detail',
    id: 'overview-detail',
    label: 'Overview + detail',
    note: 'Reference treatment for a miniature overview brush that drives a larger Flint detail view without touching compiler internals.',
  },
  {
    kind: 'drilldown',
    id: 'calendar-drilldown',
    label: 'Year -> month -> day drilldown',
    note: 'Reference treatment for hierarchical click-through: year bars open month bars, then month bars open daily detail.',
  },
];

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const OVERVIEW_ROWS: Record<string, unknown>[] = (() => {
  const rows: Record<string, unknown>[] = [];
  for (let year = 2022; year <= 2024; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      const index = (year - 2022) * 12 + (month - 1);
      const seasonal = Math.sin((index / 6) * Math.PI) * 18;
      const summerLift = month >= 6 && month <= 9 ? 20 : -4;
      const trend = index * 2.4;
      rows.push({
        Month: `${year}-${String(month).padStart(2, '0')}`,
        Bookings: Math.round(118 + trend + seasonal + summerLift),
      });
    }
  }
  return rows;
})();

const DRILLDOWN_ROWS: Record<string, unknown>[] = (() => {
  const rows: Record<string, unknown>[] = [];
  for (let year = 2022; year <= 2024; year += 1) {
    for (let month = 0; month < 12; month += 1) {
      const days = new Date(year, month + 1, 0).getDate();
      for (let day = 1; day <= days; day += 1) {
        const weekday = new Date(year, month, day).getDay();
        const annualShift = (year - 2022) * 18;
        const seasonal = Math.sin((((month + 1) / 12) * Math.PI * 2) - (Math.PI / 3)) * 22;
        const weekdaySwing = [12, 9, 6, 1, -5, -14, -9][weekday];
        const paydayLift = day <= 3 || day >= 26 ? 11 : 0;
        const intraMonth = Math.sin((day / days) * Math.PI * 2) * 7;
        rows.push({
          Date: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          Year: year,
          Month: MONTH_LABELS[month],
          MonthIndex: month + 1,
          Day: String(day),
          Orders: Math.round(92 + annualShift + seasonal + weekdaySwing + paydayLift + intraMonth),
        });
      }
    }
  }
  return rows;
})();

function findCase(id: string): PreviewCase {
  const found = PREVIEW_CASES.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Unknown preview case: ${id}`);
  return found;
}

function compileSpec({
  data,
  semanticTypes,
  chartType,
  title,
  encodings,
  chartProperties,
  baseSize = { width: 440, height: 280 },
}: CompileOptions): any {
  return assembleVegaLite({
    data: { values: data },
    semantic_types: semanticTypes,
    chart_spec: {
      chartType,
      title,
      encodings,
      baseSize,
      ...(chartProperties ? { chartProperties } : {}),
    },
  } as any);
}

function compileCase(
  previewCase: PreviewCase,
  overrides: Partial<Omit<CompileOptions, 'semanticTypes' | 'data' | 'chartType' | 'title' | 'encodings'>> & {
    data?: Record<string, unknown>[];
    chartType?: string;
    title?: string;
    encodings?: Record<string, unknown>;
  } = {},
): any {
  return compileSpec({
    data: overrides.data ?? previewCase.data,
    semanticTypes: previewCase.semantic_types,
    chartType: overrides.chartType ?? previewCase.chartType,
    title: overrides.title ?? previewCase.title,
    encodings: overrides.encodings ?? previewCase.encodings,
    chartProperties: overrides.chartProperties ?? previewCase.chartProperties,
    baseSize: overrides.baseSize,
  });
}

function datumOf(sceneItem: any): Record<string, unknown> {
  return sceneItem?.datum ?? {};
}

function installTooltip(card: HTMLElement) {
  const tooltip = document.createElement('div');
  tooltip.className = 'ic-tooltip';
  tooltip.setAttribute('role', 'status');
  card.appendChild(tooltip);
  return {
    show(event: MouseEvent, lines: string[]) {
      const [x, y] = pointer(event, card);
      tooltip.replaceChildren(...lines.map((line) => {
        const row = document.createElement('div');
        row.textContent = line;
        return row;
      }));
      tooltip.style.left = `${x + 12}px`;
      tooltip.style.top = `${y + 12}px`;
      tooltip.dataset.visible = 'true';
    },
    hide() {
      delete tooltip.dataset.visible;
    },
    remove() {
      tooltip.remove();
    },
  };
}

function fieldLines(datum: Record<string, unknown>, fields: string[]): string[] {
  return fields
    .filter((field) => datum[field] !== undefined)
    .map((field) => `${field}: ${datum[field]}`);
}

function svgPoint(svg: SVGSVGElement, node: SVGGraphicsElement): [number, number] {
  const rect = node.getBoundingClientRect();
  const point = svg.createSVGPoint();
  point.x = rect.left + rect.width / 2;
  point.y = rect.top + rect.height / 2;
  const matrix = svg.getScreenCTM();
  if (!matrix) return [0, 0];
  const local = point.matrixTransform(matrix.inverse());
  return [local.x, local.y];
}

function pointBounds(points: [number, number][], padding = 12) {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const left = Math.min(...xs) - padding;
  const top = Math.min(...ys) - padding;
  const right = Math.max(...xs) + padding;
  const bottom = Math.max(...ys) + padding;
  return {
    x: left,
    y: top,
    width: Math.max(24, right - left),
    height: Math.max(24, bottom - top),
  };
}

function attachHover(
  svg: SVGSVGElement,
  card: HTMLElement,
  selector: string,
  fields: string[],
) {
  const marks = select(svg).selectAll<SVGGraphicsElement, any>(selector);
  if (!marks.size()) return () => {};
  const tooltip = installTooltip(card);
  const show = function (this: SVGGraphicsElement, event: MouseEvent, sceneItem: any) {
    select(this).classed('ic-hovered', true);
    tooltip.show(event, fieldLines(datumOf(sceneItem), fields));
  };
  marks
    .style('cursor', 'pointer')
    .on('mouseenter.candidate', show)
    .on('mousemove.candidate', show)
    .on('mouseleave.candidate', function (this: SVGGraphicsElement) {
      select(this).classed('ic-hovered', false);
      tooltip.hide();
    });
  return () => {
    marks.on('.candidate', null).style('cursor', null).classed('ic-hovered', false);
    tooltip.remove();
  };
}

function attachBrushPoints(svg: SVGSVGElement, card: HTMLElement) {
  const marks = select(svg).selectAll<SVGGraphicsElement, any>('g.mark-symbol.role-mark path');
  if (!marks.size()) return () => {};
  const tooltip = installTooltip(card);
  const positions = new Map(marks.nodes().map((node) => [node, svgPoint(svg, node)]));
  const bounds = pointBounds([...positions.values()]);
  const layer = select(svg).append('g').attr('class', 'ic-brush');
  const selection = layer.append('rect').attr('class', 'selection').style('display', 'none');
  const overlay = layer.append('rect')
    .attr('class', 'overlay')
    .attr('x', bounds.x)
    .attr('y', bounds.y)
    .attr('width', bounds.width)
    .attr('height', bounds.height)
    .attr('fill', 'transparent');
  let anchor: [number, number] | undefined;
  const overlayNode = overlay.node();

  const update = (event: MouseEvent) => {
    if (!anchor) return;
    const [x, y] = pointer(event, svg);
    const left = Math.min(anchor[0], x);
    const top = Math.min(anchor[1], y);
    const right = Math.max(anchor[0], x);
    const bottom = Math.max(anchor[1], y);
    selection
      .attr('x', left)
      .attr('y', top)
      .attr('width', right - left)
      .attr('height', bottom - top)
      .style('display', null);
    let count = 0;
    marks.each(function () {
      const [markX, markY] = positions.get(this) ?? [0, 0];
      const selected = markX >= left && markX <= right && markY >= top && markY <= bottom;
      if (selected) count += 1;
      select(this).classed('ic-selected', selected).classed('ic-dimmed', !selected);
    });
    tooltip.show(event, [`Selected points: ${count}`]);
  };

  const start = (event: MouseEvent) => {
    if (event.target !== overlayNode) return;
    event.preventDefault();
    event.stopPropagation();
    anchor = pointer(event, svg);
    update(event);
  };
  const move = (event: MouseEvent) => {
    if (!anchor) return;
    event.preventDefault();
    event.stopPropagation();
    update(event);
  };
  const end = (event: MouseEvent) => {
    if (!anchor) return;
    event.preventDefault();
    event.stopPropagation();
    anchor = undefined;
  };
  const clear = (event: MouseEvent) => {
    if (event.target !== overlayNode) return;
    event.preventDefault();
    event.stopPropagation();
    anchor = undefined;
    selection.style('display', 'none');
    marks.classed('ic-selected', false).classed('ic-dimmed', false);
    tooltip.hide();
  };
  window.addEventListener('pointerdown', start, true);
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerup', end, true);
  window.addEventListener('pointercancel', end, true);
  window.addEventListener('mousedown', start, true);
  window.addEventListener('mousemove', move, true);
  window.addEventListener('mouseup', end, true);
  window.addEventListener('dblclick', clear, true);
  return () => {
    window.removeEventListener('pointerdown', start, true);
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', end, true);
    window.removeEventListener('pointercancel', end, true);
    window.removeEventListener('mousedown', start, true);
    window.removeEventListener('mousemove', move, true);
    window.removeEventListener('mouseup', end, true);
    window.removeEventListener('dblclick', clear, true);
    marks.classed('ic-selected', false).classed('ic-dimmed', false);
    layer.remove();
    tooltip.remove();
  };
}

function pathFor(points: [number, number][], closed = false): string {
  if (!points.length) return '';
  const [head, ...tail] = points;
  return `M ${head[0]} ${head[1]} ${tail.map(([x, y]) => `L ${x} ${y}`).join(' ')}${closed ? ' Z' : ''}`;
}

function attachLassoPoints(svg: SVGSVGElement, card: HTMLElement) {
  const marks = select(svg).selectAll<SVGGraphicsElement, any>('g.mark-symbol.role-mark path');
  if (!marks.size()) return () => {};
  const tooltip = installTooltip(card);
  const positions = new Map(marks.nodes().map((node) => [node, svgPoint(svg, node)]));
  const bounds = pointBounds([...positions.values()]);
  const layer = select(svg).append('g').attr('class', 'ic-lasso');
  const path = layer.append('path').attr('class', 'selection').style('display', 'none');
  const overlay = layer.append('rect')
    .attr('class', 'overlay')
    .attr('x', bounds.x)
    .attr('y', bounds.y)
    .attr('width', bounds.width)
    .attr('height', bounds.height)
    .attr('fill', 'transparent');
  const overlayNode = overlay.node();
  let drawing = false;
  let trace: [number, number][] = [];

  const reset = () => {
    drawing = false;
    trace = [];
    path.style('display', 'none').attr('d', '');
    marks.classed('ic-selected', false).classed('ic-dimmed', false);
    tooltip.hide();
  };

  const refreshPath = (closed = false) => {
    if (!trace.length) return;
    path.style('display', null).attr('d', pathFor(trace, closed));
  };

  const commit = (event: MouseEvent) => {
    if (trace.length < 3) {
      reset();
      return;
    }
    refreshPath(true);
    let count = 0;
    marks.each(function () {
      const point = positions.get(this) ?? [0, 0];
      const selected = polygonContains(trace, point);
      if (selected) count += 1;
      select(this).classed('ic-selected', selected).classed('ic-dimmed', !selected);
    });
    tooltip.show(event, [`Lassoed points: ${count}`, 'Double-click to clear']);
  };

  const start = (event: MouseEvent) => {
    if (event.target !== overlayNode) return;
    event.preventDefault();
    event.stopPropagation();
    drawing = true;
    trace = [pointer(event, svg)];
    marks.classed('ic-selected', false).classed('ic-dimmed', false);
    refreshPath(false);
    tooltip.show(event, ['Draw a freeform loop']);
  };

  const move = (event: MouseEvent) => {
    if (!drawing) return;
    event.preventDefault();
    event.stopPropagation();
    const next = pointer(event, svg) as [number, number];
    const prev = trace[trace.length - 1];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    if ((dx * dx) + (dy * dy) < 16) return;
    trace = [...trace, next];
    refreshPath(false);
  };

  const end = (event: MouseEvent) => {
    if (!drawing) return;
    event.preventDefault();
    event.stopPropagation();
    drawing = false;
    trace = [...trace, pointer(event, svg) as [number, number]];
    commit(event);
  };

  const clear = (event: MouseEvent) => {
    if (event.target !== overlayNode) return;
    event.preventDefault();
    event.stopPropagation();
    reset();
  };

  window.addEventListener('pointerdown', start, true);
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerup', end, true);
  window.addEventListener('pointercancel', end, true);
  window.addEventListener('mousedown', start, true);
  window.addEventListener('mousemove', move, true);
  window.addEventListener('mouseup', end, true);
  window.addEventListener('dblclick', clear, true);
  return () => {
    window.removeEventListener('pointerdown', start, true);
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', end, true);
    window.removeEventListener('pointercancel', end, true);
    window.removeEventListener('mousedown', start, true);
    window.removeEventListener('mousemove', move, true);
    window.removeEventListener('mouseup', end, true);
    window.removeEventListener('dblclick', clear, true);
    marks.classed('ic-selected', false).classed('ic-dimmed', false);
    layer.remove();
    tooltip.remove();
  };
}

function attachClickFocus(
  svg: SVGSVGElement,
  card: HTMLElement,
  selector: string,
  fields: string[],
) {
  const marks = select(svg).selectAll<SVGGraphicsElement, any>(selector);
  if (!marks.size()) return () => {};
  const tooltip = installTooltip(card);
  const clear = () => {
    marks.classed('ic-selected', false).classed('ic-dimmed', false);
    tooltip.hide();
  };
  marks
    .style('cursor', 'pointer')
    .on('click.candidate', function (event: MouseEvent, sceneItem: any) {
      event.stopPropagation();
      marks.classed('ic-selected', false).classed('ic-dimmed', true);
      select(this).classed('ic-selected', true).classed('ic-dimmed', false);
      tooltip.show(event, fieldLines(datumOf(sceneItem), fields));
    });
  select(svg).on('dblclick.candidate', clear);
  return () => {
    marks.on('.candidate', null).style('cursor', null).classed('ic-selected', false).classed('ic-dimmed', false);
    select(svg).on('.candidate', null);
    tooltip.remove();
  };
}

function attachOverviewBrush(
  svg: SVGSVGElement,
  card: HTMLElement,
  selectedRange: RangeSelection,
  onChange: (next: RangeSelection) => void,
) {
  const marks = select(svg).selectAll<SVGGraphicsElement, any>('g.mark-symbol.role-mark path');
  if (!marks.size()) return () => {};
  const tooltip = installTooltip(card);
  const entries = marks.nodes()
    .map((node, index) => {
      const sceneItem = marks.data()[index];
      const datum = datumOf(sceneItem);
      return {
        x: svgPoint(svg, node)[0],
        label: String(datum.Month),
      };
    })
    .sort((a, b) => a.x - b.x);
  const points = marks.nodes().map((node) => svgPoint(svg, node));
  const bounds = pointBounds(points, 10);
  const layer = select(svg).append('g').attr('class', 'ic-overview-brush');
  const selection = layer.append('rect').attr('class', 'selection').style('display', 'none');
  const overlay = layer.append('rect')
    .attr('class', 'overlay')
    .attr('x', bounds.x)
    .attr('y', bounds.y)
    .attr('width', bounds.width)
    .attr('height', bounds.height)
    .attr('fill', 'transparent');
  const overlayNode = overlay.node();
  let anchor: [number, number] | undefined;

  const drawSelection = (start: number, end: number) => {
    const left = entries[start].x - 10;
    const right = entries[end].x + 10;
    selection
      .style('display', null)
      .attr('x', left)
      .attr('y', bounds.y)
      .attr('width', Math.max(18, right - left))
      .attr('height', bounds.height);
  };

  const nearestIndex = (x: number) => {
    let best = 0;
    let distance = Number.POSITIVE_INFINITY;
    entries.forEach((entry, index) => {
      const delta = Math.abs(entry.x - x);
      if (delta < distance) {
        distance = delta;
        best = index;
      }
    });
    return best;
  };

  const update = (event: MouseEvent) => {
    if (!anchor) return;
    const [x] = pointer(event, svg);
    const start = nearestIndex(Math.min(anchor[0], x));
    const end = nearestIndex(Math.max(anchor[0], x));
    drawSelection(start, end);
    tooltip.show(event, [`${entries[start].label} -> ${entries[end].label}`]);
  };

  if (selectedRange) drawSelection(selectedRange[0], selectedRange[1]);

  const start = (event: MouseEvent) => {
    if (event.target !== overlayNode) return;
    event.preventDefault();
    event.stopPropagation();
    anchor = pointer(event, svg);
    update(event);
  };

  const move = (event: MouseEvent) => {
    if (!anchor) return;
    event.preventDefault();
    event.stopPropagation();
    update(event);
  };

  const end = (event: MouseEvent) => {
    if (!anchor) return;
    event.preventDefault();
    event.stopPropagation();
    const [x] = pointer(event, svg);
    const startIndex = nearestIndex(Math.min(anchor[0], x));
    const endIndex = nearestIndex(Math.max(anchor[0], x));
    anchor = undefined;
    onChange([startIndex, endIndex]);
  };

  const clear = (event: MouseEvent) => {
    if (event.target !== overlayNode) return;
    event.preventDefault();
    event.stopPropagation();
    anchor = undefined;
    selection.style('display', 'none');
    tooltip.hide();
    onChange(null);
  };

  window.addEventListener('pointerdown', start, true);
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerup', end, true);
  window.addEventListener('pointercancel', end, true);
  window.addEventListener('mousedown', start, true);
  window.addEventListener('mousemove', move, true);
  window.addEventListener('mouseup', end, true);
  window.addEventListener('dblclick', clear, true);
  return () => {
    window.removeEventListener('pointerdown', start, true);
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', end, true);
    window.removeEventListener('pointercancel', end, true);
    window.removeEventListener('mousedown', start, true);
    window.removeEventListener('mousemove', move, true);
    window.removeEventListener('mouseup', end, true);
    window.removeEventListener('dblclick', clear, true);
    layer.remove();
    tooltip.remove();
  };
}

function attachSemanticWheelZoom(
  svg: SVGSVGElement,
  card: HTMLElement,
  options: {
    selector?: string;
    hoverFields?: string[];
    zoomInMessage?: (datum: Record<string, unknown>) => string;
    zoomOutMessage: string;
    onZoomIn?: (datum: Record<string, unknown>) => void;
    onZoomOut?: () => void;
  },
) {
  const marks = select(svg).selectAll<SVGGraphicsElement, any>(options.selector ?? 'g.mark-rect.role-mark path');
  if (!marks.size()) return () => {};
  const tooltip = installTooltip(card);
  let hoveredDatum: Record<string, unknown> | null = null;

  marks
    .style('cursor', 'ns-resize')
    .on('mouseenter.candidate', function (this: SVGGraphicsElement, event: MouseEvent, sceneItem: any) {
      hoveredDatum = datumOf(sceneItem);
      select(this).classed('ic-hovered', true);
      const detail = options.hoverFields?.length ? fieldLines(hoveredDatum, options.hoverFields) : [];
      tooltip.show(event, [
        options.zoomInMessage ? options.zoomInMessage(hoveredDatum) : options.zoomOutMessage,
        ...detail,
      ]);
    })
    .on('mousemove.candidate', function (this: SVGGraphicsElement, event: MouseEvent, sceneItem: any) {
      hoveredDatum = datumOf(sceneItem);
      select(this).classed('ic-hovered', true);
      const detail = options.hoverFields?.length ? fieldLines(hoveredDatum, options.hoverFields) : [];
      tooltip.show(event, [
        options.zoomInMessage ? options.zoomInMessage(hoveredDatum) : options.zoomOutMessage,
        ...detail,
      ]);
    })
    .on('mouseleave.candidate', function (this: SVGGraphicsElement) {
      hoveredDatum = null;
      select(this).classed('ic-hovered', false);
      tooltip.hide();
    });

  const wheel = (event: WheelEvent) => {
    const target = event.target;
    if (!(target instanceof Node) || !svg.contains(target)) return;
    if (event.deltaY < 0) {
      if (!options.onZoomIn || !hoveredDatum) return;
      event.preventDefault();
      options.onZoomIn(hoveredDatum);
      return;
    }
    if (event.deltaY > 0 && options.onZoomOut) {
      event.preventDefault();
      options.onZoomOut();
      hoveredDatum = null;
      marks.classed('ic-hovered', false);
      tooltip.hide();
    }
  };

  svg.addEventListener('wheel', wheel, { passive: false });

  return () => {
    svg.removeEventListener('wheel', wheel);
    marks.on('.candidate', null).style('cursor', null).classed('ic-hovered', false);
    tooltip.remove();
  };
}

function attachInteraction(kind: InteractionKind, svg: SVGSVGElement, card: HTMLElement) {
  switch (kind) {
    case 'hover-points':
      return attachHover(svg, card, 'g.mark-symbol.role-mark path', ['Year', 'Miles/person', 'Gas price']);
    case 'brush-points':
      return attachBrushPoints(svg, card);
    case 'click-bars':
      return attachClickFocus(svg, card, 'g.mark-rect.role-mark path', ['Country', 'Population']);
    case 'click-arcs':
      return attachClickFocus(svg, card, 'g.mark-arc.role-mark path', ['OS', 'Share']);
    case 'hover-cells':
      return attachHover(svg, card, 'g.mark-rect.role-mark path', ['City', 'Month', 'Temp (°C)']);
    case 'lasso-points':
      return attachLassoPoints(svg, card);
  }
}

function CandidateHeader({
  title,
  label,
  note,
  kicker = 'Hand-authored D3',
}: {
  title: string;
  label: string;
  note: string;
  kicker?: string;
}) {
  return (
    <header className="ic-card-header">
      <div className="ic-kicker"><FlaskConical size={13} aria-hidden="true" /> {kicker}</div>
      <h2>{title}</h2>
      <strong>{label}</strong>
      <p>{note}</p>
    </header>
  );
}

function SingleCandidateCard({ example }: { example: Extract<Example, { kind: 'single' }> }) {
  const previewCase = useMemo(() => findCase(example.caseId), [example.caseId]);
  const spec = useMemo(() => compileCase(previewCase), [previewCase]);
  const cardRef = useRef<HTMLElement>(null);
  const onReady = useCallback((svg: SVGSVGElement) => {
    const card = cardRef.current;
    return card ? attachInteraction(example.interaction, svg, card) : undefined;
  }, [example.interaction]);

  return (
    <article className="ic-card" ref={cardRef}>
      <CandidateHeader title={previewCase.title} label={example.label} note={example.note} />
      <div className="ic-stage">
        <ScaleToFit height={390} minHeight={285} adaptiveHeight padding={8}>
          <VegaLiteView spec={spec} renderer="svg" onReady={onReady} />
        </ScaleToFit>
      </div>
    </article>
  );
}

function FlintDimpVisCandidateCard({ example }: { example: Extract<Example, { kind: 'flint-dimpvis' }> }) {
  return (
    <article className="ic-card">
      <CandidateHeader
        title="Global health trajectories with discrete Flint state"
        label={example.label}
        note={example.note}
        kicker="Flint interaction surface"
      />
      <div className="ic-stage">
        <FlintDimpVisStage />
      </div>
    </article>
  );
}

function DimpVisCandidateCard({ example }: { example: Extract<Example, { kind: 'dimpvis' }> }) {
  return (
    <article className="ic-card">
      <CandidateHeader
        title="Global health trajectories with direct manipulation"
        label={example.label}
        note={example.note}
      />
      <div className="ic-stage">
        <PureD3DimpVisStage />
      </div>
    </article>
  );
}

function OverviewDetailCandidateCard({ example }: { example: Extract<Example, { kind: 'overview-detail' }> }) {
  const cardRef = useRef<HTMLElement>(null);
  const [selection, setSelection] = useState<RangeSelection>([12, 23]);
  const detailRows = useMemo(() => {
    if (!selection) return OVERVIEW_ROWS;
    return OVERVIEW_ROWS.slice(selection[0], selection[1] + 1);
  }, [selection]);
  const detailTitle = useMemo(() => {
    if (!selection) return 'Monthly bookings — full series';
    const start = String(OVERVIEW_ROWS[selection[0]].Month);
    const end = String(OVERVIEW_ROWS[selection[1]].Month);
    return `Monthly bookings — detail from ${start} to ${end}`;
  }, [selection]);
  const detailSpec = useMemo(() => compileSpec({
    data: detailRows,
    semanticTypes: { Month: 'Category', Bookings: 'Quantity' },
    chartType: 'Line Chart',
    title: detailTitle,
    encodings: { x: 'Month', y: 'Bookings' },
    chartProperties: { showPoints: true, includeZero_y: false },
    baseSize: { width: 440, height: 220 },
  }), [detailRows, detailTitle]);
  const overviewSpec = useMemo(() => compileSpec({
    data: OVERVIEW_ROWS,
    semanticTypes: { Month: 'Category', Bookings: 'Quantity' },
    chartType: 'Line Chart',
    title: 'Navigator overview',
    encodings: { x: 'Month', y: 'Bookings' },
    chartProperties: { showPoints: true, includeZero_y: false },
    baseSize: { width: 440, height: 126 },
  }), []);
  const onOverviewReady = useCallback((svg: SVGSVGElement) => {
    const card = cardRef.current;
    return card ? attachOverviewBrush(svg, card, selection, setSelection) : undefined;
  }, [selection]);

  return (
    <article className="ic-card" ref={cardRef}>
      <CandidateHeader title="Monthly bookings with an external navigator" label={example.label} note={example.note} />
      <div className="ic-stage ic-stage-stack">
        <div className="ic-stage-meta">
          <strong>Detail view</strong>
          <span>{selection ? 'Drag the navigator below to redefine the focused time window.' : 'Showing the full series. Drag the navigator below to focus a smaller range.'}</span>
        </div>
        <ScaleToFit height={308} minHeight={240} adaptiveHeight padding={8}>
          <VegaLiteView spec={detailSpec} renderer="svg" />
        </ScaleToFit>
        <div className="ic-stage-divider" />
        <div className="ic-stage-meta">
          <strong>Overview navigator</strong>
          <span>Brush across the miniature line to retarget the detail chart. Double-click the navigator to reset.</span>
        </div>
        <ScaleToFit height={172} minHeight={145} adaptiveHeight padding={8}>
          <VegaLiteView spec={overviewSpec} renderer="svg" onReady={onOverviewReady} />
        </ScaleToFit>
      </div>
    </article>
  );
}

function buildDrillLevel(state: DrillState): DrillLevelView {
  if (state.year == null) {
    const totals = new Map<number, number>();
    for (const row of DRILLDOWN_ROWS) {
      const year = Number(row.Year);
      totals.set(year, (totals.get(year) ?? 0) + Number(row.Orders));
    }
    return {
      level: 'year',
      title: 'Orders by year',
      hint: 'Hover a year bar, then wheel up to zoom into its monthly breakdown. Wheel down returns to the top level.',
      rows: [...totals.entries()].map(([Year, Orders]) => ({
        YearValue: Year,
        YearLabel: String(Year),
        Orders,
      })),
      xField: 'YearLabel',
    };
  }

  if (state.month == null) {
    const totals = new Map<number, number>();
    for (const row of DRILLDOWN_ROWS) {
      if (Number(row.Year) !== state.year) continue;
      const monthIndex = Number(row.MonthIndex);
      totals.set(monthIndex, (totals.get(monthIndex) ?? 0) + Number(row.Orders));
    }
    return {
      level: 'month',
      title: `Orders in ${state.year} by month`,
      hint: 'Hover a month bar, wheel up to zoom into daily detail, or wheel down to return to the yearly view.',
      rows: [...totals.entries()].map(([MonthIndex, Orders]) => ({
        YearValue: state.year,
        MonthIndex,
        Month: MONTH_LABELS[MonthIndex - 1],
        Orders,
      })),
      xField: 'Month',
    };
  }

  const rows = DRILLDOWN_ROWS
    .filter((row) => Number(row.Year) === state.year && Number(row.MonthIndex) === state.month)
    .map((row) => ({
      Date: row.Date,
      Day: row.Day,
      Orders: row.Orders,
    }));
  return {
    level: 'day',
    title: `Orders in ${MONTH_LABELS[state.month - 1]} ${state.year} by day`,
    hint: 'Final level. Hover for day details, then wheel down to zoom back out to the monthly view.',
    rows,
    xField: 'Day',
  };
}

function DrilldownCandidateCard({ example }: { example: Extract<Example, { kind: 'drilldown' }> }) {
  const cardRef = useRef<HTMLElement>(null);
  const [state, setState] = useState<DrillState>({});
  const level = useMemo(() => buildDrillLevel(state), [state]);
  const spec = useMemo(() => compileSpec({
    data: level.rows,
    semanticTypes: {
      YearValue: 'Quantity',
      YearLabel: 'Category',
      Month: 'Category',
      MonthIndex: 'Quantity',
      Day: 'Category',
      Date: 'Date',
      Orders: 'Quantity',
    },
    chartType: 'Bar Chart',
    title: level.title,
    encodings: { x: level.xField, y: 'Orders' },
    chartProperties: { includeZero_y: true, maxBandSize: 24 },
    baseSize: { width: 440, height: 260 },
  }), [level]);
  const onReady = useCallback((svg: SVGSVGElement) => {
    const card = cardRef.current;
    if (!card) return undefined;
    if (level.level === 'year') {
      return attachSemanticWheelZoom(
        svg,
        card,
        {
          hoverFields: ['YearLabel', 'Orders'],
          zoomInMessage: (datum) => `Wheel up to open ${datum.YearLabel} by month`,
          zoomOutMessage: 'Wheel down to stay at the yearly overview',
          onZoomIn: (datum) => setState({ year: Number(datum.YearValue) }),
          onZoomOut: () => setState({}),
        },
      );
    }
    if (level.level === 'month') {
      return attachSemanticWheelZoom(
        svg,
        card,
        {
          hoverFields: ['Month', 'Orders'],
          zoomInMessage: (datum) => `Wheel up to open ${datum.Month} by day`,
          zoomOutMessage: 'Wheel down to return to the yearly overview',
          onZoomIn: (datum) => setState((current) => ({
            year: current.year,
            month: Number(datum.MonthIndex),
          })),
          onZoomOut: () => setState((current) => ({ year: current.year })),
        },
      );
    }
    return attachSemanticWheelZoom(
      svg,
      card,
      {
        hoverFields: ['Date', 'Orders'],
        zoomOutMessage: 'Wheel down to return to the monthly view',
        onZoomOut: () => setState((current) => ({ year: current.year, month: undefined })),
      },
    );
  }, [level.level]);

  return (
    <article className="ic-card" ref={cardRef}>
      <CandidateHeader title="Retail demand drilldown" label={example.label} note={example.note} />
      <div className="ic-stage ic-stage-stack">
        <div className="ic-toolbar">
          <button
            type="button"
            className="ic-pill"
            data-active={state.year == null}
            onClick={() => setState({})}
          >
            All years
          </button>
          {state.year != null ? (
            <button
              type="button"
              className="ic-pill"
              data-active={state.year != null && state.month == null}
              onClick={() => setState({ year: state.year })}
            >
              {state.year}
            </button>
          ) : null}
          {state.year != null && state.month != null ? (
            <button
              type="button"
              className="ic-pill"
              data-active="true"
              onClick={() => setState({ year: state.year, month: state.month })}
            >
              {MONTH_LABELS[state.month - 1]}
            </button>
          ) : null}
        </div>
        <div className="ic-stage-meta">
          <strong>{level.level === 'year' ? 'Level 1' : level.level === 'month' ? 'Level 2' : 'Level 3'}</strong>
          <span>{level.hint}</span>
        </div>
        <ScaleToFit height={320} minHeight={250} adaptiveHeight padding={8}>
          <VegaLiteView spec={spec} renderer="svg" onReady={onReady} />
        </ScaleToFit>
      </div>
    </article>
  );
}

function CandidateCard({ example }: { example: Example }) {
  if (example.kind === 'flint-dimpvis') return <FlintDimpVisCandidateCard example={example} />;
  if (example.kind === 'dimpvis') return <DimpVisCandidateCard example={example} />;
  if (example.kind === 'overview-detail') return <OverviewDetailCandidateCard example={example} />;
  if (example.kind === 'drilldown') return <DrilldownCandidateCard example={example} />;
  return <SingleCandidateCard example={example} />;
}

export function InteractionCandidates() {
  return (
    <div className="dev-page ic-page">
      <header className="dev-page-heading ic-heading">
        <div className="ic-eyebrow">Future interaction references</div>
        <h1>Hand-authored interaction candidates</h1>
        <p>
          Most cards on this page compile a static Flint chart and then attach D3 afterwards, preserving
          concrete interaction treatments we may later move into compiler-owned semantics and rendering.
          The discrete Flint DimpVis card is the current exception: it stays inside Flint&apos;s interaction
          surface and intentionally tests how far the existing semantic update model can go on its own.
        </p>
      </header>
      <div className="ic-grid">
        {EXAMPLES.map((example) => <CandidateCard key={example.id} example={example} />)}
      </div>
    </div>
  );
}
