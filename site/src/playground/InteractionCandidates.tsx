import { useCallback, useMemo, useRef } from 'react';
import { pointer, select } from 'd3';
import { assembleVegaLite } from 'flint-chart';
import { FlaskConical } from 'lucide-react';
import { VegaLiteView } from '../components/VegaLiteView';
import { ScaleToFit } from '../components/ScaleToFit';
import { PREVIEW_CASES, type PreviewCase } from '../shared/preview-cases';
import './interaction-candidates.css';

type InteractionKind = 'hover-points' | 'brush-points' | 'click-bars' | 'click-arcs' | 'hover-cells';

interface Example {
  id: string;
  caseId: string;
  label: string;
  note: string;
  interaction: InteractionKind;
}

const EXAMPLES: Example[] = [
  {
    id: 'point-hover',
    caseId: 'driving',
    label: 'Point hover + tooltip',
    note: 'Candidate for compiler-owned hover targeting, emphasis, and semantic tooltip content.',
    interaction: 'hover-points',
  },
  {
    id: 'brush-feedback',
    caseId: 'penguins',
    label: 'Brush selection feedback',
    note: 'Reference treatment for the supported rectangle primitive: live count, outline, and brush styling.',
    interaction: 'brush-points',
  },
  {
    id: 'bar-focus',
    caseId: 'population',
    label: 'Bar focus + details',
    note: 'Reference treatment for click focus with a contextual detail readout and double-click reset.',
    interaction: 'click-bars',
  },
  {
    id: 'arc-focus',
    caseId: 'mobile-donut',
    label: 'Arc focus + details',
    note: 'Reference treatment for semantic arc focus, stronger boundaries, and contextual values.',
    interaction: 'click-arcs',
  },
  {
    id: 'cell-hover',
    caseId: 'temp-heatmap',
    label: 'Cell hover + tooltip',
    note: 'Candidate for semantic cell hover with field-aware tooltip content.',
    interaction: 'hover-cells',
  },
];

function findCase(id: string): PreviewCase {
  const found = PREVIEW_CASES.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Unknown preview case: ${id}`);
  return found;
}

function compileCase(previewCase: PreviewCase): any {
  return assembleVegaLite({
    data: { values: previewCase.data },
    semantic_types: previewCase.semantic_types,
    chart_spec: {
      chartType: previewCase.chartType,
      title: previewCase.title,
      encodings: previewCase.encodings,
      baseSize: { width: 440, height: 280 },
      ...(previewCase.chartProperties ? { chartProperties: previewCase.chartProperties } : {}),
    },
  } as any);
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

function attachBrushPoints(svg: SVGSVGElement, card: HTMLElement) {
  const marks = select(svg).selectAll<SVGGraphicsElement, any>('g.mark-symbol.role-mark path');
  if (!marks.size()) return () => {};
  const tooltip = installTooltip(card);
  const positions = new Map(marks.nodes().map((node) => [node, svgPoint(svg, node)]));
  const xs = [...positions.values()].map(([x]) => x);
  const ys = [...positions.values()].map(([, y]) => y);
  const x0 = Math.min(...xs) - 12;
  const y0 = Math.min(...ys) - 12;
  const width = Math.max(...xs) + 12 - x0;
  const height = Math.max(...ys) + 12 - y0;
  const layer = select(svg).append('g').attr('class', 'ic-brush');
  const selection = layer.append('rect').attr('class', 'selection').style('display', 'none');
  const overlay = layer.append('rect')
    .attr('class', 'overlay')
    .attr('x', x0)
    .attr('y', y0)
    .attr('width', width)
    .attr('height', height)
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
  }
}

function CandidateCard({ example }: { example: Example }) {
  const previewCase = useMemo(() => findCase(example.caseId), [example.caseId]);
  const spec = useMemo(() => compileCase(previewCase), [previewCase]);
  const cardRef = useRef<HTMLElement>(null);
  const onReady = useCallback((svg: SVGSVGElement) => {
    const card = cardRef.current;
    return card ? attachInteraction(example.interaction, svg, card) : undefined;
  }, [example.interaction]);

  return (
    <article className="ic-card" ref={cardRef}>
      <header className="ic-card-header">
        <div className="ic-kicker"><FlaskConical size={13} aria-hidden="true" /> Hand-authored D3</div>
        <h2>{previewCase.title}</h2>
        <strong>{example.label}</strong>
        <p>{example.note}</p>
      </header>
      <div className="ic-stage">
        <ScaleToFit height={390} minHeight={285} adaptiveHeight padding={8}>
          <VegaLiteView spec={spec} renderer="svg" onReady={onReady} />
        </ScaleToFit>
      </div>
    </article>
  );
}

export function InteractionCandidates() {
  return (
    <div className="dev-page ic-page">
      <header className="dev-page-heading ic-heading">
        <div className="ic-eyebrow">Future interaction references</div>
        <h1>Hand-authored interaction candidates</h1>
        <p>
          Flint compiles each static chart. D3 is attached afterwards on this page only, preserving concrete
          interaction treatments we may later move into compiler-owned semantics and rendering.
        </p>
      </header>
      <div className="ic-grid">
        {EXAMPLES.map((example) => <CandidateCard key={example.id} example={example} />)}
      </div>
    </div>
  );
}