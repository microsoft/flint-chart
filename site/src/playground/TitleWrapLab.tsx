import { useMemo, useState } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import { filledLines, type TitleMeasure } from '../../../packages/flint-js/src/core/title-fit';
import { ScaleToFit } from '../components/ScaleToFit';
import { FlintView } from '../components/FlintView';
import { gapminderRows } from './gapminder-dashboard-data';
import './title-wrap-lab.css';

const WIDOW_SHARE = 1 / 3;

/** Fill alone: each line filled to the block, the words that do not fit falling to the next. */
function greedyLines(text: string, block: number, fontSize: number, measure: TitleMeasure): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [text];
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measure(candidate, fontSize) > block) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Pull words down: fill, then move words from the lines above into a widow until it is a third of the block. */
function pulledLines(text: string, block: number, fontSize: number, measure: TitleMeasure): string[] {
  const lines = greedyLines(text, block, fontSize, measure).map((line) => line.split(' '));
  const width = (words: string[]) => measure(words.join(' '), fontSize);
  if (lines.length < 2 || width(lines[lines.length - 1]) >= block * WIDOW_SHARE) return lines.map((words) => words.join(' '));
  // From the bottom up: each line takes words from the one above until it is long enough.
  for (let k = lines.length - 1; k > 0; k--) {
    while (width(lines[k]) < block * WIDOW_SHARE && lines[k - 1].length > 1) {
      const word = lines[k - 1][lines[k - 1].length - 1];
      if (width([word, ...lines[k]]) > block) break;
      lines[k].unshift(lines[k - 1].pop()!);
    }
    if (width(lines[k - 1]) >= block * WIDOW_SHARE) break;
  }
  return lines.map((words) => words.join(' '));
}

/** The rule before: fill to the block, then even only the last two lines when the last is a widow. */
function previousFilledLines(text: string, block: number, fontSize: number, measure: TitleMeasure): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [text];
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measure(candidate, fontSize) > block) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  if (lines.length >= 2 && measure(lines[lines.length - 1], fontSize) < block * WIDOW_SHARE) {
    const tail = previousBalanced(`${lines[lines.length - 2]} ${lines[lines.length - 1]}`, fontSize, measure);
    lines.splice(lines.length - 2, 2, ...tail);
  }
  return lines;
}

function previousBalanced(text: string, fontSize: number, measure: TitleMeasure): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const target = measure(text, fontSize) / 2;
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && lines.length < 1 && measure(candidate, fontSize) - target > target - measure(line, fontSize)) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

type Role = 'headline' | 'deck';

