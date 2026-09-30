import { useMemo, useState } from 'react';
import { assembleVegaLite, type ChartAssemblyInput } from 'flint-chart';
import { VegaLiteView } from '../components/VegaLiteView';
import './axis-label-lab.css';

interface CalendarExample {
  id: string;
  title: string;
  start: string;
  end: string;
  stepHours: number;
  semanticType?: 'Date' | 'DateTime' | 'Timestamp';
  facets?: boolean;
  vertical?: boolean;
  planningWidth?: number;
  planningHeight?: number;
  recordedAxis?: { values: number[]; labelExpr: string; labelOverlap: false; labelFlush: false };
}

const UTC_RECORDED_AXIS = {
  values: [1735668000000, 1735678800000, 1735689600000, 1735700400000, 1735711200000, 1735722000000, 1735732800000],
  labelExpr: '({"1735668000000":"6 PM","1735678800000":"9 PM","1735689600000":"Jan 1, 2025","1735700400000":"3 AM","1735711200000":"6 AM","1735722000000":"9 AM","1735732800000":"12 PM"})[toString(toNumber(datum.value))] || \'\'',
  labelOverlap: false as const,
  labelFlush: false as const,
};

const INSPECTION_EXAMPLES: CalendarExample[] = [
  { id: 'inspection-cadence', title: '1. Daily detail / three months', start: '2024-01-05', end: '2024-04-05', stepHours: 24, planningWidth: 480 },
  { id: 'inspection-resize', title: '2. Monthly detail / March to November', start: '2024-03-01', end: '2024-11-01', stepHours: 24, planningWidth: 900 },
  { id: 'inspection-portability', title: '3a. Timezone / UTC plan, local renderer', start: '2024-12-31T18:00:00Z', end: '2025-01-01T12:00:00Z', stepHours: 0.5, planningWidth: 600, recordedAxis: UTC_RECORDED_AXIS },
  { id: 'inspection-dst', title: '3b. Timezone / repeated autumn hour', start: '2024-11-03T07:00:00Z', end: '2024-11-03T12:00:00Z', stepHours: 0.25, planningWidth: 900 },
  { id: 'inspection-single-date', title: '4. Single date / missing context', start: '2024-02-29', end: '2024-02-29', stepHours: 24, planningWidth: 480 },
];

const EXAMPLES: CalendarExample[] = [
  { id: 'year-boundaries', title: 'January boundaries', start: '2020-01-01', end: '2022-01-01', stepHours: 168 },
  { id: 'partial-years', title: 'Weekly series / partial years', start: '2020-04-06', end: '2024-12-30', stepHours: 168 },
  { id: 'sparse-dates', title: 'Sparse observations', start: '2020-01-01', end: '2024-12-30', stepHours: 2160 },
  { id: 'single-year', title: 'Single year / no January', start: '2022-03-01', end: '2022-11-01', stepHours: 168 },
  { id: 'leap-day', title: 'Leap-day boundary', start: '2024-02-24', end: '2024-03-05', stepHours: 24 },
  { id: 'datetime-daily', title: 'DateTime / daily samples', start: '2024-02-24', end: '2024-03-05', stepHours: 24, semanticType: 'DateTime' },
  { id: 'intraday', title: 'Intraday / New Year', start: '2023-12-31T18:00:00Z', end: '2024-01-01T12:00:00Z', stepHours: 0.5 },
  { id: 'long-range', title: 'Forty-year range', start: '2020-01-01', end: '2060-01-01', stepHours: 720 },
  { id: 'facets', title: 'Faceted calendar axes', start: '2020-01-01', end: '2024-12-30', stepHours: 168, facets: true },
  { id: 'vertical', title: 'Vertical date axis', start: '2020-01-01', end: '2024-12-30', stepHours: 168, vertical: true },
];

