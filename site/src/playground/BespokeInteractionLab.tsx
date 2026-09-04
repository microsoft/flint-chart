import { FlintDimpVisStage } from './FlintDimpVisStage';
import { ClimatePhaseStage } from './ClimatePhaseStage';
import { FisheyeZoomStage } from './FisheyeZoomStage';
import { ExplodedDetailStage, FreeformExplodedDetailStage } from './ExplodedDetailStage';
import { RetailDrilldownStage } from './RetailDrilldownStage';
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
          </header>
          <ClimatePhaseStage />
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
          </header>
          <div className="bespoke-treatment-stack">
            <section className="bespoke-treatment">
              <FisheyeZoomStage />
            </section>
            <section className="bespoke-treatment">
              <ExplodedDetailStage />
            </section>
            <section className="bespoke-treatment">
              <FreeformExplodedDetailStage />
            </section>
          </div>
        </article>

        <article className="bespoke-case bespoke-case--single">
          <header className="bespoke-case-header">
            <div>
              <h2>Food basket price navigator</h2>
              <p>
                Explore how five U.S. average food prices compose a one-unit basket over time.
              </p>
              <div className="bespoke-pattern">
                <strong>Flint in → temporal window</strong>
              </div>
            </div>
          </header>
          <RetailDrilldownStage />
        </article>
      </div>
    </div>
  );
}
