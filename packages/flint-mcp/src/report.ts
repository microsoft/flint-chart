// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ChartLink } from 'flint-chart';
import { boardColumns, boardRows, gridLines, layoutLines } from './board-layout.js';
import { boardReview, type Board, type ChartOutcome } from './board.js';
import { isKpi } from './board-layout.js';

/**
 * What validate_chart, validate_board and show tell the model about a spec: only what it should act
 * on or tell the user. The spec itself is not repeated; the drawn card's context reports what is on screen.
 */

/** What the model reads once a chart or board is on screen. */
export function shownText(board: Pick<Board, 'kind'>): string {
  return `The ${board.kind === 'chart' ? 'chart' : 'board'} is on screen in a new card. What the reader does on it reaches you with their next message. ` +
    'To change it, change the spec and call show again: a new card shows it, and earlier cards stay as they were.';
}

const TO_FIX = 'Nothing is on screen: fix what this report lists, then call show with the whole spec.';
const CLEAN = 'Nothing to fix: call show with this spec.';
/** The head of a report held back by show: the card says it is being revised, and the model gets the fixes. */
export const HELD = 'Not drawn yet: fix what this report lists, then call show again with the whole spec.';
const FIX_HEAD = 'Fix before it draws:';
const NOTED_HEAD = 'Noted (the card draws with these; change nothing now unless the user asks, and mention what matters in your reply):';

/** What a report says, split: what keeps a chart or board from being drawn, and what it draws with. */
export interface ReportBody {
  fix: string[];
  noted: string[];
}

/** The findings of a chart or board, split into what holds it back and what it draws with. */
export function reportBody(board: Board, outcomes: readonly ChartOutcome[], notes: readonly string[] = []): ReportBody {
  if (board.kind === 'chart') {
    const findings = outcomes.flatMap((outcome) => outcome.findings);
    return {
      fix: findings.filter(isError).map(bullet),
      noted: [...notes, ...findings.filter((finding) => !isError(finding))].map(bullet),
    };
  }
  return boardBody(board, outcomes, notes);
}

/** A chart or board as the model reads it after validate_chart, validate_board or show. */
export function viewReport(board: Board, outcomes: readonly ChartOutcome[], notes: readonly string[] = [], shown: 'shown' | 'held' | false = false): string {
  const { fix, noted } = reportBody(board, outcomes, notes);
  const next = shown === 'shown' ? shownText(board) : shown === 'held' ? HELD : fix.length > 0 ? TO_FIX : CLEAN;
  // A chart that draws needs no "noted" heading for one or two warnings; a board groups them.
  const sections = [
    ...(fix.length > 0 ? [FIX_HEAD, ...fix] : []),
    ...(noted.length > 0 ? [NOTED_HEAD, ...noted] : []),
  ];
  if (board.kind === 'chart') return [next, ...sections].join('\n');
  const head = `Board${board.title ? ` "${board.title}"` : ''}: ${board.charts.length} chart${board.charts.length === 1 ? '' : 's'} (${board.charts.map((chart) => chart.id).join(', ') || 'none'}).`;
  return [head, next, ...(board.charts.length > 0 ? [layoutLine(board)] : []), ...(sections.length > 0 ? ['', ...sections] : [])].join('\n');
}

function isError(finding: string): boolean {
  return finding.startsWith('✗');
}

/** Findings that several charts share, said once under all their ids. */
function grouped(outcomes: readonly ChartOutcome[], keep: (finding: string) => boolean): string[] {
  const charts = new Map<string, string[]>();
  for (const outcome of outcomes) {
    for (const finding of outcome.findings.filter(keep)) charts.set(finding, [...(charts.get(finding) ?? []), outcome.id]);
  }
  const groups = new Map<string, string[]>();
  for (const [finding, ids] of charts) groups.set(ids.join(', '), [...(groups.get(ids.join(', ')) ?? []), finding]);
  return [...groups].flatMap(([ids, findings]) => [`${ids}:`, ...findings.map(bullet)]);
}

