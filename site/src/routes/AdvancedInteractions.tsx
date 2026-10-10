import { Fragment, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BarChart3, Braces, Brush, ChevronRight, Crosshair, Globe, Link2, Map as MapIcon, MessageSquare, MousePointerClick,
  Move, Pencil, PenLine, Play, Route, ScrollText, ShoppingBasket, Sigma, SquareDashed, Thermometer, TrendingUp, ZoomIn,
  type LucideIcon,
} from 'lucide-react';
import { CodeBlock } from '../components/CodeBlock';
import { SiteShell } from '../components/SiteShell';
import { LocaleLink } from '../i18n/LocaleLink';
import { scrollToHeading } from '../shared/scroll-to-heading';
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
import { FlintDimpVisStage } from '../playground/FlintDimpVisStage';
import { ClimatePhaseStage } from '../playground/ClimatePhaseStage';
import { FisheyeZoomStage } from '../playground/FisheyeZoomStage';
import { FreeformExplodedDetailStage } from '../playground/ExplodedDetailStage';
import { IndexChartStage } from '../playground/IndexChartStage';
import { TimeboxStage } from '../playground/TimeboxStage';
import { YouDrawItStage } from '../playground/YouDrawItStage';
import { ChinaSemanticZoomStage } from '../playground/ChinaSemanticZoomStage';
import { RetailDrilldownStage } from '../playground/RetailDrilldownStage';
import { MovingAverageStage } from '../playground/MovingAverageStage';
import mapSource from '../playground/MapSemanticZoomStage.tsx?raw';
import chinaSource from '../playground/ChinaSemanticZoomStage.tsx?raw';
import retailSource from '../playground/RetailDrilldownStage.tsx?raw';
import fisheyeSource from '../playground/FisheyeZoomStage.tsx?raw';
import explodedSource from '../playground/ExplodedDetailStage.tsx?raw';
import indexSource from '../playground/IndexChartStage.tsx?raw';
import pisaSource from '../playground/PisaDrawStage.tsx?raw';
import drawSource from '../playground/YouDrawItStage.tsx?raw';
import distributionSource from '../playground/release-examples/application-demos-distribution.tsx?raw';
import regressionSource from '../playground/release-examples/application-demos-regression.tsx?raw';
import datasaurusSource from '../playground/release-examples/application-demos-datasaurus.tsx?raw';
import trajectorySource from '../playground/FlintDimpVisStage.tsx?raw';
import climateSource from '../playground/ClimatePhaseStage.tsx?raw';
import timeboxSource from '../playground/TimeboxStage.tsx?raw';
import averageSource from '../playground/MovingAverageStage.tsx?raw';
import overviewSource from '../playground/release-examples/application-demos-overview-detail.tsx?raw';
import connectedSource from '../playground/release-examples/application-demos-connected.tsx?raw';
import worldCupSource from '../playground/WorldCupScorersDemo.tsx?raw';
import '../playground/click-focus-lab.css';
import '../playground/interaction-transport.css';
import '../playground/bespoke-interaction-lab.css';
import '../playground/release-examples/application-demos.css';
import './advanced-interactions.css';

type Source = { label: string; url: string };

interface Case {
  id: string;
  title: string;
  icon: LucideIcon;
  body: ReactNode;
  credit?: Source;
  demo: ReactNode;
  code?: string;
  /** A case of several treatments shows each one's own meta line. */
  treatments?: boolean;
}

// The three primaries at matched weight: blue, red, and a yellow deep enough to read on white.
const PISA_INK = { Science: '#2f6db5', Reading: '#cf3a3a', Mathematics: '#d99a1c' } as const;

const NASA_CLIMATOLOGY = 'https://power.larc.nasa.gov/docs/services/api/temporal/climatology/';

function Credit({ source }: { source: Source }) {
  return <p className="ia-source">Source: <a href={source.url} target="_blank" rel="noreferrer">{source.label}</a>.</p>;
}

