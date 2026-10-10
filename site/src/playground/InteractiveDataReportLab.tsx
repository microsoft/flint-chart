import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { ArrowUp, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, GripVertical, Pause, Pencil, Play, Plus, Trash2, X } from 'lucide-react';
import { FlintChart } from 'flint-chart/react';
import { expressionInterpreter } from 'vega-interpreter';
import { AGENT, ARTICLE, COUNTRIES, DEFAULT_STORY, OPENING, SCALES, SELECTION_CHAT, STORY } from './interactive-data-report-content';
import {
  agentChartOf,
  asSentence,
  selectionSentence,
  sentencesOf,
  type Message,
  type Paragraph,
  type Row,
  type SectionSpec,
  type Sentence,
} from './interactive-data-report-model';
import {
  AgentPanel,
  CONNECTION,
  PresetEditor,
  ReportParagraph,
  ReportSentence,
  sentenceElementId,
  useAgentChat,
  usePresets,
  useReportChart,
  type EditablePresets,
  type ReportChart,
} from './interactive-data-report-ui';
import type { ChartChange } from 'flint-chart/interactive';
import type { OpenAIConnection } from './openai-chat-client';
import { withHouseId } from '../shared/test-case-utils';
import './interaction-transport.css';
import './interactive-data-report-chat.css';
import './interactive-data-report.css';

/*
 * The interactive data report: one chart, three ways to read it. Every section is one
 * chart bound to its sentences by `useReportChart`, plus a text renderer on top: the
 * report's paragraphs, the slides, or the agent's chat. What the sections say lives in
 * `interactive-data-report-content.ts`; how sentences and charts read each other lives in
 * `interactive-data-report-model.ts` and `interactive-data-report-ui.tsx`.
 */

/* ---------- shared pieces of a section ---------- */

/** A section's title and lede, with the preset editor unless the host turned editing off. */
function SectionHeader({ spec, presets, editable = true }: { spec: SectionSpec; presets: EditablePresets; editable?: boolean }) {
  return (
    <header className="it-example-header idr-section-header">
      <div>
        <h2>{spec.title}</h2>
        <p>{spec.lede}</p>
      </div>
      {editable && <PresetEditor editable={presets} />}
    </header>
  );
}

/** The spec with the presets the reader has mounted; the chart rebuilds when they change. */
function useEditableSpec(spec: SectionSpec): { live: SectionSpec; presets: EditablePresets } {
  const presets = usePresets(spec);
  const live = useMemo(() => ({ ...spec, presets: presets.presets }), [presets.presets, spec]);
  return { live, presets };
}

const scrollToSentence = (sectionId: string) => (item: Sentence) =>
  document.getElementById(sentenceElementId(sectionId, item))?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

/* ---------- 1. the report: paragraphs beside the chart ---------- */

/** One figure of the report: the text beside its chart, each reading the other. */
export function ReportSection({ spec, editable }: { spec: SectionSpec; editable?: boolean }) {
  const { live, presets } = useEditableSpec(spec);
  const sentences = useMemo(() => sentencesOf(spec.paragraphs), [spec.paragraphs]);
  const jump = useMemo(() => scrollToSentence(spec.id), [spec.id]);
  const report = useReportChart(live, sentences, jump);

  return (
    <article className="it-example idr-section" id={`section-${spec.id}`}>
      <SectionHeader spec={spec} presets={presets} editable={editable} />
      <div className="it-workspace it-workspace-external idr-workspace">
        <section className="it-control-panel idr-report-panel" aria-label={`Report: ${spec.title}`}>
          <h3 className="it-component-title">Report</h3>
          <div className="idr-report">
            {spec.paragraphs.map((paragraph, index) => (
              <ReportParagraph key={index} parts={paragraph} report={report} sectionId={spec.id} />
            ))}
          </div>
          <button type="button" className="it-reset" onClick={report.clear}>Clear chart and pins</button>
        </section>
        <section className="it-chart-panel">
          <FlintChart {...report.chartProps} renderer="svg" expressionInterpreter={expressionInterpreter} className="it-chart-mount" width="100%" />
        </section>
      </div>
    </article>
  );
}

