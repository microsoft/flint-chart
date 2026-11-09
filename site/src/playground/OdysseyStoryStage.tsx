import { useEffect, useMemo, useState } from 'react';
import { assembleVegaLite, resolveThemeSpec, type ChartAssemblyInput, type ChartUpdateOp } from 'flint-chart';
import type { ChartUpdate, InteractiveChartSurface } from 'flint-chart/interactive';
import { FlintChart } from 'flint-chart/react';
import { expressionInterpreter } from 'vega-interpreter';
import { ScaleToFit } from '../components/ScaleToFit';
import { StoryBoard, type BoardChapter } from './stories/StoryBoard';
import { GREEK_WORLD } from './stories/boundaries';

/**
 * A story told on a map, chapter by chapter: the wanderings of Odysseus, from Troy home to Ithaca.
 *
 * The chart is an ordinary point Map: `order` joins the stops into one route, `color` paints each leg
 * of the voyage, `detail` keeps them one route, and `size` is each leg's width — the crew that sailed it.
 * Every chapter is one chart update with one id, so the next replaces it whole:
 *
 * - `set-viewport` eases the map to the chapter's stops;
 * - `set-style` recedes the rest of the route;
 * - `annotate-text` notes the chapter's episodes;
 * - a chapter may add an overlay of its own: the first draws the direct way home (`set-overlay`).
 *
 * The sea names are one more `set-overlay`, under their own id, so they stay from chapter to chapter.
 * Notes keep clear of them, of the route and its heads, and stay inside the map.
 *
 * Places follow the traditional identifications; Homer's geography is a poet's. Crews follow a
 * traditional reckoning: twelve ships of about fifty men leave Troy.
 */

interface Stop { stop: number; leg: string; crew: number; episode: string; longitude: number; latitude: number }

const STOPS: readonly Stop[] = [
  { stop: 1, leg: 'Leaving Troy', crew: 600, episode: 'Troy', longitude: 26.24, latitude: 39.96 },
  { stop: 2, leg: 'Leaving Troy', crew: 528, episode: 'Ismarus', longitude: 25.52, latitude: 40.89 },
  { stop: 3, leg: 'Leaving Troy', crew: 528, episode: 'The Lotus-Eaters', longitude: 10.86, latitude: 33.81 },
  { stop: 4, leg: 'Monsters and winds', crew: 522, episode: 'The Cyclops', longitude: 15.16, latitude: 37.56 },
  { stop: 5, leg: 'Monsters and winds', crew: 522, episode: 'Aeolia', longitude: 14.95, latitude: 38.47 },
  { stop: 6, leg: 'Monsters and winds', crew: 46, episode: 'The Laestrygonians', longitude: 9.16, latitude: 41.39 },
  { stop: 7, leg: 'Circe and the dead', crew: 45, episode: 'Aeaea', longitude: 13.05, latitude: 41.23 },
  { stop: 8, leg: 'Circe and the dead', crew: 45, episode: 'The Underworld', longitude: 14.07, latitude: 40.84 },
  { stop: 9, leg: 'Sirens to shipwreck', crew: 45, episode: 'The Sirens', longitude: 14.43, latitude: 40.58 },
  { stop: 10, leg: 'Sirens to shipwreck', crew: 39, episode: 'Scylla and Charybdis', longitude: 15.63, latitude: 38.25 },
  { stop: 11, leg: 'Sirens to shipwreck', crew: 1, episode: 'Thrinacia', longitude: 15.0, latitude: 37.08 },
  { stop: 12, leg: 'Homeward', crew: 1, episode: 'Ogygia', longitude: 14.25, latitude: 36.05 },
  { stop: 13, leg: 'Homeward', crew: 1, episode: 'Scheria', longitude: 19.92, latitude: 39.62 },
  { stop: 14, leg: 'Homeward', crew: 1, episode: 'Ithaca', longitude: 20.71, latitude: 38.37 },
];

const ROWS = STOPS.map(({ stop, leg, crew, episode, longitude, latitude }) =>
  ({ Stop: stop, Leg: leg, Crew: crew, Episode: episode, Voyage: 'Odysseus', longitude, latitude }));

