/**
 * ECharts layout fixes: each case as ECharts drew it before the fix (an SVG captured from the browser,
 * with the spec's layout fields) beside how it draws now, and the layout fields that changed.
 */
import { useMemo } from 'react';
import { assembleECharts, type ChartAssemblyInput } from 'flint-chart';
import { FlintView } from '../../components/FlintView';
import { SECTIONS, SETUPS, LEGEND_SIZES, sectionCases, type LayoutCase } from './cases';
import beforeSpecs from './echarts-before/specs.json';
import './backend-layout.css';

const BEFORE_SVGS = import.meta.glob('./echarts-before/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

interface FixGroup { issue: string; fix: string; cases: string[] }

const GROUPS: FixGroup[] = [
  {
    issue: '1 · A date axis down y drew no points',
    fix: 'The scatter template put dates on a value axis, which cannot place a date string. Dates on either axis now run on ECharts\u2019 time axis, as epoch ms.',
    cases: ['calendar-vertical'],
  },
  {
    issue: '2 · The key stood far from the plot',
    fix: 'The gutter was the key planner\u2019s width budget, not what ECharts draws. It is now the box ECharts draws (icon, 5 px, widest line, padding) plus a 12 px gap; the key\u2019s title starts where its entries do.',
    cases: ['labels-density-16-2-color', 'labels-five-long-color', 'legend-colour-10-long', 'legend-colour-size'],
  },
  {
    issue: '3, 5, 6 · A heatmap\u2019s colour ramp overlapped the x labels and name',
    fix: 'The frame recomputed the bottom margin from the axis alone and dropped the room the heatmap template kept for its ramp. A horizontal ramp at the foot is now measured (bar, handle values, padding, or rows of pieces) and the x name stands above it.',
    cases: ['squeeze-budget-heatmap', 'squeeze-dd-heat-few', 'squeeze-dd-heat-many', 'temporal-heatmap-six-months', 'color-2', 'color-4'],
  },
  {
    issue: '4 · A wide gap between the title and a pie',
    fix: 'An axis-less chart moved down by the whole title block, on top of the margin the pie already keeps for its labels. It now moves down only by what the title needs past the content\u2019s own top.',
    cases: ['squeeze-pie-ok'],
  },
  {
    issue: '7 · The size ramp\u2019s title sat up against the headline, off its bar',
    fix: 'ECharts\u2019 own continuous size (and colour) ramp is kept. Its title graphic was pinned 10 px from the canvas top, right-aligned past the bar, and the bar placed by a percentage of the canvas, so a title block pushed the title under the headline, away from its bar. The frame now stands each ramp from the plot\u2019s top: the title centred over its bar, the bar under it; two ramps side by side move apart where their titles would meet, and the gutter widens so no title reaches into the plot.',
    cases: ['legend-colour-size', 'legend-size', 'legend-ramp-size', 'legend-ramp', 'squeeze-gapminder-card'],
  },
  {
    issue: '8 · Colour bins edged at long raw numbers',
    fix: 'Bins cut the extent into equal parts (\u221253901.0 \u2013 \u221226950.5). They now edge at round values, the outer two open (< \u221225,000 \u00b7 \u221225,000 \u2013 0 \u00b7 0 \u2013 25,000 \u00b7 \u2265 25,000): roundBinEdges in core/color-controls, the bins the author asked for, a round step centred on the data.',
    cases: ['color-4', 'color-5'],
  },
  {
    issue: '9 · A long key wrapped badly and ran under the scroll pager',
    fix: 'The key planner fitted 32 names into three 43 px columns; ECharts draws one column, so a name broke as \u201cUnited\u201d over the rest. The planner is now told the key is one column (it scrolls), and every line is cut at the width it is given.',
    cases: ['labels-density-32-16-color', 'labels-horizontal-narrow'],
  },
  {
    issue: 'Controls · unchanged by the fixes',
    fix: 'Cases the fixes should leave as they were.',
    cases: ['calendar-inspection-cadence', 'title-snapshot-deck'],
  },
];

/** The cases as the capture compiled them: canvas squeeze at its first box, the legend lab at medium. */
function findCase(id: string): LayoutCase | undefined {
  for (const section of SECTIONS) {
    const found = sectionCases(section.id, { setup: SETUPS[0], legendSize: LEGEND_SIZES[1] }).find((c) => c.id === id);
    if (found) return found;
  }
  return undefined;
}

/** The option's layout fields, as the capture kept them. */
function layoutFields(input: ChartAssemblyInput): Record<string, unknown> {
  const o: any = assembleECharts(input);
  const pick = { _width: o._width, _height: o._height, grid: o.grid, title: o.title, legend: o.legend, visualMap: o.visualMap, xAxis: o.xAxis, yAxis: o.yAxis, graphic: o.graphic, _canvasFit: o._canvasFit };
  return JSON.parse(JSON.stringify(pick, (key, value) => typeof value === 'function' ? '[function]'
    : key === 'data' && Array.isArray(value) && value.length > 12 ? [...value.slice(0, 12), `\u2026 ${value.length - 12} more`] : value));
}

/** Prefix an inlined SVG's ids, so its gradients and clip paths never resolve to another chart's on the page. */
function scopeIds(svg: string, scope: string): string {
  return svg.replace(/id="([^"]+)"/g, `id="${scope}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#${scope}-$1)`).replace(/href="#([^"]+)"/g, `href="#${scope}-$1"`);
}

