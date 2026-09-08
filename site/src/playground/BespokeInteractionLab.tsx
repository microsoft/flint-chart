import { FlintDimpVisStage } from './FlintDimpVisStage';
import { ClimatePhaseStage } from './ClimatePhaseStage';
import { FisheyeZoomStage } from './FisheyeZoomStage';
import { ExplodedDetailStage } from './ExplodedDetailStage';
import { IndexChartStage } from './IndexChartStage';
import { YouDrawItStage } from './YouDrawItStage';
import { MapSemanticZoomStage } from './MapSemanticZoomStage';
import { ChinaSemanticZoomStage } from './ChinaSemanticZoomStage';
import './bespoke-interaction-lab.css';

export function BespokeInteractionLab() {
  return (
    <div className="dev-page bespoke-page">
      <header className="dev-page-heading bespoke-heading">
        <h1>Advanced interaction prototypes</h1>
        <p>
          Experiments in direct manipulation, data-space gestures, and interaction techniques
          that go beyond dashboard controls.
        </p>
      </header>

      <div className="bespoke-grid">
        <article className="bespoke-case bespoke-case--single">
          <header className="bespoke-case-header">
            <div>
              <h2>Data-space trajectory</h2>
              <p>
                Select a country, then drag its historical path to update the shared year.
              </p>
              <div className="bespoke-pattern">
                <strong>Flint in → Flint out</strong>
              </div>
            </div>
            <span className="bespoke-status">Case 01</span>
          </header>
          <FlintDimpVisStage large />
        </article>

        <article className="bespoke-case bespoke-case--single">
          <header className="bespoke-case-header">
            <div>
              <h2>Climate phase portrait</h2>
              <p>
                Select or drag a city’s annual climate loop; play animates the same update externally.
              </p>
              <div className="bespoke-pattern">
                <strong>Flint in → Flint out</strong>
                <strong>Animation: external in → Flint out</strong>
              </div>
            </div>
            <span className="bespoke-status">Case 02</span>
          </header>
          <ClimatePhaseStage />
        </article>

        <article className="bespoke-case bespoke-case--single">
          <header className="bespoke-case-header">
            <div>
              <h2>Index chart with host-owned reference cursor</h2>
              <p>
                Re-index the same stock series against a movable date while the overlay owns pointer acquisition
                and the active reference marker.
              </p>
              <div className="bespoke-pattern">
                <strong>Flint in → Flint out</strong>
                <strong>Host overlay → custom out</strong>
              </div>
            </div>
            <span className="bespoke-status">Case 03</span>
          </header>
          <IndexChartStage />
        </article>

        <article className="bespoke-case">
          <header className="bespoke-case-header">
            <div>
              <h2>Semantic acquisition vs render-layer detail</h2>
              <p>
                Compare a semantic lens with a cloned-SVG exploded detail.
              </p>
              <div className="bespoke-pattern">
                <strong>Flint in → custom out</strong>
                <strong>Rendered SVG → custom out</strong>
              </div>
            </div>
            <span className="bespoke-status">Case 04</span>
          </header>
          <div className="bespoke-treatment-stack">
            <section className="bespoke-treatment">
              <FisheyeZoomStage />
            </section>
            <section className="bespoke-treatment">
              <ExplodedDetailStage />
            </section>
          </div>
        </article>

        <article className="bespoke-case bespoke-case--single">
          <header className="bespoke-case-header">
            <div>
              <h2>You draw it</h2>
              <p>
                Draw the future part of a line chart with a freehand stroke; the chart reveals the real
                series and scores the guess.
              </p>
              <div className="bespoke-pattern">
                <strong>Flint in → Flint out</strong>
                <strong>Reveal: external in → Flint out</strong>
              </div>
            </div>
            <span className="bespoke-status">Case 05</span>
          </header>
          <YouDrawItStage />
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
              </p>
              <div className="bespoke-pattern">
                <strong>Flint in → Flint out</strong>
                <strong>Level swap: Flint in → Flint out</strong>
              </div>
            </div>
            <span className="bespoke-status">Case 06</span>
          </header>
          <MapSemanticZoomStage />
        </article>

        <article className="bespoke-case bespoke-case--single">
          <header className="bespoke-case-header">
            <div>
              <h2>Semantic zoom: provinces to cities</h2>
              <p>
                The China bubble map from the dimpvis candidates, rebuilt on Flint&apos;s projection
                navigation: province centroids give way to city points as the zoom narrows, in one chart,
                with the province under the centre read from the base map.
              </p>
              <div className="bespoke-pattern">
                <strong>Flint in → Flint out</strong>
                <strong>Level swap: Flint in → Flint out</strong>
              </div>
            </div>
            <span className="bespoke-status">Case 07</span>
          </header>
          <ChinaSemanticZoomStage />
        </article>
      </div>
    </div>
  );
}
