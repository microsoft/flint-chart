// @ts-check

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(here, 'examples');

const snapshots = [
  ['out/gallery/funnel-chart/00-card5.excel.png', 'funnel.png'],
  ['out/gallery/pyramid-chart/00-card18.excel.png', 'pyramid.png'],
  ['out/gallery/grouped-bar-chart/14-card6.excel.png', 'grouped-bar.png'],
  ['out/gallery/line-chart/14-card50.excel.png', 'multi-series-line.png'],
  ['out/gallery/area-chart/01-card24.excel.png', 'stacked-area.png'],
  ['out/gallery/radar-chart/05-card8.excel.png', 'radar.png'],
  ['out/gallery/treemap/01-card0.excel.png', 'treemap.png'],
  ['out/gallery/sunburst-chart/02-card0.excel.png', 'sunburst.png'],
  ['out/candlestick-audit/advanced-90-day-dense.excel.png', 'candlestick.png'],
];

mkdirSync(examplesDir, { recursive: true });
for (const [sourceRelative, destinationName] of snapshots) {
  const source = join(here, sourceRelative);
  if (!existsSync(source)) {
    throw new Error(`Missing evaluation output: ${sourceRelative}`);
  }
  copyFileSync(source, join(examplesDir, destinationName));
  console.log(`updated examples/${destinationName}`);
}
