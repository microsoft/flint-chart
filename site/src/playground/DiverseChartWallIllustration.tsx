import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { BACKENDS } from '../shared/supported-backends';
import { PREVIEW_CASES, type PreviewCase } from '../shared/preview-cases';
import { ScaleToFit } from '../components/ScaleToFit';
import { VegaLiteView } from '../components/VegaLiteView';

type IllustrationSlot = {
  id: string;
  theme?: string;
  attribution: string;
};

// Hand-tune the gap before rows 1, 2, and 3 without resizing charts.
const ROW_GAPS = [0, -32, -60] as const;

const SLOTS: IllustrationSlot[] = [
  { id: 'keeling', attribution: 'NOAA · atmospheric CO₂' },
  { id: 'driving', theme: 'economist', attribution: 'NYT / FHWA · driving' },
  { id: 'seattle-range', theme: 'swiss', attribution: 'NOAA · temperature range' },
  { id: 'temp-heatmap', theme: 'pop', attribution: 'Climate normals · temperature' },
  { id: 'browser-pie', theme: 'nature', attribution: 'StatCounter · browsers' },
  { id: 'co2-lollipop', theme: 'nyt', attribution: 'Global Carbon Project · emissions' },
  { id: 'life-expectancy', theme: 'datawrapper', attribution: 'World Bank · life expectancy' },
  { id: 'lifeexp-dumbbell', theme: 'mckinsey', attribution: 'World Bank · life expectancy' },
  { id: 'electricity-mix-area', theme: 'powerbi-light', attribution: 'IEA / Ember · electricity' },
  { id: 'big-mac', theme: 'cartoon', attribution: 'The Economist · Big Mac index' },
  { id: 'olympic-bump', theme: 'powerbi', attribution: 'IOC · Olympic medals' },
  { id: 'nutrition-radar', theme: 'swiss', attribution: 'USDA · nutrition' },
  { id: 'faithful-hist', theme: 'nature', attribution: 'R datasets · eruptions' },
  { id: 'trust-likert', theme: 'pop', attribution: 'Pew / Gallup · trust' },
  { id: 'population-waterfall', theme: 'nyt', attribution: 'UN · population change' },
  { id: 'us-pyramid', theme: 'datawrapper', attribution: 'US Census · population' },
  { id: 'gapminder-bubble', theme: 'mckinsey', attribution: 'Gapminder · health and wealth' },
  { id: 'earnings-education', theme: 'cartoon', attribution: 'US BLS · earnings' },
  { id: 'penguins', theme: 'powerbi-light', attribution: 'Palmer LTER · penguins' },
  { id: 'population', theme: 'economist', attribution: 'UN / World Bank · population' },
  { id: 'faithful-density', theme: 'swiss', attribution: 'R datasets · eruptions' },
  { id: 'medals-grouped', theme: 'pop', attribution: 'IOC · Paris 2024 medals' },
  { id: 'electricity-stacked', theme: 'nature', attribution: 'Ember · electricity mix' },
  { id: 'mobile-donut', theme: 'nyt', attribution: 'StatCounter · mobile OS' },
];

const CASE_BY_ID = new Map(PREVIEW_CASES.map((previewCase) => [previewCase.id, previewCase]));

function buildInput(previewCase: PreviewCase, title: string, theme?: string) {
  return {
    data: { values: previewCase.data },
    semantic_types: previewCase.semantic_types,
    chart_spec: {
      chartType: previewCase.chartType,
      encodings: previewCase.encodings,
      baseSize: { width: 300, height: 200 },
      title,
      ...(previewCase.chartProperties ? { chartProperties: previewCase.chartProperties } : {}),
    },
    ...(theme ? { theme_spec: theme } : {}),
  } as any;
}

