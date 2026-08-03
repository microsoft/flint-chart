import { useEffect, useMemo, useState } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import { FlintAppInner } from '../../../packages/flint-mcp/ui/src/FlintApp';
import { siteTheme } from '../shared/theme';

type Example = {
  id: string;
  title: string;
  note: string;
  input: ChartAssemblyInput;
};

// Every fixture carries a headline and a deck, because every real call does.
// They are also the part of a chart a house has most to say about — the type
// scale is set on them and the Economist hangs its masthead tab off them — so
// a titleless fixture makes the theme switch look like it does almost nothing.
// Sizes are left unstated for the same reason: a stated size outranks the
// house's own footprint, and the widget's sizing is one of the things this
// page exists to exercise.
const lineInput: ChartAssemblyInput = {
  data: {
    values: [
      { month: '2026-02', area: 'site', commits: 12 },
      { month: '2026-03', area: 'site', commits: 9 },
      { month: '2026-04', area: 'site', commits: 13 },
      { month: '2026-05', area: 'site', commits: 16 },
      { month: '2026-06', area: 'site', commits: 54 },
      { month: '2026-02', area: 'flint-js', commits: 20 },
      { month: '2026-03', area: 'flint-js', commits: 11 },
      { month: '2026-04', area: 'flint-js', commits: 8 },
      { month: '2026-05', area: 'flint-js', commits: 10 },
      { month: '2026-06', area: 'flint-js', commits: 28 },
    ],
  },
  semantic_types: {
    month: 'YearMonth',
    area: 'Category',
    commits: 'Count',
  },
  chart_spec: {
    chartType: 'Line Chart',
    encodings: {
      x: { field: 'month' },
      y: { field: 'commits' },
      color: { field: 'area' },
    },
    title: 'Where the commits went',
    subtitle: 'Commits per month, 2026',
    chartProperties: {
      interpolate: 'monotone',
      showPoints: true,
    },
  },
  options: { addTooltips: true },
  field_display_names: {
    month: 'Month',
    area: 'Area',
    commits: 'Commits',
  },
};

const scatterInput: ChartAssemblyInput = {
  data: {
    values: [
      { weight: 1.6, mpg: 32, origin: 'JP' },
      { weight: 2.1, mpg: 27, origin: 'US' },
      { weight: 1.9, mpg: 29, origin: 'EU' },
      { weight: 2.8, mpg: 21, origin: 'US' },
      { weight: 1.4, mpg: 38, origin: 'JP' },
      { weight: 2.4, mpg: 24, origin: 'EU' },
      { weight: 3.1, mpg: 18, origin: 'US' },
      { weight: 1.7, mpg: 34, origin: 'JP' },
      { weight: 2.2, mpg: 26, origin: 'EU' },
    ],
  },
  semantic_types: { weight: 'Quantity', mpg: 'Quantity', origin: 'Category' },
  chart_spec: {
    chartType: 'Scatter Plot',
    encodings: {
      x: { field: 'weight' },
      y: { field: 'mpg' },
      color: { field: 'origin' },
    },
    title: 'Heavier cars, thirstier engines',
    subtitle: 'Miles per gallon against kerb weight, tonnes',
    chartProperties: { opacity: 0.8 },
  },
  options: { addTooltips: true },
  field_display_names: { weight: 'Weight', mpg: 'MPG', origin: 'Origin' },
};

const areaInput: ChartAssemblyInput = {
  data: {
    values: [
      { month: '2026-01', stage: 'design', hours: 18 },
      { month: '2026-02', stage: 'design', hours: 22 },
      { month: '2026-03', stage: 'design', hours: 14 },
      { month: '2026-04', stage: 'design', hours: 9 },
      { month: '2026-01', stage: 'build', hours: 30 },
      { month: '2026-02', stage: 'build', hours: 41 },
      { month: '2026-03', stage: 'build', hours: 52 },
      { month: '2026-04', stage: 'build', hours: 48 },
    ],
  },
  semantic_types: { month: 'YearMonth', stage: 'Category', hours: 'Quantity' },
  chart_spec: {
    chartType: 'Area Chart',
    encodings: {
      x: { field: 'month' },
      y: { field: 'hours' },
      color: { field: 'stage' },
    },
    title: 'Build overtakes design',
    subtitle: 'Hours logged by stage, 2026',
    chartProperties: { interpolate: 'monotone' },
  },
  options: { addTooltips: true },
  field_display_names: { month: 'Month', stage: 'Stage', hours: 'Hours' },
};

const barInput: ChartAssemblyInput = {
  data: {
    values: [
      { team: 'Falcons', wins: 14 },
      { team: 'Otters', wins: 9 },
      { team: 'Bears', wins: 21 },
      { team: 'Wolves', wins: 6 },
      { team: 'Hawks', wins: 17 },
    ],
  },
  semantic_types: { team: 'Category', wins: 'Count' },
  chart_spec: {
    chartType: 'Bar Chart',
    encodings: {
      x: { field: 'team' },
      y: { field: 'wins' },
    },
    title: 'The Bears run away with it',
    subtitle: 'Wins, regular season',
    chartProperties: { cornerRadius: 3 },
  },
  options: { addTooltips: true },
  field_display_names: { team: 'Team', wins: 'Wins' },
};