/* ---------- 2. the slides: one sentence at a time ---------- */

const SLIDE_MS = 5000;
/** The mark glide of `.idr-animated` charts; keep in step with interactive-data-report.css. */
const GLIDE = { glideMs: 500 };

/** The slides of one chart: a sideways scroller, one sentence per page, with the controls under it. */
interface SlidePanelProps {
  slides: readonly Sentence[];
  report: ReportChart;
  /** Slides stack top to bottom and a wheel notch moves down one; sideways otherwise. */
  vertical?: boolean;
  /** Content above the slides, such as an article's headline. */
  header?: ReactNode;
}

function SlidePanel({ slides, report, vertical = false, header }: SlidePanelProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  // The slide on show is the pinned sentence; a change replaces it in one render.
  const { ready, show } = report;
  useEffect(() => {
    if (!ready) return;
    void show(slides[index] ?? null);
  }, [index, ready, show, slides]);

  // The panel scrolls sideways one slide at a time, and the slide in view is the one on show.
  const onScroll = useCallback(() => {
    if (frame.current !== 0) return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = 0;
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const extent = vertical ? scroller.clientHeight : scroller.clientWidth;
      if (extent === 0) return;
      const next = Math.round((vertical ? scroller.scrollTop : scroller.scrollLeft) / extent);
      setIndex(Math.min(slides.length - 1, Math.max(0, next)));
    });
  }, [slides.length, vertical]);
  useEffect(() => () => { if (frame.current !== 0) window.cancelAnimationFrame(frame.current); }, []);

  const go = useCallback((next: number) => {
    const target = Math.min(slides.length - 1, Math.max(0, next));
    const scroller = scrollerRef.current;
    if (!scroller) setIndex(target);
    else if (vertical) scroller.scrollTo({ top: target * scroller.clientHeight, behavior: 'smooth' });
    else scroller.scrollTo({ left: target * scroller.clientWidth, behavior: 'smooth' });
  }, [slides.length, vertical]);

  // A sideways swipe scrolls on its own. A mouse wheel moves up and down, so one notch
  // steps one slide; the lock keeps a long notch from skipping slides.
  const indexRef = useRef(index);
  indexRef.current = index;
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let locked = false;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      setPlaying(false);
      if (locked) return;
      locked = true;
      window.setTimeout(() => { locked = false; }, 450);
      go(indexRef.current + Math.sign(event.deltaY));
    };
    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => scroller.removeEventListener('wheel', onWheel);
  }, [go]);

  useEffect(() => {
    if (!playing) return;
    if (index >= slides.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => go(index + 1), SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [go, index, playing, slides.length]);

  return (
    <section className={`idr-slide-panel${vertical ? ' is-vertical' : ''}`} aria-label="Slides">
      {header}
      <div className="idr-slide-scroller" ref={scrollerRef} onScroll={onScroll}>
        {slides.map((slide, slideIndex) => (
          <div key={slide.id} className={`idr-slide${slideIndex === index ? ' is-active' : ''}`} aria-current={slideIndex === index ? 'step' : undefined}>
            <span className="idr-slide-count">Slide {slideIndex + 1} of {slides.length}</span>
            {slide.kind === 'title'
              ? <><h2 className="idr-article-title idr-slide-title">{slide.text}</h2>{slide.detail && <p className="idr-article-byline">{slide.detail}</p>}</>
              : <p className="idr-slide-sentence">{asSentence(slide.text)}</p>}
          </div>
        ))}
      </div>
      <div className="idr-slide-controls">
        <button type="button" className="idr-control" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous slide">
          {vertical ? <ChevronUp size={16} strokeWidth={2} aria-hidden="true" /> : <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />}
        </button>
        <button
          type="button"
          className={`idr-control${playing ? ' is-playing' : ''}`}
          onClick={() => setPlaying((current) => !current)}
          aria-pressed={playing}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Pause size={15} strokeWidth={2} aria-hidden="true" /> : <Play size={15} strokeWidth={2} aria-hidden="true" />}
        </button>
        <button type="button" className="idr-control" onClick={() => go(index + 1)} disabled={index >= slides.length - 1} aria-label="Next slide">
          {vertical ? <ChevronDown size={16} strokeWidth={2} aria-hidden="true" /> : <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />}
        </button>
        <ol className="idr-dots" aria-label="Slides">
          {slides.map((entry, slideIndex) => (
            <li key={entry.id} className={slideIndex === index ? 'is-active' : slideIndex < index ? 'is-done' : ''}>
              <button type="button" onClick={() => go(slideIndex)} aria-label={entry.kind === 'title' ? entry.text : asSentence(entry.text)} aria-current={slideIndex === index ? 'step' : undefined} />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function SlideSection({ spec }: { spec: SectionSpec }) {
  const { live, presets } = useEditableSpec(spec);
  const slides = useMemo(() => sentencesOf(spec.paragraphs), [spec.paragraphs]);
  const report = useReportChart(live, slides, undefined, GLIDE);
  return (
    <article className="it-example idr-section" id={`section-${spec.id}`}>
      <SectionHeader spec={spec} presets={presets} />
      <div className="it-workspace idr-slides idr-animated">
        <SlidePanel slides={slides} report={report} />
        <section className="it-chart-panel idr-slide-chart">
          <FlintChart {...report.chartProps} renderer="svg" expressionInterpreter={expressionInterpreter} className="it-chart-mount" width="100%" />
        </section>
      </div>
    </article>
  );
}

/* ---------- 2b. the article: a news report told as vertical slides ---------- */

/** One slide per paragraph: the paragraph's whole text, with the ops of its bound sentence. */
function paragraphSlides(paragraphs: readonly Paragraph[]): Sentence[] {
  return paragraphs.flatMap((paragraph, index) => {
    const bound = paragraph.find((part): part is Sentence => typeof part !== 'string');
    if (!bound) return [];
    const text = paragraph.map((part) => (typeof part === 'string' ? part : part.text)).join('');
    return [{ ...bound, text }];
  });
}

/** A news report beside its chart: the headline stays, and each wheel notch moves to the next paragraph. */
export function ArticleSection({ spec, editable = true }: { spec: SectionSpec; editable?: boolean }) {
  const { live, presets } = useEditableSpec(spec);
  const slides = useMemo(() => paragraphSlides(spec.paragraphs).map((slide) => (
    slide.kind === 'title' ? { ...slide, detail: slide.detail ?? spec.byline } : slide
  )), [spec.byline, spec.paragraphs]);
  const report = useReportChart(live, slides, undefined, GLIDE);
  // When the title is the first slide, the panel has no fixed header above the slides.
  const header = slides[0]?.kind === 'title' ? undefined : (
    <header className="idr-article-head">
      <h2 className="idr-article-title">{spec.title}</h2>
      <p className="idr-article-standfirst">{spec.lede}</p>
      <p className="idr-article-byline">{spec.byline ?? 'Flint data desk · 2021 figures, published 5 October 2026'}</p>
    </header>
  );
  return (
    <article className="it-example idr-section" id={`section-${spec.id}`}>
      {editable && <header className="it-example-header idr-section-header">
        <div />
        <PresetEditor editable={presets} />
      </header>}
      <div className="it-workspace idr-slides idr-article idr-animated">
        <SlidePanel slides={slides} report={report} vertical header={header} />
        <section className="it-chart-panel idr-slide-chart">
          <FlintChart {...report.chartProps} renderer="svg" expressionInterpreter={expressionInterpreter} className="it-chart-mount" width="100%" />
        </section>
      </div>
    </article>
  );
}

/* ---------- 2c. the selection chat: a chart as the agent's answer, a brush as the next question's context ---------- */

/** The quarter a brushed point sits in, from the timestamp the chart keeps for its month. */
function quarterLabel(ms: number): string {
  const date = new Date(ms);
  return `${date.getUTCFullYear()} Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

/** The brushed quarters in order, each with its spending; empty when the brush is. */
function brushedQuarters(
  elements: readonly { value: unknown }[],
  spending: ReadonlyMap<string, number>,
): { label: string; value: number | undefined }[] {
  const months = [...new Set(elements
    .map((element) => (element.value as { Month?: unknown } | undefined)?.Month)
    .filter((month): month is number => typeof month === 'number'))].sort((a, b) => a - b);
  return months.map((ms) => {
    const label = quarterLabel(ms);
    return { label, value: spending.get(label) };
  });
}

/** A conversation: the reader asks for the chart, the agent answers with it, and the brushed range waits in the composer as context. */
export function SelectionChatDemo({ spec, editable, themeId }: { spec: typeof SELECTION_CHAT; editable?: boolean; themeId?: string | null }) {
  const chartInput = useMemo(() => withHouseId(spec.fixture.input, themeId), [spec.fixture.input, themeId]);
  const { presets } = useEditableSpec(spec);
  const [quarters, setQuarters] = useState<{ label: string; value: number | undefined }[]>([]);
  const spending = useMemo(() => new Map((spec.fixture.input.data.values ?? []).map((row) => [
    quarterLabel(Date.parse(`${String(row.Month)}-01T00:00:00Z`)), Number(row.Spending),
  ])), [spec.fixture.input]);
  // A brush commit names the interaction; a reset (Escape, a click on the background) names none, and the state holds what remains.
  const onChange = useCallback((change: ChartChange) => {
    if (change.interactionId !== undefined && change.interactionId !== 'brush') return;
    if (change.phase !== 'cancel' && change.phase !== 'commit') return;
    setQuarters(change.phase === 'cancel' ? [] : brushedQuarters(
      change.state.entries?.get('brush')?.elements ?? change.target?.elements ?? [], spending,
    ));
  }, [spending]);
  const first = quarters[0]?.label;
  const last = quarters[quarters.length - 1]?.label;
  const value = (quarter: typeof quarters[number]) => quarter.value !== undefined ? ` · $${quarter.value.toFixed(2)}B` : '';
  const context = quarters.length === 0 ? 'No selection'
    : quarters.length === 1 ? `${first}${value(quarters[0])}`
    : `${first} – ${last} · ${quarters.length} quarters`;
  return (
    <article className="it-example idr-section" id={`section-${spec.id}`}>
      <SectionHeader spec={spec} presets={presets} editable={editable} />
      <section className="it-workspace idr-selection-chat idr-chat-window" aria-label="Chat">
        <div className="idr-chat-messages">
          <div className="idr-chat-turn idr-chat-turn-user">
            <span className="idr-chat-turn-label">You</span>
            <div className="idr-chat-bubble"><p>{spec.question}</p></div>
          </div>
          <div className="idr-chat-turn idr-chat-turn-assistant">
            <span className="idr-chat-turn-label">Assistant</span>
            <div className="idr-chat-bubble idr-chat-chart-bubble">
              <FlintChart
                spec={chartInput}
                interactions={spec.interactions}
                chartId={spec.id}
                ariaLabel={spec.fixture.title}
                renderer="svg" expressionInterpreter={expressionInterpreter} className="it-chart-mount" width="100%"
                onChange={onChange}
              />
            </div>
          </div>
        </div>
        <div className="idr-chat-window-foot">
          <div className="idr-chat-composer">
            <span className={quarters.length > 0 ? 'idr-composer-context' : 'idr-composer-context is-empty'}
              title={quarters.map((quarter) => `${quarter.label}${value(quarter)}`).join('\n') || undefined}>
              {context}
            </span>
            <div className="idr-composer-input" aria-hidden="true">
              <span>{quarters.length > 0 ? 'Ask about the selected quarters …' : 'Drag across the chart to add context, then ask …'}</span>
              <span className="idr-chat-window-send"><ArrowUp size={13} strokeWidth={2.2} /></span>
            </div>
          </div>
        </div>
      </section>
    </article>
  );
}

/* ---------- 3. the agent: a chat whose answers are bound sentences ---------- */

interface AgentSectionProps {
  spec: SectionSpec;
  opening?: readonly Message[];
  connection?: OpenAIConnection;
  /** The sentences the reader kept for the story, by the id of the chat sentence they came from. */
  storyIds?: ReadonlySet<string>;
  /** Adds a chat sentence to the story, or takes it out again. */
  onToggleStory?: (item: Sentence) => void;
}

export function AgentSection({ spec, opening, connection = CONNECTION, storyIds, onToggleStory }: AgentSectionProps) {
  // The chat reads the selection when a question goes out; the chart hosts the chat's
  // sentences. A ref breaks the cycle between the two hooks.
  const readRef = useRef<() => Promise<Row[]>>(async () => []);
  const { live, presets } = useEditableSpec(spec);
  const chat = useAgentChat({ spec: live, connection, opening, getSelected: () => readRef.current() });
  const jump = useMemo(() => scrollToSentence(spec.id), [spec.id]);
  const report = useReportChart(live, chat.sentences, jump);
  readRef.current = report.readSelected;

  return (
    <article className="it-example idr-section idr-chat-section" id={`section-${spec.id}`}>
      <SectionHeader spec={spec} presets={presets} />
      <div className="it-workspace it-workspace-outbound idr-chat-workspace">
        <section className="it-chart-panel idr-chat-chart-panel">
          <div className="idr-chat-chart">
            <FlintChart {...report.chartProps} renderer="svg" expressionInterpreter={expressionInterpreter} className="it-chart-mount" width="100%" />
          </div>
        </section>
        <AgentPanel chat={chat} report={report} sectionId={spec.id} connection={connection} adoptedIds={storyIds} onAdopt={onToggleStory} />
      </div>
    </article>
  );
}

/* ---------- 4. the story: the sentences the reader kept, as a paragraph or as slides ---------- */

type StoryFormat = 'paragraph' | 'slides';

interface StoryRowProps {
  item: Sentence;
  report: ReportChart;
  sectionId: string;
  dragging: boolean;
  drop: 'before' | 'after' | null;
  onDragStart: () => void;
  onDragOver: (event: DragEvent<HTMLLIElement>) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onEdit: (text: string) => void;
  onDelete: () => void;
  /** Open the editor as soon as the row mounts: a sentence the reader has just created. */
  startEditing?: boolean;
}

/** One sentence of the story: a grip to drag it, the bound sentence, a pencil that opens an editor, and a bin. */
function StoryRow({ item, report, sectionId, dragging, drop, onDragStart, onDragOver, onDrop, onDragEnd, onEdit, onDelete, startEditing = false }: StoryRowProps) {
  const [draft, setDraft] = useState<string | null>(startEditing ? item.text : null);
  const finish = () => {
    const text = draft?.trim();
    if (text && text !== item.text) onEdit(asSentence(text));
    setDraft(null);
  };
  return (
    <li
      className={`idr-story-row${dragging ? ' is-dragging' : ''}${drop ? ` is-drop-${drop}` : ''}`}
      onDragOver={onDragOver}
      onDrop={(event) => { event.preventDefault(); onDrop(); }}
    >
      <button
        type="button"
        className="idr-grip"
        draggable
        onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', item.id); onDragStart(); }}
        onDragEnd={onDragEnd}
        aria-label="Drag to move this sentence"
        title="Drag to move"
      >
        <GripVertical size={13} aria-hidden="true" />
      </button>
      {draft === null ? (
        <>
          <span className="idr-story-text"><ReportSentence sentence={item} report={report} sectionId={sectionId} /></span>
          <span className="idr-edit-actions">
            <button type="button" className="idr-edit" onClick={() => setDraft(item.text)} aria-label="Edit this sentence" title="Edit">
              <Pencil size={12} aria-hidden="true" />
            </button>
            <button type="button" className="idr-edit is-delete" onClick={onDelete} aria-label="Remove this sentence from the story" title="Remove">
              <Trash2 size={12} aria-hidden="true" />
            </button>
          </span>
        </>
      ) : (
        <>
          <textarea
            className="idr-story-editor"
            value={draft}
            rows={2}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); finish(); }
              if (event.key === 'Escape') setDraft(null);
            }}
            aria-label="Edit the sentence"
          />
          <span className="idr-edit-actions">
            <button type="button" className="idr-edit is-done" onClick={finish} aria-label="Done" title="Done"><Check size={12} aria-hidden="true" /></button>
            <button type="button" className="idr-edit" onClick={() => setDraft(null)} aria-label="Cancel" title="Cancel"><X size={12} aria-hidden="true" /></button>
          </span>
        </>
      )}
    </li>
  );
}

interface StoryRowsProps {
  story: readonly Sentence[];
  report: ReportChart;
  sectionId: string;
  onChange: (story: Sentence[]) => void;
  /** The sentence the reader has just created, which opens in its editor. */
  newId: string | null;
}

/** The story as rows the reader can reorder by drag and edit in place. The chart updates stay with the sentences. */
function StoryRows({ story, report, sectionId, onChange, newId }: StoryRowsProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; where: 'before' | 'after' } | null>(null);
  // Drag events can arrive before the state from the previous one has rendered, so the
  // handlers read the drag through refs and the state only paints it.
  const dragRef = useRef<string | null>(null);
  const dropRef = useRef<{ id: string; where: 'before' | 'after' } | null>(null);
  const startDrag = (id: string) => { dragRef.current = id; setDragId(id); };
  const hover = (id: string, where: 'before' | 'after') => { dropRef.current = { id, where }; setDrop({ id, where }); };

  const finishDrag = () => {
    const from = dragRef.current;
    const to = dropRef.current;
    if (from && to && to.id !== from) {
      const moving = story.find((item) => item.id === from);
      const rest = story.filter((item) => item.id !== from);
      const at = rest.findIndex((item) => item.id === to.id) + (to.where === 'after' ? 1 : 0);
      if (moving) onChange([...rest.slice(0, at), moving, ...rest.slice(at)]);
    }
    dragRef.current = null;
    dropRef.current = null;
    setDragId(null);
    setDrop(null);
  };

  return (
    <ol className="idr-story-rows" aria-label="Your story, one sentence per row">
      {story.map((item) => (
        <StoryRow
          key={item.id}
          item={item}
          report={report}
          sectionId={sectionId}
          dragging={dragId === item.id}
          drop={drop?.id === item.id && dragId !== item.id ? drop.where : null}
          onDragStart={() => startDrag(item.id)}
          onDragOver={(event) => {
            if (!dragRef.current) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            const rect = event.currentTarget.getBoundingClientRect();
            hover(item.id, event.clientY < rect.top + rect.height / 2 ? 'before' : 'after');
          }}
          onDrop={finishDrag}
          onDragEnd={finishDrag}
          onEdit={(text) => onChange(story.map((entry) => (entry.id === item.id ? { ...entry, text } : entry)))}
          onDelete={() => onChange(story.filter((entry) => entry.id !== item.id))}
          startEditing={item.id === newId}
        />
      ))}
    </ol>
  );
}

interface StorySectionProps {
  spec: SectionSpec;
  story: readonly Sentence[];
  /** The story after a reorder or an edit. */
  onChange: (story: Sentence[]) => void;
}

let ownCounter = 0;

export function StorySection({ spec, story, onChange }: StorySectionProps) {
  const [format, setFormat] = useState<StoryFormat>('paragraph');
  const [newId, setNewId] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const chart = useMemo(() => agentChartOf(spec.fixture, spec.presets), [spec.fixture, spec.presets]);
  const { live, presets } = useEditableSpec(spec);
  const paragraph = useMemo<Paragraph>(() => story.flatMap((item, index) => (index === 0 ? [item] : [' ', item])), [story]);
  const storySpec = useMemo<SectionSpec>(() => ({ ...live, paragraphs: [paragraph] }), [live, paragraph]);
  const jump = useMemo(() => scrollToSentence(spec.id), [spec.id]);
  const report = useReportChart(storySpec, story, jump, GLIDE);

  // The reader's own sentence: the chart's selection as an emphasis, with a text to rewrite.
  const addOwn = async () => {
    const selected = await report.readSelected();
    ownCounter += 1;
    const item = selectionSentence(`own-${ownCounter}`, selected, chart);
    if (!item) {
      setHint('Select records on the chart first.');
      return;
    }
    setHint(null);
    setNewId(item.id);
    onChange([...story, item]);
    setFormat('paragraph');
  };

  return (
    <article className="it-example idr-section" id={`section-${spec.id}`}>
      <SectionHeader spec={spec} presets={presets} />
      <div className="it-workspace idr-story idr-animated">
        <section className="it-chart-panel idr-slide-chart">
          <FlintChart {...report.chartProps} renderer="svg" expressionInterpreter={expressionInterpreter} className="it-chart-mount" width="100%" />
        </section>
        <section className="idr-story-panel" aria-label="Your story">
          <div className="idr-format" role="tablist" aria-label="Story format">
            <button type="button" role="tab" aria-selected={format === 'paragraph'} className={format === 'paragraph' ? 'is-active' : ''} onClick={() => setFormat('paragraph')}>Paragraph</button>
            <button type="button" role="tab" aria-selected={format === 'slides'} className={format === 'slides' ? 'is-active' : ''} onClick={() => setFormat('slides')}>Slides</button>
            {format === 'paragraph' && (
              <button
                type="button"
                className="idr-add"
                onClick={() => void addOwn()}
                title="Add a sentence about the selected records"
              >
                <Plus size={12} strokeWidth={2.2} aria-hidden="true" /> Add sentence
              </button>
            )}
          </div>
          {hint && <p className="idr-story-hint" role="status">{hint}</p>}
          {story.length === 0 ? (
            <div className="it-empty-state idr-story-empty">Press + after a sentence in the agent's answer to keep it here, or select records on this chart and add a sentence of your own.</div>
          ) : format === 'paragraph' ? (
            <StoryRows story={story} report={report} sectionId={spec.id} onChange={onChange} newId={newId} />
          ) : (
            <SlidePanel slides={story} report={report} />
          )}
        </section>
      </div>
    </article>
  );
}

/* ---------- the page ---------- */

/** A chat sentence as a story sentence: its own id, and a capital and a full stop of its own. */
const toStoryEntry = (item: Sentence): Sentence => ({ ...item, id: `story-${item.id}`, text: asSentence(item.text) });


export function InteractiveDataReportLab() {
  // The story: chat sentences the reader kept, as copies with their own ids and full stops.
  // It opens with the preset agent sentences the content file lists, in that order.
  const [story, setStory] = useState<Sentence[]>(() => {
    const said = OPENING.filter((message) => message.from === 'agent').flatMap((message) => sentencesOf(message.paragraphs));
    return DEFAULT_STORY.flatMap((id) => said.filter((item) => item.id === id)).map(toStoryEntry);
  });
  const storyIds = useMemo(() => new Set(story.map((item) => item.id.slice('story-'.length))), [story]);
  const toggleStory = useCallback((item: Sentence) => {
    const id = `story-${item.id}`;
    setStory((current) => (current.some((entry) => entry.id === id)
      ? current.filter((entry) => entry.id !== id)
      : [...current, toStoryEntry(item)]));
  }, []);

  return (
    <div className="dev-page it-page idr-page">
      <header className="dev-page-heading it-heading">
        <h1>A report and its chart read each other</h1>
        <p>
          Each underlined sentence carries one chart update, written in the library's own update language.
          Hover a sentence to preview it on the chart, or click it to pin it. A gesture on the chart drops
          the pin, and what you select goes with your questions. One chart runs through every section:
          income against life expectancy for twelve countries.
        </p>
        {!CONNECTION.apiKey && (
          <p className="idr-warning">
            No API key is configured. Set <code>VITE_OPENAI_API_KEY</code> in <code>site/.env.local</code> to enable the agent.
          </p>
        )}
      </header>
      <div className="it-examples idr-sections">
        <ReportSection spec={COUNTRIES} />
        <SlideSection spec={SCALES} />
        <AgentSection spec={AGENT} opening={OPENING} storyIds={storyIds} onToggleStory={toggleStory} />
        <StorySection spec={STORY} story={story} onChange={setStory} />
      </div>
    </div>
  );
}
