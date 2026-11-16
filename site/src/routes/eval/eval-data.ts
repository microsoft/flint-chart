import { useEffect, useState } from 'react';

// Run exports the Eval page reads from site/public/eval/ (gitignored, written by the experiments' export scripts).
export const EVAL_ROOT = `${import.meta.env.BASE_URL}eval/`;

export type Grade = 'good' | 'ok' | 'bad';
export const GRADES: Grade[] = ['good', 'ok', 'bad'];

export interface InteractionRun {
  status: string;
  chartType: string | null;
  interactions: string[];
  spec: Record<string, unknown> | null;
  table: string | null;
  updates: unknown[];
  answer: string | null;
  calls: number;
  grade?: { grade: Grade; tags?: string[]; note?: string } | null;
}

export interface InteractionTask {
  id: string;
  dataset: string;
  family: string;
  ask: string;
  style: string;
  text: string;
  want: string[];
  wantAll?: boolean;
  wantUpdates?: boolean;
  ok: string[];
  note?: string;
  expect?: string;
  form?: string;
  runs: Record<string, InteractionRun>;
}

export interface InteractionPayload {
  arms: string[];
  model: string;
  ranOn: string | null;
  summary: { title?: string; findings: string[] };
  datasets: Record<string, string>;
  tables: Record<string, Record<string, unknown>[]>;
  tasks: InteractionTask[];
}

export interface McpTurn {
  text: string;
  expect: string;
  expectNote: string;
  finalText: string | null;
  file: string | null;
  kind: string | null;
  charts: string[];
  linked: string[] | null;
  theme: string | null;
  shows: { isError: boolean; report: string }[];
  issues: string[];
}

export interface McpRun {
  run: string;
  model: string;
  rep: number;
  task: string;
  category: string;
  dataset: string;
  status: string;
  seconds: number;
  modelCalls: number;
  tokens: number;
  outputTokens: number;
  tools: string[];
  turns: McpTurn[];
}

export interface McpPayload {
  arm: string;
  ranOn: string | null;
  /** Repeats whose cards were exported; every run is in `runs`. */
  cardReps: number[];
  runs: McpRun[];
}

type Loaded<T> = { data: T | null; error: string | null };
const cache = new Map<string, Promise<unknown>>();

function load<T>(file: string, rerun: string): Promise<T> {
  if (!cache.has(file)) {
    cache.set(file, fetch(`${EVAL_ROOT}${file}`).then((response) => {
      if (!response.ok) throw new Error(`site/public/eval/${file} is missing. Run ${rerun}.`);
      return response.json();
    }));
  }
  return cache.get(file) as Promise<T>;
}

function useLoaded<T>(file: string, rerun: string): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ data: null, error: null });
  useEffect(() => {
    let live = true;
    load<T>(file, rerun)
      .then((data) => { if (live) setState({ data, error: null }); })
      .catch((error: Error) => {
        cache.delete(file);
        if (live) setState({ data: null, error: error.message });
      });
    return () => { live = false; };
  }, [file, rerun]);
  return state;
}

const INTERACTION_EXPORT = 'python3 experiments/interaction/code/export-page.py';
const MCP_EXPORT = 'python3 experiments/mcp-app/code/export.py';

export const useInteractionEval = () => useLoaded<InteractionPayload>('interactions.json', INTERACTION_EXPORT);
export const useMcpEval = () => useLoaded<McpPayload>('mcp/index.json', MCP_EXPORT);

/** The arm that carries the skill under evaluation: the export lists it first. */
export const currentArm = (data: InteractionPayload) => data.arms[0];

export function gradeCounts(tasks: InteractionTask[], arm: string) {
  const counts: Record<Grade | 'ungraded', number> = { good: 0, ok: 0, bad: 0, ungraded: 0 };
  for (const task of tasks) {
    const run = task.runs[arm];
    if (run) counts[run.grade?.grade ?? 'ungraded']++;
  }
  return counts;
}

export interface McpModelStats {
  model: string;
  runs: number;
  turns: number;
  cleanTurns: number;
  heldShows: number;
  medianSeconds: number;
  meanCalls: number;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export function mcpModelStats(runs: McpRun[]): McpModelStats[] {
  const models = [...new Set(runs.map((run) => run.model))].sort();
  return models.map((model) => {
    const mine = runs.filter((run) => run.model === model);
    const turns = mine.flatMap((run) => run.turns);
    return {
      model,
      runs: mine.length,
      turns: turns.length,
      cleanTurns: turns.filter((turn) => turn.issues.length === 0).length,
      heldShows: turns.reduce((sum, turn) => sum + turn.shows.filter((show) => show.isError).length, 0),
      medianSeconds: median(mine.map((run) => run.seconds)),
      meanCalls: mine.reduce((sum, run) => sum + run.modelCalls, 0) / mine.length,
    };
  });
}

export const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '–');
