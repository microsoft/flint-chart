import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Check, Plus, Scan, Send, Square, X } from 'lucide-react';
import type {
  ChartUpdateOp,
  FlintInteractionEventDetail,
  InteractionContext,
  InteractionDef,
  InteractiveChartSurface,
  SemanticElement,
  SemanticTarget,
} from 'flint-chart/interactive';
import { externalInteraction } from 'flint-chart/interactive';
import type { InteractionDemoFixture } from './interaction-demo-data';
import {
  ANSWER_RULES,
  OPS,
  abilitiesText,
  agentChartOf,
  answerSchema,
  availablePresets,
  chartRows,
  extractParts,
  levelOf,
  numeric,
  opClass,
  overlap,
  paragraphsText,
  parseParts,
  presetCatalog,
  presetOf,
  recordsOf,
  rowId,
  rowsInView,
  rowsOf,
  selectionSentence,
  sentenceRows,
  sentencesOf,
  toParagraphs,
  type AgentChart,
  type ChartRows,
  type Domain,
  type Message,
  type Paragraph,
  type Preset,
  type PresetOption,
  type Row,
  type RowSet,
  type SectionSpec,
  type Sentence,
} from './interactive-data-report-model';
import {
  DEFAULT_OPENAI_BASE_URL,
  DEFAULT_OPENAI_MODEL,
  streamChatCompletion,
  type ChatMessage,
  type OpenAIConnection,
} from './openai-chat-client';

/*
 * The building blocks every section is made of:
 *   - `useReportChart`, the one binding engine between a chart and its sentences;
 *   - `ReportSentence` and `ReportParagraph`, the one way a bound sentence is rendered;
 *   - `useAgentChat` and `AgentPanel`, a chat whose answers are paragraphs of sentences.
 * A section is one chart, one engine, and one or more text renderers on top.
 */

/* ======================================================================================
 * The binding engine
 * ====================================================================================== */

/*
 * Retained update layers on the chart:
 *   - the presets' own updates, keyed by their ids;
 *   - `report-pin`, the sentence the reader pinned (or the slide on show);
 *   - `report-preview`, the sentence under the pointer, cleared on leave.
 * A probe interaction reads the chart's InteractionContext back. The chart state and each
 * sentence both reduce to data rows, and a sentence lights up by the share of rows in common.
 */
const PREVIEW_ID = 'report-preview';
const PIN_ID = 'report-pin';
const PROBE_ID = 'report-probe';
const READ_GUARD = { minVisibleFraction: 0.02, maxVisibleFraction: 1, overscrollFraction: 0 };

interface Viewport {
  x?: Domain;
  y?: Domain;
}

interface ChartSnapshot {
  selected: readonly SemanticElement[];
  viewport?: Viewport;
}

interface ProbePayload {
  receive: (context: InteractionContext) => void;
}

function toDomain(value: readonly [unknown, unknown] | undefined): Domain | undefined {
  if (!value) return undefined;
  const [start, end] = value.map((bound) => Number(numeric(bound)));
  return Number.isFinite(start) && Number.isFinite(end) ? [Math.min(start, end), Math.max(start, end)] : undefined;
}

function snapshotOf(context: InteractionContext): ChartSnapshot {
  const navigation = context.resolveNavigation?.(
    { phase: 'commit', operation: 'pan', axes: 'xy', delta: { x: 0, y: 0 } },
    READ_GUARD,
  );
  const viewportRange = navigation
    ? { x: toDomain(navigation.value.x), y: toDomain(navigation.value.y) }
    : undefined;
  return {
    selected: [...context.selected],
    viewport: viewportRange && (viewportRange.x || viewportRange.y) ? viewportRange : undefined,
  };
}

