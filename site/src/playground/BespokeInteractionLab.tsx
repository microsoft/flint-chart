import { FlintDimpVisStage } from './FlintDimpVisStage';
import { FlintTimeboxStage } from './FlintTimeboxStage';
import { ClimatePhaseStage } from './ClimatePhaseStage';
import { FisheyeZoomStage } from './FisheyeZoomStage';
import { ExplodedDetailStage } from './ExplodedDetailStage';
import { FisheyeExcentricStage } from './FisheyeExcentricStage';
import { MapSemanticZoomStage } from './MapSemanticZoomStage';
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
              <h2>Discrete line-chart timebox</h2>
              <p>
                Drag out a time window with value bounds; only series whose sampled points stay inside survive.
              </p>
              <div className="bespoke-pattern">
                <strong>Host drag / mark drag → Flint out</strong>
                <strong>Retained box + set-data</strong>
              </div>
            </div>
            <span className="bespoke-status">Case 02</span>
          </header>
          <FlintTimeboxStage large />
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
            <span className="bespoke-status">Case 03</span>
          </header>
          <ClimatePhaseStage />
        </article>

        <article className="bespoke-case">
          <header className="bespoke-case-header">
            <div>
              <h2>Map semantic zoom</h2>
              <p>
                Geometric viewport zoom continues inside a layer; crossing thresholds swaps province
                centroids for city points with `set-data`.
              </p>
              <div className="bespoke-pattern">
                <strong>Map template reuse</strong>
                <strong>Viewport zoom → semantic data swap</strong>
              </div>
            </div>
            <span className="bespoke-status">Case 04</span>
          </header>
          <MapSemanticZoomStage />
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
            <span className="bespoke-status">Case 05</span>
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
              <h2>Lens + excentric labeling</h2>
              <p>
                Flint draws the scatterplot and semantic hover hit; an SVG overlay renders the lens,
                then lays out top-k labels outside the lens without distorting the underlying points.
              </p>
              <div className="bespoke-pattern">
                <strong>Flint in → custom out</strong>
                <strong>Semantic hover → overlay labels</strong>
              </div>
            </div>
            <span className="bespoke-status">Case 06</span>
          </header>
          <FisheyeExcentricStage />
        </article>
      </div>
    </div>
  );
}
