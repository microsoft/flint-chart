import type { ChartAssemblyInput } from 'flint-chart';
import { OMNI_VIZ_GAME_ORDER, OMNI_VIZ_ROWS } from 'flint-chart/test-data';
import { FlintView } from '../components/FlintView';
import './color-lab.css';

const GAMES = OMNI_VIZ_GAME_ORDER.slice(0, 8) as readonly string[];
export const ROWS = OMNI_VIZ_ROWS
  .filter((r) => GAMES.includes(r.game))
  .map(({ period, game, gameType, newUsers }) => ({ period, game, gameType, newUsers }));

export type Case = Omit<ChartAssemblyInput, 'data'>;

const heatmap = (color: Record<string, unknown> = {}, extra: Partial<Case> = {}, newUsers: unknown = 'Profit'): Case => ({
  semantic_types: { period: 'YearMonth', game: 'Category', newUsers } as Case['semantic_types'],
  chart_spec: {
    chartType: 'Heatmap',
    encodings: { x: 'period', y: 'game', color: { field: 'newUsers', aggregate: 'sum', ...color } },
  },
  ...extra,
});

export const CASES: Case[] = [
  heatmap(),
  heatmap({}, { theme_spec: 'economist' }),
  heatmap({ scheme: 'viridis' }),
  heatmap({ scheme: ['#c0392b', '#f7f7f7', '#2e75b6'] }),
  heatmap({ scheme: ['#c0392b', '#f7f7f7', '#2e75b6'], bins: 4 }),
  heatmap({ bins: 7 }, { theme_spec: 'economist' }),
  heatmap({ bins: 0 }, { theme_spec: 'economist' }),
  heatmap({ reverse: true }),
  heatmap({ mid: 10000 }),
  heatmap({ domain: [-100000, 100000] }),
  heatmap({}, { theme_spec: 'economist' }, { semanticType: 'Profit', polarity: 'lower-is-better' }),
  {
    semantic_types: { gameType: 'Category', newUsers: 'Quantity' },
    chart_spec: {
      chartType: 'Bar Chart',
      encodings: {
        x: 'gameType',
        y: { field: 'newUsers', aggregate: 'sum' },
        color: { field: 'gameType', colors: { Console: '#2a9d8f', 'Mobile Casual': '#e76f51' } },
      },
    },
  },
];

/** One-line JSON with spaces: `{ "a": [1, 2] }`. */
function inline(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(inline).join(', ')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return entries.length ? `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`).join(', ')} }` : '{}';
  }
  return JSON.stringify(value);
}

/** JSON with what fits kept on one line. */
function compact(value: unknown, indent = 0, width = 50, lead = 0): string {
  const one = inline(value);
  if (one.length + indent + lead <= width || typeof value !== 'object' || value === null) return one;
  const pad = ' '.repeat(indent);
  const inner = ' '.repeat(indent + 2);
  if (Array.isArray(value)) {
    return `[\n${value.map((v) => inner + compact(v, indent + 2, width)).join(',\n')}\n${pad}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${compact(v, indent + 2, width, k.length + 4)}`).join(',\n')}\n${pad}}`;
}

export function ColorLab() {
  return (
    <div className="dev-page color-lab">
      <header className="dev-page-heading">
        <h1>Color</h1>
      </header>
      {CASES.map((input, i) => (
        <section key={i} className="color-lab-row">
          <pre className="color-lab-code">{compact(input)}</pre>
          <div className="color-lab-chart">
            <FlintView spec={{ ...input, data: { values: ROWS } } as ChartAssemblyInput} renderer="svg" />
          </div>
        </section>
      ))}
    </div>
  );
}