export interface ReportChart {
  /** Spread onto an `InteractionDemoChart`. */
  chartProps: {
    fixture: InteractionDemoFixture;
    interactions: InteractionDef[];
    chartId: string;
    onSurface: (surface: InteractiveChartSurface | null) => void;
    onSemanticEvent: (detail: FlintInteractionEventDetail) => void;
  };
  rows: ChartRows;
  ready: boolean;
  hoveredId: string | null;
  pinnedId: string | null;
  /** Sentence -> chart, preview layer: on while the pointer is on the sentence. */
  preview: (id: string) => void;
  endPreview: (id: string) => void;
  /** Sentence -> chart, pin layer. A pin replaces the chart's own state; pinning again unpins. */
  pin: (item: Sentence) => Promise<void>;
  /** Shows exactly one sentence, or none, in a single render: what a slide does. */
  show: (item: Sentence | null) => Promise<void>;
  unpin: () => Promise<void>;
  /** Drops the pin and the presets' own state. */
  clear: () => void;
  /** Chart -> sentence: the underline classes for a sentence. */
  classFor: (item: Sentence) => string;
  /** The records the chart points at right now: what leaves the chart. */
  selected: Row[];
}

/**
 * Binds one chart to a list of sentences. The list may grow while the chart is mounted:
 * the event handler reads it through a ref, so the chart is built once per section.
 */