const FONT: Record<Role, { size: number; weight: number; family: string }> = {
  headline: { size: 22, weight: 700, family: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  deck: { size: 15, weight: 400, family: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
};

const canvas = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;

function measureFor(role: Role): TitleMeasure {
  const { weight, family } = FONT[role];
  return (text, fontSize) => {
    if (!canvas) return text.length * fontSize * 0.55;
    canvas.font = `${weight} ${fontSize}px ${family}`;
    return canvas.measureText(text).width;
  };
}

export interface TextCase { id: string; label: string; role: Role; text: string; note: string; block: number }

const SNAPSHOT_DECK = 'GDP per capita (log scale) vs life expectancy, 2007; bubble size = population; X: GDP per capita ($, log scale); Y: Life expectancy (years)';

export const TEXT_CASES: TextCase[] = [
  {
    id: 'snapshot-deck', label: 'Deck from the bubble chart', role: 'deck', text: SNAPSHOT_DECK, block: 440,
    note: 'The reported case. Fill leaves a widow; the old rule evened the last two lines into one full line over two half lines. Now the room the last line needs is shared by the two lines above it.',
  },
  {
    id: 'long-deck', label: 'Long deck', role: 'deck', block: 260,
    text: 'Share of adults who say they trust the national government to do what is right most of the time, by age group and country, 2010 to 2024; weighted survey responses, excluding don’t know',
    note: 'The old fix only ever touched the last two lines; the room the last line needs is now taken across the lines above it.',
  },
  {
    id: 'headline-widow', label: 'Headline with a widow', role: 'headline', block: 320,
    text: 'Wealthier countries live longer, but the gap is closing fast',
    note: 'A headline follows the same rule as the deck.',
  },
  {
    id: 'headline-three', label: 'Three-line headline', role: 'headline', block: 480,
    text: 'Electricity demand from data centres is set to double by the end of the decade, led by America',
    note: 'Three lines at this width: the lines above the widow stay near the block edge rather than halving.',
  },
  {
    id: 'no-widow', label: 'Deck that fills without a widow', role: 'deck', block: 300,
    text: 'Annual mean temperature anomaly relative to the 1951–1980 average, global land and ocean, degrees Celsius',
    note: 'At this width the last line is long enough, so fill stands in every rule. Drag the width to find where a widow appears.',
  },
  {
    id: 'cjk', label: 'CJK deck', role: 'deck', block: 300,
    text: '2007 年 各国 人均 GDP（对数刻度）与 预期寿命；气泡 大小 表示 人口；横轴：人均 GDP（美元）；纵轴：预期寿命（岁）',
    note: 'Breaks only fall at spaces, in every rule.',
  },
];

function widthsOf(lines: string[], role: Role): number[] {
  const measure = measureFor(role);
  return lines.map((line) => measure(line, FONT[role].size));
}

function Paragraph({ lines, role, block, label }: { lines: string[]; role: Role; block: number; label: string }) {
  const widths = widthsOf(lines, role);
  const spread = Math.max(...widths) - Math.min(...widths);
  const font = FONT[role];
  return (
    <figure className="title-wrap-paragraph">
      <figcaption>{label} · {lines.length} {lines.length === 1 ? 'line' : 'lines'} · spread {Math.round(spread)}px</figcaption>
      <div className="title-wrap-block" style={{ width: block }}>
        {lines.map((line, index) => (
          <div className="title-wrap-line" key={index}>
            <span className="title-wrap-bar" style={{ width: widths[index] }} />
            <span
              className="title-wrap-text"
              style={{ fontSize: font.size, fontWeight: font.weight, fontFamily: font.family }}
            >{line}</span>
            <span className="title-wrap-px">{Math.round(widths[index])}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

function TextComparison({ testCase }: { testCase: TextCase }) {
  const [block, setBlock] = useState(testCase.block);
  const measure = useMemo(() => measureFor(testCase.role), [testCase.role]);
  const size = FONT[testCase.role].size;
  const fill = greedyLines(testCase.text, block, size, measure);
  const before = previousFilledLines(testCase.text, block, size, measure);
  const pulled = pulledLines(testCase.text, block, size, measure);
  const after = filledLines(testCase.text, block, size, measure);
  const same = before.join('\n') === after.join('\n');
  return (
    <article className="title-wrap-case" data-case={testCase.id}>
      <header>
        <h3>{testCase.label} <span className="title-wrap-tag">{testCase.role}</span>{same && <span className="title-wrap-tag is-same">unchanged</span>}</h3>
        <p>{testCase.note}</p>
        <label className="title-wrap-width">
          Block <input type="range" min={160} max={720} value={block} onChange={(event) => setBlock(Number(event.target.value))} />
          <output>{block}px</output>
        </label>
      </header>
      <div className="title-wrap-pair">
        <Paragraph lines={fill} role={testCase.role} block={block} label="Fill alone" />
        <Paragraph lines={before} role={testCase.role} block={block} label="Before: even the last two" />
        <Paragraph lines={pulled} role={testCase.role} block={block} label="Alternative: pull words down (top lines kept full)" />
        <Paragraph lines={after} role={testCase.role} block={block} label="Now: fullest lines, no widow (room shared)" />
      </div>
    </article>
  );
}

const bubbleRows = gapminderRows.filter((row) => row.Year === 2007);

export function bubbleInput(width: number, subtitle: string): ChartAssemblyInput {
  return {
    data: { values: bubbleRows },
    semantic_types: { Country: 'Country', Continent: 'Category', Population: 'Quantity', 'Life expectancy': 'Quantity', 'GDP per capita': 'Quantity' },
    theme_spec: 'economist',
    chart_spec: {
      chartType: 'Scatter Plot',
      title: 'Wealthier countries live longer',
      subtitle,
      encodings: { x: 'GDP per capita', y: 'Life expectancy', size: 'Population', color: 'Continent', detail: 'Country' },
      chartProperties: { logScale_x: true },
      baseSize: { width, height: 360 },
    },
  };
}

export const CHART_WIDTHS = [300, 380, 460];
export const CHART_DECKS = [
  { id: 'snapshot', label: 'Deck as reported', text: SNAPSHOT_DECK },
  { id: 'long', label: 'Longer deck', text: 'GDP per capita in 2007 dollars (log scale) against life expectancy at birth, 142 countries, 2007; bubble size is population, colour is continent' },
];

export function TitleWrapLab() {
  const [deck, setDeck] = useState(CHART_DECKS[0].id);
  const deckText = CHART_DECKS.find((d) => d.id === deck)!.text;
  return (
    <section className="title-wrap-lab">
      <header className="title-wrap-heading">
        <h1>Title wrap</h1>
        <p>How a headline and a deck that overhang their block are broken over lines: <code>filledLines</code> in <code>flint-js/src/core/title-fit.ts</code>.</p>
      </header>

      <section className="title-wrap-rationale">
        <div>
          <h2>Rule</h2>
          <p>
            Fill each line to the block. Where that leaves a widow, a last line under a third of the block, break the same number
            of lines again as full as they can be with no widow. The block keeps its measure; only lines near the end give up room.
          </p>
          <p className="title-wrap-muted">
            One rule for the headline and the deck, from measured word widths and the block width alone. The line count is
            fill&rsquo;s, so the height taken from the plot does not change.
          </p>
        </div>
        <div>
          <h2>How</h2>
          <p>
            A dynamic program over word boundaries: every line but the last is charged the square of the room it leaves on the
            block; no line may pass the block and the last may not be a widow. Squaring spreads the room the last line needs over
            the lines above it rather than emptying one of them.
          </p>
          <p className="title-wrap-muted">
            The established reference is the line-breaking cost TeX uses (Knuth&ndash;Plass). Later preferences, such as keeping
            the parts of a deck Flint assembled whole, join as cost terms rather than branches.
          </p>
        </div>
      </section>

      <section className="title-wrap-approaches">
        <h2>Approaches compared</h2>
        <div className="title-wrap-table">
          <table>
            <thead>
              <tr><th></th><th>Problem it answers</th><th>Goal</th><th>Approach</th><th>Tradeoff</th><th>Review</th></tr>
            </thead>
            <tbody>
              <tr>
                <th>Before: even the last two</th>
                <td>Fill can leave a widow</td>
                <td>No widow</td>
                <td>Fill; on a widow, join the last two lines and split them near halfway, word by word</td>
                <td>From three lines on, one full line over two half lines, split wherever halfway falls</td>
                <td>A patch on fill&rsquo;s output; each new case would be another branch</td>
              </tr>
              <tr>
                <th>Tried: even them all</th>
                <td>The jump the old fix left</td>
                <td>No widow, lines as even as possible</td>
                <td>Fill sets the line count; on a widow, a DP minimises each line&rsquo;s squared distance from the average</td>
                <td>The paragraph turns narrower than the block, and a pixel of width flips it between full and even</td>
                <td>Sound mechanism, wrong goal: it works against fill</td>
              </tr>
              <tr>
                <th>Considered: pull words down</th>
                <td>The narrow paragraph</td>
                <td>No widow, the most full lines</td>
                <td>Fill; on a widow, move words down from the line above, then higher lines, until the last is long enough</td>
                <td>The line above takes the whole shortfall, so with long words it halves and repeats the old shape (see the long deck and the three-line headline); the result is defined by the loop, not an objective</td>
                <td>Local repair; avoiding a bad break would need another rule in the loop</td>
              </tr>
              <tr className="is-chosen">
                <th>Now: fullest lines, no widow</th>
                <td>The same, stated as one objective</td>
                <td>Lines as full as possible, no widow</td>
                <td>Fill sets the line count; on a widow, a DP minimises the squared room left on every line but the last, the last at least a third</td>
                <td>The shortfall is shared over the lines near the end; a trace is needed to explain a break</td>
                <td>One objective with a reference; new preferences are cost terms</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Line breaks, before and after</h2>
        <p className="title-wrap-muted">The grey bar under each line is its measured width; the dashed edge is the block. Each case opens at a width that shows its point.</p>
        {TEXT_CASES.map((testCase) => <TextComparison key={testCase.id} testCase={testCase} />)}
      </section>

      <section>
        <div className="title-wrap-controls">
          <h2>In a chart (after)</h2>
          <label>
            Deck <select value={deck} onChange={(event) => setDeck(event.target.value)}>
              {CHART_DECKS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </label>
        </div>
        <p className="title-wrap-muted">Economist theme. Charts compile with the new rule; the deck is broken to each chart&rsquo;s block.</p>
        <div className="title-wrap-charts">
          {CHART_WIDTHS.map((width) => (
            <figure key={`${deck}-${width}`}>
              <figcaption>{width}px plot</figcaption>
              <ScaleToFit adaptiveHeight height={620} minHeight={200} padding={0}>
                <FlintView spec={bubbleInput(width, deckText)} renderer="svg" />
              </ScaleToFit>
            </figure>
          ))}
        </div>
      </section>
    </section>
  );
}
