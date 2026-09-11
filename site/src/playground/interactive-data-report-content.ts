import { MousePointerClick, Move, Scan, Target, Timer } from 'lucide-react';
import {
  clickHighlight,
  doubleActivate,
  hoverGroupFocus,
  longPress,
  navigate,
  select,
} from 'flint-chart/interactive';
import { countriesFixture } from './interaction-demo-data';
import {
  emphasis,
  fullView,
  note,
  preset,
  sentence,
  view,
  type Message,
  type SectionSpec,
} from './interactive-data-report-model';

/** The report: point selection, viewport navigation, and cohort hover on one chart. */
export const COUNTRIES: SectionSpec = {
  id: 'countries',
  title: 'Interactive data report',
  lede: 'Chart and report can be bi-directionally connected. Hover a sentence to preview it on the chart, or click it to pin it. Interact with the chart, and the sentences that point at the same data rows light up.',
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