function exampleInput(example: CalendarExample, width: number, height: number, theme: string): ChartAssemblyInput {
  const semanticType = example.semanticType ?? (example.stepHours < 24 ? 'DateTime' : 'Date');
  const start = Date.parse(example.start);
  const end = Date.parse(example.end);
  const step = example.stepHours * 60 * 60 * 1000;
  const rows = Array.from({ length: Math.ceil((end - start) / step) + 1 }, (_, index) => {
    const timestamp = new Date(Math.min(end, start + index * step)).toISOString();
    return {
      date: semanticType === 'Date' ? timestamp.slice(0, 10) : timestamp,
      value: Math.round((100 + 12 * Math.sin(index * 0.35) + index * 0.08) * 100) / 100,
    };
  });
  return {
    data: { values: example.facets
      ? ['North', 'South'].flatMap((region, index) => rows.map(row => ({ ...row, region, value: row.value + index * 15 })))
      : rows },
    semantic_types: { date: semanticType, value: 'Quantity', region: 'Category' },
    field_display_names: { date: 'Date', value: 'Reading', region: 'Region' },
    theme_spec: theme || undefined,
    chart_spec: {
      chartType: example.vertical || start === end ? 'Scatter Plot' : 'Line Chart',
      title: example.title,
      subtitle: `${example.start} to ${example.end}`,
      encodings: {
        x: example.vertical ? 'value' : 'date',
        y: example.vertical ? 'date' : 'value',
        ...(example.facets ? { column: 'region' } : {}),
      },
      baseSize: { width, height: Math.max(80, height - 140) },
      canvasSize: { width, height },
    },
  };
}

function nativeDefault(flint: any) {
  const native = JSON.parse(JSON.stringify(flint));
  const config = native.config ?? {};
  delete config.timeFormat;
  const temporalSettings = ['format', 'formatType', 'labelExpr', 'values', 'tickCount', 'tickMinStep',
    'labelOverlap', 'labelFlush', 'labelFlushOffset'];
  const visit = (node: any): void => {
    for (const channel of ['x', 'y']) {
      const encoding = node.encoding?.[channel];
      if (encoding?.type !== 'temporal') continue;
      for (const key of ['axis', 'axisTemporal', channel === 'x' ? 'axisX' : 'axisY',
        channel === 'x' ? 'axisBottom' : 'axisLeft']) {
        if (config[key]) for (const property of temporalSettings) delete config[key][property];
      }
      if (encoding.axis) for (const property of temporalSettings) delete encoding.axis[property];
    }
    if (node.spec) visit(node.spec);
    for (const child of [...(node.layer ?? []), ...(node.vconcat ?? []), ...(node.hconcat ?? []), ...(node.concat ?? [])]) visit(child);
  };
  visit(native);
  return native;
}

