import { SLIDES, type SlideDef } from './slides';
import { VIS_2026, VIS_2026_SLIDES } from './vis2026';

export interface TalkDeckDef {
  id: string;
  title: string;
  /** Where and when it is given, or what it is for. */
  occasion: string;
  slides: SlideDef[];
}

/** Every talk at #/talk/<id>, newest first. */
export const DECKS: TalkDeckDef[] = [
  { id: 'vis-2026', title: VIS_2026.title, occasion: `${VIS_2026.venue} · ${VIS_2026.date}`, slides: VIS_2026_SLIDES },
  { id: 'overview', title: 'Flint: a visualization language for the AI era', occasion: 'The general talk: language, themes, interactions and applications', slides: SLIDES },
];
