import type { ReactNode } from 'react';
import { TEST_GENERATORS } from 'flint-chart/test-data';
import { FlintView } from '../components/FlintView';
import { ScaleToFit } from '../components/ScaleToFit';
import { testCaseToAssemblyInput } from '../shared/test-case-utils';
import { siteTheme } from '../shared/theme';

// What the 1.1 release check found, drawn live so each can be seen and its fix checked.

const HOURS = Array.from({ length: 24 }, (_, hour) => ({
  Time: `2020-01-15T${String(hour).padStart(2, '0')}:00:00`,
  Visits: 120 + Math.round(80 * Math.sin((hour / 24) * Math.PI * 2 - 1.2) + 40 * Math.sin(hour)),
}));

const hourlyBars = {
  data: { values: HOURS },
  semantic_types: { Time: 'DateTime', Visits: 'Quantity' },
  chart_spec: { chartType: 'Bar Chart', encodings: { x: 'Time', y: 'Visits' }, title: 'Visits by hour, 15 January 2020', canvasSize: { width: 460, height: 260 } },
};

const heatmapCase = (generator: string, pattern: RegExp) => {
  const found = TEST_GENERATORS[generator]?.().find((tc) => pattern.test(tc.title));
  if (!found) return null;
  const input = testCaseToAssemblyInput(found, { width: 460, height: 260 });
  return { ...input, chart_spec: { ...input.chart_spec, title: found.title } };
};
const irregularHeatmap = heatmapCase('Heatmap', /80.5/);
const monthlyHeatmap = heatmapCase('Omni: Heatmap', /Heatmap/);

// The theme lab's "Shipments over time": 24 dates about 45 days apart, on a bar chart.
const shipmentsCase = TEST_GENERATORS['Bar Chart']?.()[9];
const shipments = shipmentsCase ? (() => {
  const input = testCaseToAssemblyInput(shipmentsCase, { width: 460, height: 260 });
  return { ...input, chart_spec: { ...input.chart_spec, title: 'Shipments over time', subtitle: 'Units, 2020–2022' } };
})() : null;
const shipmentsBefore = shipments
  ? { ...shipments, chart_spec: { ...shipments.chart_spec, chartProperties: { ...(shipments.chart_spec as any).chartProperties, xAxisType: 'nominal' } } }
  : null;
const shipmentDates = shipmentsCase ? [...new Set(shipmentsCase.data.map((row) => String(row[Object.keys(row).find((k) => /date/i.test(k)) ?? ''])))].slice(0, 6) : [];

const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const offset = -new Date('2020-01-15T00:00:00').getTimezoneOffset() / 60;

function Figure({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <figure style={{ margin: 0, minWidth: 0 }}>
      <figcaption style={{ fontSize: 12, color: siteTheme.textMuted, marginBottom: 6 }}>{caption}</figcaption>
      <ScaleToFit adaptiveHeight height={360} minHeight={160} padding={0}>{children}</ScaleToFit>
    </figure>
  );
}

const STATUS = {
  open: { ink: '#cf222e', border: '#f4b4b0', badge: undefined, wash: undefined },
  fixed: { ink: '#1a7f37', border: '#aceebb', badge: 'fixed', wash: '#dafbe1' },
  decide: { ink: '#9a6700', border: '#f2d48a', badge: 'decide', wash: '#fff8c5' },
} as const;

function Blocker({ n, title, look, cause, fix, fixLabel, status = 'open', children }: { n: number; title: string; look: ReactNode; cause: ReactNode; fix: ReactNode; fixLabel?: string; status?: keyof typeof STATUS; children: ReactNode }) {
  const { ink, border, badge, wash } = STATUS[status];
  return (
    <article style={{ border: `1px solid ${border}`, borderLeft: `4px solid ${ink}`, borderRadius: 8, background: '#fff', padding: '14px 16px' }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>{n}. {title} {badge && <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 600, color: ink, background: wash, padding: '1px 8px', borderRadius: 999 }}>{badge}</span>}</h2>
      <dl style={{ display: 'grid', gridTemplateColumns: '84px minmax(0, 1fr)', gap: '4px 12px', margin: '0 0 12px', fontSize: 13, lineHeight: 1.5 }}>
        <dt style={{ color: siteTheme.textMuted }}>Look at</dt><dd style={{ margin: 0 }}>{look}</dd>
        <dt style={{ color: siteTheme.textMuted }}>Cause</dt><dd style={{ margin: 0 }}>{cause}</dd>
        <dt style={{ color: siteTheme.textMuted }}>{fixLabel ?? (status === 'fixed' ? 'Fixed' : 'Fix')}</dt><dd style={{ margin: 0 }}>{fix}</dd>
      </dl>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))', gap: 16 }}>{children}</div>
    </article>
  );
}

