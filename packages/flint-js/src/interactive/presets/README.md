# Interaction Presets

Presets translate semantic interaction events into renderer-neutral `ChartUpdate` operations. They decide what action to take, not how a particular mark should draw that action.

Region presets follow chart geometry. `brushX()` and `brushY()` consume Cartesian intervals, while `brushAngle()` consumes an annular sector and is admitted only by polar ChartDefs such as pie, donut, and rose. All three produce the same semantic `emphasize` operation after the owning ChartDef resolves physical hits.

## Emphasis Policy

Built-in selection presets use one clear opacity rule:

- focused elements retain their authored opacity;
- unfocused elements use `0.25` opacity;
- categorical color does not introduce a separate dimming range.

Keeping one value makes linked views predictable. A bar, point, arc, line, or cell receives the same semantic emphasis operation even when its chart presents focus differently.

## Representation-Aware Presentation

The owning ChartDef may add a focus treatment when opacity alone is insufficient:

| Representation | Focus presentation |
| --- | --- |
| Filled categorical marks | Full opacity; unfocused peers at `0.25` |
| Lines | Full opacity and authored stroke width multiplied by `1.2`; unfocused peers at `0.25` |
| Continuous-color cells | Full opacity plus a contiguous-region boundary; unfocused cells at `0.25` |

Line width is proportional rather than fixed, so a theme's authored hierarchy survives interaction:

$$
w_{focus} = 1.2 w_{authored}
$$

For continuous-color grids, the boundary is drawn once around each contiguous selected region rather than around every cell. This preserves the heatmap as a field instead of introducing a competing internal grid. Its paint comes from the grounded ThemeSpec `interaction.selectionBoundary` role. By default, the foreground borrows the theme accent and the halo borrows the plot surface, keeping the treatment visible over both ends of a color ramp without introducing renderer-owned colors.

## Ownership

The stages remain separate:

1. Trigger normalization reports physical hits.
2. ChartDef resolution converts hits into semantic elements.
3. A preset emits `emphasize` with the selected elements and dim opacity.
4. ChartDef presentation declares representation-specific focus styling.
5. The renderer applies opacity, proportional line width, or region boundaries mechanically.

Presets must not inspect SVG, scenegraph geometry, color scales, or authored stroke widths. Those are renderer and ChartDef presentation concerns.