function CalendarChart({ example, theme }: { example: CalendarExample; theme: string }) {
  const planningWidth = example.planningWidth ?? 480;
  const planningHeight = example.planningHeight ?? 420;
  const built = useMemo(() => {
    const input = exampleInput(example, planningWidth, planningHeight, theme);
    try {
      const spec = assembleVegaLite(input);
      if (example.recordedAxis) {
        const applyRecordedAxis = (node: any): void => {
          const encoding = node.encoding?.x;
          if (encoding?.type === 'temporal') encoding.axis = { ...encoding.axis, ...example.recordedAxis };
          if (node.spec) applyRecordedAxis(node.spec);
          for (const child of [...(node.layer ?? []), ...(node.vconcat ?? []), ...(node.hconcat ?? [])]) applyRecordedAxis(child);
        };
        applyRecordedAxis(spec);
      }
      return { input, spec, native: nativeDefault(spec), error: '' };
    } catch (error) {
      return { input, spec: null, native: null, error: String(error) };
    }
  }, [example, planningWidth, planningHeight, theme]);

  return (
    <article className="axis-label-case" data-case={example.id}>
      <h2>{example.title}</h2>
      {example.recordedAxis && <p className="axis-label-source">Plan timezone: UTC; browser timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>}
      {example.id === 'inspection-dst' && <p className="axis-label-source">Browser timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}; US Pacific transition: 01:59 PDT to 01:00 PST.</p>}
      <div className="axis-label-comparison calendar-axis-comparison"
        style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${planningWidth}px), 1fr))` }}>
        {built.error ? <p role="alert">{built.error}</p> : [
          { id: 'default', title: 'Vega-Lite default', spec: built.native },
          { id: 'flint', title: example.recordedAxis ? 'Flint / recorded UTC plan' : 'Flint current', spec: built.spec },
        ].map(variant => <figure key={variant.id} data-variant={variant.id}>
          <figcaption>{variant.title}</figcaption>
          <div className="calendar-axis-viewport" tabIndex={0} aria-label={`${example.title}: ${variant.title}`}>
            <VegaLiteView spec={variant.spec} renderer="svg" />
          </div>
          <div className="calendar-axis-inspect"><details>
            <summary>Full Vega-Lite spec</summary>
            <pre tabIndex={0}>{JSON.stringify(variant.spec, null, 2)}</pre>
          </details></div>
        </figure>)}
      </div>
      <div className="calendar-axis-inspect">
        <details>
          <summary>Assembly input</summary>
          <pre tabIndex={0}>{JSON.stringify(built.input, null, 2)}</pre>
        </details>
      </div>
    </article>
  );
}

export function CalendarAxisLab() {
  const [theme, setTheme] = useState('');
  const examples = [...INSPECTION_EXAMPLES, ...EXAMPLES];
  return (
    <section className="axis-label-lab calendar-axis-lab">
      <header className="axis-label-heading">
        <div><h1>Calendar axes</h1><p>Vega-Lite / generated fixtures</p></div>
        <div className="calendar-axis-controls">
          <label>Theme <select value={theme} onChange={event => setTheme(event.target.value)}>
            <option value="">Unthemed</option>
            <option value="datawrapper">Datawrapper</option>
            <option value="powerbi">Power BI</option>
            <option value="swiss">Swiss</option>
            <option value="nyt">NYT</option>
            <option value="economist">Economist</option>
            <option value="mckinsey">McKinsey</option>
            <option value="nature">Nature</option>
          </select></label>
        </div>
      </header>
      {examples.map(example => <CalendarChart key={example.id} example={example} theme={theme} />)}
      <details className="calendar-axis-principles">
        <summary>Principles</summary>
        <ol>
          <li><strong>Semantic precision.</strong> Start with the field's unit. Date uses days; YearMonth uses months. Never introduce finer ticks or gridlines.</li>
          <li><strong>Consistent label form.</strong> Choose by expected month repetition before fitting. Dense daily ticks use Day with occasional month context; sparse dates across several months use MonthDay. Fitting may hide text, but must not change its form.</li>
          <li><strong>Month names.</strong> Prefer full names for standalone months, especially promoted boundaries between day numbers. Abbreviate consistently only when full names would collide, exceed the label limit, or hide more labels.</li>
          <li><strong>Boundary promotion.</strong> Promote the label form, not the whole axis. MonthDay stays complete across months and becomes 2025 at New Year. Day becomes Jan at a month boundary or Jan 2025 at New Year. Month becomes 2025; Hour becomes Jan 1, 2025.</li>
          <li><strong>Preserve detail.</strong> Keep ordinary unit labels between boundaries. Thin them only when their measured spacing requires it.</li>
          <li><strong>Regular grid cadence.</strong> Divide calendar periods into near-equal intervals that meet their boundaries. Weekly and fortnightly grids may adjust by up to two days; do not insert cramped extra lines beside month or year boundaries. Include a start tick only when it respects that cadence.</li>
          <li><strong>Boundary priority.</strong> Place higher-level dividers first. Lower-level dividers and ordinary labels must not displace them.</li>
          <li><strong>Gridlines and ticks survive hidden labels.</strong> Keep every planned tick and normal gridline, including ordinary days or months, even when its label cannot fit. Hide only the overlapping text; do not create gaps or change line styling.</li>
          <li><strong>Start context.</strong> Shorten redundant context before changing alignment: for example, 10 AM before a visible 2024 divider closing the opening calendar period. Without that divider, keep the date and year. Include the start only when it fits; never borrow context from a hidden label.</li>
          <li><strong>Calendar consistency.</strong> Use one timezone for positions, boundaries, and labels. Respect variable month lengths, leap days, and daylight-saving changes.</li>
          <li><strong>Cyclic axes stay cyclic.</strong> Month-of-year and hour-of-day categories do not imply years or dates. DateTime and Timestamp permit sub-day precision.</li>
          <li><strong>Explicit choices win.</strong> Preserve authored formats, tick values, and domains. Apply the same temporal rules across themes.</li>
        </ol>
      </details>
    </section>
  );
}