/** What the Odyssey page lets a reader try: the map's ground, the legs' colours, the house, and how the route is drawn. */
export interface OdysseyLook {
  /** A named map style, or a style of its own. */
  mapStyle: string | Record<string, string>;
  /** The legs' colours, in voyage order; unset takes the house's palette. */
  legInks?: readonly string[];
  /** A house Flint ships; unset draws without one. */
  theme?: string;
  curve: 'auto' | 'arc' | 'great-circle' | 'straight';
  arrows: boolean;
  graticule: boolean;
  borderWidth?: number;
  /** Dots at every stop, at each chapter's start and end (`ends`), or none; `stopRadius` their radius in px, else the map's own. */
  stops: 'all' | 'ends' | 'none';
  stopRadius?: number;
  /** The sea names' ink and the halo they stand in, to read on the ground's water. */
  seaLabel: { fill: string; halo: string };
}

// An atlas ground and a Swiss house, so the voyage carries the colour: it sets out from Troy in
// crimson and comes home in navy.
export const DEFAULT_LOOK: OdysseyLook = {
  mapStyle: 'atlas',
  legInks: ['#b2182b', '#e0622b', '#d9a320', '#2a9d8f', '#1d3557'],
  theme: 'swiss',
  curve: 'auto',
  arrows: true,
  graticule: false,
  borderWidth: 0.5,
  stops: 'ends',
  // The atlas's water, so a route crossing a sea's name does not cut it.
  seaLabel: { fill: '#5f7d92', halo: '#dbe9f2' },
};

/**
 * The story drawn in a house (null: Flint's own): the house's ground and palette, the sea names in a
 * halo of its page, which is the water a route map leaves to the theme.
 */
export function odysseyLookInHouse(theme: string | null): OdysseyLook {
  const { theme: _swiss, ...rest } = DEFAULT_LOOK;
  const ink = theme ? resolveThemeSpec(theme)?.ink : undefined;
  const canvas = ink?.surface?.canvas;
  const page = typeof canvas === 'string' && /^#[0-9a-f]{6}$/i.test(canvas) ? canvas : '#ffffff';
  const n = parseInt(page.slice(1), 16);
  const dark = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) < 110;
  const palette = ink?.series?.categorical;
  return {
    ...rest,
    ...(theme ? { theme } : {}),
    ...(palette?.length ? { legInks: palette.slice(0, 5) } : {}),
    mapStyle: 'auto',
    seaLabel: { fill: dark ? '#b9c8d4' : '#6f7f8c', halo: page },
  };
}

/** The chart the story is told on: the stops as one route, before any chapter's notes. */
export function odysseySpec(look: OdysseyLook = DEFAULT_LOOK): ChartAssemblyInput {
  return {
    data: { values: ROWS },
    semantic_types: { Stop: 'Rank', Leg: 'Category', Crew: 'Count', Voyage: 'Category', Episode: 'Name', longitude: 'Longitude', latitude: 'Latitude' },
    chart_spec: {
      chartType: 'Map',
      title: 'The wanderings of Odysseus',
      // The keys stand under the map, as a caption does, so the map starts right under its title.
      encodings: {
        longitude: 'longitude', latitude: 'latitude', order: 'Stop', detail: 'Voyage',
        color: { field: 'Leg', ...(look.legInks ? { scheme: [...look.legInks] } : {}), legend: { orient: 'bottom' } },
        strokeWidth: { field: 'Crew', legend: { orient: 'bottom' } },
      },
      chartProperties: {
        mapStyle: look.mapStyle,
        // Natural Earth's finest coasts, cut to the Mediterranean: the world map's are too coarse for a chapter's close frame.
        boundaries: GREEK_WORLD,
        ...(look.curve !== 'auto' ? { curve: look.curve } : {}),
        ...(look.arrows ? {} : { arrows: false }),
        ...(look.graticule ? { graticule: true } : {}),
        ...(look.borderWidth !== undefined ? { borderWidth: look.borderWidth } : {}),
        ...(look.stops !== 'none' ? { stops: look.stops } : {}),
        ...(look.stops !== 'none' && look.stopRadius !== undefined ? { stopRadius: look.stopRadius } : {}),
      },
      // Wider than tall, as the Mediterranean the voyage crosses is.
      canvasSize: { width: 600, height: 600 },
    },
    ...(look.theme ? { theme_spec: look.theme } : {}),
    interaction_spec: { interactions: [{ type: 'navigate' }] },
    options: { addTooltips: true },
  } as ChartAssemblyInput;
}

const ODYSSEY = odysseySpec();