function IllustrationCard({ slot }: { slot: IllustrationSlot }) {
  const { t } = useTranslation();
  const previewCase = CASE_BY_ID.get(slot.id);
  const title = previewCase ? t(`themes.cases.${previewCase.id}.title`, previewCase.title) : slot.id;
  const result = useMemo(() => {
    if (!previewCase) return { ok: false as const, error: `Missing preview case: ${slot.id}` };
    try {
      return {
        ok: true as const,
        compiled: BACKENDS.vegalite.assemble(buildInput(previewCase, title, slot.theme)),
      };
    } catch (error) {
      return { ok: false as const, error: String((error as Error)?.message ?? error) };
    }
  }, [previewCase, slot, title]);

  return (
    <article className="diverse-wall-card">
      <ScaleToFit height={170} minHeight={96} adaptiveHeight padding={1}>
        {result.ok
          ? <VegaLiteView spec={result.compiled} />
          : <div className="diverse-wall-error">{result.error}</div>}
      </ScaleToFit>
      <div className="diverse-wall-caption">
        <div className="diverse-wall-description">{slot.attribution}</div>
      </div>
    </article>
  );
}

export function DiverseChartWallIllustration() {
  return (
    <section className="diverse-wall-figure" aria-label="Flint Vega-Lite charts across themes">
      <style>{styles}</style>
      <div className="diverse-wall">
        {[0, 1, 2].map((row) => (
          <div
            className="diverse-wall-row"
            key={row}
            style={{ marginTop: ROW_GAPS[row] }}
          >
            {SLOTS.slice(row * 8, row * 8 + 8).map((slot) => (
              <IllustrationCard key={slot.id} slot={slot} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

const styles = `
  .diverse-wall-figure {
    box-sizing: border-box;
    width: 100%;
    padding: 20px 20px 26px;
    overflow: hidden;
    background-color: #fafafa;
    background-image:
      linear-gradient(90deg, rgba(0, 0, 0, 0.025) 1px, transparent 1px),
      linear-gradient(0deg, rgba(0, 0, 0, 0.025) 1px, transparent 1px);
    background-size: 24px 24px;
  }
  .diverse-wall {
    width: 100%;
    margin: 0 auto;
    padding: 10px 8px 20px;
  }
  .diverse-wall-row {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    align-items: center;
  }
  .diverse-wall-card {
    --x: 0px;
    --y: 0px;
    --r: 0deg;
    position: relative;
    z-index: 1;
    min-width: 0;
    margin: -4px -5px;
    padding: 7px 7px 8px;
    border: 1px solid rgba(0, 0, 0, 0.13);
    background: #fff;
    box-shadow: 0 4px 11px rgba(31, 35, 40, 0.17), 0 16px 30px rgba(31, 35, 40, 0.08);
    transform: translate3d(var(--x), var(--y), 0) rotate(var(--r));
    transform-origin: center;
  }
  .diverse-wall-card:nth-child(8n + 1) { --x: 8px;  --y: 4px;  --r: -2.4deg; }
  .diverse-wall-card:nth-child(8n + 2) { --x: -6px; --y: -8px; --r: 1.7deg; }
  .diverse-wall-card:nth-child(8n + 3) { --x: 4px;  --y: 10px; --r: -1.1deg; }
  .diverse-wall-card:nth-child(8n + 4) { --x: -7px; --y: 0px;  --r: 2.5deg; }
  .diverse-wall-card:nth-child(8n + 5) { --x: 6px;  --y: -6px; --r: -1.8deg; }
  .diverse-wall-card:nth-child(8n + 6) { --x: -5px; --y: 8px;  --r: 1.2deg; }
  .diverse-wall-card:nth-child(8n + 7) { --x: 7px;  --y: 1px;  --r: -2deg; }
  .diverse-wall-card:nth-child(8n)     { --x: -7px; --y: -4px; --r: 1.5deg; }
  .diverse-wall-card:nth-child(8n + 3) { --r: 3deg; }
  .diverse-wall-card:nth-child(11n + 1) { --y: -11px; }
  .diverse-wall-caption {
    height: 14px;
    margin-top: 2px;
    padding: 0 2px;
    overflow: hidden;
  }
  .diverse-wall-description {
    overflow: hidden;
    color: rgba(31, 35, 40, 0.62);
    font: 400 9.5px/14px 'Inter Variable', sans-serif;
    letter-spacing: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .diverse-wall-error {
    width: 300px;
    color: #b42318;
    font: 11px/1.4 ui-monospace, monospace;
    white-space: pre-wrap;
  }
  @media (max-width: 1100px) {
    .diverse-wall-row { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  }
`;