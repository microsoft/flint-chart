import { Crosshair, MousePointerClick, Move, Scan, Target, Timer } from 'lucide-react';
import {
  brushX,
  clickHighlight,
  doubleActivate,
  hoverGroupFocus,
  inspectIndex,
  longPress,
  navigate,
  select,
} from 'flint-chart/interactive';
import type { InteractionDef } from 'flint-chart/interactive';
import type { ChartAssemblyInput } from 'flint-chart';
import dataCenters from '../data/data-center-construction.json';
import timeUse from '../data/time-use-companions.json';
import { countriesFixture, type InteractionDemoFixture } from './interaction-demo-data';
import {
  emphasis,
  fullView,
  note,
  pointNote,
  preset,
  sentence,
  titleSlide,
  view,
  type Message,
  type SectionSpec,
} from './interactive-data-report-model';

/** The report: point selection, viewport navigation, and cohort hover on one chart. */
export const COUNTRIES: SectionSpec = {
  id: 'countries',
  title: 'Interactive data report',
  lede: 'Hover a sentence to preview it on the chart, or click it to pin it. A gesture on the chart drops the pin and gives the chart back to you.',
  fixture: countriesFixture,
  presets: [
    preset('set-style', 'Click highlight', MousePointerClick, clickHighlight({ id: 'focus', targets: ['mark', 'legend'] })),
    preset('set-style', 'Select', Scan, select({ id: 'select' })),
    preset('set-style', 'Hover group focus', Target, hoverGroupFocus({ id: 'group-hover', groupBy: 'Continent' })),
  ],
  paragraphs: [
    [
      'Across the twelve countries, income and longevity move together, but not in lockstep. ',
      sentence('japan', 'Japan leads life expectancy at 84.2 years', emphasis({ Country: 'Japan' })),
      ' despite a mid-tier income, while ',
      sentence('norway', 'Norway, the richest country at $64,800 per person', emphasis({ Country: 'Norway' })),
      ', trails it by two years. ',
      sentence('us-norway', 'The United States earns nearly as much as Norway yet lives almost four years less', emphasis({ Country: 'United States' }, { Country: 'Norway' })),
      '.',
    ],
    [
      // Two ops on one sentence: the five are emphasized, and the longest-lived gets a note.
      sentence(
        'over-80',
        'Only five countries average more than 80 years, and two of them are European. ',
        emphasis({ Country: 'Norway' }, { Country: 'Germany' }, { Country: 'Chile' }, { Country: 'Japan' }, { Country: 'Australia' }),
        note({ Country: 'Japan' }, '84.2 years, the longest'),
      ),
      '. At the other end, ',
      sentence('nigeria', 'Nigeria combines the lowest life expectancy, 54.3 years, with one of the lowest incomes', emphasis({ Country: 'Nigeria' })),
      ', and ',
      sentence('ethiopia', 'Ethiopia reaches 66.2 years on just $2,000 per person', emphasis({ Country: 'Ethiopia' })),
      '. ',
      sentence('china-india', 'China and India, the two most populous countries, sit near the middle of the income range but differ by almost ten years of life expectancy.', emphasis({ Country: 'China' }, { Country: 'India' })),
    ],
  ],
};

/** The scale paragraph on its own, told as slides: its viewport updates glide. */
export const SCALES: SectionSpec = {
  id: 'scales',
  title: 'The paragraph as slides',
  lede: 'Turn the paragraph into slides for step-by-step storytelling. Each slide applies its update on the chart, and a CSS transition on the marks carries the chart from one sentence to the next. Step through with the arrows or press play.',
  fixture: countriesFixture,
  presets: [
    preset('set-style', 'Click highlight', MousePointerClick, clickHighlight({ id: 'focus', targets: ['mark', 'legend'] })),
    preset('set-viewport', 'Pan & zoom', Move, navigate({ id: 'navigate' })),
    preset('set-style', 'Hover group focus', Target, hoverGroupFocus({ id: 'group-hover', groupBy: 'Continent' })),
  ],
  paragraphs: [
    [
      sentence('all', 'Taking closer looks at different parts of the chart reveals different patterns.', fullView('xy')),
      sentence(
        'rich',
        'Above $30,000 per person the picture is crowded: five countries within six years of one another.',
        view({ x: [30000, 110000] }),
        emphasis({ Country: 'Norway' }, { Country: 'Germany' }, { Country: 'United States' }, { Country: 'Japan' }, { Country: 'Australia' }),
      ),
      sentence('poor', 'Below $10,000 sit Ethiopia, Nigeria, and India, spread across thirteen years of life expectancy.', view({ x: [1500, 10000] })),
      sentence('catching-up', 'The 60-to-70-year band holds the three countries still catching up.', view({ y: [58, 72] })),
    ],
  ],
};