type ChartOverlaySpec = NonNullable<Extract<ChartUpdateOp, { op: 'set-overlay' }>['value']>;

// ── Geography ────────────────────────────────────────────────────────────

const stopAt = (stop: number) => STOPS.find((row) => row.stop === stop)!;

/** Great-circle distance in km. */
function kilometres(a: Stop, b: Stop): number {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const roundTo = (value: number, step: number) => Math.round(value / step) * step;
const SAILED_KM = roundTo(STOPS.slice(1).reduce((total, row, index) => total + kilometres(STOPS[index], row), 0), 100);
const DIRECT_KM = roundTo(kilometres(stopAt(1), stopAt(14)), 10);

/** The stops' box as a viewport (longitude on x, latitude on y), padded by a share of its span so notes fit. */
function frameOf(stops: readonly number[], share = 0.22, min = 1.6): { x: [number, number]; y: [number, number] } {
  const rows = stops.map(stopAt);
  const pad = (values: number[]): [number, number] => {
    const low = Math.min(...values);
    const high = Math.max(...values);
    const margin = Math.max(min, (high - low) * share);
    return [low - margin, high + margin];
  };
  return { x: pad(rows.map((row) => row.longitude)), y: pad(rows.map((row) => row.latitude)) };
}

const textOverlay = (role: string, values: readonly Record<string, unknown>[], style: ChartOverlaySpec['style']): ChartOverlaySpec => ({
  mark: 'text', role, data: { values },
  encodings: { longitude: { field: 'longitude' }, latitude: { field: 'latitude' }, text: { field: 'text' } },
  style,
});

const ROUTE_INK = '#5c6b77';

// ── Chapters ─────────────────────────────────────────────────────────────

/** A note on one stop, or on the leg that sets out from it. */
interface Note { stop: number; text: string; on?: 'leg' }

interface Chapter {
  title: string;
  /** The leg of the voyage the chapter follows; the rest of the route recedes. */
  leg?: string;
  /** The stops to frame; every stop when left out. */
  frame?: readonly number[];
  text: string;
  notes: readonly Note[];
  /** Overlays of the chapter's own, gone with it. */
  extra?: readonly ChartUpdateOp[];
}

// The sea most of the wandering happens round: its box, for counting the episodes in it.
const TYRRHENIAN = { longitude: [8.6, 16.4] as [number, number], latitude: [37.9, 41.9] as [number, number] };
const TYRRHENIAN_STOPS = STOPS.filter((row) => row.longitude >= TYRRHENIAN.longitude[0] && row.longitude <= TYRRHENIAN.longitude[1]
  && row.latitude >= TYRRHENIAN.latitude[0] && row.latitude <= TYRRHENIAN.latitude[1]).length;

const CHAPTERS: readonly Chapter[] = [
  {
    title: 'Twenty years from home',
    text: `Troy has fallen after ten years of war, and Odysseus sets out for Ithaca with twelve ships, about six hundred men. `
      + `Ithaca is ${DIRECT_KM} km away as the crow flies. He will sail about ${SAILED_KM.toLocaleString('en')} km, take ten more years, and come home alone.`,
    notes: [{ stop: 1, text: 'Troy: the war is over' }, { stop: 14, text: 'Ithaca, ten years later' }],
    extra: [
      {
        op: 'set-overlay', name: 'direct-line', value: {
          mark: 'line', role: 'direct-route',
          data: { values: [stopAt(1), stopAt(14)].map(({ longitude, latitude }, index) => ({ order: index + 1, longitude, latitude })) },
          encodings: { longitude: { field: 'longitude' }, latitude: { field: 'latitude' }, order: { field: 'order' } },
          // Lighter and beneath the route: a reference, read in the background of the route taken.
          style: { stroke: ROUTE_INK, strokeWidth: 1.5, strokeDash: 'dash', opacity: 0.55 },
          layer: 'under',
        },
      },
    ],
  },
  {
    title: 'Leaving Troy',
    leg: 'Leaving Troy',
    frame: [1, 2, 3],
    text: 'The fleet sacks Ismarus, city of the Cicones, but lingers; the Cicones return in force and kill six men from every ship. '
      + 'A north wind drives them nine days off course to the Lotus-Eaters, whose honeyed fruit makes men forget home.',
    notes: [
      { stop: 2, text: 'Ismarus sacked; 72 men killed' },
      { stop: 2, on: 'leg', text: 'Nine days blown off course' },
      { stop: 3, text: 'The lotus: men forget home' },
    ],
  },
  {
    title: 'Monsters and winds',
    leg: 'Monsters and winds',
    frame: [3, 4, 5, 6],
    text: 'In the Cyclops’ cave Polyphemus eats six men before Odysseus, “Nobody”, blinds him. Aeolus gives him the winds tied in a bag; '
      + 'within sight of Ithaca the crew opens it, and the gale blows them back. Then the giant Laestrygonians sink eleven of the twelve ships.',
    notes: [
      { stop: 4, text: 'Polyphemus eats six men' },
      { stop: 5, text: 'A bag of winds, opened too soon' },
      { stop: 6, text: 'Eleven ships sunk; one escapes' },
    ],
  },
  {
    title: 'Circe and the dead',
    leg: 'Circe and the dead',
    frame: [6, 7, 8],
    text: 'One ship and forty-six men reach Aeaea, where Circe turns the scouts into swine. Odysseus stays a year, then sails to the edge '
      + `of the world to ask the ghost of Tiresias the way home. ${TYRRHENIAN_STOPS} of the ${STOPS.length} episodes lie around this one sea.`,
    notes: [
      { stop: 7, text: 'A year with Circe' },
      { stop: 8, text: 'The ghost of Tiresias' },
    ],
  },
  {
    title: 'Sirens to shipwreck',
    leg: 'Sirens to shipwreck',
    frame: [8, 9, 10, 11],
    text: 'Bound to the mast, Odysseus hears the Sirens while his crew row on with wax in their ears. Scylla snatches six men from the deck. '
      + 'On Thrinacia, starving, the crew kill the cattle of the Sun; Zeus wrecks the ship, and only Odysseus survives.',
    notes: [
      { stop: 9, text: 'Bound to the mast' },
      { stop: 10, text: 'Scylla takes six men' },
      { stop: 11, text: 'The Sun’s cattle: all but one drown' },
    ],
  },
  {
    title: 'Homeward',
    leg: 'Homeward',
    frame: [11, 12, 13, 14],
    text: 'Clinging to wreckage, Odysseus washes up on Ogygia, where Calypso keeps him seven years. Shipwrecked once more on Scheria, '
      + 'he tells the Phaeacians his story, and they carry him home asleep. He wakes on Ithaca, twenty years after he left.',
    notes: [
      { stop: 12, text: 'Seven years with Calypso' },
      { stop: 13, text: 'The Phaeacians carry him home' },
      { stop: 14, text: 'Home, after twenty years' },
    ],
  },
  {
    title: 'The whole voyage',
    text: `Ithaca was ${DIRECT_KM} km from Troy. Odysseus sailed about ${SAILED_KM.toLocaleString('en')} km to get there, most of it lost in one sea, `
      + 'and took ten years. Twelve ships and some six hundred men set out; one man came home, in a stranger’s ship, to a house full of suitors.',
    notes: [
      { stop: 1, text: 'Twelve ships, 600 men' },
      { stop: 6, text: 'Eleven ships lost' },
      { stop: 14, text: 'One man home' },
    ],
  },
];

// A note names one mark by the fields the chart keys its marks on.
const KEY_FIELDS: readonly string[] = (assembleVegaLite(ODYSSEY) as { _interactionSemantics?: { fields?: string[] } })
  ._interactionSemantics?.fields ?? ['longitude', 'latitude', 'Stop'];
const keyOf = (stop: number): Record<string, unknown> => {
  const row = ROWS.find((candidate) => candidate.Stop === stop) as Record<string, unknown>;
  return Object.fromEntries(KEY_FIELDS.map((field) => [field, row[field]]));
};

const noteOp = (note: Note): ChartUpdateOp => ({
  op: 'annotate-text',
  target: { select: { key: keyOf(note.stop), visual: note.on === 'leg' ? { kind: 'path', role: 'leg' } : { kind: 'mark', role: 'point' } } },
  value: { text: note.text },
});

const CHAPTER_UPDATE = 'odyssey-chapter';
// A note on a stop and one on the leg leaving it name the same row: a note is keyed by its row within an
// update, so leg notes go in an update of their own.
const LEG_NOTES_UPDATE = 'odyssey-chapter-legs';
const SEAS_UPDATE = 'odyssey-seas';

function chapterUpdate(chapter: Chapter): ChartUpdate {
  const ops: ChartUpdateOp[] = [{ op: 'set-viewport', axes: 'xy', value: frameOf(chapter.frame ?? STOPS.map((row) => row.stop)) }];
  if (chapter.leg) {
    ops.push({ op: 'set-style', targets: [{ select: { where: { Leg: { in: [chapter.leg] } } } }], value: { state: 'emphasized', emphasis: 'strong' } });
  }
  ops.push(...chapter.notes.filter((note) => note.on !== 'leg').map(noteOp));
  ops.push(...(chapter.extra ?? []));
  return { id: CHAPTER_UPDATE, ops };
}

const seasUpdate = (label: OdysseyLook['seaLabel']): ChartUpdate => ({
  id: SEAS_UPDATE,
  ops: [{
    op: 'set-overlay', name: 'seas',
    value: textOverlay('sea-name', [
      { text: 'Aegean Sea', longitude: 25.2, latitude: 38.6 },
      { text: 'Ionian Sea', longitude: 18.6, latitude: 37.4 },
      { text: 'Tyrrhenian Sea', longitude: 12.0, latitude: 39.6 },
      { text: 'Mediterranean Sea', longitude: 18.5, latitude: 34.2 },
    ], { fill: label.fill, fontSize: 11, fontStyle: 'italic', stroke: label.halo }),
  }],
});

/** The updates that open the story: the sea names and the first chapter, for a copy of the spec to carry. */
export function odysseyOpeningUpdates(look: OdysseyLook = DEFAULT_LOOK): ChartUpdate[] {
  const first = CHAPTERS[0];
  const legNotes = first.notes.filter((note) => note.on === 'leg').map(noteOp);
  return [seasUpdate(look.seaLabel), chapterUpdate(first), ...(legNotes.length ? [{ id: LEG_NOTES_UPDATE, ops: legNotes }] : [])];
}

// ── Stage ────────────────────────────────────────────────────────────────

/** The story beside its map; a `look` redraws the map in other colours and keeps the chapter. */
export function OdysseyStoryStage({ look = DEFAULT_LOOK, compact = false }: { look?: OdysseyLook; compact?: boolean } = {}) {
  const spec = useMemo(() => odysseySpec(look), [look]);
  const [index, setIndex] = useState(0);
  const [surface, setSurface] = useState<InteractiveChartSurface | null>(null);
  const chapter = CHAPTERS[index];
  // Each chapter in its leg's colour, as the map draws the leg.
  const board = useMemo<BoardChapter[]>(() => {
    const legs = [...new Set(STOPS.map((row) => row.leg))];
    return CHAPTERS.map((item) => {
      const ink = item.leg && look.legInks ? look.legInks[legs.indexOf(item.leg) % look.legInks.length] : undefined;
      return { title: item.title, text: item.text, ...(ink ? { ink } : {}) };
    });
  }, [look.legInks]);

  useEffect(() => {
    if (!surface) return;
    void surface.applyUpdate(seasUpdate(look.seaLabel));
  }, [surface, spec, look.seaLabel]);

  // Each chapter replaces the last (one update id), easing the map to its frame.
  useEffect(() => {
    if (!surface) return;
    void (async () => {
      await surface.applyUpdate(chapterUpdate(chapter), { transition: { duration: 700 } });
      const legNotes = chapter.notes.filter((note) => note.on === 'leg').map(noteOp);
      await (legNotes.length ? surface.applyUpdate({ id: LEG_NOTES_UPDATE, ops: legNotes }) : surface.clearUpdate(LEG_NOTES_UPDATE));
    })();
  }, [surface, spec, chapter]);

  return (
    <StoryBoard
      chapters={board}
      index={index}
      onSelect={setIndex}
      label="The wanderings of Odysseus"
      compact={compact}
      map={(
        <ScaleToFit height={600} adaptiveHeight padding={4}>
          <div className="ic-flint-dimpvis-mount">
            <FlintChart
              spec={spec}
              renderer="svg"
              expressionInterpreter={expressionInterpreter}
              ariaLabel="Map of the wanderings of Odysseus"
              chartId="odyssey-story"
              onRender={setSurface}
              onError={(error) => console.error('Odyssey stage failed to build', error)}
            />
          </div>
        </ScaleToFit>
      )}
    />
  );
}
