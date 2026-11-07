/**
 * The style-guide houses — themes adapted from 69 public data-visualisation style guides — as the
 * Visual Themes page and the Theme Lab show them: a short name, a line on the design idea, the theme.
 */
import { withChrome, type ThemeSpec } from 'flint-chart';

/** A theme's inks for its swatch: the single-series ink, then the categorical set. */
export function themeInks(theme: ThemeSpec): string[] {
  const series = theme.ink?.series as { single?: string; categorical?: string[] } | undefined;
  const inks = [series?.single, ...(series?.categorical ?? [])].filter((c): c is string => typeof c === 'string' && c.length > 0);
  return [...new Set(inks)].slice(0, 4);
}

/** A style-guide house as the picker shows it: a short name, its full org, its theme and what it is about. */
export interface HouseChoice { id: string; name: string; org: string; theme: ThemeSpec; about: string }

/** Names the short rule below would leave long or unclear. */
const HOUSE_NAMES: Record<string, string> = {
  cfpb: 'CFPB', 'dallas-morning-news': 'Dallas Morning News', 'goldman-sachs': 'Goldman Sachs', hdx: 'HDX',
  material: 'Material Design', michelin: 'Michelin', 'monash-climate': 'Monash Climate', morningstar: 'Morningstar',
  ons: 'UK ONS', tractie: 'NS Dutch Railways', 'usaid-oha': 'USAID', who: 'WHO', 'london-city-intelligence': 'London GLA',
};

/** An org's name without its parenthetical, subtitle or design-system name: "Datadog (DRUIDS design system)" → "Datadog". */
export function shortName(id: string, org: string, label?: string): string {
  if (HOUSE_NAMES[id]) return HOUSE_NAMES[id];
  const cut = (text: string) => text.split(/ \(| — | – |: /)[0].trim();
  const fromOrg = cut(org);
  const fromLabel = label ? cut(label) : fromOrg;
  return fromOrg.length > 22 && fromLabel.length < fromOrg.length ? fromLabel : fromOrg;
}

/**
 * The research summary's opening, to a sentence or two: the house's design idea in brief — where it
 * is used, then how it looks. Parenthetical asides and quoted names are dropped to keep it to a line or two.
 */
export function aboutHouse(summary: string | undefined): string {
  const clean = (summary ?? '').replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  const sentences = clean.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [];
  let text = '';
  for (const sentence of sentences) {
    if (text && (text + sentence).length > 240) break;
    text += sentence;
  }
  text = text.trim() || clean;
  if (text.length <= 240) return text;
  // One long sentence: cut it at the last clause that fits.
  const cut = text.slice(0, 240);
  const at = Math.max(cut.lastIndexOf(', '), cut.lastIndexOf('; '));
  return `${(at > 120 ? cut.slice(0, at) : cut.slice(0, cut.lastIndexOf(' '))).trim()}…`;
}

let housesPromise: Promise<HouseChoice[]> | undefined;

/** Style-guide houses Flint now ships as presets; the page offers each once, as the preset. */
const SHIPPED_AS_PRESET = new Set(['bbc', 'material']);

/** How many houses `loadHouses` offers, counted from the module list without loading the modules (each file is named for its house). */
export const HOUSE_COUNT = Object.keys(import.meta.glob('../playground/new-theme-test/themes/*.ts'))
  .map((path) => path.split('/').pop()!.replace(/\.ts$/, ''))
  .filter((name) => name !== 'index' && !SHIPPED_AS_PRESET.has(name)).length;

/**
 * Every researched style-guide house, loaded on demand (the modules carry their research and gap
 * charts too) and loaded once. Their logos are left out: inline SVG and image data that would
 * swamp an editor and every preview.
 */
export function loadHouses(): Promise<HouseChoice[]> {
  // A house that has since shipped as a preset is offered once, as the preset.
  housesPromise ??= import('../playground/new-theme-test/themes').then(({ STYLE_GUIDE_THEMES }) => STYLE_GUIDE_THEMES
    .filter((house) => !SHIPPED_AS_PRESET.has(house.id))
    .map((house) => ({
    id: house.id, name: shortName(house.id, house.org, house.theme.label), org: house.org,
    theme: withChrome(house.theme, { logos: false }) ?? house.theme,
    about: aboutHouse(house.research?.summary),
    })));
  return housesPromise;
}