export function ReleaseBlockers() {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 'min(100%, 1080px)' }}>
      <header>
        <h2 style={{ margin: 0, fontSize: 18 }}>Release 1.1 blockers</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: siteTheme.textMuted }}>
          Found by comparing every gallery case against the published 1.0.1, and every dev page before and after the fixes. Each is
          drawn live below, by the current code.
        </p>
      </header>

      <Blocker
        n={0}
        status="fixed"
        title="A bar chart over dates about 45 days apart now stands on a time scale"
        look={<>The theme lab's <b>“Shipments over time”</b> (generated data): 24 dates, {shipmentDates.join(', ')}, … Left, as drawn
          now: a time axis (<b>2020, April, July, …</b>), each bar at its date. Right, as before: one band per date, labelled with
          every date turned upright.</>}
        cause={<>The heatmap fix reads the step dates keep from the dates themselves, and that reading also decides whether dates
          on a bar chart are a few snapshots (bands) or a run of time (a time scale). Before, these dates were measured in days
          (a step of one day, filled by 24 of 1,050), so they read as snapshots; now they keep about one step of 45 days, a run.</>}
        fixLabel="Decided"
        fix={<>Keep the time scale: readable labels, bars placed at their dates. A few dates (eight or fewer) on a bar chart are
          still named one band each, as before.</>}
      >
        <Figure caption="Now: a time scale">
          {shipments ? <FlintView spec={shipments as never} renderer="svg" /> : <p>Test case not found.</p>}
        </Figure>
        <Figure caption="Before: one band per date (xAxisType: nominal)">
          {shipmentsBefore ? <FlintView spec={shipmentsBefore as never} renderer="svg" /> : <p>Test case not found.</p>}
        </Figure>
      </Blocker>

      <Blocker
        n={1}
        status="fixed"
        title="Times of day are labelled in the wrong hour outside UTC"
        look={<>The data runs from <b>00:00 to 23:00 on 15 January</b>, written without a time zone, so the first bar is labelled
          {' '}<b>Jan 15, 12 AM</b> whatever the viewer's time zone (this browser: <code>{zone}</code>, UTC{offset >= 0 ? '+' : ''}{offset}).
          Before the fix, outside UTC the axis was shifted by the viewer's offset: in Pacific time it started at <b>Jan 14, 4 PM</b>.</>}
        cause={<>A timestamp with no zone was read as UTC (<code>readIsoTimestamp</code> in <code>core/temporal-parse.ts</code> added a
          {' '}<code>Z</code>), but the time axis prints local time. For dates that is right (a midnight timestamp becomes its date);
          for a time of day the reading and the labels disagreed.</>}
        fix={<>A zoneless time of day stays a wall-clock time, as in 1.0.1: written in ISO form without a zone, so it is read and
          labelled in the viewer's time. Midnight timestamps under a date type still become their dates. Tested in UTC and Los Angeles
          {' '}(<code>tests/temporal-midnight.test.ts</code>).</>}
      >
        <Figure caption="Hourly bars, wall-clock times with no zone">
          <FlintView spec={hourlyBars as never} renderer="svg" showWarnings />
        </Figure>
        <figure style={{ margin: 0, minWidth: 0 }}>
          <figcaption style={{ fontSize: 12, color: siteTheme.textMuted, marginBottom: 6 }}>The rows as written</figcaption>
          <pre style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5, background: siteTheme.bg, padding: 10, borderRadius: 6, maxHeight: 280, overflow: 'auto' }}>
            {HOURS.slice(0, 6).map((row) => JSON.stringify(row)).join('\n')}{'\n'}…{'\n'}{JSON.stringify(HOURS[23])}
          </pre>
        </figure>
      </Blocker>

      <Blocker
        n={2}
        status="fixed"
        title="A heatmap over irregular dates draws hairline cells"
        look={<>Left: dates 13 or 14 days apart, which drew every cell as a one-day sliver; now each cell runs to the next date and
          the row tiles. Right: one row a month. Neither x-axis title shows the internal field any more (it read <b>“Date,
          __cell_x_end”</b>). Every case is in <b>Layout → Heatmaps</b>.</>}
        cause={<>A heatmap cell on a time axis spanned the finest common step in days (one day here), and only dates on the 1st
          of a month counted as monthly. The end field (<code>x2: __cell_x_end</code>) had no title, so Vega-Lite joined its name
          into the axis title.</>}
        fix={<>Each date stands for the period it repeats at, read from the values (<code>dateCadence</code> /
          {' '}<code>dateCells</code> in <code>core/decisions.ts</code>): its month, quarter or year whatever the day; an exact step
          (days, weeks, hours); or until the next date where the gaps keep about one step. A whole run of months is now a time scale
          too, not bands. <code>x2</code> takes the axis's title. Tested in <code>tests/heatmap-time-cells.test.ts</code>.</>}
      >
        <Figure caption="Temporal × Nominal (large, 80×5): dates 13 or 14 days apart">
          {irregularHeatmap ? <FlintView spec={irregularHeatmap as never} renderer="svg" /> : <p>Test case not found.</p>}
        </Figure>
        <Figure caption="Monthly heatmap: cells tile correctly">
          {monthlyHeatmap ? <FlintView spec={monthlyHeatmap as never} renderer="svg" /> : <p>Test case not found.</p>}
        </Figure>
      </Blocker>
    </section>
  );
}
