import { FlintDimpVisStage } from './FlintDimpVisStage';
import { ClimatePhaseStage } from './ClimatePhaseStage';
import { FisheyeZoomStage } from './FisheyeZoomStage';
import { ExplodedDetailStage } from './ExplodedDetailStage';
import { IndexChartStage } from './IndexChartStage';
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

      </div>
    </div>
  );
}
