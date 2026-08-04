// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Default font family for rasterization fallback. We bundle **Liberation Sans**,
 * which is metric-compatible with Arial/Helvetica, so server-side text layout
 * and rendering match what the browser (and the live MCP app) produce with
 * Arial. DejaVu Sans is also bundled as a broad-Unicode glyph fallback.
 */
export const DEFAULT_FONT_FAMILY = 'Liberation Sans';

/**
 * Font stack applied to chart text (axis/legend/title). Resolves to Arial /
 * Helvetica on systems that have them; otherwise to the bundled, Arial-metric
 * Liberation Sans. This keeps static PNG/SVG exports visually identical to the
 * live app preview, including label widths and reserved axis space.
 */
export const CHART_FONT_FAMILY =
  "Arial, 'Helvetica Neue', Helvetica, 'Liberation Sans', Roboto, sans-serif";

/**
 * Generic/aliased family names the bundled Arial-metric font answers to.
 *
 * This list is what keeps text measurement and rasterisation agreeing. The two
 * are done by different engines — `@napi-rs/canvas` measures, resvg draws —
 * and each resolves a CSS font stack against its own view of the system. Where
 * they disagree, Vega reserves a box using one font's width and resvg fills it
 * with another's, so a title measured narrow and drawn wide runs off the edge
 * of the canvas and is clipped. Registering the bundled face under a name
 * forces the measuring side onto it, and the bundled faces are also the ones
 * handed to resvg, so both sides land on the same metrics.
 *
 * That is why the platform sans names are here rather than left to the system.
 * `Helvetica Neue` is the one that bites on macOS: it ships as a `.ttc`
 * collection, which resvg's font database will not open, so resvg fell back to
 * the bundled face while the canvas happily measured the real thing — 26px
 * narrower over a chart title, and every house leading with that stack had its
 * headline shaved off. Naming it here is not a preference about how the chart
 * should look; it is the bundled Arial-metric face standing in for a
 * platform-specific one, which is the same job it already does for `Helvetica`
 * and `Arial`.
 *
 * A family only belongs here when resvg cannot draw it. Georgia and Comic Sans
 * MS are deliberately absent: both engines find them, they agree to within a
 * pixel, and adding them would throw away a house's typeface for nothing.
 */
const SANS_ALIASES = ['sans-serif', 'Arial', 'Helvetica', 'Helvetica Neue', 'Liberation Sans'];

/** Arial-metric primary faces (registered for layout + rendering). */
const SANS_FONTS = [
  { file: 'LiberationSans-Regular.ttf', weight: 'normal' as const },
  { file: 'LiberationSans-Bold.ttf', weight: 'bold' as const },
];

/** Broad-Unicode fallback faces. */
const FALLBACK_FONTS = ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf'];

/** Every bundled TTF, used for resvg's font file list. */
const FONT_FILES = [...SANS_FONTS.map((f) => f.file), ...FALLBACK_FONTS];

let fontDirCache: string | null = null;

/**
 * Locate the bundled `assets/fonts` directory.
 *
 * The render core is emitted to several places (`dist/server.js`,
 * `dist/render/index.js`) and is also run from source during tests, so we walk
 * up from this module until we find the bundled font, rather than assuming a
 * fixed relative depth.
 */
export function getFontDir(): string {
  if (fontDirCache) return fontDirCache;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, 'assets', 'fonts');
    if (existsSync(join(candidate, FONT_FILES[0]))) {
      fontDirCache = candidate;
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback to a CWD-relative guess (covers unusual install layouts).
  fontDirCache = join(process.cwd(), 'assets', 'fonts');
  return fontDirCache;
}

/** Absolute paths to the bundled TTF files that actually exist on disk. */
export function getFontFiles(): string[] {
  const dir = getFontDir();
  return FONT_FILES.map((f) => join(dir, f)).filter((p) => existsSync(p));
}

let vegaTextMetricsInstalled = false;

/**
 * Point Vega's text measurement at `@napi-rs/canvas` so axis/legend label
 * widths match the browser — without depending on `node-canvas` (and its
 * Cairo/Pango system libraries). Vega exposes `textMetrics.width` as a
 * documented override hook (the same one vl-convert uses); we measure each run
 * with the item's exact CSS font, which `vega.font(item)` builds. Registering
 * the bundled Arial-metric faces first makes those measurements match the live
 * app. Idempotent, and a no-op if `@napi-rs/canvas` is unavailable (Vega then
 * keeps its built-in, font-independent width estimate).
 */
export async function installVegaTextMetrics(vega: any): Promise<void> {
  if (vegaTextMetricsInstalled) return;
  let napiCanvas: any;
  try {
    napiCanvas = await import('@napi-rs/canvas');
  } catch {
    return; // napi-canvas unavailable; Vega falls back to width estimation
  }
  registerNapiFonts(napiCanvas);
  const ctx = napiCanvas.createCanvas(64, 64).getContext('2d');
  vega.textMetrics.width = (item: unknown, text: string): number => {
    ctx.font = vega.font(item);
    return ctx.measureText(String(text ?? '')).width;
  };
  vegaTextMetricsInstalled = true;
}

let napiRegistered = false;

/** Register the bundled fonts with `@napi-rs/canvas` (idempotent). */
export function registerNapiFonts(napiCanvas: any): void {
  if (napiRegistered || !napiCanvas?.GlobalFonts) return;
  const dir = getFontDir();
  // Arial-metric faces answer to the generic + Arial/Helvetica names.
  for (const alias of SANS_ALIASES) {
    for (const { file } of SANS_FONTS) {
      const fp = join(dir, file);
      if (!existsSync(fp)) continue;
      try {
        napiCanvas.GlobalFonts.registerFromPath(fp, alias);
      } catch {
        /* ignore individual font registration failures */
      }
    }
  }
  // Unicode fallback faces under their own family name.
  for (const file of FALLBACK_FONTS) {
    const fp = join(dir, file);
    if (!existsSync(fp)) continue;
    try {
      napiCanvas.GlobalFonts.registerFromPath(fp, 'DejaVu Sans');
    } catch {
      /* ignore */
    }
  }
  napiRegistered = true;
}

/** `@resvg/resvg-js` font option block referencing the bundled fonts. */
export function resvgFontOption(): {
  fontFiles: string[];
  loadSystemFonts: boolean;
  defaultFontFamily: string;
} {
  return {
    fontFiles: getFontFiles(),
    loadSystemFonts: true,
    defaultFontFamily: DEFAULT_FONT_FAMILY,
  };
}
