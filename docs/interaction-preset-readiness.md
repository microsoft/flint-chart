# Vega-Lite interaction preset readiness

This report records the browser sweep exposed on the consolidated test page at
`#/playground/click-focus`. The page selects one representative case for every
Vega-Lite chart template, adds a second Bar Chart case for horizontal orientation,
and includes two multi-legend Scatter Plot stress cases. Each card reports its
actual mount status, and the sticky semantic inspector shows the latest resolved
target, semantic items, phase, and drag drop-target.

For the separation between gestures, updates, and presets, the missing capability
inventory, and the 80% preset / 95% composition targets, see
[interaction-capability-roadmap.md](interaction-capability-roadmap.md).

## Coverage summary

| Preset | Ready cases | Explicitly unsupported | Gesture checks |
| --- | ---: | ---: | --- |
| Click highlight | 39 | 0 | Inspector verified across semantic mark families |
| Click group highlight | 39 | 0 | Inspector reports resolved groups |
| Click annotate | 39 | 0 | Inspector reports annotation subjects |
| Rectangle select | 39 | 0 | Inspector reports selected semantic items |
| X brush | 39 | 0 | Inspector reports interval targets |
| Y brush | 39 | 0 | Inspector reports interval targets |
| Stateful X brush | 39 | 0 | Inspector reports committed and edited intervals |
| Stateful Y brush | 39 | 0 | Inspector reports committed and edited intervals |
| Angular brush | 3 | 34 | 3/3 emitted |
| Navigate | Capability-filtered demos | — | Inspector reports viewport events |
| Drag reorder | Capability-filtered demos | — | All visible cases compile without unsupported cards |

The 407 chart/preset mount combinations produced no unexpected runtime errors.
Unsupported combinations reject during interaction compilation with a specific
diagnostic instead of mounting a silent no-op.

## Drag reorder

`dragReorder()` is supported by unfaceted charts with authored nominal or ordinal
Cartesian position axes. Templates may narrow or disable this capability when
their positional channels compile to nested or polar scales. Vega receives
resettable domain signals through `domainRaw`; the runtime acquires the source
mark, resolves the nearest category slot from the pointer's axis coordinate,
and applies the ordered domain.

Both live orientations passed:

- Vertical bar: the first category moved from the first X band to the fourth.
- Horizontal bar: the first category moved from the first Y band to the fourth.
- Sequential Bar commits compose against the active domain rather than source data order.
- Heatmap horizontal drags reorder whole columns and vertical drags reorder whole rows.
- Composite categories such as Boxplot boxes and whiskers move as one semantic unit.
- Preview dims stationary marks, translates a virtual semantic unit, and marks the insertion edge.
- Each drag emitted `start`, `preview`, and `commit` events.
- Faceted charts, non-categorical axes, and nested/polar scale layouts reject the preset.

## Semantic coverage

All Vega-Lite templates now declare basic element and rectangular-region semantics.
Generated statistical paths resolve to their authored group or category rather than
claiming a one-to-one source observation. Composite charts exclude structural marks:
KPI tracks, Bullet zones, Radar grids, and map baselayers remain decorative.

Angular brush is intentionally restricted to Donut Chart, Pie Chart, and Rose
Chart. Navigation is restricted to templates with at least one unfaceted
quantitative or temporal axis. Category reorder is restricted to authored nominal
or ordinal Cartesian axes. Radar, Rose, and Violin currently opt out because their
apparent position channels do not compile to controllable top-level axis scales;
Range Area opts out because its path-only envelope has no discrete draggable mark.

## Validation procedure

1. Select each mode on the test page and wait for every probe to leave
   `loading`.
2. Verify there are no `error` probes.
3. Interact with ready cards and inspect the shared semantic resolution card.
4. Dispatch start/move/end pointer sequences for every ready region probe.
5. Dispatch a wheel zoom for every ready navigation probe.
6. Drag into category-slot whitespace in both Bar Chart orientations and compare
   rendered mark positions before and after; repeat a second drag against the new order.
7. Reorder one Heatmap column horizontally and one row vertically; verify the
   complete semantic unit appears in the virtual preview.
8. Repeat the mount sweep at a 390 x 844 viewport and verify no page-level
   horizontal overflow.

## Residual work

Choropleth rectangle selection currently uses rendered shape bounds rather than exact
polygon intersection. Grouped, stacked, and faceted Bar reorder still need an explicit
policy for whether the gesture reorders categories, series, or both. These combinations
remain unsupported until their owning templates declare those decisions.