/** A news report on the chart: the paragraph in view applies its update as the reader scrolls. */
export const ARTICLE: SectionSpec = {
  id: 'article',
  title: 'Money buys years, but the price goes up',
  lede: 'Twelve countries, one chart: income lifts life expectancy fast at the bottom of the scale, and barely at all at the top.',
  fixture: countriesFixture,
  presets: [
    preset('set-style', 'Click highlight', MousePointerClick, clickHighlight({ id: 'focus', targets: ['mark', 'legend'] })),
    preset('set-viewport', 'Pan & zoom', Move, navigate({ id: 'navigate' })),
  ],
  paragraphs: [
    [
      sentence('open', 'Lined up by income, the twelve countries in this chart climb from Ethiopia at the bottom left to Japan at the top', fullView('xy')),
      '. The climb is steep at first and flat at the end: past a certain income, more money buys fewer extra years.',
    ],
    [
      sentence('top', 'Three countries sit above 82 years: Japan, Australia, and Norway', emphasis({ Country: 'Japan' }, { Country: 'Australia' }, { Country: 'Norway' })),
      '. Two of them are among the richest in the group. The third is not.',
    ],
    [
      sentence('japan', 'Japan leads at 84.2 years on an income of $39,300 per person, less than two-thirds of Norway’s', emphasis({ Country: 'Japan' }), note({ Country: 'Japan' }, '84.2 years')),
      '.',
    ],
    [
      sentence('rich', 'Above $30,000 the picture is crowded: five countries within six years of one another', view({ x: [30000, 110000] })),
      '. At this end of the scale, income no longer separates them.',
    ],
    [
      sentence('us', 'The United States is the outlier of the group: the second-richest of the five, and the shortest-lived', view({ x: [30000, 110000] }), note({ Country: 'United States' }, '78.6 years at $62,600')),
      '.',
    ],
    [
      sentence('poor', 'Below $10,000 the spread opens up: Ethiopia, Nigeria, and India are thirteen years apart', view({ x: [1500, 10000] })),
      '. Here, a few thousand dollars of income go with years of life.',
    ],
    [
      sentence('nigeria', 'Nigeria sits at the bottom at 54.3 years, twelve years below Ethiopia on more than twice the income', view({ x: [1500, 10000] }), note({ Country: 'Nigeria' }, '54.3 years')),
      '. Income is not the whole story.',
    ],
    [
      sentence('chile', 'Back at full width, Chile makes the point: 80 years on $25,200 per person, less than half the income of the United States', fullView('xy'), emphasis({ Country: 'Chile' }, { Country: 'United States' })),
      '.',
    ],
  ],
};

/** Hours per day Americans spend with each kind of companion, by age: the "All people" series of the survey. */
const timeUseFixture: InteractionDemoFixture = {
  id: 'time-use',
  title: 'Who Americans spend their time with, by age',
  source: timeUse.source,
  input: {
    data: { values: timeUse.values.filter((row) => row.Group === 'All people').map(({ Age, Who, Hours }) => ({ Age, Who, Hours })) },
    semantic_types: { Age: 'Quantity', Who: 'Category', Hours: 'Quantity' },
    field_display_names: { Hours: 'Hours per day' },
    chart_spec: {
      chartType: 'Line Chart',
      title: 'Who Americans spend their time with, by age',
      subtitle: 'Hours per day, averages from U.S. surveys between 2010 and 2024',
      encodings: { x: 'Age', y: 'Hours', color: 'Who' },
      baseSize: { width: 500, height: 320 },
      chartProperties: { includeZero_x: false, showPoints: true },
    },
  } as ChartAssemblyInput,
};

