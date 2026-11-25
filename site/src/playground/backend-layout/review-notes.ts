/**
 * Cases to check by eye, per backend: where the layout made a call that may not suit the library's
 * own look, or where the backend cannot draw what the plan decided. One central list per backend,
 * shown at the top of its page; each note links to its case.
 */
import type { SectionId } from './cases';

export type ReviewBackend = 'echarts' | 'chartjs' | 'plotly';

export interface ReviewNote {
  section: SectionId;
  /** The case id on the page (`labels-…`, `title-…`); unset for notes about a whole section. */
  caseId?: string;
  /** What to look at, as a question. */
  question: string;
  /** What Flint does now, and why. */
  now: string;
}

export const REVIEW_NOTES: Record<ReviewBackend, ReviewNote[]> = {
  echarts: [
    {
      section: 'title-wrap', caseId: 'title-snapshot-deck',
      question: 'Should the headline sit centred over the canvas, as ECharts 6 sets its title, or start-aligned over the plot as Vega-Lite and most houses set it?',
      now: 'ECharts\u2019 own title: centred, 15 px from the top, 18 px bold over a 12 px grey deck, broken to the canvas width less padding with the shared no-widow rule. The plot starts under the block; a key beside the plot starts under it too.',
    },
    {
      section: 'calendar', caseId: 'calendar-inspection-cadence',
      question: 'Is ECharts\u2019 own time axis acceptable for calendar labels, or should Vega-Lite\u2019s calendar tick plan (`planTemporalTicks`) move to core and drive ECharts too?',
      now: 'The Line/Area templates stand every time label on end; the frame stands them flat where a label fits a sixth of the plot, with `hideOverlap` dropping any that would collide. Tick choice and boundary labels are ECharts\u2019 own (e.g. \u201cJan 08\u201d, not \u201cJan 5, 2024\u201d). Dense series (density-lines-164) stay turned.',
    },
    {
      section: 'density', caseId: 'density-lines-30',
      question: 'When long series names make the side key take too much width, is ECharts\u2019 own foot legend (one line a name, flowing in rows) the right fallback, or should the names wrap beside the plot instead?',
      now: 'The canvas fit tries, in turn, key names held to 120 px (wrapped beside the plot), the key at the foot, and a smaller plot, and keeps whichever reads best, only where it beats the plan. Here none beats the plan, so the key stays beside the plot and the host scales the drawing to about 63%.',
    },
    {
      section: 'legend', caseId: 'legend-long-size',
      question: 'Two keys (colour + size): the colour legend sits at the foot and the size key is ECharts\u2019 own continuous visualMap. Is the native ramp, stood from the plot\u2019s top with its title centred over the bar, the right look, or should it show discrete bubbles as Vega-Lite does?',
      now: 'Native visualMap kept (per review). The frame stands each vertical ramp from the plot top, centres its title over the bar clear of the chart title, and widens `grid.right` to fit; the foot rows of the colour legend are measured as ECharts wraps them so the plot and its x name stay clear.',
    },
    {
      section: 'color',
      question: 'A binned colour scale\u2019s pieces now break at round values (\u201c\u221225,000 \u2013 0\u201d) rather than at the data\u2019s raw quantiles. Is rounding the edges right when it makes the bins slightly uneven in count?',
      now: '`roundBinEdges` (core) snaps each edge to the coarsest round step that keeps the edges distinct; the outer pieces stay open (\u201c< \u2026\u201d, \u201c\u2265 \u2026\u201d) and an authored domain still wins.',
    },
    {
      section: 'canvas-squeeze', caseId: 'squeeze-pie-ok',
      question: 'Axis-less charts (pie, sunburst, gauge, radar, funnel): is pushing the whole chart down under the title right, or should the title shrink the chart instead?',
      now: 'The canvas grows by the title block; every positioned component moves down by it (percent centres and radii are held in px of the canvas as it was). A component placed with `top: \u2018middle\u2019` (funnel) is left where ECharts puts it and may sit closer to the title.',
    },
    {
      section: 'axis-labels', caseId: 'labels-facet-long',
      question: 'Facets: only the title is laid out; each panel keeps the facet combiner\u2019s own label handling (turned names). Should panels take the band-label plan too?',
      now: 'The frame treats a multi-grid option as one block: the title is broken over the canvas and every grid moves down under it. Panel gutters are not re-measured.',
    },
    {
      section: 'axis-labels', caseId: 'labels-short-control-color',
      question: 'A padded scatter domain ends off the round ticks (11.25, 41.4). Hiding those end labels matches Vega-Lite; is that right for ECharts readers, who are used to seeing them?',
      now: '`showMinLabel` / `showMaxLabel` set false only where the end is not on one of the renderer\u2019s round ticks.',
    },
  ],
  chartjs: [
    {
      section: 'title-wrap', caseId: 'title-snapshot-deck',
      question: 'Chart.js\u2019 title plugin defaults to 12 px bold over a 12 px subtitle, much quieter than the other backends. Keep the library default, or set the headline a size or two up?',
      now: 'Library default kept: `plugins.title` (12 px bold) and `plugins.subtitle` (12 px), centred, lines given as arrays and broken with the shared no-widow rule. The canvas grows by the block so the plot keeps its planned size.',
    },
    {
      section: 'legend', caseId: 'legend-colour-10-long',
      question: 'Chart.js holds a side legend to a quarter of the canvas and cannot wrap names in a row at the foot. Are cut names (\u201cBosnia and He\u2026\u201d) acceptable, or should long-name keys fall back to an HTML legend?',
      now: 'Beside the plot names wrap onto lines (array labels) within the quarter-canvas cap and are cut past it; at the foot each name stands on one line, cut where it would run past the canvas.',
    },
    {
      section: 'legend', caseId: 'legend-ramp',
      question: 'Legends a template writes itself (a colour ramp\u2019s stops) keep the layout pass\u2019s fixed 96 px gutter; Chart.js draws them wider than planned. Measure them too?',
      now: 'Left as the layout pass set them; the plot comes out narrower than planned by the difference (Chart.js fits its boxes inside the canvas).',
    },
    {
      section: 'axis-labels', caseId: 'labels-facet-long',
      question: 'Facet grids are composed by the HTML host, which draws no chart title yet. Add a title row to the facet host?',
      now: 'Faceted charts skip the frame: no title, panels as before.',
    },
    {
      section: 'calendar', caseId: 'calendar-inspection-cadence',
      question: 'Chart.js\u2019 time scale picks sparse ticks (\u201cJan 2024\u201d, \u201cMar 2024\u201d) with its own autoSkip. Acceptable, or should the calendar tick plan drive Chart.js ticks?',
      now: 'Chart.js\u2019 own time ticks; the frame only measures the room they take.',
    },
    {
      section: 'color',
      question: 'Chart.js has no Heatmap, Boxplot or Donut template, so most Color cases and several squeeze/temporal cases are drawn by Vega-Lite only. Expected?',
      now: 'Shown on the page as unsupported, not as errors.',
    },
  ],
  plotly: [
    {
      section: 'title-wrap', caseId: 'title-long-deck',
      question: 'Text is measured as Verdana, which Plotly\u2019s default stack (\u201cOpen Sans\u201d, verdana, arial) draws in where Open Sans is not loaded. If a host loads Open Sans, lines break a little early (Open Sans runs ~5% narrower). Fine?',
      now: 'Headline and deck broken with the shared no-widow rule in Verdana metrics; the deck rides as a smaller second span under the headline (Plotly 2.x has no subtitle). Broken lines come out of a continuous plot.',
    },
    {
      section: 'axis-labels', caseId: 'labels-horizontal-narrow',
      question: 'Wrapping a long legend name puts `<br>` into the trace name, which the hover label shows too (in full, `namelength: -1`). Acceptable, or should the hover keep the one-line name via a hovertemplate?',
      now: 'Names wrap only when the canvas fit holds key names to 120 px; otherwise Plotly\u2019s legend sets them on one line beside the plot.',
    },
    {
      section: 'density', caseId: 'density-lines-164',
      question: 'Plotly\u2019s side legend never wraps into columns (it scrolls), so a long key makes a wide figure. Is moving it to a horizontal row at the foot (container-anchored) the right fallback?',
      now: 'Side legend measured as one column; the canvas fit may hold names to 120 px or move the key to the foot, taking whichever reads best and only where it beats the plan.',
    },
    {
      section: 'color', caseId: 'color-4',
      question: 'The colour bar\u2019s room is estimated from its ticks and title; Plotly\u2019s automargin settles the last 10\u201330 px. Close enough?',
      now: 'Right margin = max(32, bar + widest tick label, title); Plotly may still grow it.',
    },
    {
      section: 'canvas-squeeze', caseId: 'squeeze-products-swiss',
      question: 'Themed Plotly charts: a house that sets the key above or below the plot has the plan\u2019s side room given back before the theme lays the axes out. Check houses with keys on top look balanced.',
      now: 'The key, the red tab or rule (`planHeader`), the headline and the source line (`planSource`) all start at the chart\u2019s left edge, as Vega-Lite sets them; a house that stands the value axis on the right (Economist) has it drawn there. The foot follows the names the house realizes: room kept for turned names or for an axis title moved into the deck is given back.',
    },
    {
      section: 'canvas-squeeze', caseId: 'squeeze-stacked-economist',
      question: 'Plotly draws headline and deck as one block of lines, so the house\u2019s padding between them (e.g. Economist 7 px) is not drawn; the deck sits at Plotly\u2019s own line spacing. Acceptable, or draw the deck as a separate annotation?',
      now: 'Title height reserved as the lines Plotly draws, plus the house\u2019s title offset; the key above the plot is set inside Plotly\u2019s padded legend box so the gaps between what is drawn match the house\u2019s.',
    },
    {
      section: 'canvas-squeeze', caseId: 'squeeze-gapminder-economist',
      question: 'Plotly has no size legend, so a bubble chart shows only its colour key (Vega-Lite also shows \u201cPopulation (M)\u201d with sample circles). Draw a size key from dummy traces or shapes?',
      now: 'Colour key only; bubble size is unexplained in the figure.',
    },
    {
      section: 'canvas-squeeze', caseId: 'squeeze-cpi-nyt',
      question: 'Plotly\u2019s templates leave keys untitled. A house that titles its key (NYT: \u201cDirection\u201d) now gets the field\u2019s name inline at the start of the row, as Vega-Lite sets it. Right for every house?',
      now: 'The key is titled from the colour (or group) field\u2019s display name only where the house\u2019s resolved `legend.title` is on; untheme\u2019d Plotly charts stay untitled. Names along the band are cut in the face they were planned in, so they break as Vega-Lite breaks them.',
    },
    {
      section: 'canvas-squeeze', caseId: 'squeeze-ch-ten-long-keys-top',
      question: 'A house key of ten long names on top made the drawing 1.5\u00d7 taller than its box; the canvas fit now stands it beside the plot (one column, Plotly\u2019s side legend). Is overriding the house\u2019s top placement right here, as Vega-Lite does?',
      now: '`refitCanvas` tries `{ keys: \u2019side\u2019 }` (and with names held to 120 px) when keys in rows above or below the plot make the drawing tall; the side key is measured as Plotly draws it (`keyBlock`, `PLOTLY_PROFILE`) and kept only where it reads clearly better.',
    },
    {
      section: 'canvas-squeeze', caseId: 'squeeze-oecd-16-slide',
      question: 'Facets: one shared y title and one shared x title (centred), x labels only under each column\u2019s last panel, years thinned to flat round ticks. Vega-Lite repeats the y title per row and the x title per column. Prefer the repeated titles?',
      now: 'The grid is planned with Plotly\u2019s furniture (`plFacetFurniture`: 4 columns here, as Vega-Lite) and laid out around measured labels (`plLayoutFacetGrid`). Banded x axes keep labels on every panel, rows spaced for them.',
    },
    {
      section: 'canvas-squeeze', caseId: 'squeeze-ch-pie-callouts-economist',
      question: 'A themed pie (or one with a source line) whose callouts would stand outside it now names its slices in a key, in the house\u2019s row where it fits in two rows, else beside the pie, with shares inside \u2014 as Vega-Lite does. Right for every house, or should a house with no key on top keep callouts?',
      now: 'Fixed: outside callouts let Plotly\u2019s automargin grow the margins after the header was written, dragging the paper-referenced red tab off the headline (and with it the plot area). Callouts are turned off and the pie\u2019s room is fixed, so nothing the frame hung from the plot moves. Unthemed pies with no source keep Plotly\u2019s callouts. Inside/outside packing before keying was considered and skipped; instead `chartProperties.sliceNames` (`auto` | `onSlices` | `key`), also settable per house in `chartDefaults[\u2019Pie Chart\u2019]`, lets the author or house choose.',
    },
    {
      section: 'canvas-squeeze', caseId: 'squeeze-companies-default',
      question: 'Overflow policy (needs a decision): with Plotly\u2019s own sizes (12 px Verdana, 40 px before each key name) a seven-long-name key and the planned 300 px plot cannot share a 450 px box; the host scales the drawing to 75%. Vega-Lite fits because its key is ~130 px wide. Which should give: (a) the library\u2019s type sizes (step key, tick and title text down to a 10 px floor), (b) the plot (laid out smaller \u2014 tried, it left a 180 px plot and a scrolling key, worse), or (c) accept host scaling down to some limit?',
      now: 'Decided for now: the key gives way, the plot and library type sizes do not (except key text, one size, 10 px floor). Names are held to 120 px of their own width (then 90 px with smaller text), scored by flags plus host shrink below 90%; the plot shrinks only past legibility (70%). Here that takes Plotly from 75% to 83% (Datawrapper 85% \u2192 94%). Reverse the call if you prefer smaller tick/title type or a smaller plot. ECharts stays at 82%: its size ramp holds the right edge, so the colour key cannot stand beside the plot without stacking with it.',
    },
    {
      section: 'canvas-squeeze', caseId: 'squeeze-oecd-4-card',
      question: 'Plotly still assembles through `computeLayout` and takes the plan\u2019s decisions piecemeal; only Vega-Lite runs `planLayout` with a `BackendLayoutProfile`. Move Plotly (then ECharts and Chart.js) onto `planLayout` with their own profiles, so facet columns, tick counts and label sizes come from one plan?',
      now: 'Not done: a large change to each backend\u2019s assemble. The drawing side is profiled (`BackendProfile`); the plan side gets Plotly\u2019s facet furniture through `facetFixedPadding`/`facetGap` only.',
    },
    {
      section: 'categorical-temporal', caseId: 'temporal-bar-24-months',
      question: 'Bars over a regular run of months stay on a time scale (Vega-Lite, and Plotly\u2019s date axis) with one width each, centred on the 1st: months run 28\u201331 days, so the gap after February all but closes while the others stay ~2 px (visible at 24 bars in 400 px). Fix by (a) spanning each bar f/2 of the way to its neighbours (gaps a constant share of each month, centres within 2% of a step \u2014 needs working x/x2 columns, so the tooltip, brush and house bar fraction need care), (b) Vega-Lite\u2019s own `timeUnit` spans (bars move to mid-month, half a step off their ticks), or (c) bands for whole month runs, as heatmaps now do?',
      now: 'Not changed: the \u201cruns of time stay continuous\u201d rule for bars stands. Heatmaps changed: a whole run of months or quarters (`readsAsCalendarRun`) is drawn as equal cells named by the calendar (`Jan`/`2025`, `Feb`, \u2026) on every backend, the time scale one `xAxisType` choice away; a run with a gap, or of days, weeks or years, keeps its time scale.',
    },
  ],
};
