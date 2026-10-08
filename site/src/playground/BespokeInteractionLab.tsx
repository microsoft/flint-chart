import { useState } from 'react';
import { Braces, ChevronRight } from 'lucide-react';
import { CodeBlock } from '../components/CodeBlock';
import { FlintDimpVisStage } from './FlintDimpVisStage';
import { ClimatePhaseStage } from './ClimatePhaseStage';
import { FisheyeZoomStage } from './FisheyeZoomStage';
import { FreeformExplodedDetailStage } from './ExplodedDetailStage';
import { IndexChartStage } from './IndexChartStage';
import { TimeboxStage } from './TimeboxStage';
import { YouDrawItStage } from './YouDrawItStage';
import { MapSemanticZoomStage } from './MapSemanticZoomStage';
import { ChinaSemanticZoomStage } from './ChinaSemanticZoomStage';
import { RetailDrilldownStage } from './RetailDrilldownStage';
import { MovingAverageStage } from './MovingAverageStage';
import { SiteShell } from '../components/SiteShell';
import mobility from '../data/county-mobility.json';
import trajectorySource from './FlintDimpVisStage.tsx?raw';
import climateSource from './ClimatePhaseStage.tsx?raw';
import fisheyeSource from './FisheyeZoomStage.tsx?raw';
import explodedSource from './ExplodedDetailStage.tsx?raw';
import indexSource from './IndexChartStage.tsx?raw';
import timeboxSource from './TimeboxStage.tsx?raw';
import drawSource from './YouDrawItStage.tsx?raw';
import mapSource from './MapSemanticZoomStage.tsx?raw';
import chinaSource from './ChinaSemanticZoomStage.tsx?raw';
import retailSource from './RetailDrilldownStage.tsx?raw';
import averageSource from './MovingAverageStage.tsx?raw';
import './bespoke-interaction-lab.css';

function BespokeCode({ title, source }: { title: string; source: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="bespoke-code" onToggle={event => setOpen(event.currentTarget.open)}>
      <summary aria-label={`View code: ${title}`}>
        <ChevronRight className="bespoke-code-chevron" size={14} aria-hidden="true" />
        <Braces size={15} aria-hidden="true" />
        <span>View code</span>
      </summary>
      {open && <CodeBlock language="typescript" variant="light" customStyle={{ margin: 0, borderRadius: 0, fontSize: 12, maxHeight: 420, overflow: 'auto' }}>{source}</CodeBlock>}
    </details>
  );
}

