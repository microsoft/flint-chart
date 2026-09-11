// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ChartWarning } from 'flint-chart';

/** Rendering backends that can produce an artifact. */
export type RenderBackend = 'vegalite' | 'echarts' | 'chartjs';

/** Output artifact format. */
export type RenderFormat = 'png' | 'svg';

export interface RenderOptions {
  /** Output format. `chartjs` supports `png` only. Default: `png`. */
  format?: RenderFormat;
  /**
   * Device scale applied to the PNG raster (1 = design size, 2 = retina).
   * Ignored for `svg` output. Default: `1`.
   */
  scale?: number;
  /** Background color for the artifact. Default: `#ffffff`. */
  background?: string;
  /** When true, reject local `data.url` file references (inline rows only). */
  disableFileReference?: boolean;
  /** Base directory for resolving relative `data.url` paths. Defaults to cwd. */
  cwd?: string;
}

/** A rendered artifact plus the assembly warnings that produced it. */
export interface RenderResult {
  backend: RenderBackend;
  format: RenderFormat;
  /** MIME type: `image/png` or `image/svg+xml`. */
  mimeType: string;
  /** Raw PNG bytes (present when `format === 'png'`). */
  buffer?: Buffer;
  /** base64-encoded PNG (present when `format === 'png'`). */
  base64?: string;
  /** SVG markup (present when `format === 'svg'`). */
  svg?: string;
  /** Logical artifact width in CSS pixels (before `scale`). */
  width: number;
  /** Logical artifact height in CSS pixels (before `scale`). */
  height: number;
  /** Warnings emitted by the Flint assembler for this spec. */
  warnings: ChartWarning[];
}