export function useReportChart(
  spec: SectionSpec,
  sentences: readonly Sentence[],
  onJump?: (item: Sentence) => void,
): ReportChart {
  const surfaceRef = useRef<InteractiveChartSurface | null>(null);
  const previewTimer = useRef<number | undefined>(undefined);
  const pinnedRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ChartSnapshot | null>(null);
  const [annotated, setAnnotated] = useState<SemanticTarget | null>(null);
  const [hoverTarget, setHoverTarget] = useState<SemanticTarget | null>(null);

  const rows = useMemo(() => chartRows(spec.fixture.input), [spec.fixture]);
  const byId = useMemo(() => new Map(sentences.map((item) => [item.id, item])), [sentences]);
  // The rows each sentence points at, fixed for the life of the sentence.
  const rowsBySentence = useMemo(() => new Map(sentences.map((item) => [item.id, sentenceRows(item, rows)])), [rows, sentences]);
  const presetOps = useMemo(() => new Map(spec.presets.map((entry) => [entry.def.id, entry.op])), [spec.presets]);

  const latest = useRef({ rows, sentences, rowsBySentence, presetOps, onJump });
  latest.current = { rows, sentences, rowsBySentence, presetOps, onJump };

  const interactions = useMemo<InteractionDef[]>(() => [
    ...spec.presets.map((entry) => entry.def),
    externalInteraction<ProbePayload>({
      id: PROBE_ID,
      handle: (payload, context) => {
        payload.receive(context);
        return null;
      },
    }),
  ], [spec.presets]);

  const probe = useCallback(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    void surface.dispatch(PROBE_ID, {
      receive: (context: InteractionContext) => setSnapshot(snapshotOf(context)),
    } satisfies ProbePayload).catch(() => undefined);
  }, []);

  // The runtime applies a preset's update after it emits the event, so read back twice.
  const probeSoon = useCallback(() => {
    window.setTimeout(probe, 40);
    window.setTimeout(probe, 240);
  }, [probe]);

  const probeThrottled = useCallback(() => {
    if (previewTimer.current !== undefined) return;
    previewTimer.current = window.setTimeout(() => {
      previewTimer.current = undefined;
      probe();
    }, 120);
  }, [probe]);

  useEffect(() => () => {
    if (previewTimer.current !== undefined) window.clearTimeout(previewTimer.current);
  }, []);

  const onSurface = useCallback((surface: InteractiveChartSurface | null) => {
    surfaceRef.current = surface;
    setReady(false);
    if (surface) {
      void surface.ready.then(() => {
        setReady(true);
        probeSoon();
      }).catch(() => undefined);
    }
  }, [probeSoon]);

  const setPinned = useCallback((id: string | null) => {
    pinnedRef.current = id;
    setPinnedId(id);
  }, []);

  const unpin = useCallback(async () => {
    setPinned(null);
    await surfaceRef.current?.clearUpdate(PIN_ID);
    probeSoon();
  }, [probeSoon, setPinned]);

  // One setUpdates call replaces every retained layer in a single render: the chart's own
  // state goes and the sentence lands, so a CSS transition runs straight from one to the other.
  const show = useCallback(async (item: Sentence | null) => {
    const surface = surfaceRef.current;
    if (!surface) return;
    setAnnotated(null);
    if (!item) {
      setPinned(null);
      await surface.setUpdates([]);
    } else {
      await surface.setUpdates([{ id: PIN_ID, ops: item.ops }]);
      setPinned(item.id);
    }
    probeSoon();
  }, [probeSoon, setPinned]);

  const pin = useCallback(async (item: Sentence) => {
    if (pinnedRef.current === item.id) await unpin();
    else await show(item);
  }, [show, unpin]);

  const clear = useCallback(() => {
    void unpin();
    const surface = surfaceRef.current;
    if (!surface) return;
    for (const entry of spec.presets) void surface.clearUpdate(entry.def.id);
    setAnnotated(null);
    probeSoon();
  }, [probeSoon, spec.presets, unpin]);

  // Sentence -> chart, preview layer.
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const item = hoveredId ? byId.get(hoveredId) : undefined;
    if (!item) {
      // The preview emphasizes rows, so the chart counts them as its own state while it is
      // up. Read the chart back once the layer goes, or the last reading stays polluted.
      void surface.clearUpdate(PREVIEW_ID).then(probeSoon);
      return;
    }
    void surface.applyUpdate({ id: PREVIEW_ID, ops: item.ops });
  }, [byId, hoveredId, probeSoon]);

  const preview = useCallback((id: string) => setHoveredId(id), []);
  const endPreview = useCallback((id: string) => setHoveredId((current) => (current === id ? null : current)), []);

  // Chart -> sentences.
  const onSemanticEvent = useCallback((detail: FlintInteractionEventDetail) => {
    const { event, interactionId } = detail;
    const { rows: chart, sentences: items, rowsBySentence: rowsBy, presetOps: ops, onJump: jump } = latest.current;
    const op = ops.get(interactionId);
    if (event.phase === 'preview' || event.phase === 'start') {
      if (event.target !== undefined) setHoverTarget(event.target);
      if (op === 'set-viewport') probeThrottled();
      return;
    }
    if (event.phase === 'cancel') {
      setHoverTarget(null);
      return;
    }
    setHoverTarget(null);
    const target = event.target ?? null;
    const levelFor = (item: Sentence, elements: readonly SemanticElement[]) =>
      levelOf(overlap(rowsBy.get(item.id) ?? new Set<string>(), rowsOf(elements, chart)));
    if (event.action.startsWith('double-activate-') && target) {
      const best = items.find((item) => levelFor(item, target.elements) === 'full')
        ?? items.find((item) => levelFor(item, target.elements) === 'partial');
      if (best) {
        void pin(best);
        jump?.(best);
        return;
      }
    }
    // The reader's own hand owns the chart, so a gesture drops the pin. The sentence stays
    // lit when the gesture points at its rows, by the same overlap as any other state.
    if (op && pinnedRef.current) void unpin();
    if (op === 'set-annotation') setAnnotated(target);
    probeSoon();
  }, [pin, probeSoon, probeThrottled, unpin]);

  // The rows the chart points at, per slice of its state. A sentence compares with the slices its ops speak about.
  const stateRowsByOp = useMemo<Partial<Record<ChartUpdateOp['op'], RowSet>>>(() => ({
    'set-style': rowsOf(snapshot?.selected ?? [], rows),
    'set-annotation': rowsOf(annotated?.elements ?? [], rows),
    'set-viewport': new Set(snapshot?.viewport ? rowsInView(rows, snapshot.viewport).map(rowId) : []),
  }), [annotated, rows, snapshot]);
  const hoverRows = useMemo(() => (hoverTarget ? rowsOf(hoverTarget.elements, rows) : null), [hoverTarget, rows]);
  const selected = useMemo(() => recordsOf(snapshot?.selected ?? [], rows), [rows, snapshot]);

  // A sentence compares with the slices of the chart state its ops speak about.
  const classFor = useCallback((item: Sentence): string => {
    const classes = ['idr-fragment'];
    const own = rowsBySentence.get(item.id) ?? sentenceRows(item, rows);
    const state = new Set<string>();
    for (const op of item.ops) for (const id of stateRowsByOp[op.op] ?? []) state.add(id);
    const level = levelOf(overlap(own, state));
    if (pinnedId === item.id || level === 'full') classes.push('is-active');
    else if (level === 'partial') classes.push('is-related');
    const hovered = hoverRows ? levelOf(overlap(own, hoverRows)) : null;
    if (hoveredId === item.id || hovered === 'full') classes.push('is-preview');
    else if (hovered === 'partial') classes.push('is-preview-related');
    return classes.join(' ');
  }, [hoverRows, hoveredId, pinnedId, rows, rowsBySentence, stateRowsByOp]);

  return {
    chartProps: { fixture: spec.fixture, interactions, chartId: `report-${spec.id}`, onSurface, onSemanticEvent },
    rows,
    ready,
    hoveredId,
    pinnedId,
    preview,
    endPreview,
    pin,
    show,
    unpin,
    clear,
    classFor,
    selected,
  };
}