const sparklineInput: ChartAssemblyInput = {
  data: {
    values: (() => {
      const services = ['auth', 'search', 'cache', 'api', 'cdn', 'queue', 'db', 'cron'];
      const rows: { day: number; service: string; latency: number }[] = [];
      for (const s of services) {
        const base = 20 + ((s.length * 13) % 110);
        for (let day = 1; day <= 14; day += 1) {
          rows.push({
            day,
            service: s,
            latency: Math.round(base + 18 * Math.sin(day / 2 + s.length) + (day % 3) * 4),
          });
        }
      }
      return rows;
    })(),
  },
  semantic_types: { day: 'Quantity', service: 'Category', latency: 'Quantity' },
  chart_spec: {
    chartType: 'Sparkline',
    encodings: {
      x: { field: 'day' },
      y: { field: 'latency' },
      color: { field: 'service' },
    },
    title: 'Latency, service by service',
    subtitle: 'Median response in ms, last 14 days',
    chartProperties: { interpolate: 'monotone' },
    // Sparklines want a wide, short canvas: long traces packed into short rows.
    // The only fixture that states a size, so the app's other sizing branch —
    // caller said, so nobody else gets a say — stays covered here too.
    baseSize: { width: 720, height: 360 },
    canvasSize: { width: 720, height: 360 },
  },
  options: { addTooltips: true },
  field_display_names: { day: 'Day', service: 'Service', latency: 'Latency (ms)' },
};

const examples: Example[] = [
  { id: 'line', title: 'Line Chart', note: 'pivot · dropdown · toggle', input: lineInput },
  { id: 'scatter', title: 'Scatter Plot', note: 'opacity slider · regression dropdown', input: scatterInput },
  { id: 'area', title: 'Area Chart', note: 'curve · stack', input: areaInput },
  { id: 'bar', title: 'Bar Chart', note: 'corners slider · sort', input: barInput },
  { id: 'sparkline', title: 'Sparkline', note: 'curve · shared Y · packed rows', input: sparklineInput },
];

const mockApp = {
  sendMessage: async () => undefined,
};

const frameWidths = [560, 680, 820, 940] as const;

function ExampleCard(props: { example: Example; frameWidth: number }) {
  const { example, frameWidth } = props;
  const [copied, setCopied] = useState(false);
  const app = useMemo(
    () => ({
      ...mockApp,
      sendMessage: async () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      },
    }),
    [],
  );

  return (
    <div style={{ ...cardStyle, width: frameWidth }}>
      <div style={cardHeaderStyle}>
        <span style={cardTitleStyle}>{example.title}</span>
        <span style={cardNoteStyle}>{copied ? 'Copied spec' : example.note}</span>
      </div>
      <div style={{ ...frameStyle, width: frameWidth }}>
        <FlintAppInner app={app as never} input={example.input} />
      </div>
    </div>
  );
}

export function McpAppMockup() {
  const [frameWidth, setFrameWidth] = useState<(typeof frameWidths)[number]>(680);

  useEffect(() => {
    void import('../../../packages/flint-mcp/ui/src/styles.css');
  }, []);

  return (
    <section style={{ ...sectionStyle, width: frameWidth + 38 }}>
      <div style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>MCP app mockup</div>
          <h2 style={titleStyle}>Compact chart controls</h2>
        </div>
        <div style={headerControlsStyle}>
          <div style={sizeControlStyle} aria-label="Mockup width">
            {frameWidths.map((width) => (
              <button
                key={width}
                type="button"
                style={width === frameWidth ? activeSizeButtonStyle : sizeButtonStyle}
                onClick={() => setFrameWidth(width)}
              >
                {width}
              </button>
            ))}
          </div>
          <span style={statusStyle}>Live source CSS</span>
        </div>
      </div>
      <div style={cardsStyle}>
        {examples.map((example) => (
          <ExampleCard key={example.id} example={example} frameWidth={frameWidth} />
        ))}
      </div>
    </section>
  );
}

const sectionStyle: React.CSSProperties = {
  maxWidth: 'calc(100vw - 48px)',
  boxSizing: 'border-box',
  padding: 18,
  border: `1px solid ${siteTheme.border}`,
  background: '#ffffff',
};

const cardsStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
};

const cardStyle: React.CSSProperties = {
  maxWidth: '100%',
};

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 12,
  marginBottom: 6,
};

const cardTitleStyle: React.CSSProperties = {
  color: siteTheme.text,
  fontFamily: siteTheme.fontSans,
  fontSize: 14,
  fontWeight: 500,
};

const cardNoteStyle: React.CSSProperties = {
  color: siteTheme.textMuted,
  fontSize: 12,
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'space-between',
  gap: 16,
  marginBottom: 12,
};

const headerControlsStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
};

const sizeControlStyle: React.CSSProperties = {
  display: 'inline-flex',
  padding: 2,
  border: `1px solid ${siteTheme.border}`,
  borderRadius: 5,
  background: '#ffffff',
};

const sizeButtonStyle: React.CSSProperties = {
  border: 0,
  borderRadius: 3,
  padding: '3px 7px',
  background: 'transparent',
  color: siteTheme.textMuted,
  font: `12px ${siteTheme.fontSans}`,
  cursor: 'pointer',
};

const activeSizeButtonStyle: React.CSSProperties = {
  ...sizeButtonStyle,
  background: siteTheme.text,
  color: '#ffffff',
};

const eyebrowStyle: React.CSSProperties = {
  marginBottom: 4,
  color: siteTheme.textMuted,
  fontSize: 12,
  letterSpacing: 0,
  textTransform: 'uppercase',
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  color: siteTheme.text,
  fontFamily: siteTheme.fontSans,
  fontSize: 24,
  fontWeight: 500,
  letterSpacing: 0,
};

const statusStyle: React.CSSProperties = {
  color: siteTheme.textMuted,
  fontSize: 12,
};

const frameStyle: React.CSSProperties = {
  background: '#ffffff',
  overflow: 'hidden',
  maxWidth: '100%',
};