/** The board's findings: each chart's, a finding several charts share said once, then links and review. */
function boardBody(board: Board, outcomes: readonly ChartOutcome[], notes: readonly string[]): ReportBody {
  const links = linkFindings(board);
  const review = boardReview(board);
  const fields = board.link_spec?.fields.join(', ');
  return {
    fix: [
      ...grouped(outcomes, isError),
      ...(links.fix.length > 0 ? [`Links (${fields}):`, ...links.fix.map(bullet)] : []),
      ...(review.fix.length > 0 ? ['Review:', ...review.fix.map(bullet)] : []),
    ],
    noted: [
      ...notes.map(bullet),
      ...grouped(outcomes, (finding) => !isError(finding)),
      ...(links.noted.length > 0 ? [`Link notes (${fields}); change nothing unless the user asked for that connection:`, ...links.noted.map(bullet)] : []),
      ...(review.noted.length > 0 ? ['Review:', ...review.noted.map(bullet)] : []),
    ],
  };
}

function bullet(text: string): string {
  return `- ${text}`;
}

/** The board's layout in one line: its rows as the card draws them, or the reader's grid. */
function layoutLine(board: Board): string {
  if (board.grid) return `Layout: the reader's grid; keep passing it, or leave it out for rows. ${gridLines(board.grid).map(unbullet).join('; ')}.`;
  const charts = board.charts.map((chart) => ({ id: chart.id, chartType: chart.input.chart_spec.chartType, layout: chart.layout }));
  return `Layout: ${layoutLines(boardRows(charts, boardColumns(charts, board.columns))).map(unbullet).join('; ')}.`;
}

function unbullet(line: string): string {
  return line.replace(/^- /, '');
}

function isUnlinked(link: ChartLink): boolean {
  return link.sends.length === 0 && link.receives.length === 0;
}

/**
 * What the link leaves out. To fix: a chart whose data has a linked field its marks do not carry, an
 * unknown chart id, a field fewer than two charts carry (it joins nothing). Noted: what linked charts
 * leave out. Silent: a chart taken out of the link (send and receive false), and a KPI tile that has
 * none of the fields.
 */
function linkFindings(board: Board): ReportBody {
  const fix: string[] = [];
  const noted: string[] = [];
  if (!board.link_spec || !board.linked) return { fix, noted };
  const roles = board.link_spec.charts ?? {};
  const types = new Map(board.charts.map((chart) => [chart.id, chart.input.chart_spec.chartType]));
  for (const [id, link] of Object.entries(board.linked)) {
    if (roles[id]?.send === false && roles[id]?.receive === false) continue;
    if (isUnlinked(link)) {
      const fixable = link.notes.some((note) => note.includes('its marks do not carry') || note.startsWith('no chart "'));
      if (fixable) fix.push(`✗ ${id}: not linked; ${link.notes.join('; ')}`);
      else if (!isKpi(types.get(id) ?? '')) noted.push(`${id}: not linked; ${link.notes.join('; ')}`);
    } else if (link.notes.length > 0) {
      noted.push(`${id}: ${link.notes.join('; ')}`);
    }
  }
  for (const field of board.link_spec.fields) {
    const carriers = board.charts.map((chart) => chart.id)
      .filter((id) => board.linked![id] && !board.linked![id].notes.some((note) => note.startsWith(`leaves out ${field}:`)));
    // A chart told to carry the field already says how to join it.
    if (carriers.length < 2 && !fix.some((line) => line.includes(`its marks do not carry ${field};`))) {
      fix.push(`✗ ${field} joins nothing: ${carriers.length === 0 ? 'no chart carries it' : `only ${carriers[0]} carries it`}; drop it from link_spec.fields, or encode it on another chart.`);
    }
  }
  return { fix, noted };
}
