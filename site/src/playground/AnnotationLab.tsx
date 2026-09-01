import { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import {
  assembleVegaLite,
} from 'flint-chart';
import {
  buildInteractiveChart,
  externalInteraction,
  type ChartUpdate,
  type ChartUpdateResult,
} from 'flint-chart/interactive';
import { expressionInterpreter } from 'vega-interpreter';
import { annotationCases, type InteractionCase } from './ClickFocusLab';
import { ThemePicker } from './ThemePicker';
import './click-focus-lab.css';
import './annotation-lab.css';

type StaticStatus = 'loading' | 'applied' | 'unsupported' | 'error';
type AnnotationFixture = {
  label: string;
  key: string;
  visual: { kind: 'mark' | 'path' | 'region'; role: string };
  text: string;
};

function fixtureSelector(
  input: InteractionCase['input'],
  fixture: AnnotationFixture,
): Record<string, unknown> {
  const spec = assembleVegaLite(input) as any;
  const fields = spec._interactionSemantics?.fields as string[] | undefined;
  const parts = fixture.key.replace(/\|__flint_path$/, '').split('|');
  const sourceRows = input.data.values as readonly Record<string, unknown>[];
  return Object.fromEntries((fields ?? []).slice(0, parts.length).map((field, index) => {
    const part = parts[index];
    const sourceValue = sourceRows.map((record) => record[field]).find((value) =>
      String(value) === part
      || value instanceof Date && String(value.getTime()) === part
      || typeof value === 'string' && String(Date.parse(value)) === part);
    const numeric = Number(part);
    return [field, sourceValue ?? (Number.isFinite(numeric) ? numeric : part)];
  }));
}

const ANNOTATION_FIXTURES: Record<string, readonly AnnotationFixture[]> = {
  'Area Chart': [
    { label: '1995–2000', key: '788918400000|1|__flint_path', visual: { kind: 'path', role: 'area' }, text: '1995–2000: 1% → 7%' },
    { label: '2010–2015', key: '1262304000000|29|__flint_path', visual: { kind: 'path', role: 'area' }, text: '2010–2015: 29% → 43%' },
    { label: '2020–2023', key: '1577836800000|60|__flint_path', visual: { kind: 'path', role: 'area' }, text: '2020–2023: 60% → 67%' },
  ],
  'Bar Chart': [
    { label: '1880s', key: '1880s|-0.17', visual: { kind: 'mark', role: 'mark' }, text: '1880s: -0.17 °C' },
    { label: '1960s', key: '1960s|-0.03', visual: { kind: 'mark', role: 'mark' }, text: '1960s: -0.03 °C' },
    { label: '2020s', key: '2020s|1.02', visual: { kind: 'mark', role: 'mark' }, text: '2020s: +1.02 °C' },
  ],
  'Bar Table': [
    { label: 'Brazil', key: 'Brazil', visual: { kind: 'mark', role: 'bar-table-row' }, text: 'Brazil: $2.2T GDP' },
    { label: 'India', key: 'India', visual: { kind: 'mark', role: 'bar-table-row' }, text: 'India: $3.9T GDP' },
    { label: 'United States', key: 'United States', visual: { kind: 'mark', role: 'bar-table-row' }, text: 'United States: $27.4T GDP' },
  ],
  'Bullet Chart': [
    { label: 'United States', key: 'United States|22.7|50', visual: { kind: 'mark', role: 'bullet-actual' }, text: 'United States: 22.7% vs 50% target' },
    { label: 'Germany', key: 'Germany|51.6|80', visual: { kind: 'mark', role: 'bullet-actual' }, text: 'Germany: 51.6% vs 80% target' },
    { label: 'Norway', key: 'Norway|98.6|100', visual: { kind: 'mark', role: 'bullet-actual' }, text: 'Norway: 98.6% vs 100% target' },
  ],
  'Calendar Heatmap': [
    { label: 'Jan 1', key: '1704067200000|Mon|1704067200000', visual: { kind: 'mark', role: 'calendar-day' }, text: 'Jan 1: 60 activities' },
    { label: 'Mar 1', key: '1708905600000|Fri|1709251200000', visual: { kind: 'mark', role: 'calendar-day' }, text: 'Mar 1: 68 activities' },
    { label: 'Apr 30', key: '1714348800000|Tue|1714435200000', visual: { kind: 'mark', role: 'calendar-day' }, text: 'Apr 30: 88 activities' },
  ],
  'Candlestick Chart': [
    { label: 'Jan 2', key: '1704153600000|187|188|183|185', visual: { kind: 'mark', role: 'candlestick' }, text: 'Jan 2: O 187, H 188, L 183, C 185' },
    { label: 'Jan 8', key: '1704672000000|182|186|182|185', visual: { kind: 'mark', role: 'candlestick' }, text: 'Jan 8: O 182, H 186, L 182, C 185' },
    { label: 'Jan 12', key: '1705017600000|186|188|185|185', visual: { kind: 'mark', role: 'candlestick' }, text: 'Jan 12: O 186, H 188, L 185, C 185' },
  ],
  Choropleth: [
    { label: 'Alaska', key: 'Alaska|0.73', visual: { kind: 'region', role: 'geographic-region' }, text: 'Alaska: 0.73' },
    { label: 'Illinois', key: 'Illinois|12.81', visual: { kind: 'region', role: 'geographic-region' }, text: 'Illinois: 12.81' },
    { label: 'Maine', key: 'Maine|1.36', visual: { kind: 'region', role: 'geographic-region' }, text: 'Maine: 1.36' },
  ],
  'Connected Scatter Plot': [
    { label: '1956 point', key: '3675|2.38|1956', visual: { kind: 'mark', role: 'symbol' }, text: '1956: 3,675 miles/person; gas $2.38' },
    { label: '1982–1983 path', key: '6835|2.92|1982|__flint_path', visual: { kind: 'path', role: 'line' }, text: '1982 → 1983: gas $2.92 → $2.66' },
    { label: '2005 point', key: '10067|2.53|2005', visual: { kind: 'mark', role: 'symbol' }, text: '2005: 10,067 miles/person; gas $2.53' },
  ],
  'Density Plot': [
    { label: 'Low duration', key: '1.9040000000000001|0.23092429172368195|__flint_path', visual: { kind: 'path', role: 'area' }, text: '1.904 min: density 0.231' },
    { label: 'Middle duration', key: '3.184|0.21760927780507272|__flint_path', visual: { kind: 'path', role: 'area' }, text: '3.184 min: density 0.218' },
    { label: 'High duration', key: '4.464|0.2959686144815777|__flint_path', visual: { kind: 'path', role: 'area' }, text: '4.464 min: density 0.296' },
  ],
  Heatmap: [
    { label: 'Singapore · Jan', key: 'Jan|Singapore', visual: { kind: 'mark', role: 'mark' }, text: 'Singapore · Jan: 26 °C' },
    { label: 'Seattle · Jun', key: 'Jun|Seattle', visual: { kind: 'mark', role: 'mark' }, text: 'Seattle · Jun: 16 °C' },
    { label: 'Seattle · Dec', key: 'Dec|Seattle', visual: { kind: 'mark', role: 'mark' }, text: 'Seattle · Dec: 4 °C' },
  ],
  'Pie Chart': [
    { label: 'Edge', key: 'Edge', visual: { kind: 'mark', role: 'slice' }, text: 'Edge: 12%' },
    { label: 'Other', key: 'Other', visual: { kind: 'mark', role: 'slice' }, text: 'Other: 5%' },
    { label: 'Chrome', key: 'Chrome', visual: { kind: 'mark', role: 'slice' }, text: 'Chrome: 65%' },
  ],
  'Ranged Dot Plot': [
    { label: 'Nigeria range', key: '51|Nigeria|Male|__flint_path', visual: { kind: 'path', role: 'line' }, text: 'Nigeria: Male 51, Female 54' },
    { label: 'Brazil range', key: '69|Brazil|Male|__flint_path', visual: { kind: 'path', role: 'line' }, text: 'Brazil: Male 69, Female 76' },
    { label: 'Japan range', key: '81.5|Japan|Male|__flint_path', visual: { kind: 'path', role: 'line' }, text: 'Japan: Male 81.5, Female 87.6' },
  ],
  'Scatter Plot': [
    { label: 'Ethiopia', key: '2000|66.2|Africa|109', visual: { kind: 'mark', role: 'point' }, text: 'Ethiopia: GDP/person 2,000; 66.2 years' },
    { label: 'China', key: '16800|76.7|Asia|1393', visual: { kind: 'mark', role: 'point' }, text: 'China: GDP/person 16,800; 76.7 years' },
    { label: 'Qatar', key: '116900|80.1|Asia|2.8', visual: { kind: 'mark', role: 'point' }, text: 'Qatar: GDP/person 116,900; 80.1 years' },
  ],
  'Slope Chart': [
    { label: 'Tablet 2019 point', key: '2019|69|Tablet', visual: { kind: 'mark', role: 'symbol' }, text: 'Tablet · 2019: 69 revenue' },
    { label: 'Phone path', key: '2019|56|Phone|__flint_path', visual: { kind: 'path', role: 'line' }, text: 'Phone: 56 → 42 revenue' },
    { label: 'Tablet 2024 point', key: '2024|35|Tablet', visual: { kind: 'mark', role: 'symbol' }, text: 'Tablet · 2024: 35 revenue' },
  ],
  'Violin Plot': [
    { label: 'Class A', key: 'Class A|__flint_path', visual: { kind: 'path', role: 'area' }, text: 'Class A density' },
    { label: 'Class B', key: 'Class B|__flint_path', visual: { kind: 'path', role: 'area' }, text: 'Class B density' },
    { label: 'Class D', key: 'Class D|__flint_path', visual: { kind: 'path', role: 'area' }, text: 'Class D density' },
  ],
  'Waterfall Chart': [
    { label: '1950 baseline', key: '1950', visual: { kind: 'mark', role: 'waterfall-step' }, text: '1950 baseline: 2,536M' },
    { label: 'Africa addition', key: 'Africa', visual: { kind: 'mark', role: 'waterfall-step' }, text: 'Africa: +1,134M' },
    { label: 'Oceania addition', key: 'Oceania', visual: { kind: 'mark', role: 'waterfall-step' }, text: 'Oceania: +32M' },
  ],
};

const coverage = [
  'mark', 'path', 'area', 'distribution', 'composite', 'polar', 'region',
];

function nextLayoutTurn(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

async function waitForStableChartLayout(container: HTMLElement): Promise<void> {
  let previous = container.getBoundingClientRect();
  let stableFrames = 0;
  for (let attempt = 0; attempt < 8 && stableFrames < 2; attempt += 1) {
    await nextLayoutTurn();
    const current = container.getBoundingClientRect();
    const stable = Math.abs(current.width - previous.width) < 0.5
      && Math.abs(current.height - previous.height) < 0.5;
    stableFrames = stable ? stableFrames + 1 : 0;
    previous = current;
  }
}

    function StaticAnnotationChart({
      item,
      fixture,
      themeId,
      resetVersion,
      onStatus,
    }: {
      item: InteractionCase;
      fixture: AnnotationFixture;
      themeId: string | undefined;
      resetVersion: number;
      onStatus: (status: StaticStatus, result?: ChartUpdateResult | Error) => void;
    }) {
      const containerRef = useRef<HTMLDivElement>(null);
      const statusRef = useRef(onStatus);
      statusRef.current = onStatus;

      useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        statusRef.current('loading');
        const themedInput = themeId ? { ...item.input, theme_spec: themeId } : item.input;
        const surface = buildInteractiveChart(container, themedInput, {
          backend: 'vegalite',
          renderer: 'svg',
          interactions: [externalInteraction<ChartUpdate>({
            id: 'static-annotation-policy',
            handle: (update) => update,
          })],
          expressionInterpreter,
          ariaLabel: item.input.chart_spec.title,
        });
        let active = true;
        void surface.ready.then(async () => {
          await waitForStableChartLayout(container);
          if (!active) return;
          const target = {
            select: {
              key: fixtureSelector(themedInput, fixture),
              visual: fixture.visual,
            },
          };
          const result = await surface.dispatch('static-annotation-policy', {
            id: `annotation-lab-${item.id}-${fixture.label}`,
            ops: [
              { op: 'set-annotation', target, value: { text: fixture.text } },
              {
                op: 'set-style',
                targets: [target],
                value: { state: 'emphasized', mutedOpacity: 0.25 },
              },
            ],
          });
          if (!active) return;
          statusRef.current(result?.status === 'applied' ? 'applied' : 'unsupported', result ?? undefined);
        }).catch((error) => {
          if (!active) return;
          statusRef.current('error', error instanceof Error ? error : new Error(String(error)));
        });
        return () => {
          active = false;
          surface.destroy();
        };
      }, [fixture, item, resetVersion, themeId]);

      return <div className="cf-mount" ref={containerRef} />;
    }

    function StaticAnnotationCard({
      item,
      fixture,
      themeId,
      resetVersion,
    }: {
      item: InteractionCase;
      fixture: AnnotationFixture;
      themeId: string | undefined;
      resetVersion: number;
    }) {
      const [status, setStatus] = useState<StaticStatus>('loading');
      const [detail, setDetail] = useState('Applying annotation update');
      return (
        <article className="cf-probe annotation-static-card">
          <header className="cf-probe-header">
            <div>
              <h2>{item.chartType}</h2>
              <p>{fixture.label} <span>{fixture.visual.role}</span></p>
            </div>
            <span className={`cf-status cf-status-${status === 'applied' ? 'ready' : status}`} title={detail}>
              {status === 'applied' ? 'Applied' : status}
            </span>
          </header>
          <div className="cf-stage annotation-static-stage">
            <StaticAnnotationChart
              item={item}
              fixture={fixture}
              themeId={themeId}
              resetVersion={resetVersion}
              onStatus={(nextStatus, result) => {
                setStatus(nextStatus);
                setDetail(result instanceof Error
                  ? result.message
                  : result ? `${result.status}: ${result.resolvedTargets} target` : 'Applying annotation update');
              }}
            />
          </div>
        </article>
      );
    }

    export function AnnotationLab() {
      const [themeId, setThemeId] = useState<string | undefined>();
      const [resetVersion, setResetVersion] = useState(0);
      const staticCases = annotationCases.flatMap((item) =>
        (ANNOTATION_FIXTURES[item.chartType] ?? []).map((fixture) => ({ item, fixture })));

      return (
        <div className="dev-page cf-page annotation-page">
          <header className="dev-page-heading cf-heading annotation-heading">
            <div className="annotation-title-row">
              <div>
                <h1>Annotation lab</h1>
                <p>Static charts with annotation update specs applied directly after render.</p>
              </div>
              <button type="button" className="annotation-reset" title="Reapply all annotation updates"
                onClick={() => setResetVersion((value) => value + 1)}>
                <RotateCcw size={15} aria-hidden="true" /> Reapply
              </button>
            </div>
            <div className="annotation-toolbar">
              <div className="annotation-coverage" aria-label="Annotation component coverage">
                {coverage.map((item) => <span key={item}>{item}</span>)}
              </div>
              <ThemePicker themeId={themeId} onTheme={setThemeId} />
            </div>
            <div className="cf-summary"><span><strong>{staticCases.length}</strong> exact-target cases · <strong>{annotationCases.length}</strong> chart types</span></div>
          </header>
          <div className="cf-grid annotation-grid">
            {staticCases.map(({ item, fixture }) => (
              <StaticAnnotationCard key={`${item.id}-${fixture.label}`} item={item} fixture={fixture}
                themeId={themeId} resetVersion={resetVersion} />
            ))}
          </div>
        </div>
      );
    }