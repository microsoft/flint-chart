/**
 * The Greek stories' land: Natural Earth's finest countries (1:10m, public domain), cut to Europe,
 * North Africa and the Near East (30° W to 70° E, 10° N to 75° N) — wider than any story's frame, so
 * a map zoomed out to a whole story never shows the land's edge — and keyed by country code as the
 * world map is, so a chart frames and joins as it would on the world map. Half the points are kept
 * (the least significant dropped first): coasts still fine enough to zoom into the plain of Troy.
 */
export const GREEK_WORLD = {
  url: `${import.meta.env.BASE_URL}map-data/greek-world-10m.json`,
  feature: 'countries',
  ids: 'iso-numeric',
  attribution: 'Natural Earth (1:10m)',
} as const;