/** The Our World in Data article on time use: the title opens, each paragraph zooms to its decades and lights its companions, and the summary closes. */
export const TIME_USE: SectionSpec = {
  id: 'time-use',
  title: 'Who do Americans spend time with over their lives?',
  lede: 'Family and friends fill the teenage years, children and co-workers the middle decades, and a partner and time alone the later ones.',
  byline: 'Our World in Data · 30 April 2026',
  fixture: timeUseFixture,
  presets: [
    preset('set-style', 'Click highlight', MousePointerClick, clickHighlight({ id: 'focus', targets: ['legend'] })),
    preset('set-viewport', 'Pan & zoom', Move, navigate({ id: 'navigate' })),
  ],
  paragraphs: [
    [titleSlide('title', 'Who do Americans spend time with over their lives?', fullView('xy'))],
    [
      sentence('teens', 'In their teens, Americans spend a lot of time with friends and family', view({ x: [15, 25] }), emphasis({ Who: 'Family' }, { Who: 'Friends' }), pointNote({ Who: 'Family', Age: 15 }, '4.3 hours a day with family')),
      '.',
    ],
    [
      sentence('twenties', 'In their 20s, time with friends and family starts to drop off. Instead, Americans begin to spend more time with partners and children', view({ x: [20, 40] }), emphasis({ Who: 'Partner' }, { Who: 'Children' }), pointNote({ Who: 'Children', Age: 39 }, 'Peak at 4.3 hours with children at 39')),
      '.',
    ],
    [
      sentence('work', 'Throughout their 30s, 40s, and 50s, Americans spend much of their time with coworkers', view({ x: [25, 60] }), emphasis({ Who: 'Co-workers' }), pointNote({ Who: 'Co-workers', Age: 30 }, '3.3 hours a day')),
      '.',
    ],
    [
      sentence('older', 'As they get older, Americans spend more time alone, but surveys show this “doesn’t necessarily mean they’re lonely”', fullView('xy'), emphasis({ Who: 'Alone' }, { Who: 'Partner' }), pointNote({ Who: 'Alone', Age: 60 }, '7.2 hours a day alone at 60')),
      '.',
    ],
    [sentence('summary', 'Family and friends fill the teenage years, children and co-workers the middle decades, and a partner and time alone the later ones.', fullView('xy'))],
  ],
};