function CaseCode({ title, source }: { title: string; source: string }) {
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

const SECTIONS: { title: string; cases: Case[] }[] = [
  {
    title: 'Zoom and focus',
    cases: [
      {
        id: 'zoom-into-counties',
        title: 'Zoom into counties',
        icon: MapIcon,
        body: 'The 2024 presidential vote margin by state and county. Scroll to zoom; past a threshold the state map becomes a county map in place. Click a state to fly into it and a county to read it; the profile beside the map follows.',
        credit: { label: 'US County Level Election Results 08-24, compiled by Tony McGovern', url: 'https://github.com/tonmcg/US_County_Level_Election_Results_08-24' },
        demo: <ElectionProfileDemo />,
        code: mapSource,
      },
      {
        id: 'china-aging',
        title: 'Where China\u2019s population is aging',
        icon: Globe,
        body: <>
          Zoom from provinces to prefectures and county units. Population totals and population-weighted
          shares aged 65+ cover 30 provinces, 343 prefectural units, and 2,668 county units. Aggregates cover
          included counties, not full-region totals; age-data coverage is reported in tooltips. Base map:
          DataV.GeoAtlas province boundaries (100000_full), Alibaba Cloud.
        </>,
        credit: { label: '2020 census compilation by Lei Dong and colleagues', url: 'https://github.com/leiii/census' },
        demo: <ChinaSemanticZoomStage />,
        code: chinaSource,
      },
      {
        id: 'food-basket',
        title: 'Food basket price navigator',
        icon: ShoppingBasket,
        body: 'How five U.S. average food prices compose a one-unit basket over time. The wheel narrows the month window, and Flint re-lays out the chart for the visible months, so the bar step, the price domain, and the tick labels all follow the data.',
        credit: { label: 'U.S. Bureau of Labor Statistics average price data for bananas, eggs, ground beef, white bread, and whole milk', url: 'https://www.bls.gov/cpi/data.htm' },
        demo: <RetailDrilldownStage />,
        code: retailSource,
      },
      {
        id: 'semantic-lens',
        title: 'Semantic lens and exploded detail',
        icon: ZoomIn,
        body: <>
          A semantic lens beside a cloned-SVG exploded detail. The lens uses Palmer Penguins: flipper length
          and body mass for 33 specimens, Horst, Hill &amp; Gorman (2020). The exploded detail uses
          {' '}<a href={NASA_CLIMATOLOGY} target="_blank" rel="noreferrer">NASA POWER</a> monthly climatology, MERRA-2, 1991-2020.
        </>,
        treatments: true,
        demo: <div className="bespoke-treatment-stack">
          <section className="bespoke-treatment">
            <h4 className="bespoke-treatment-title">Semantic lens</h4>
            <FisheyeZoomStage />
            <CaseCode title="Semantic lens" source={fisheyeSource} />
          </section>
          <section className="bespoke-treatment">
            <h4 className="bespoke-treatment-title">Exploded detail</h4>
            <FreeformExplodedDetailStage />
            <CaseCode title="Exploded detail" source={explodedSource} />
          </section>
        </div>,
      },
      {
        id: 'index-cursor',
        title: 'Re-index from any date',
        icon: Crosshair,
        body: 'Re-index the same stock series against a movable date while an overlay owns the pointer and the reference marker. Sampled AAPL, AMZN, GOOG, IBM, and MSFT prices from the D3/Vega index-chart reference dataset, 2013-2017.',
        demo: <IndexChartStage />,
        code: indexSource,
      },
    ],
  },
  {
    title: 'Draw and drag',
    cases: [
      {
        id: 'climate-phase-portrait',
        title: 'Climate phase portrait',
        icon: Thermometer,
        body: <>
          Select or drag a city&apos;s annual climate loop; Play animates the same update from outside the chart.
          {' '}<a href={NASA_CLIMATOLOGY} target="_blank" rel="noreferrer">NASA POWER</a> monthly climatology, MERRA-2, 1991-2020.
        </>,
        demo: <ClimatePhaseStage />,
        code: climateSource,
      },
      {
        id: 'data-space-trajectory',
        title: 'Drag along a trajectory',
        icon: Route,
        body: 'Select a country, then drag its historical path to update the shared year. Fertility, life expectancy, and population for eight countries, 1955-2005.',
        demo: <FlintDimpVisStage large />,
        code: trajectorySource,
      },
      {
        id: 'tilt-the-line',
        title: 'Tilt the line',
        icon: TrendingUp,
        body: 'Visual belief elicitation, after Koonchanok, Papka and Reda. Drag the red line to set the slope you believe in and the slider to set how strong the relationship is; a sample drawn from your model keeps refreshing beneath it.',
        credit: { label: 'Koonchanok, Papka & Reda (2023), Visual Belief Elicitation Reduces the Incidence of False Discovery, CHI 2023', url: 'https://doi.org/10.1145/3544548.3580808' },
        demo: <DragTheFitDemo />,
        code: regressionSource,
      },
      {
        id: 'you-draw-it',
        title: 'You draw it',
        icon: Pencil,
        body: 'Draw the future part of a line chart with a freehand stroke; once every year is filled, the chart reveals the real series and scores the guess. Press Reset or double-click to start over. Approximate annual U.S. coal electricity-generation shares, 2000-2024, rounded to one decimal.',
        credit: { label: 'U.S. Energy Information Administration, Electric Power Monthly', url: 'https://www.eia.gov/electricity/monthly/' },
        demo: <YouDrawItStage />,
        code: drawSource,
      },
      {
        id: 'draw-the-lines',
        title: 'Draw the lines',
        icon: PenLine,
        body: 'Average PISA scores of the OECD-23 countries, blank after 2012. Start on the end of a subject\u2019s line, or pick it on the right, and draw it to 2025; once all three are drawn, the real lines appear and the chart scores your guess.',
        credit: { label: 'OECD, PISA 2025 Results (Volume I), Table I.D.1', url: 'https://stat.link/urv65o' },
        demo: <PisaDrawStage theme="economist" ink={PISA_INK} />,
        code: pisaSource,
      },
      {
        id: 'sketch-the-wait',
        title: 'Sketch the wait',
        icon: BarChart3,
        body: 'How long between Old Faithful\u2019s eruptions, in five-minute bins. Drag a handle, or sweep across the bars, to draw the distribution you expect, then press Show the data to see the real month behind your sketch.',
        credit: { label: 'Azzalini & Bowman (1990), 272 eruptions in August 1985, as R datasets::faithful', url: 'https://stat.ethz.ch/R-manual/R-devel/library/datasets/html/faithful.html' },
        demo: <FitDistributionDemo />,
        code: distributionSource,
      },
      {
        id: 'drag-the-shape',
        title: 'Drag the shape',
        icon: Move,
        body: 'Thirteen point clouds with the same means, standard deviations, and correlation. Drag the orange point along its path to morph the cloud from one shape to the next, or click a shape in the list.',
        credit: { label: 'Matejka & Fitzmaurice (2017), the Datasaurus Dozen', url: 'https://www.research.autodesk.com/publications/same-stats-different-graphs/' },
        demo: <DatasaurusDemo />,
        code: datasaurusSource,
      },
    ],
  },
  {
    title: 'Brush and select',
    cases: [
      {
        id: 'timebox',
        title: 'Timebox the temperatures',
        icon: SquareDashed,
        body: <>
          Drag a box over a date interval and temperature band; cities match only when every daily value in
          that interval stays within the band. The box can be moved and resized. 12 cities in 2023, all 365 daily
          values per city: {' '}<a href="https://power.larc.nasa.gov/docs/services/api/temporal/daily/" target="_blank" rel="noreferrer">NASA POWER</a>
          {' '}/ MERRA-2 gridded reanalysis at city coordinates, in Celsius and local solar time.
        </>,
        demo: <TimeboxStage />,
        code: timeboxSource,
      },
      {
        id: 'moving-average',
        title: 'A moving average line',
        icon: Sigma,
        body: 'Drag across months and a reference line moves to their mean; move or resize the brush and the line follows every frame. One definition returns the emphasis and the line together.',
        credit: { label: 'BLS average retail price of a dozen eggs, U.S. city average', url: 'https://www.bls.gov/cpi/data.htm' },
        demo: <MovingAverageStage />,
        code: averageSource,
      },
      {
        id: 'brush-the-overview',
        title: 'Brush the overview',
        icon: Brush,
        body: 'The weekly price of a gallon of regular gasoline in the United States since 2000. Drag across the strip at the bottom to frame those weeks in the chart above; drag the brush along and the detail follows.',
        credit: { label: 'U.S. Energy Information Administration, weekly retail gasoline prices', url: 'https://www.eia.gov/petroleum/gasdiesel/' },
        demo: <OverviewDetailDemo />,
        code: overviewSource,
      },
      {
        id: 'link-two-charts',
        title: 'Link two charts',
        icon: Link2,
        body: 'Notable AI models by release date, and the companies behind them. Drag across the release dates to re-count the bars; click a company to light its models on the scatter.',
        credit: { label: 'Epoch AI, notable AI models', url: 'https://epoch.ai/data/ai-models' },
        demo: <ConnectedModelsDemo />,
        code: connectedSource,
      },
    ],
  },
  {
    title: 'Charts in an application',
    cases: [
      {
        id: 'click-a-team',
        title: 'Click a team',
        icon: MousePointerClick,
        body: 'Goals by team at the 2026 World Cup, with the scorer list beside the bars. Click a team to list its scorers, and a scorer to see their goals by opponent. Click the background or press Escape to return to the top scorers.',
        credit: { label: 'openfootball, 2026 World Cup match results', url: 'https://github.com/openfootball/worldcup.json' },
        demo: <WorldCupScorersDemo />,
        code: worldCupSource,
      },
      {
        id: 'brush-for-the-agent',
        title: 'Brush for the agent',
        icon: MessageSquare,
        body: 'A chart inside a chat. Drag across the dates to brush a period; the brushed quarters become the context of the next question. Hover a point to inspect it; Escape clears the brush.',
        credit: { label: 'U.S. Census Bureau monthly construction spending, via Our World in Data', url: 'https://www.census.gov/construction/c30/' },
        demo: <div className="it-page idr-page app-demo-embed"><SelectionChatDemo spec={SELECTION_CHAT} editable={false} /></div>,
      },
      {
        id: 'scroll-the-article',
        title: 'Scroll the article',
        icon: ScrollText,
        body: 'An article as vertical slides over a six-line chart. Scroll through the paragraphs; each one zooms to its decades, lights the lines it names, and pins one reading.',
        credit: { label: 'American Time Use Survey (BLS 2025), via Our World in Data', url: 'https://ourworldindata.org/who-do-americans-spend-time-with-over-their-lives' },
        demo: <div className="it-page idr-page app-demo-embed"><ArticleSection spec={TIME_USE} editable={false} /></div>,
      },
      {
        id: 'play-the-years',
        title: 'Play the years',
        icon: Play,
        body: 'The ten largest economies, 1960 to 2025. Press Play or drag the year slider to step through the years; pick a country to keep its bar orange as its rank changes; click a timeline event to jump to its year.',
        credit: { label: 'World Bank, GDP in current US dollars', url: 'https://data.worldbank.org/indicator/NY.GDP.MKTP.CD' },
        demo: <SetWindowDemo />,
      },
    ],
  },
];

function CaseRail({ scroller }: { scroller: RefObject<HTMLElement | null> }) {
  const [active, setActive] = useState<string>(SECTIONS[0].cases[0].id);
  useEffect(() => {
    const root = scroller.current;
    if (!root) return undefined;
    // The case crossing the upper part of the pane is the one being read.
    const observer = new IntersectionObserver((entries) => {
      const hit = entries.filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (hit) setActive(hit.target.id);
    }, { root, rootMargin: '-20% 0px -70% 0px' });
    for (const { id } of SECTIONS.flatMap((section) => section.cases)) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [scroller]);

  return (
    <nav className="cf-action-rail ig-action-rail" aria-label="Advanced interactions">
      {SECTIONS.map((section, index) => (
        <Fragment key={section.title}>
          {index > 0 && <div className="cf-action-divider" role="separator" />}
          {section.cases.map(({ id, title, icon: Icon }) => (
            <button key={id} type="button" className={active === id ? 'active' : undefined}
              aria-current={active === id ? 'true' : undefined}
              onClick={() => {
                setActive(id);
                scrollToHeading(id, scroller.current);
              }}>
              <Icon size={15} strokeWidth={1.8} aria-hidden="true" /><span>{title}</span>
            </button>
          ))}
        </Fragment>
      ))}
    </nav>
  );
}

export function AdvancedInteractions() {
  const scroller = useRef<HTMLElement>(null);
  const linkedCase = useSearchParams()[0].get('case');
  useEffect(() => {
    if (linkedCase) document.getElementById(linkedCase)?.scrollIntoView({ block: 'start' });
  }, [linkedCase]);
  return (
    <SiteShell>
      <main className="bespoke-public-scroll" ref={scroller}>
        <div className="bespoke-page bespoke-public-page ia-page">
          <header className="bespoke-heading">
            <nav className="ig-breadcrumb" aria-label="Breadcrumb">
              <LocaleLink to="/interactions">Flint Interactive</LocaleLink><span aria-hidden="true">/</span><span aria-current="page">Advanced Interactions</span>
            </nav>
            <h1>Flint Advanced Interactions</h1>
            <p>
              Each case here is a bespoke interaction built with the{' '}
              <LocaleLink to="/documentation/interaction-api">Flint interaction API</LocaleLink>, beyond what the presets
              cover. Instead of handling raw pointer events and renderer-specific marks, a custom interaction receives
              semantic events about the data and answers with high-level chart updates, so you or your agent can lean
              on the Flint compiler's semantic resolution to keep even complex interactions short. The cases range
              from zooming and focusing within a chart and drawing or dragging the data itself to brushing across
              views and charts that drive and answer the application around them. Each case shows its code; design
              your own and{' '}
              <a href="https://github.com/microsoft/flint-chart/issues/new" target="_blank" rel="noreferrer">propose it as a preset</a>.
              For the ready-made ones, see the <LocaleLink to="/interactions/gallery">Interaction Presets</LocaleLink>.
            </p>
          </header>
          <CaseRail scroller={scroller} />

          {SECTIONS.map((section) => (
            <section key={section.title} className="bespoke-grid ia-section" aria-label={section.title}>
              {section.cases.map((item) => (
                <article key={item.id} id={item.id}
                  className={item.treatments ? 'bespoke-case' : 'bespoke-case bespoke-case--single'}>
                  <header className="bespoke-case-header">
                    <div>
                      <h3>{item.title}</h3>
                      <p>{item.body}</p>
                      {item.credit && <Credit source={item.credit} />}
                    </div>
                  </header>
                  {item.demo}
                  {item.code && <CaseCode title={item.title} source={item.code} />}
                </article>
              ))}
            </section>
          ))}
        </div>
      </main>
    </SiteShell>
  );
}