export function BespokeInteractionLab({ publicPage = false }: { publicPage?: boolean }) {
  const content = (
    <div className={publicPage ? 'bespoke-page bespoke-public-page' : 'dev-page bespoke-page'}>
      <header className={publicPage ? 'bespoke-heading' : 'dev-page-heading bespoke-heading'}>
        <h1>{publicPage ? 'Bespoke Interactions' : 'Advanced interaction prototypes'}</h1>
        <p>
          {publicPage
            ? 'Custom interactions built with Flint: direct manipulation, data-space gestures, and connected chart updates.'
            : 'Experiments in direct manipulation, data-space gestures, and interaction techniques that go beyond dashboard controls.'}
        </p>
      </header>

      <div className="bespoke-grid">
        <article className="bespoke-case bespoke-case--single">
          <header className="bespoke-case-header">
            <div>
              <h2>Data-space trajectory</h2>
              <p>
                Select a country, then drag its historical path to update the shared year.
                Fertility, life expectancy, and population for eight countries, 1955-2005.
              </p>
              <div className="bespoke-pattern">
                <strong>Flint in → Flint out</strong>
              </div>
            </div>
            <span className="bespoke-status">Case 01</span>
          </header>
          <FlintDimpVisStage large />
          <BespokeCode title="Data-space trajectory" source={trajectorySource} />
        </article>

        <article className="bespoke-case bespoke-case--single">
          <header className="bespoke-case-header">
            <div>
              <h2>Climate phase portrait</h2>
              <p>
                Select or drag a city’s annual climate loop; play animates the same update externally.
                {' '}<a href="https://power.larc.nasa.gov/docs/services/api/temporal/climatology/" target="_blank" rel="noreferrer">NASA POWER</a> monthly climatology, MERRA-2, 1991-2020.
              </p>
              <div className="bespoke-pattern">
                <strong>Flint in → Flint out</strong>
                <strong>Animation: external in → Flint out</strong>
              </div>
            </div>
            <span className="bespoke-status">Case 02</span>
          </header>
          <ClimatePhaseStage />
          <BespokeCode title="Climate phase portrait" source={climateSource} />
        </article>

        <article className="bespoke-case bespoke-case--single">
          <header className="bespoke-case-header">
            <div>
              <h2>Index chart with host-owned reference cursor</h2>
              <p>
                Re-index the same stock series against a movable date while the overlay owns pointer acquisition
                and the active reference marker. Sampled AAPL, AMZN, GOOG, IBM, and MSFT prices from the
                D3/Vega index-chart reference dataset, 2013-2017.
              </p>
              <div className="bespoke-pattern">
                <strong>Flint in → Flint out</strong>
                <strong>Host overlay → custom out</strong>
              </div>
            </div>
            <span className="bespoke-status">Case 03</span>
          </header>
          <IndexChartStage />
          <BespokeCode title="Index chart" source={indexSource} />
        </article>

        <article className="bespoke-case">
          <header className="bespoke-case-header">
            <div>
              <h2>Semantic acquisition vs render-layer detail</h2>
              <p>
                Compare a semantic lens with a cloned-SVG exploded detail.
                The semantic lens uses Palmer Penguins: flipper length and body mass for 33 specimens.
                Horst, Hill &amp; Gorman (2020). The exploded detail uses{' '}
                <a href="https://power.larc.nasa.gov/docs/services/api/temporal/climatology/" target="_blank" rel="noreferrer">NASA POWER</a> monthly climatology, MERRA-2, 1991-2020.
              </p>
              <div className="bespoke-pattern">
                <strong>Flint in → custom out</strong>
                <strong>Flint in → set-freeform-overlay</strong>
              </div>
            </div>
            <span className="bespoke-status">Case 04</span>
          </header>
          <div className="bespoke-treatment-stack">
            <section className="bespoke-treatment">
              <h3 className="bespoke-treatment-title">Semantic lens</h3>
              <FisheyeZoomStage />
              <BespokeCode title="Semantic lens" source={fisheyeSource} />
            </section>
            <section className="bespoke-treatment">
              <h3 className="bespoke-treatment-title">Exploded detail</h3>
              <FreeformExplodedDetailStage />
              <BespokeCode title="Exploded detail" source={explodedSource} />
            </section>
          </div>
        </article>

        <article className="bespoke-case bespoke-case--single">
          <header className="bespoke-case-header">
            <div>
              <h2>Food basket price navigator</h2>
              <p>
                Explore how five U.S. average food prices compose a one-unit basket over time. The wheel
                narrows the month window, and Flint re-lays out the chart for the visible months, so the
                bar step, the price domain, and the tick labels all follow the data.
                U.S. Bureau of Labor Statistics average price data for bananas, eggs, ground beef, white bread, and whole milk.
              </p>
              <div className="bespoke-pattern">
                <strong>DOM wheel → filtered rows</strong>
                <strong>Semantic zoom by re-layout</strong>
              </div>
            </div>
            <span className="bespoke-status">Case 05</span>
          </header>
          <RetailDrilldownStage />
          <BespokeCode title="Food basket price navigator" source={retailSource} />
        </article>

        <article className="bespoke-case bespoke-case--single">
          <header className="bespoke-case-header">
            <div>
              <h2>Timebox on daily city temperatures</h2>
              <p>
                Drag a box over a date interval and temperature band; cities match only when every daily
                value in that interval stays within the band. The retained box can be moved
                and resized. 12 cities in 2023, all 365 daily values per city;
                the constraint uses the same values as the visible lines.
                {' '}<a href="https://power.larc.nasa.gov/docs/services/api/temporal/daily/" target="_blank" rel="noreferrer">NASA POWER</a>
                {' '}/ MERRA-2 gridded reanalysis at city coordinates, in Celsius and local solar time;
                not station observations or all-day temperature bounds.
              </p>
              <div className="bespoke-pattern">
                <strong>Flint in → Flint out</strong>
                <strong>Host overlay + region drag → set-style</strong>
              </div>
            </div>
            <span className="bespoke-status">Case 06</span>
          </header>
          <TimeboxStage />
          <BespokeCode title="Timebox" source={timeboxSource} />
        </article>

        <article className="bespoke-case bespoke-case--single">
          <header className="bespoke-case-header">
            <div>
              <h2>Semantic zoom: states to counties</h2>
              <p>
                Zoom the US map; once the view narrows enough, the state choropleth becomes a county
                choropleth at the same place.
                Both levels live in one chart, so the swap is a layer flip, not a rebuild. Click a state
                to fly into it: the viewport fits the state's shape over a transition and lands on counties.
                {' '}{mobility.measure} {mobility.source}
              </p>
              <div className="bespoke-pattern">
                <strong>Flint in → Flint out</strong>
                <strong>Level swap: Flint in → Flint out</strong>
              </div>
            </div>
            <span className="bespoke-status">Case 07</span>
          </header>
          <MapSemanticZoomStage />
          <BespokeCode title="States to counties" source={mapSource} />
        </article>

        <article className="bespoke-case bespoke-case--single">
          <header className="bespoke-case-header">
            <div>
              <h2>Where China&apos;s population is aging</h2>
              <p>
                Zoom from provinces to prefectures and county units. Population totals and population-weighted
                shares aged 65+ come from the <a href="https://github.com/leiii/census" target="_blank" rel="noreferrer">2020 census compilation by Lei Dong and colleagues</a>:
                {' '}30 provinces, 343 prefectural units, and 2,668 county units. Aggregates cover included
                counties, not full-region totals; age-data coverage is reported in tooltips.
                Base map: DataV.GeoAtlas province boundaries (100000_full), Alibaba Cloud.
              </p>
              <div className="bespoke-pattern">
                <strong>Flint in → Flint out</strong>
                <strong>Level swap: Flint in → Flint out</strong>
              </div>
            </div>
            <span className="bespoke-status">Case 08</span>
          </header>
          <ChinaSemanticZoomStage />
          <BespokeCode title="China census semantic zoom" source={chinaSource} />
        </article>

        <article className="bespoke-case bespoke-case--single">
          <header className="bespoke-case-header">
            <div>
              <h2>You draw it</h2>
              <p>
                Draw the future part of a line chart with a freehand stroke; once every year is filled, the
                chart reveals the real series and scores the guess. Double-click to start over.
                Approximate annual U.S. coal electricity-generation shares from EIA Electric Power Monthly,
                2000-2024, rounded to one decimal.
              </p>
              <div className="bespoke-pattern">
                <strong>Flint in → Flint out</strong>
                <strong>Reveal: external in → Flint out</strong>
              </div>
            </div>
            <span className="bespoke-status">Case 09</span>
          </header>
          <YouDrawItStage />
          <BespokeCode title="You draw it" source={drawSource} />
        </article>

        <article className="bespoke-case bespoke-case--single">
          <header className="bespoke-case-header">
            <div>
              <h2>A moving average line</h2>
              <p>
                Drag across months and a reference line moves to their mean; move or resize the brush and the
                line follows every frame. One definition returns the emphasis and the line together.
                Average retail price of a dozen eggs, U.S. city average, from
                {' '}<a href="https://www.bls.gov/cpi/data.htm" target="_blank" rel="noreferrer">BLS average price data</a>.
              </p>
              <div className="bespoke-pattern">
                <strong>Flint in → Flint out</strong>
                <strong>Stateful brush → set-style + set-overlay</strong>
              </div>
            </div>
            <span className="bespoke-status">Case 10</span>
          </header>
          <MovingAverageStage />
          <BespokeCode title="A moving average line" source={averageSource} />
        </article>
      </div>
    </div>
  );
  return publicPage
    ? <SiteShell><main className="bespoke-public-scroll">{content}</main></SiteShell>
    : content;
}