/* ======================================================================================
 * Rendering sentences
 * ====================================================================================== */

/** The element id of a sentence on the page, for jumps and pins from the chart. */
export const sentenceElementId = (sectionId: string, item: Sentence): string => `${sectionId}-${item.id}`;

interface ReportSentenceProps {
  sentence: Sentence;
  report: ReportChart;
  sectionId: string;
  /** Rendered right after the sentence, for example a button that saves it. */
  action?: ReactNode;
}

/** One bound sentence: hover to preview, click to pin, lit by the chart state. */
export function ReportSentence({ sentence: item, report, sectionId, action }: ReportSentenceProps) {
  return (
    <>
      <span
        id={sentenceElementId(sectionId, item)}
        role="button"
        tabIndex={0}
        className={report.classFor(item)}
        aria-pressed={report.pinnedId === item.id}
        onMouseEnter={() => report.preview(item.id)}
        onMouseLeave={() => report.endPreview(item.id)}
        onFocus={() => report.preview(item.id)}
        onBlur={() => report.endPreview(item.id)}
        onClick={() => void report.pin(item)}
        onKeyDown={(keyboardEvent) => {
          if (keyboardEvent.key !== 'Enter' && keyboardEvent.key !== ' ') return;
          keyboardEvent.preventDefault();
          void report.pin(item);
        }}
      >
        {item.text}
      </span>
      {action}
    </>
  );
}

function sentenceOpsTitle(item: Sentence): string {
  return [...new Set(item.ops.map((op) => OPS[op.op === 'set-viewport' || op.op === 'set-order' || op.op === 'set-annotation' ? op.op : 'set-style'].title))].join(' + ');
}

interface ReportParagraphProps {
  parts: Paragraph;
  report: ReportChart;
  sectionId: string;
  actionFor?: (item: Sentence) => ReactNode;
}

/** A paragraph of plain text and bound sentences. */
export function ReportParagraph({ parts, report, sectionId, actionFor }: ReportParagraphProps) {
  return (
    <p>
      {parts.map((part, index) => (typeof part === 'string'
        ? <span key={index}>{part}</span>
        : <ReportSentence key={part.id} sentence={part} report={report} sectionId={sectionId} action={actionFor?.(part)} />))}
    </p>
  );
}

