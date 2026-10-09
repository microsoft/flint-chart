import { ArticleSection, SelectionChatDemo } from '../playground/InteractiveDataReportLab';
import { WorldCupScorersDemo } from '../playground/WorldCupScorersDemo';
import { PisaDrawStage } from '../playground/PisaDrawStage';
import { TIME_USE, SELECTION_CHAT } from '../playground/interactive-data-report-content';
import { ConnectedModelsDemo } from '../playground/release-examples/application-demos-connected';
import { SetWindowDemo } from '../playground/release-examples/application-demos-inbound';
import { ElectionProfileDemo } from '../playground/release-examples/application-demos-election-profile';
import { DatasaurusDemo } from '../playground/release-examples/application-demos-datasaurus';
import { DragTheFitDemo } from '../playground/release-examples/application-demos-regression';
import { FitDistributionDemo } from '../playground/release-examples/application-demos-distribution';
import { OverviewDetailDemo } from '../playground/release-examples/application-demos-overview-detail';
import { SiteShell } from '../components/SiteShell';
import '../playground/interaction-transport.css';
import '../playground/bespoke-interaction-lab.css';
import '../playground/release-examples/application-demos.css';
import './interaction-applications.css';

type Source = { label: string; url: string };

const PISA_INK = { Science: '#5b8fd6', Mathematics: '#f2a89b', Reading: '#e3120b' } as const;

function Credit({ source }: { source: Source }) {
  return <p className="ia-source">Source: <a href={source.url} target="_blank" rel="noreferrer">{source.label}</a>.</p>;
}