function flatten(value: unknown, path = '', out: Record<string, string> = {}): Record<string, string> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) flatten(child, path ? `${path}.${key}` : key, out);
  } else if (Array.isArray(value) && value.some((v) => v && typeof v === 'object')) {
    value.forEach((child, index) => flatten(child, `${path}[${index}]`, out));
  } else if (value !== undefined) {
    out[path] = JSON.stringify(value);
  }
  return out;
}

function SpecDiff({ before, after }: { before: unknown; after: unknown }) {
  const rows = useMemo(() => {
    const a = flatten(before);
    const b = flatten(after);
    return [...new Set([...Object.keys(a), ...Object.keys(b)])]
      .filter((key) => a[key] !== b[key] && !key.startsWith('_canvasFit'))
      .sort()
      .map((key) => ({ key, before: a[key] ?? '\u2014', after: b[key] ?? '\u2014' }));
  }, [before, after]);
  if (!rows.length) return <p className="bl-note">No layout field changed.</p>;
  return (
    <table className="bl-diff">
      <thead><tr><th>Spec field</th><th>Before</th><th>After</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.key}><td><code>{row.key}</code></td><td>{row.before}</td><td>{row.after}</td></tr>)}</tbody>
    </table>
  );
}

function FixCase({ id }: { id: string }) {
  const c = useMemo(() => findCase(id), [id]);
  const after = useMemo(() => (c ? layoutFields(c.input) : undefined), [c]);
  const before = (beforeSpecs as Record<string, any>)[id];
  const svg = useMemo(() => scopeIds(BEFORE_SVGS[`./echarts-before/${id}.svg`] ?? '', `before-${id}`), [id]);
  if (!c) return <article className="bl-case"><p className="bl-note">No case {id}.</p></article>;
  const size = (spec: any) => spec ? `${spec._width} \u00d7 ${spec._height}` : '';
  return (
    <article className="bl-case is-wide" id={id}>
      <header><h3>{c.title}</h3><div className="bl-tags"><code>{id}</code></div></header>
      <div className="bl-fix-pair">
        <figure>
          <figcaption>Before{before ? ` \u00b7 ${size(before)}` : ''}</figcaption>
          {svg ? <div className="bl-natural" dangerouslySetInnerHTML={{ __html: svg }} />
            : <p className="bl-note bl-no-before">No before captured for this case.</p>}
        </figure>
        <figure>
          <figcaption>After · {size(after)}</figcaption>
          <div className="bl-natural"><FlintView spec={c.input} backend="echarts" renderer="svg" compact /></div>
        </figure>
      </div>
      <details>
        <summary>Spec fields that changed</summary>
        {before ? <SpecDiff before={before} after={after} /> : <p className="bl-note">No before captured.</p>}
      </details>
    </article>
  );
}

export function EChartsFixesLab() {
  return (
    <section className="bl-lab">
      <header className="bl-heading">
        <div>
          <h1>ECharts layout fixes: before and after</h1>
          <p>
            Before is the SVG ECharts drew from the spec before each fix, captured in the browser; after is drawn live from the
            current spec. Under each, the layout fields of the ECharts option that changed.
          </p>
        </div>
      </header>
      {GROUPS.map((group) => (
        <section key={group.issue} className="bl-fix-group">
          <h2>{group.issue}</h2>
          <p className="bl-note">{group.fix}</p>
          {group.cases.map((id) => <FixCase key={id} id={id} />)}
        </section>
      ))}
    </section>
  );
}
