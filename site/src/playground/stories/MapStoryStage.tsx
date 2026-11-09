import { useEffect, useMemo, useState } from 'react';
import { assembleVegaLite, type ChartAssemblyInput, type ChartUpdateOp } from 'flint-chart';
import type { ChartUpdate, InteractiveChartSurface } from 'flint-chart/interactive';
import { FlintChart } from 'flint-chart/react';
import { expressionInterpreter } from 'vega-interpreter';
import { ScaleToFit } from '../../components/ScaleToFit';
import { StoryBoard, type BoardChapter } from './StoryBoard';
import type { OdysseyLook } from '../OdysseyStoryStage';

/** How a story's map is drawn: its ground, its legs' colours (unset: the house's), its house, its routes. */
export type StoryLook = OdysseyLook;

/**
 * A story told on a map, chapter by chapter, as the Odyssey's is: one point Map whose `order` joins
 * the stops into routes (one per `detail` value), coloured by the stretch of the story each leg
 * belongs to. Every chapter is one chart update with one id, so the next replaces it whole:
 * `set-viewport` eases the map to the chapter's stops, `set-style` recedes the rest, `annotate-text`
 * notes its episodes, and a chapter may add overlays of its own. The sea names are one more overlay,
 * under their own id, so they stay from chapter to chapter.
 */

/** One place on a route. `id` names it for the chapters; `leg` is the stretch the leg leaving it belongs to. */
export interface StoryStop {
  id: string;
  place: string;
  leg: string;
  /** The route it is on, where a story has several (one per labour); else the story's one route. */
  route?: string;
  /** Its place in its route. */
  order: number;
  longitude: number;
  latitude: number;
  /** A measure the leg leaving it is drawn as wide as (the crew that sailed it). */
  width?: number;
}

/** A note on one stop, or on the leg that sets out from it. */
export interface StoryNote { at: string; text: string; on?: 'leg' }

export interface StoryChapter {
  title: string;
  /** The stretches the chapter follows; the rest of the story recedes. */
  legs?: readonly string[];
  /** The stops to frame; every stop when left out. */
  frame?: readonly string[];
  text: string;
  notes: readonly StoryNote[];
  /** Overlays of the chapter's own, gone with it. */
  extra?: readonly ChartUpdateOp[];
}

export interface MapStory {
  /** A short id, for the chart's and the updates' names. */
  id: string;
  title: string;
  stops: readonly StoryStop[];
  /** What the stretches are called in the key (`Leg`, `Labours`). */
  legField: string;
  /** What the routes are, where there are several (`Labour`). */
  routeField?: string;
  /** What `width` measures, where it is given (`Crew`). */
  widthField?: string;
  /** The stretches' colours, in story order. */
  legInks: readonly string[];
  seas: readonly { text: string; longitude: number; latitude: number }[];
  chapters: readonly StoryChapter[];
  canvas: { width: number; height: number };
  /** The least margin round a chapter's frame, in degrees. */
  frameMargin?: number;
  /** Boundaries of the story's own (`chartProperties.boundaries`): a finer file for a story that zooms in close. */
  boundaries?: Record<string, unknown>;
}