export function InteractionApplications() {
  return (
    <SiteShell>
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
                  <h2>Zoom into counties</h2>
                  <p>The 2024 presidential vote margin by state and county. Scroll to zoom; past a threshold the state map becomes a county map in place. Click a state to fly into it and a county to read it; the profile beside the map follows.</p>
                  <Credit source={{ label: 'US County Level Election Results 08-24, compiled by Tony McGovern', url: 'https://github.com/tonmcg/US_County_Level_Election_Results_08-24' }} />
                  <div className="bespoke-pattern">
                    <strong>Within chart</strong>
                    <strong>Flint in → Flint out, navigation → custom out</strong>
                  </div>
                </div>
                <span className="bespoke-status">Case 01</span>
              </header>
              <ElectionProfileDemo />
            </article>

            <article className="bespoke-case bespoke-case--single">
              <header className="bespoke-case-header">
                <div>
                  <h2>Click a team</h2>
                  <p>Goals by team at the 2026 World Cup, with the scorer list beside the bars. Click a team to list its scorers, and a scorer to see their goals by opponent. Click the background or press Escape to return to the top scorers.</p>
                  <Credit source={{ label: 'openfootball, 2026 World Cup match results', url: 'https://github.com/openfootball/worldcup.json' }} />
                  <div className="bespoke-pattern">
                    <strong>Chart to external</strong>
                    <strong>Flint in → custom out</strong>
                  </div>
                </div>
                <span className="bespoke-status">Case 02</span>
              </header>
              <WorldCupScorersDemo />
            </article>

            <article className="bespoke-case bespoke-case--single">
              <header className="bespoke-case-header">
                <div>
                  <h2>Brush for the agent</h2>
                  <p>A chart inside a chat. Drag across the dates to brush a period; the brushed quarters become the context of the next question. Hover a point to inspect it; Escape clears the brush.</p>
                  <Credit source={{ label: 'U.S. Census Bureau monthly construction spending, via Our World in Data', url: 'https://www.census.gov/construction/c30/' }} />
                  <div className="bespoke-pattern">
                    <strong>Chart to external</strong>
                    <strong>Flint in → agent context</strong>
                  </div>
                </div>
                <span className="bespoke-status">Case 03</span>
              </header>
              <div className="it-page idr-page app-demo-embed"><SelectionChatDemo spec={SELECTION_CHAT} editable={false} /></div>
            </article>

            <article className="bespoke-case bespoke-case--single">
              <header className="bespoke-case-header">
                <div>
                  <h2>Scroll the article</h2>
                  <p>An article as vertical slides over a six-line chart. Scroll through the paragraphs; each one zooms to its decades, lights the lines it names, and pins one reading.</p>
                  <Credit source={{ label: 'American Time Use Survey (BLS 2025), via Our World in Data', url: 'https://ourworldindata.org/who-do-americans-spend-time-with-over-their-lives' }} />
                  <div className="bespoke-pattern">
                    <strong>External to chart</strong>
                    <strong>External in → Flint out</strong>
                  </div>
                </div>
                <span className="bespoke-status">Case 04</span>
              </header>
              <div className="it-page idr-page app-demo-embed"><ArticleSection spec={TIME_USE} editable={false} /></div>
            </article>

            <article className="bespoke-case bespoke-case--single">
              <header className="bespoke-case-header">
                <div>
                  <h2>Play the years</h2>
                  <p>The ten largest economies, 1960 to 2025. Press Play or drag the year slider to step through the years; pick a country to keep its bar orange as its rank changes; click a timeline event to jump to its year.</p>
                  <Credit source={{ label: 'World Bank, GDP in current US dollars', url: 'https://data.worldbank.org/indicator/NY.GDP.MKTP.CD' }} />
                  <div className="bespoke-pattern">
                    <strong>External to chart</strong>
                    <strong>External in → set-data + set-style + set-annotation</strong>
                  </div>
                </div>
                <span className="bespoke-status">Case 05</span>
              </header>
              <SetWindowDemo />
            </article>

            <article className="bespoke-case bespoke-case--single">
              <header className="bespoke-case-header">
                <div>
                  <h2>Link two charts</h2>
                  <p>Notable AI models by release date, and the companies behind them. Drag across the release dates to re-count the bars; click a company to light its models on the scatter.</p>
                  <Credit source={{ label: 'Epoch AI, notable AI models', url: 'https://epoch.ai/data/ai-models' }} />
                  <div className="bespoke-pattern">
                    <strong>Connected view</strong>
                    <strong>Flint in → Flint out</strong>
                  </div>
                </div>
                <span className="bespoke-status">Case 06</span>
              </header>
              <ConnectedModelsDemo />
            </article>

            <article className="bespoke-case bespoke-case--single">
              <header className="bespoke-case-header">
                <div>
                  <h2>Brush the overview</h2>
                  <p>The weekly price of a gallon of regular gasoline in the United States since 2000. Drag across the strip at the bottom to frame those weeks in the chart above; drag the brush along and the detail follows.</p>
                  <Credit source={{ label: 'U.S. Energy Information Administration, weekly retail gasoline prices', url: 'https://www.eia.gov/petroleum/gasdiesel/' }} />
                  <div className="bespoke-pattern">
                    <strong>Connected view</strong>
                    <strong>Flint in → set-viewport</strong>
                  </div>
                </div>
                <span className="bespoke-status">Case 07</span>
              </header>
              <OverviewDetailDemo />
            </article>

            <article className="bespoke-case bespoke-case--single">
              <header className="bespoke-case-header">
                <div>
                  <h2>Draw the lines</h2>
                  <p>Average PISA scores of the OECD-23 countries, blank after 2012. Pick a subject and draw its line to 2025; once all three are drawn, the real lines appear and the chart scores your guess.</p>
                  <Credit source={{ label: 'OECD, PISA 2025 Results (Volume I), Table I.D.1', url: 'https://stat.link/urv65o' }} />
                  <div className="bespoke-pattern">
                    <strong>Within chart</strong>
                    <strong>Flint in → Flint out</strong>
                  </div>
                </div>
                <span className="bespoke-status">Case 08</span>
              </header>
              <PisaDrawStage theme="economist" ink={PISA_INK} />
            </article>

            <article className="bespoke-case bespoke-case--single">
              <header className="bespoke-case-header">
                <div>
                  <h2>Drag the shape</h2>
                  <p>Thirteen point clouds with the same means, standard deviations, and correlation. Drag the orange point along its path to morph the cloud from one shape to the next, or click a shape in the list.</p>
                  <Credit source={{ label: 'Matejka & Fitzmaurice (2017), the Datasaurus Dozen', url: 'https://www.research.autodesk.com/publications/same-stats-different-graphs/' }} />
                  <div className="bespoke-pattern">
                    <strong>Within chart</strong>
                    <strong>Drag along a path → set-overlay + set-data</strong>
                  </div>
                </div>
                <span className="bespoke-status">Case 09</span>
              </header>
              <DatasaurusDemo />
            </article>

            <article className="bespoke-case bespoke-case--single">
              <header className="bespoke-case-header">
                <div>
                  <h2>Tilt the line</h2>
                  <p>Visual belief elicitation, after Koonchanok, Papka and Reda. Drag the red line to set the slope you believe in and the slider to set how strong the relationship is; a sample drawn from your model keeps refreshing beneath it.</p>
                  <Credit source={{ label: 'Koonchanok, Papka & Reda (2023), Visual Belief Elicitation Reduces the Incidence of False Discovery, CHI 2023', url: 'https://doi.org/10.1145/3544548.3580808' }} />
                  <div className="bespoke-pattern">
                    <strong>Within chart</strong>
                    <strong>Drag → set-overlay; external → set-data</strong>
                  </div>
                </div>
                <span className="bespoke-status">Case 10</span>
              </header>
              <DragTheFitDemo />
            </article>

            <article className="bespoke-case bespoke-case--single">
              <header className="bespoke-case-header">
                <div>
                  <h2>Sketch the wait</h2>
                  <p>How long between Old Faithful’s eruptions, in five-minute bins. Drag a handle, or sweep across the bars, to draw the distribution you expect, then press Show the data to see the real month behind your sketch.</p>
                  <Credit source={{ label: 'Azzalini & Bowman (1990), 272 eruptions in August 1985, as R datasets::faithful', url: 'https://stat.ethz.ch/R-manual/R-devel/library/datasets/html/faithful.html' }} />
                  <div className="bespoke-pattern">
                    <strong>Within chart</strong>
                    <strong>Drag a handle → set-data + set-overlay</strong>
                  </div>
                </div>
                <span className="bespoke-status">Case 11</span>
              </header>
              <FitDistributionDemo />
            </article>
          </div>
        </div>
      </main>
    </SiteShell>
  );
}
