import { useCallback, useState } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import type { ChartChange, InteractionDef } from 'flint-chart/interactive';
import worldCup from '../data/world-cup-2026.json';
import { InteractionDemoChart } from './InteractionDemoChart';
import type { InteractionDemoFixture } from './interaction-demo-data';

type Scorer = (typeof worldCup.scorers)[number];

const TEAM_COUNT = 16;
const TOP_SCORERS = 10;

const TEAMS = worldCup.teams.slice(0, TEAM_COUNT);

/** The scorers of one team, or the tournament's top scorers when no team is pinned. */
function scorersOf(team: string | null): Scorer[] {
  return team ? worldCup.scorers.filter((scorer) => scorer.team === team) : worldCup.scorers.slice(0, TOP_SCORERS);
}

/** Standard competition ranks: tied scorers share a rank, and the next rank skips past them. */
function ranksOf(scorers: Scorer[]): number[] {
  return scorers.map((scorer) => scorers.findIndex((other) => other.goals === scorer.goals) + 1);
}

const TEAMS_FIXTURE: InteractionDemoFixture = {
  id: 'world-cup-teams',
  title: 'Goals by team',
  source: worldCup.source,
  input: {
    data: { values: TEAMS.map((team) => ({ Team: team.team, Goals: team.goals })) },
    semantic_types: { Team: 'Category', Goals: 'Count' },
    chart_spec: {
      chartType: 'Bar Chart',
      title: 'Goals by team',
      subtitle: `2026 World Cup, top ${TEAM_COUNT} teams, own goals left out`,
      encodings: { x: 'Goals', y: { field: 'Team', sortBy: 'x', sortOrder: 'descending' } },
      baseSize: { width: 400, height: 440 },
    },
    interaction_spec: { interactions: [{ type: 'click-highlight', id: 'team', options: { targets: ['mark'] } }] },
  } as ChartAssemblyInput,
};

const NO_INTERACTIONS: readonly InteractionDef[] = [];

/** The team a click pinned: the value of the first retained mark. */
function pinnedTeam(change: ChartChange): string | null {
  const retained = [...(change.state.entries?.values() ?? [])].filter((entry) => entry.layer === 'retained');
  const team = retained.flatMap((entry) => entry.elements)[0]?.value.Team;
  return team === undefined ? null : String(team);
}

export function WorldCupScorersDemo() {
  const [team, setTeam] = useState<string | null>(null);
  const handleChange = useCallback((change: ChartChange) => setTeam(pinnedTeam(change)), []);
  const scorers = scorersOf(team);
  const ranks = ranksOf(scorers);
  const total = TEAMS.find((entry) => entry.team === team)?.goals;

  return (
    <article className="it-example">
      <header className="it-example-header">
        <div>
          <h2>World Cup scorers</h2>
          <p>Click a team to list its scorers; click the background or press Escape to go back to the top scorers.</p>
        </div>
      </header>
      <div className="it-workspace it-workspace-outbound">
        <section className="it-chart-panel">
          <InteractionDemoChart fixture={TEAMS_FIXTURE} interactions={NO_INTERACTIONS} chartId="world-cup-teams" onChange={handleChange} />
        </section>
        <section className="it-detail-panel" aria-live="polite">
          <div className="it-detail-body">
            <div className="it-detail-heading">{team ?? `Top ${TOP_SCORERS} scorers`}</div>
            <p className="it-detail-note">{team ? `${total} goals from ${scorers.length} players` : '2026 World Cup, all teams'}</p>
            <ol className="it-scorer-list">
              {scorers.map((scorer, index) => (
                <li key={`${scorer.player}-${scorer.team}`}>
                  <span className="it-scorer-rank">{ranks[index]}</span>
                  <span className="it-scorer-name">
                    {scorer.player}
                    {(!team || scorer.penalties > 0) && (
                      <small>{[!team && scorer.team, scorer.penalties > 0 && `${scorer.penalties} from penalties`].filter(Boolean).join(' · ')}</small>
                    )}
                  </span>
                  <span className="it-scorer-goals">{scorer.goals}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </div>
    </article>
  );
}