/** A mounted interaction, as a chip; with `onRemove`, the chip has a cross that unmounts it. */
export function PresetChip({ preset: entry, size = 13, onRemove }: { preset: Preset; size?: number; onRemove?: () => void }) {
  const Icon = entry.icon;
  return (
    <span className={`idr-chip-interaction ${opClass(entry.op)}${onRemove ? ' is-editable' : ''}`} title={`${entry.def.id} · ${OPS[entry.op].title}`}>
      <Icon size={size} strokeWidth={1.8} aria-hidden="true" />
      <span>{entry.label}</span>
      {onRemove && (
        <button type="button" className="idr-chip-remove" onClick={onRemove} aria-label={`Remove ${entry.label}`} title="Remove this interaction">
          <X size={10} aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

/* ---------- editable presets ---------- */

export interface EditablePresets {
  presets: Preset[];
  /** The options that can still be mounted without a gesture conflict. */
  options: PresetOption[];
  add: (id: string) => void;
  remove: (id: string) => void;
}

/** The presets of a section as state: it starts from the spec, and the reader edits it. */
export function usePresets(spec: SectionSpec): EditablePresets {
  const catalog = useMemo(() => presetCatalog(spec.fixture), [spec.fixture]);
  const [presets, setPresets] = useState<Preset[]>(spec.presets);
  const options = useMemo(() => availablePresets(catalog, presets), [catalog, presets]);
  const add = useCallback((id: string) => {
    const option = catalog.find((candidate) => candidate.id === id);
    if (option) setPresets((current) => (current.some((entry) => entry.def.id === id) ? current : [...current, presetOf(option)]));
  }, [catalog]);
  const remove = useCallback((id: string) => setPresets((current) => current.filter((entry) => entry.def.id !== id)), []);
  return { presets, options, add, remove };
}

/** The chips of the mounted presets, each with a cross, and a menu that adds one more. */
export function PresetEditor({ editable, label = 'Interactions on this chart' }: { editable: EditablePresets; label?: string }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLLIElement>(null);

  // A click outside or Escape closes the menu.
  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const none = editable.options.length === 0;
  return (
    <ul className="idr-preset-list" aria-label={label}>
      {editable.presets.map((entry) => (
        <li key={entry.def.id}><PresetChip preset={entry} onRemove={() => editable.remove(entry.def.id)} /></li>
      ))}
      <li className="idr-preset-add" ref={menuRef}>
        <button
          type="button"
          className={`idr-preset-add-toggle${open ? ' is-open' : ''}`}
          onClick={() => setOpen((current) => !current)}
          disabled={none}
          aria-haspopup="menu"
          aria-expanded={open}
          title={none ? 'Every interaction that fits this chart is mounted, or would conflict with one' : 'Add an interaction'}
        >
          <Plus size={11} strokeWidth={2.2} aria-hidden="true" /> Add
        </button>
        {open && (
          <div className="idr-preset-menu" role="menu" aria-label="Interactions to add">
            {editable.options.map((option) => {
              const Icon = option.icon;
              return (
                <button key={option.id} type="button" role="menuitem" onClick={() => { editable.add(option.id); setOpen(false); }}>
                  <Icon size={13} strokeWidth={1.8} aria-hidden="true" className={`idr-preset-menu-icon ${opClass(option.op)}`} />
                  <span>{option.label}</span>
                  <span className="idr-preset-menu-kind">{OPS[option.op].title}</span>
                </button>
              );
            })}
          </div>
        )}
      </li>
    </ul>
  );
}

/* ======================================================================================
 * The agent
 * ====================================================================================== */

/** The model configuration lives in site/.env.local; see site/.env.example. */
export function envConnection(): OpenAIConnection {
  const env = import.meta.env;
  return {
    apiKey: env.VITE_OPENAI_API_KEY?.trim() ?? '',
    model: env.VITE_OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
    baseUrl: env.VITE_OPENAI_BASE_URL?.trim() || DEFAULT_OPENAI_BASE_URL,
  };
}

export const CONNECTION = envConnection();

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

const SYSTEM_PROMPT = [
  'You are a data analyst embedded next to an interactive chart.',
  'The user selects marks on the chart with a gesture. Every question arrives with a description of the chart, the selected records, and the other records for comparison.',
  'Treat the selection as the subject of the question unless the user says otherwise. Use concrete numbers from the attached data and never invent values that are not in it.',
  ...ANSWER_RULES,
].join(' ');

function chartDescription(spec: SectionSpec, chart: AgentChart): string[] {
  const input = spec.fixture.input;
  const chartSpec = input.chart_spec as { title?: string; chartType: string; encodings: Record<string, unknown> };
  const types = (input.semantic_types ?? {}) as Record<string, string>;
  return [
    `Chart: "${chartSpec.title ?? spec.fixture.title}" (${chartSpec.chartType}). Source: ${spec.fixture.source}.`,
    `Encodings: ${Object.entries(chartSpec.encodings).map(([channel, field]) => `${channel} = ${String(field)}`).join(', ')}.`,
    `Fields: ${Object.entries(types).map(([field, type]) => `${field} (${type})`).join(', ')}.`,
    `Update abilities on this chart: ${abilitiesText(chart)}. Other ops are unsupported here.`,
  ];
}

/** Everything the model gets with a question: the chart, the selection, and the other rows. */
function contextText(spec: SectionSpec, chart: AgentChart, selected: readonly Row[]): string {
  const selectedIds = new Set(selected.map(rowId));
  const rest = chart.rows.filter((row) => !selectedIds.has(rowId(row)));
  const lines = chartDescription(spec, chart);
  lines.push(`The chart shows ${chart.rows.length} records.`);
  if (selected.length > 0) {
    lines.push(`The user selected ${selected.length} of them.`, 'Selected records (JSON):', JSON.stringify(selected));
    if (rest.length > 0) lines.push('The other records, for comparison (JSON):', JSON.stringify(rest));
  } else {
    lines.push('The user has not selected anything, so the question is about the whole chart.', 'All records (JSON):', JSON.stringify(chart.rows));
  }
  return lines.join('\n');
}

/**
 * A message in the chat. What the reader sees is the paragraphs, on both sides; a question
 * ends with a sentence for the selection that went with it, when there was one.
 */
export interface ChatTurn extends Message {
  id: string;
  /** Plain text of the paragraphs, as kept in the API history. */
  text: string;
  /** The full user message as sent to the API, including the data context. */
  apiContent?: string;
  pending?: boolean;
  error?: string;
}

let turnCounter = 0;
const nextTurnId = (): string => {
  turnCounter += 1;
  return `turn-${turnCounter}`;
};

export interface AgentChat {
  turns: ChatTurn[];
  /** Every bound sentence in the chat, for the chart to match against. */
  sentences: Sentence[];
  chart: AgentChart;
  ask: (question: string) => Promise<void>;
  stop: () => void;
  busy: boolean;
  draft: string;
  setDraft: (draft: string) => void;
  hasKey: boolean;
}

interface AgentChatOptions {
  spec: SectionSpec;
  connection: OpenAIConnection;
  /** Messages already in the chat when the section mounts, in order, as context for what follows. */
  opening?: readonly Message[];
  /** The records the chart points at when the question goes out. */
  getSelected: () => Row[];
}

function openingTurns(opening: readonly Message[] = []): ChatTurn[] {
  return opening.map((message) => ({ ...message, id: nextTurnId(), text: paragraphsText(message.paragraphs) }));
}

/** The chat beside one chart. Answers arrive as paragraphs of sentences bound to that chart. */
export function useAgentChat({ spec, connection, opening, getSelected }: AgentChatOptions): AgentChat {
  const [turns, setTurns] = useState<ChatTurn[]>(() => openingTurns(opening));
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const chart = useMemo(() => agentChartOf(spec.fixture, spec.presets), [spec.fixture, spec.presets]);
  const sentences = useMemo(() => turns.flatMap((turn) => sentencesOf(turn.paragraphs)), [turns]);

  const updateTurn = useCallback((id: string, patch: Partial<ChatTurn>) => {
    setTurns((previous) => previous.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn)));
  }, []);

  const ask = useCallback(async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || busy || !connection.apiKey) return;
    const selected = getSelected();
    const apiContent = `${trimmed}\n\n---\nContext from the chart:\n${contextText(spec, chart, selected)}`;
    const userId = nextTurnId();
    const about = selectionSentence(`${userId}-selection`, selected, chart);
    const userTurn: ChatTurn = {
      id: userId,
      from: 'user',
      text: trimmed,
      apiContent,
      paragraphs: [about ? [trimmed, ' · ', about] : [trimmed]],
    };
    const assistantTurn: ChatTurn = { id: nextTurnId(), from: 'agent', text: '', paragraphs: [], pending: true };
    const history: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...turns.flatMap<ChatMessage>((turn) => {
        if (turn.from === 'user') return [{ role: 'user', content: turn.apiContent ?? turn.text }];
        return turn.text ? [{ role: 'assistant', content: turn.text }] : [];
      }),
      { role: 'user', content: apiContent },
    ];
    setTurns((previous) => [...previous, userTurn, assistantTurn]);
    setDraft('');
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const receive = (parts: ReturnType<typeof extractParts>, pending: boolean) => {
      const paragraphs = toParagraphs(parts, assistantTurn.id, chart);
      updateTurn(assistantTurn.id, { paragraphs, text: paragraphsText(paragraphs), pending });
    };
    try {
      const result = await streamChatCompletion({
        connection,
        messages: history,
        responseFormat: answerSchema('chart_answer', false),
        signal: controller.signal,
        onText: (_delta, full) => {
          const parts = extractParts(full);
          if (parts.length > 0) receive(parts, true);
        },
      });
      let parts: ReturnType<typeof extractParts>;
      try {
        parts = parseParts(result.content);
      } catch {
        parts = extractParts(result.content);
        if (parts.length === 0 && result.content.trim()) parts = [{ text: result.content, chart: null, updates: [] }];
      }
      receive(parts, false);
    } catch (error) {
      const message = controller.signal.aborted ? 'Stopped.' : error instanceof Error ? error.message : String(error);
      updateTurn(assistantTurn.id, { pending: false, error: message });
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }, [busy, chart, connection, getSelected, spec, turns, updateTurn]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return { turns, sentences, chart, ask, stop, busy, draft, setDraft, hasKey: connection.apiKey.length > 0 };
}

interface AgentPanelProps {
  chat: AgentChat;
  report: ReportChart;
  sectionId: string;
  connection: OpenAIConnection;
  /** When given, every bound sentence in an answer gets a button that adds it to the story, or takes it out. */
  onAdopt?: (item: Sentence) => void;
  /** Ids of the chat sentences already in the story; their button shows a check. */
  adoptedIds?: ReadonlySet<string>;
}

/** Always two, so the panel keeps its height when a selection comes and goes. */
function promptsFor(hasSelection: boolean): [string, string] {
  return hasSelection
    ? ['Summarize the selection in a few sentences.', 'How does this selection compare with the rest of the chart?']
    : ['Describe the main pattern in this chart.', 'Which records stand out, and why?'];
}

/** The chat: turns, suggested questions, the selection chip, and the composer. */
export function AgentPanel({ chat, report, sectionId, connection, onAdopt, adoptedIds }: AgentPanelProps) {
  const messagesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = messagesRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [chat.turns]);

  const handleComposerKey = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void chat.ask(chat.draft);
    }
  }, [chat]);

  const selectedCount = report.selected.length;
  const actionFor = onAdopt
    ? (item: Sentence) => {
      const added = adoptedIds?.has(item.id) ?? false;
      return (
        <button
          type="button"
          className={`idr-chat-adopt${added ? ' is-added' : ''}`}
          title={added ? 'In your story · press to take it out' : 'Add this sentence to your story'}
          aria-label={added ? 'Take this sentence out of your story' : 'Add this sentence to your story'}
          aria-pressed={added}
          onClick={() => onAdopt(item)}
        >
          {added ? <Check size={10} strokeWidth={2.5} aria-hidden="true" /> : '+'}
        </button>
      );
    }
    : undefined;

  return (
    <section className="it-detail-panel idr-chat-agent-panel" aria-label="Agent">
      <div className="idr-chat-agent-head">
        <h3 className="it-component-title">Agent</h3>
        <span>{connection.model} via {hostOf(connection.baseUrl)}</span>
      </div>

      <div className="idr-chat-messages" ref={messagesRef}>
        {chat.turns.length === 0 ? (
          <div className="idr-chat-messages-empty">
            <p>Select part of the chart, then ask. The selection goes with the question, and the answer's underlined sentences are bound to the chart.</p>
            {!chat.hasKey && <p className="idr-chat-warning">Set VITE_OPENAI_API_KEY in site/.env.local to enable the agent.</p>}
          </div>
        ) : chat.turns.map((turn) => (
          <div key={turn.id} className={`idr-chat-turn idr-chat-turn-${turn.from === 'user' ? 'user' : 'assistant'}`}>
            {turn.from === 'user' ? (
              <div className="idr-chat-bubble">
                {turn.paragraphs.map((paragraph, index) => (
                  <ReportParagraph key={index} parts={paragraph} report={report} sectionId={sectionId} />
                ))}
              </div>
            ) : (
              <>
                <div className="idr-chat-bubble idr-chat-answer">
                  {turn.paragraphs.length > 0
                    ? turn.paragraphs.map((paragraph, index) => (
                      <ReportParagraph key={index} parts={paragraph} report={report} sectionId={sectionId} actionFor={actionFor} />
                    ))
                    : turn.pending && <span className="idr-chat-thinking">Thinking…</span>}
                  {turn.pending && turn.paragraphs.length > 0 && <span className="idr-chat-cursor" aria-hidden="true" />}
                </div>
                {turn.error && <div className="idr-chat-error">{turn.error}</div>}
              </>
            )}
          </div>
        ))}
      </div>

      <div className="idr-chat-suggestions">
        {promptsFor(selectedCount > 0).map((prompt) => (
          <button key={prompt} type="button" disabled={chat.busy || !chat.hasKey} onClick={() => void chat.ask(prompt)}>
            {prompt}
          </button>
        ))}
      </div>

      <div className="idr-chat-context-row" aria-live="polite">
        {selectedCount > 0 ? (
          <span className="idr-chat-context-chip is-selection">
            <Scan size={11} aria-hidden="true" />
            {`Selected: ${selectedCount} of ${report.rows.rows.length} records go as context`}
            <button type="button" onClick={report.clear} aria-label="Clear the selection" title="Clear">×</button>
          </span>
        ) : (
          <span className="idr-chat-context-chip">
            <Scan size={11} aria-hidden="true" />
            Nothing selected · all {report.rows.rows.length} records go as context
          </span>
        )}
      </div>
      <form
        className="idr-chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void chat.ask(chat.draft);
        }}
      >
        <textarea
          rows={2}
          placeholder={selectedCount > 0 ? `Ask about the ${selectedCount} selected…` : 'Ask about this chart…'}
          value={chat.draft}
          onChange={(event) => chat.setDraft(event.target.value)}
          onKeyDown={handleComposerKey}
          disabled={chat.busy}
        />
        {chat.busy ? (
          <button type="button" className="idr-chat-send" onClick={chat.stop} title="Stop">
            <Square size={13} aria-hidden="true" /> Stop
          </button>
        ) : (
          <button type="submit" className="idr-chat-send" disabled={!chat.draft.trim() || !chat.hasKey} title="Send">
            <Send size={13} aria-hidden="true" /> Send
          </button>
        )}
      </form>
    </section>
  );
}