/** Great-circle distance in km between two stops. */
export function kilometres(a: StoryStop, b: StoryStop): number {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** The distance along a route of stops, in km. */
export const routeKilometres = (stops: readonly StoryStop[]) => stops.slice(1).reduce((total, stop, i) => total + kilometres(stops[i], stop), 0);

const ROUTE = 'Route';

/** The atlas's water, so a route crossing a sea's name does not cut it. */
const SEA_LABEL = { fill: '#5f7d92', halo: '#dbe9f2' };

function rowsOf(story: MapStory): Record<string, unknown>[] {
  return story.stops.map((stop) => ({
    Stop: stop.order,
    [story.legField]: stop.leg,
    Place: stop.place,
    [story.routeField ?? ROUTE]: stop.route ?? story.title,
    ...(story.widthField && stop.width !== undefined ? { [story.widthField]: stop.width } : {}),
    longitude: stop.longitude,
    latitude: stop.latitude,
  }));
}

/** The look a story is drawn in where the page sets none: an atlas, the Swiss house, the story's own colours. */
const STORY_LOOK = (story: MapStory): StoryLook => ({
  mapStyle: 'atlas', legInks: story.legInks, theme: 'swiss', curve: 'auto', arrows: true, graticule: false,
  borderWidth: 0.5, stops: 'ends', seaLabel: SEA_LABEL,
});

/** The chart a story is told on, in a look: its stops as routes, before any chapter's notes. */
export function storySpec(story: MapStory, look: StoryLook = STORY_LOOK(story)): ChartAssemblyInput {
  return {
    data: { values: rowsOf(story) },
    semantic_types: {
      Stop: 'Rank', [story.legField]: 'Category', Place: 'Name', [story.routeField ?? ROUTE]: 'Category',
      ...(story.widthField ? { [story.widthField]: 'Count' } : {}), longitude: 'Longitude', latitude: 'Latitude',
    },
    chart_spec: {
      chartType: 'Map',
      title: story.title,
      // The keys stand under the map, as a caption does, so the map starts right under its title.
      encodings: {
        longitude: 'longitude', latitude: 'latitude', order: 'Stop', detail: story.routeField ?? ROUTE,
        color: { field: story.legField, ...(look.legInks ? { scheme: [...look.legInks] } : {}), legend: { orient: 'bottom' } },
        ...(story.widthField ? { strokeWidth: { field: story.widthField, legend: { orient: 'bottom' } } } : {}),
      },
      // By default a dot where each stretch starts and ends; the stops between are marked by their arrows.
      chartProperties: {
        mapStyle: look.mapStyle,
        ...(look.borderWidth !== undefined ? { borderWidth: look.borderWidth } : {}),
        ...(look.curve !== 'auto' ? { curve: look.curve } : {}),
        ...(look.arrows ? {} : { arrows: false }),
        ...(look.graticule ? { graticule: true } : {}),
        ...(look.stops !== 'none' ? { stops: look.stops } : {}),
        ...(look.stops !== 'none' && look.stopRadius !== undefined ? { stopRadius: look.stopRadius } : {}),
        ...(story.boundaries ? { boundaries: story.boundaries } : {}),
      },
      canvasSize: story.canvas,
    },
    ...(look.theme ? { theme_spec: look.theme } : {}),
    interaction_spec: { interactions: [{ type: 'navigate' }] },
    options: { addTooltips: true },
  } as unknown as ChartAssemblyInput;
}

type ChartOverlaySpec = NonNullable<Extract<ChartUpdateOp, { op: 'set-overlay' }>['value']>;

function seasUpdate(story: MapStory, label: StoryLook['seaLabel'] = SEA_LABEL): ChartUpdate {
  const value: ChartOverlaySpec = {
    mark: 'text', role: 'sea-name', data: { values: story.seas.map((sea) => ({ ...sea })) },
    encodings: { longitude: { field: 'longitude' }, latitude: { field: 'latitude' }, text: { field: 'text' } },
    style: { fill: label.fill, fontSize: 11, fontStyle: 'italic', stroke: label.halo },
  };
  return { id: `${story.id}-seas`, ops: [{ op: 'set-overlay', name: 'seas', value }] };
}

/** The stops' box as a viewport (longitude on x, latitude on y), padded by a share of its span so notes fit. */
function frameOf(stops: readonly StoryStop[], margin: number, share = 0.22): { x: [number, number]; y: [number, number] } {
  const pad = (values: number[]): [number, number] => {
    const low = Math.min(...values);
    const high = Math.max(...values);
    const room = Math.max(margin, (high - low) * share);
    return [low - room, high + room];
  };
  return { x: pad(stops.map((stop) => stop.longitude)), y: pad(stops.map((stop) => stop.latitude)) };
}

/** The story's chapters as chart updates: the chapter's own, and its notes on legs (which name the rows its stop notes do). */
function chapterUpdates(story: MapStory, spec: ChartAssemblyInput) {
  const rows = rowsOf(story);
  // A note names one mark by the fields the chart keys its marks on.
  const fields = (assembleVegaLite(spec) as { _interactionSemantics?: { fields?: string[] } })._interactionSemantics?.fields
    ?? ['longitude', 'latitude', 'Stop'];
  const indexOf = new Map(story.stops.map((stop, index) => [stop.id, index]));
  const stopOf = (id: string) => {
    const index = indexOf.get(id);
    if (index === undefined) throw new Error(`${story.id}: no stop '${id}'`);
    return index;
  };
  const keyOf = (id: string) => Object.fromEntries(fields.map((field) => [field, rows[stopOf(id)][field]]));
  const noteOp = (note: StoryNote): ChartUpdateOp => ({
    op: 'annotate-text',
    target: { select: { key: keyOf(note.at), visual: note.on === 'leg' ? { kind: 'path', role: 'leg' } : { kind: 'mark', role: 'point' } } },
    value: { text: note.text },
  });
  return (chapter: StoryChapter): { chapter: ChartUpdate; legs: ChartUpdateOp[] } => {
    const framed = chapter.frame ? chapter.frame.map((id) => story.stops[stopOf(id)]) : story.stops;
    const ops: ChartUpdateOp[] = [{ op: 'set-viewport', axes: 'xy', value: frameOf(framed, story.frameMargin ?? 1.6) }];
    if (chapter.legs?.length) {
      ops.push({ op: 'set-style', targets: [{ select: { where: { [story.legField]: { in: [...chapter.legs] } } } }], value: { state: 'emphasized', emphasis: 'strong' } });
    }
    ops.push(...chapter.notes.filter((note) => note.on !== 'leg').map(noteOp));
    ops.push(...(chapter.extra ?? []));
    return { chapter: { id: `${story.id}-chapter`, ops }, legs: chapter.notes.filter((note) => note.on === 'leg').map(noteOp) };
  };
}

/** The story beside its map, in a look (else the story's own). */
export function MapStoryStage({ story, look }: { story: MapStory; look?: StoryLook }) {
  const drawn = useMemo(() => look ?? STORY_LOOK(story), [look, story]);
  const spec = useMemo(() => storySpec(story, drawn), [story, drawn]);
  const updatesOf = useMemo(() => chapterUpdates(story, spec), [story, spec]);
  const [index, setIndex] = useState(0);
  const [surface, setSurface] = useState<InteractiveChartSurface | null>(null);
  const chapters = story.chapters;
  const chapter = chapters[index];
  // Each chapter in the colour of the stretch it follows: the stretches take the inks in the order the story meets them.
  const board = useMemo<BoardChapter[]>(() => {
    const order = [...new Set(story.stops.map((stop) => stop.leg))];
    // A house's own palette is not known here: the timeline's nodes stay neutral.
    const inks = drawn.legInks;
    const inkOf = (leg: string) => (inks ? inks[order.indexOf(leg) % inks.length] : undefined);
    return chapters.map((item) => {
      const ink = item.legs?.length ? inkOf(item.legs[0]) : undefined;
      return { title: item.title, text: item.text, ...(ink ? { ink } : {}) };
    });
  }, [story, chapters, drawn]);

  useEffect(() => { setIndex(0); }, [story]);

  useEffect(() => {
    if (!surface) return;
    void surface.applyUpdate(seasUpdate(story, drawn.seaLabel));
  }, [surface, story, spec, drawn.seaLabel]);

  // Each chapter replaces the last (one update id), easing the map to its frame.
  useEffect(() => {
    if (!surface || !chapter) return;
    const { chapter: update, legs } = updatesOf(chapter);
    const legNotes = `${story.id}-chapter-legs`;
    void (async () => {
      await surface.applyUpdate(update, { transition: { duration: 700 } });
      await (legs.length ? surface.applyUpdate({ id: legNotes, ops: legs }) : surface.clearUpdate(legNotes));
    })();
  }, [surface, chapter, updatesOf, story.id]);

  return (
    <StoryBoard
      chapters={board}
      index={index}
      onSelect={setIndex}
      label={story.title}
      map={(
        <ScaleToFit height={600} adaptiveHeight padding={4}>
          <div className="ic-flint-dimpvis-mount">
            <FlintChart
              key={story.id}
              spec={spec}
              renderer="svg"
              expressionInterpreter={expressionInterpreter}
              ariaLabel={`Map: ${story.title}`}
              chartId={`${story.id}-story`}
              onRender={setSurface}
              onError={(error) => console.error(`${story.title}: the stage failed to build`, error)}
            />
          </div>
        </ScaleToFit>
      )}
    />
  );
}

/**
 * The spec as JSON, a data row to a line, with the updates that open the story: the sea names and
 * the first chapter (its frame, its notes, its overlays), so a copy pasted elsewhere opens as the page does.
 */
export function storySpecText(story: MapStory, look: StoryLook = STORY_LOOK(story)): string {
  const spec = storySpec(story, look);
  const first = chapterUpdates(story, spec)(story.chapters[0]);
  const opening = {
    ...spec,
    updates: [seasUpdate(story, look.seaLabel), first.chapter, ...(first.legs.length ? [{ id: `${story.id}-chapter-legs`, ops: first.legs }] : [])],
  } as ChartAssemblyInput & { data: { values: unknown[] } };
  return specText(opening);
}

/** A spec as JSON, a data row to a line. */
export function specText(spec: ChartAssemblyInput): string {
  const rows = (spec.data as { values: unknown[] }).values.map((row) => `      ${JSON.stringify(row)}`).join(',\n');
  return JSON.stringify({ ...spec, data: { values: '__ROWS__' } }, null, 2).replace('"__ROWS__"', `[\n${rows}\n    ]`);
}

