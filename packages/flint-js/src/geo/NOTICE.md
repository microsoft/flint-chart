# Bundled boundaries

The files in this folder let Flint's maps draw without a network. They are also published, unchanged,
on Flint's site at `https://microsoft.github.io/flint-chart/geo/v1/`, the URLs compiled specs name;
a published version never changes (`scripts/publish-site-geo.mjs`).

| File | Source | Licence |
|---|---|---|
| `world-bank-coarse.json`, `world-bank-medium.json` | [World Bank Official Boundaries](https://datacatalog.worldbank.org/search/dataset/0038272/world-bank-official-boundaries) (Admin 0 and Non-Determined Legal Status Areas), simplified to two levels of detail by Data Formulator's `src/maps/data/world-bank/build.sh`, then given ISO 3166-1 numeric ids and a `disputed` mesh by `scripts/build-world-bank.mjs` | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), © The World Bank Group, under the [World Bank's terms of use for datasets](https://www.worldbank.org/en/about/legal/terms-of-use-for-datasets) |
| `world-110m.json` | [world-atlas](https://github.com/topojson/world-atlas) 1:110m countries, as distributed in [vega-datasets](https://github.com/vega/vega-datasets) `data/world-110m.json`, built from [Natural Earth](https://www.naturalearthdata.com/), unchanged | world-atlas: ISC (below); Natural Earth: public domain |
| `states-10m.json` | [us-atlas](https://github.com/topojson/us-atlas) 3.0.1, built from the US Census Bureau's cartographic boundary files, unchanged | us-atlas: ISC (below); Census data: public domain |
| `counties-albers-10m.json` | [us-atlas](https://github.com/topojson/us-atlas) 3.0.1, projected with `geoAlbersUsa().scale(1300).translate([487.5, 305])`, unchanged | us-atlas: ISC (below); Census data: public domain |

## World Bank Official Boundaries

Changes to the World Bank data: territories sharing an ISO 3166-1 alpha-3 code were merged; France's
overseas departments take France's id; geometry was simplified. Use of these files is subject to
CC BY 4.0 and the World Bank's terms of use for datasets linked above, which pass to anyone they are
shared with. Maps drawn from them credit the World Bank at their foot, with its disclaimer:

> The boundaries, colors, denominations, and any other information shown on maps made with these
> files do not imply any judgment on the part of The World Bank concerning the legal status of any
> territory or the endorsement or acceptance of such boundaries.

The World Bank does not endorse Flint or any map made with these files.

## world-atlas and us-atlas

`world-110m.json`, `states-10m.json` and `counties-albers-10m.json` are distributed under this notice:

```
Copyright 2013-2019 Michael Bostock

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
```

## Disputed boundaries

Flint takes no position on any boundary or territorial claim. Natural Earth's borders are de facto
boundaries; the World Bank's mark areas of non-determined legal status. Neither may meet the mapping
law of every country. A host that needs other boundaries passes its own as `options.basemaps`
(see `MapBasemaps` in `src/core/types.ts`).
