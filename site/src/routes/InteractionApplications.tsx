import { ArticleSection, SelectionChatDemo } from '../playground/InteractiveDataReportLab';
import { MapSemanticZoomStage } from '../playground/MapSemanticZoomStage';
import { ELECTION_DATASET } from '../playground/election-semantic-zoom-input';
import { WorldCupScorersDemo } from '../playground/WorldCupScorersDemo';
import { PisaDrawStage } from '../playground/PisaDrawStage';
import { TIME_USE, SELECTION_CHAT } from '../playground/interactive-data-report-content';
import { BespokeFrame } from '../playground/release-examples/application-demos-extensions';
import { DemoChartFitContext, type DemoChartFit } from '../playground/InteractionDemoChart';
import { ConnectedModelsDemo } from '../playground/release-examples/application-demos-connected';
import { SetWindowDemo } from '../playground/release-examples/application-demos-inbound';
import { SiteShell } from '../components/SiteShell';
import '../playground/interaction-transport.css';
import '../playground/bespoke-interaction-lab.css';
import '../playground/release-examples/application-demos.css';
import './interaction-applications.css';

type Source = { label: string; url: string };

const PISA_INK = { Science: '#5b8fd6', Mathematics: '#f2a89b', Reading: '#e3120b' } as const;

/** Charts on this page sit in an 832px reading column, so they render a little under their designed size. */
const CHART_FIT: DemoChartFit = { height: 420, minHeight: 240, maxScale: 0.85 };

function Credit({ source }: { source: Source }) {
  return <p className="ia-source">Source: <a href={source.url} target="_blank" rel="noreferrer">{source.label}</a>.</p>;
}

export function InteractionApplications() {
  return (
    <SiteShell>
      <DemoChartFitContext.Provider value={CHART_FIT}>
      <main className="bespoke-public-scroll">
        <div className="bespoke-page bespoke-public-page ia-page">
          <header className="bespoke-heading">
            <h1>Interaction Applications</h1>
            <p>
              Flint charts inside applications: a chart that zooms within itself, a chart that drives the page
              around it, a page that drives the chart, and charts that answer each other.
            </p>
          </header>

          <div className="bespoke-grid">
            <article className="bespoke-case bespoke-case--single">
              <header className="bespoke-case-header">
                <div>
                  <h2>Semantic zooming</h2>
                  <p>
                    2024 presidential vote margin by state and county. Zoom the map; once the view narrows
                    enough, the state choropleth becomes a county choropleth at the same place. Click a state
                    to fly into it.
                  </p>
                  <Credit source={{ label: 'US County Level Election Results 08-24, compiled from official state tallies by Tony McGovern', url: 'https://github.com/tonmcg/US_County_Level_Election_Results_08-24' }} />
                  <div className="bespoke-pattern">
                    <strong>Within chart</strong>
                    <strong>Flint in → Flint out</strong>
                  </div>
                </div>
                <span className="bespoke-status">Case 01</span>
              </header>
              <BespokeFrame><MapSemanticZoomStage dataset={ELECTION_DATASET} /></BespokeFrame>
            </article>

            <article className="bespoke-case bespoke-case--single">
              <header className="bespoke-case-header">
                <div>
                  <h2>You draw it</h2>
                  <p>
                    Average PISA scores of the OECD-23 countries, with the lines after 2012 left blank. Pick a
                    subject and draw its line to 2025; once all three are drawn, the real lines appear and the
                    chart scores your guess.
                  </p>
                  <Credit source={{ label: 'OECD, PISA 2025 Results (Volume I), Table I.D.1', url: 'https://stat.link/urv65o' }} />
                  <div className="bespoke-pattern">
                    <strong>Within chart</strong>
                    <strong>Flint in → Flint out</strong>
                  </div>
                </div>
                <span className="bespoke-status">Case 02</span>
              </header>
              <PisaDrawStage theme="economist" ink={PISA_INK} />
            </article>

            <article className="bespoke-case bespoke-case--single">
              <header className="bespoke-case-header">
                <div>
                  <h2>World Cup scorers</h2>
                  <p>
                    Click a team on the bars, and the scorer list beside the chart narrows to that team. The
                    host reads the chart state and renders the list itself. Click the background or press
                    Escape to go back to the top scorers.
                  </p>
                  <div className="bespoke-pattern">
                    <strong>Chart to external</strong>
                    <strong>Flint in → custom out</strong>
                  </div>
                </div>
                <span className="bespoke-status">Case 03</span>
              </header>
              <WorldCupScorersDemo />
            </article>

            <article className="bespoke-case bespoke-case--single">
              <header className="bespoke-case-header">
                <div>
                  <h2>Selection to agent</h2>
                  <p>
                    The reader asks for the chart, and the agent answers with it. Drag across the dates to
                    brush, and the brushed quarters wait above the composer as the context of the next
                    question. Hover a point to inspect it; Escape clears the brush.
                  </p>
                  <Credit source={{ label: 'U.S. Census Bureau monthly construction spending, via Our World in Data', url: 'https://www.census.gov/construction/c30/' }} />
                  <div className="bespoke-pattern">
                    <strong>Chart to external</strong>
                    <strong>Flint in → agent context</strong>
                  </div>
                </div>
                <span className="bespoke-status">Case 04</span>
              </header>
              <div className="it-page idr-page app-demo-embed"><SelectionChatDemo spec={SELECTION_CHAT} editable={false} /></div>
            </article>

            <article className="bespoke-case bespoke-case--single">
              <header className="bespoke-case-header">
                <div>
                  <h2>Article to chart</h2>
                  <p>
                    The Our World in Data article as vertical slides over a six-line chart: the title opens on
                    the full chart, each paragraph zooms to its decades, lights the companions it names and
                    pins one reading, and the summary closes over all six.
                  </p>
                  <Credit source={{ label: 'American Time Use Survey (BLS 2025), via Our World in Data', url: 'https://ourworldindata.org/who-do-americans-spend-time-with-over-their-lives' }} />
                  <div className="bespoke-pattern">
                    <strong>External to chart</strong>
                    <strong>External in → Flint out</strong>
                  </div>
                </div>
                <span className="bespoke-status">Case 05</span>
              </header>
              <div className="it-page idr-page app-demo-embed"><ArticleSection spec={TIME_USE} editable={false} /></div>
            </article>

            <article className="bespoke-case bespoke-case--single">
              <header className="bespoke-case-header">
                <div>
                  <h2>External control</h2>
                  <p>
                    A year slider sends set-data: that year&apos;s ten largest economies replace the rows, and
                    the bars re-sort.
                  </p>
                  <div className="bespoke-pattern">
                    <strong>External to chart</strong>
                    <strong>External in → set-data</strong>
                  </div>
                </div>
                <span className="bespoke-status">Case 06</span>
              </header>
              <SetWindowDemo />
            </article>

            <article className="bespoke-case bespoke-case--single">
              <header className="bespoke-case-header">
                <div>
                  <h2>Models and companies</h2>
                  <p>
                    A brush on the release dates re-counts the bars, and a click on a company lights its
                    models on the scatter.
                  </p>
                  <Credit source={{ label: 'Epoch AI, notable AI models', url: 'https://epoch.ai/data/ai-models' }} />
                  <div className="bespoke-pattern">
                    <strong>Connected view</strong>
                    <strong>Flint in → Flint out</strong>
                  </div>
                </div>
                <span className="bespoke-status">Case 07</span>
              </header>
              <ConnectedModelsDemo />
            </article>
          </div>
        </div>
      </main>
      </DemoChartFitContext.Provider>
    </SiteShell>
  );
}