/** The scripted exchange of the selection demo: three countries selected, one question, one answer. */
/** Monthly spending averaged per quarter: 51 points sit apart on the line, where 152 months would hide them. */
const QUARTERS = (() => {
  const sums = new Map<string, { total: number; months: number }>();
  for (const row of dataCenters.values) {
    const [year, month] = row.month.split('-').map(Number);
    const quarter = `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
    const entry = sums.get(quarter) ?? { total: 0, months: 0 };
    entry.total += row.spending;
    entry.months += 1;
    sums.set(quarter, entry);
  }
  // Each quarter sits at its first month, so the axis keeps its yearly ticks.
  return [...sums].map(([quarter, { total, months }]) => {
    const [year, index] = quarter.split('-Q');
    return { Month: `${year}-${String((Number(index) - 1) * 3 + 1).padStart(2, '0')}`, Spending: Math.round(total / months / 1e7) / 100 };
  });
})();

/** The data center series as the chart beside the scripted chat: points on the line, Economist house style. */
const dataCentersFixture: InteractionDemoFixture = {
  id: 'data-centers-chat',
  title: 'U.S. data center construction spending',
  source: dataCenters.source,
  input: {
    data: { values: QUARTERS },
    semantic_types: { Month: 'YearMonth', Spending: 'Quantity' },
    field_display_names: { Spending: 'Monthly spending ($ billions)' },
    theme_spec: 'economist',
    chart_spec: {
      chartType: 'Line Chart',
      title: 'Data center construction spending has grown thirtyfold since 2014',
      subtitle: 'United States, quarterly average of monthly construction spending on data centers',
      encodings: { x: 'Month', y: 'Spending' },
      baseSize: { width: 640, height: 394 },
      // Without a canvas the layout narrows the 51-quarter plot and lets it grow tall.
      canvasSize: { width: 640, height: 394 },
      chartProperties: { showPoints: true },
    },
  } as ChartAssemblyInput,
};

/** The chat about the data center series: the reader asks for the chart, the agent answers with it, and a brush on it becomes context. */
export const SELECTION_CHAT: SectionSpec & { question: string; interactions: readonly InteractionDef[] } = {
  id: 'selection-chat',
  title: 'Selection as context',
  lede: 'The selection on the chart goes with the next question as its context.',
  fixture: dataCentersFixture,
  presets: [],
  paragraphs: [],
  question: 'Show me an interactive line chart with this data.',
  interactions: [brushX({ id: 'brush', mode: 'stateful' })],
};

/** The agent's chart: point selection only, so a drag is a rectangle and never a pan. */
export const AGENT: SectionSpec = {
  id: 'agent',
  title: 'Context for and from agent',
  lede: 'User can use selection to provide context about their request for the agent. Vice versa, the agent can use selection to augment their response and provide context for the user.',
  fixture: countriesFixture,
  presets: [
    preset('set-style', 'Click highlight', MousePointerClick, clickHighlight({ id: 'focus', targets: ['mark', 'legend'] })),
    preset('set-style', 'Select', Scan, select({ id: 'select' })),
    preset('set-style', 'Hover group focus', Target, hoverGroupFocus({ id: 'group-hover', groupBy: 'Continent' })),
  ],
  paragraphs: [],
};

/** The story: the sentences the reader kept from the chat, on their own chart. */
export const STORY: SectionSpec = {
  id: 'story',
  title: 'From exploration to data story',
  lede: 'Save interesting insights from your exploration as a data story, or create a new one from scratch.',
  fixture: countriesFixture,
  presets: [
    preset('set-style', 'Click highlight', MousePointerClick, clickHighlight({ id: 'focus', targets: ['mark', 'legend'] })),
    preset('set-style', 'Select', Scan, select({ id: 'select' })),
  ],
  paragraphs: [],
};

/** The messages the chat opens with, in order, written with the same builders as the report. */
export const OPENING: Message[] = [
  { from: 'user', paragraphs: [['What are the interesting findings in this chart?']] },
  {
    from: 'agent',
    paragraphs: [
      [
        sentence('asia', 'Asia stretches from India at 67 years to Japan at 84', emphasis({ Continent: 'Asia' })),
        ', while ',
        sentence('africa', 'all three African countries sit below 67', emphasis({ Continent: 'Africa' })),
        ' and ',
        sentence('americas', 'the Americas cluster between 75 and 80', emphasis({ Continent: 'Americas' })),
        '.',
      ],
    ],
  },
  {
    from: 'user', paragraphs: [
      [
        sentence('user', 'Summarize the pattern of the selected data,', emphasis({ Country: 'Norway' }, { Country: 'Germany' }, { Country: 'United States' }, { Country: 'Japan' }, { Country: 'Australia' }))
      ]
    ]
  },
  {
    from: 'agent', paragraphs: [
      [
        sentence('agent', 'The selection shows five relatively high GDP and high life expectancy countries, sitting in the upper-right portion overall.', emphasis({ Country: 'Norway' }, { Country: 'Germany' }, { Country: 'United States' }, { Country: 'Japan' }, { Country: 'Australia' }))
      ]
    ]
  }
];

/** The sentences the story opens with, by id, in order: two from the first response and the second response. */
export const DEFAULT_STORY: string[] = ['asia', 'africa', 'agent'];
