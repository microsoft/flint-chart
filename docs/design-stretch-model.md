# Auto Layout Algorithm

Physics-based models for automatically sizing chart axes when data outgrows the available canvas.

New to Flint sizing? Start with [Example: Auto Layout](/playgrounds/auto-layout), then return here for the complete algorithm.

**How to read this document:** [§1](#1-layout-mode-classification) classifies banded vs continuous axes and routes to the right model. [§2](#2-discrete-axis-elastic-budget-model)–[§5](#5-area-layout-2d-pressure-model) describe the four geometry-specific models. [§6](#6-unified-summary) collects the shared pressure–stretch pattern, decision tree, and implementation map.

| § | Model | Geometry | Chart types |
|---|---|---|---|
| [§2](#2-discrete-axis-elastic-budget-model) | Elastic Budget | 1D banded axis | Bar, Histogram, Heatmap, Boxplot |
| [§3](#3-continuous-axis-gas-pressure-model) | Gas Pressure | 2D point cloud | Scatter, Line, Area |
| [§4](#4-circumference-radial-pressure-model) | Circumference | 1D closed loop | Pie, Rose, Sunburst, Radar, Gauge |
| [§5](#5-area-layout-2d-pressure-model) | Area (2D) | 2D filled space | Treemap |

---

## Base size and the stretch ceiling

Every model below starts from **two numbers**: a target size the chart aims for
and a ceiling it may never exceed.

| Field | Role in the model | Default |
|-------|-------------------|---------|
| `baseSize` | **Target.** The rest length $L_0$ / base canvas $W_0 \times H_0$ that every "pressure = demand ÷ supply" ratio below is measured against. | $400 \times 320$ |
| `canvasSize` | **Hard ceiling.** The maximum stretched size, in any dimension (facet grids included). | none → $\text{baseSize} \times \text{maxStretch}$ (default $1.5\times$) |

The stretch multiplier $\beta$ caps how far an axis may grow past the base, and
is set per dimension:

- **No `canvasSize` (default).** Each dimension may stretch up to `maxStretch`
  (default **1.5**), i.e. the ceiling is $\text{baseSize} \times \text{maxStretch}$.
- **Explicit `canvasSize` ceiling.** The caps become the ceiling-to-base ratio:

  $$\beta_x = \max\!\left(1, \frac{\text{canvasSize.width}}{\text{baseSize.width}}\right), \qquad \beta_y = \max\!\left(1, \frac{\text{canvasSize.height}}{\text{baseSize.height}}\right).$$

**Base never exceeds the ceiling.** Before the caps are computed, the base is
clamped per dimension to the ceiling ($L_0 = \min(\text{baseSize}, \text{canvasSize})$).
So a `canvasSize` *smaller* than the base (for example, a fixed slot with
`baseSize` left at its default) shrinks $L_0$ to fit the box. The chart
compresses and degrades text instead of overflowing. With `baseSize` omitted, a
lone `canvasSize` behaves as pure **fit-to-box**: $L_0 = \text{canvasSize}$,
$\beta = 1$, and the chart cannot grow past the box.

The width-driving models (discrete x-axis, gas-pressure x, treemap x-split) use
$\beta_x$; the height-driving models (discrete y-axis, gas-pressure y, treemap
y-split) use $\beta_y$; radial/area caps use $\max(\beta_x, \beta_y)$. The same
ceiling bounds **faceted** layouts: the total stretched extent of the
small-multiple grid cannot exceed `canvasSize`. Where the sections below write a
single $\beta$, read it as $\beta_x$ or $\beta_y$ for that dimension.

---

## Interactive demos

These four models size chart axes when data overflows the canvas. Drag the controls to watch each model respond as you add items, change the stretch factor, or resize the canvas. Every control is explained inside its demo; the sections below give the formulas for readers who want the full derivation.

### Elastic budget — discrete (banded) axis · [§2](#2-discrete-axis-elastic-budget-model)

Bars, histograms, heatmaps. The plot widens as categories are added, then compresses, then overflows once the stretch cap is exhausted.

```flint-playground
discrete
```

### Gas pressure — continuous axis · [§3](#3-continuous-axis-gas-pressure-model)

Scatter, line, area. The axis stretches gently with point density rather than snapping to per-item bands.

```flint-playground
continuous
```

### Circumference — radial / closed loop · [§4](#4-circumference-radial-pressure-model)

Pie, rose, radar. The chart grows its radius to keep the circumference legible as slices crowd in.

```flint-playground
circumference
```

### Area — 2D filled space · [§5](#5-area-layout-2d-pressure-model)

Treemap. The canvas area grows so every rectangle stays large enough to read instead of shrinking to slivers.

```flint-playground
area
```

---

## Table of Contents

- [§1 Layout Mode Classification](#1-layout-mode-classification)
  - [§1.1 Banded vs Non-Banded](#11-banded-vs-non-banded)
  - [§1.2 Decision Tree](#12-decision-tree)
  - [§1.3 Vega-Lite Implementation Notes](#13-vega-lite-implementation-notes)
- [§2 Discrete Axis (Elastic Budget Model)](#2-discrete-axis-elastic-budget-model)
  - [§2.1 Problem](#21-problem)
  - [§2.2 Parameters](#22-parameters)
  - [§2.3 Three Regimes](#23-three-regimes)
  - [§2.4 Power-Law Elastic Budget](#24-power-law-elastic-budget)
  - [§2.5 Theoretical foundation](#25-theoretical-foundation-spring-model)
  - [§2.6 Grouped Items](#26-grouped-items)
  - [§2.7 Per-Mark-Type Guidelines](#27-per-mark-type-guidelines)
  - [§2.8 Faceted Charts](#28-faceted-charts)
  - [§2.9 Summary](#29-summary)
- [§3 Continuous Axis (Gas Pressure Model)](#3-continuous-axis-gas-pressure-model)
  - [§3.1 Problem](#31-problem)
  - [§3.2 Parameters](#32-parameters)
  - [§3.3 Per-Axis Stretch](#33-per-axis-stretch)
  - [§3.4 Positional ≥ Series Constraint](#34-positional--series-constraint)
  - [§3.5 Parameter Table](#35-parameter-table)
  - [§3.6 Worked Examples](#36-worked-examples)
  - [§3.7 Summary](#37-summary)
  - [§3.8 Faceted continuous layout](#38-faceted-continuous-layout-per-subplot-baseline--pressure--ar-blend--fit)
    - [§3.8.1 Problem](#381-problem)
    - [§3.8.2 Per-subplot baseline](#382-per-subplot-baseline-canvas)
    - [§3.8.3 Banking AR](#383-banking-ar-multi-scale-slope-optimization)
    - [§3.8.4 Gas–Banking blend](#384-gasbanking-ar-blend)
    - [§3.8.5 Area budget](#385-area-budget-and-shape)
    - [§3.8.6 Fit to budget](#386-fit-to-budget-preserving-ar)
  - [§3.9 Band AR blending](#39-band-ar-blending)
- [§4 Circumference (Radial Pressure Model)](#4-circumference-radial-pressure-model)
  - [§4.1 Problem](#41-problem)
  - [§4.2 Parameters](#42-parameters)
  - [§4.3 Effective Item Count](#43-effective-item-count)
  - [§4.4 Pressure and Stretch](#44-pressure-and-stretch)
  - [§4.5 Canvas Sizing](#45-canvas-sizing)
  - [§4.6 Gauge Faceting](#46-gauge-faceting)
  - [§4.7 Parameter Table](#47-parameter-table)
  - [§4.8 Summary](#48-summary)
- [§5 Area Layout (2D Pressure Model)](#5-area-layout-2d-pressure-model)
  - [§5.1 Problem](#51-problem)
  - [§5.2 Parameters](#52-parameters)
  - [§5.3 Effective Item Count](#53-effective-item-count)
  - [§5.4 Pressure and Biased Split](#54-pressure-and-biased-split)
  - [§5.5 Worked Examples](#55-worked-examples)
  - [§5.6 Summary](#56-summary)
- [§6 Unified Summary](#6-unified-summary)

---

# §1 Layout Mode Classification

## §1.1 Banded vs Non-Banded

The layout model needs to decide **how** to allocate space for each positional axis. Two independent properties drive that decision:

1. **Scale type** — the Vega-Lite encoding type of the field.
2. **Mark geometry** — whether the mark occupies a fixed-width band or a point-like position.

### Banded layout

A **banded** axis allocates a fixed-width slot (band) per data position. The layout model controls the step size per slot. Items are read by the width/area of their band.

| Condition | Example |
|---|---|
| **Discrete scale** (nominal / ordinal) | Categories on a bar chart, ordinal months |
| **Continuous scale + band mark** | Bar chart with quantitative or temporal X (years as numbers) |
| **Binned axis** (`bin: true`) | Histogram bins — each bin is a band regardless of scale |

### Non-banded layout

A **non-banded** axis places items at data-determined positions within a continuous range. The layout model controls the overall canvas size but does **not** allocate per-item slots.

| Condition | Example |
|---|---|
| **Continuous scale + point mark** | Scatter plot, line chart, area chart |

### Summary matrix

|  | Band mark (bar, rect, boxplot) | Point mark (circle, line, area) |
|---|---|---|
| **Discrete scale** (N/O) | Banded — §2 | Banded — §2 (*) |
| **Continuous scale** (Q/T) | Banded — §2 | Non-banded — §3 |

(*) Discrete scales are always banded regardless of mark type — VL allocates a band per category.

## §1.2 Decision Tree

```
For each positional axis (x, y):

1. Is the VL encoding type nominal or ordinal?
   → YES: Banded (discrete). Use §2 directly.

2. Is the axis binned (enc.bin = true)?
   → YES: Banded (continuous). Use §2 with bin count as N.

3. Does the template declare this axis as banded?
   (axisFlags.banded = true, e.g. bar/rect/boxplot marks)
   → YES: Banded (continuous). Use §2 with field cardinality as N.

4. Otherwise:
   → Non-banded (continuous). Use §3.
```

> **Implementation:** The decision is made in `compute-layout.ts` via `axisFlags.x.banded` / `axisFlags.y.banded` and `isDiscreteType()` checks. See `computeLayout()` lines ~155–230.

## §1.3 Vega-Lite Implementation Notes

The §2 elastic budget model applies to both discrete-banded and continuous-banded axes, but the **Vega-Lite implementation differs** by scale type:

### Discrete banded (nominal / ordinal)

VL natively supports step-based sizing:

```json
{ "width": { "step": ℓ } }
```

VL creates a band scale, allocates $\ell$ pixels per category, and sizes the chart to $N \times \ell$.

For grouped bars (xOffset / yOffset):

```json
{ "width": { "step": ℓ_group, "for": "position" } }
```

### Continuous banded (quantitative / temporal + band mark)

VL does **not** support `{ "step": N }` on continuous scales, so Flint handles this in two phases:

**Phase 1 — Canvas sizing (assemble.ts):**

```
continuousWidth = stepSize × (N + 1)
```

The `+1` adds half-step padding on each side. The scale domain is extended by ±halfStep so positions align as they would on a discrete band scale.

**Phase 2 — Mark sizing (postProcessing):**

Since VL does not auto-size bars on a continuous scale:
1. Sort unique field values; find `minGap` (smallest consecutive difference).
2. Convert to pixels: `pixelsPerUnit = subplotDim × (N−1) / (dataRange × N)`.
3. `markSize = min(stepSize × 0.9, floor(minGap × pixelsPerUnit))`.
4. Apply via `{ "mark": { "size": markSize } }` (or `width`/`height` for rect with 0.98 fill ratio).

### Comparison

| Aspect | Discrete banded | Continuous banded |
|---|---|---|
| VL scale type | `nominal` / `ordinal` (band scale) | `quantitative` / `temporal` (linear/time scale) |
| Step control | `{ "step": ℓ }` on width/height | Manual: `config.view.continuousWidth = ℓ × (N+1)` |
| Mark sizing | Automatic (VL fills bands) | Manual: `mark.size` from min-gap calculation |
| Domain padding | Automatic (band scale) | Manual: extend domain by ±halfStep |
| Sort control | `encoding.sort` | Data-determined (continuous scale) |

### When to prefer continuous banded

- The data has **natural ordering and arithmetic meaning** (years, dates, prices).
- The data has **irregular spacing** — a continuous scale preserves proportional positions.
- The template declares `axisFlags.banded = true` while keeping the VL encoding type as Q/T.

The `detectBandedAxis` function in `templates/utils.ts` handles this decision.

---

# §2 Discrete Axis (Elastic Budget Model)

## §2.1 Problem

A discrete axis displays $N$ banded items (categories, bins, groups) along a 1D
segment of length $L_0$ pixels. Each band has a **natural size** $\ell_0$ and is
kept within a **minimum** $\ell_{\min}$ and a **maximum** $\ell_{\max}$.

The layout balances two directions:

1. **Too sparse.** When a few items share a wide plot, each band grows to fill
   the space — but never past $\ell_{\max}$, so one or two bars don't balloon to
   the whole canvas.
2. **Too dense.** When many items crowd the axis, bands compress toward
   $\ell_{\min}$, and the axis itself may stretch up to $L_{\max}$ to relieve the
   pressure. Beyond that, extra items overflow.

## §2.2 Parameters

| Symbol | Meaning | Code mapping | Default |
|---|---|---|---|
| $L_0$ | Natural axis length | `width` / `height` (base size) | 400 px |
| $L_{\max}$ | Maximum axis length | `base × β` (β from `maxStretch` or `canvasSize`) | 800 px |
| $N$ | Number of banded items | Field cardinality | data-dependent |
| $\ell_0$ | Natural (base) size per band | `defaultBandSize` | ~20 px |
| $\ell_{\min}$ | Minimum size per band | `minStep` option | 8 px |
| $\ell_{\max}$ | Maximum size per band | `maxBandSize` option | = $\ell_0$ |
| $\alpha$ | Elasticity exponent | `elasticity` option | 0.5 |
| $\beta$ | Maximum stretch multiplier | `maxStretch`, or derived from `canvasSize` | 1.5 |

> **Code defaults:** `elasticity: 0.5`, `minStep: 8`, and `maxStretch: 1.5` when no `canvasSize` ceiling is set. $\ell_0$ and $\ell_{\max}$ are given at a 300 px reference canvas and scaled with size: `round(bandSize × max(1, sizeRatio))`.

### §2.2.1 Band size bounds — min, base, max

Every banded chart resolves one number, the **band step** $\ell$: the pixels
allotted to each category slot. It is a clamp of the available width per item
between the minimum and maximum band size:

$$\ell = \operatorname{clamp}\!\left(\frac{L}{N},\; \ell_{\min},\; \ell_{\max}\right)$$

- $\ell_0$ (**base**) is the natural band size *and* the density threshold: it
  decides when compression begins.
- $\ell_{\min}$ (**min**) is the tightest a band may compress before items
  overflow.
- $\ell_{\max}$ (**max**) is the widest a band may expand when the chart is
  sparse.

The three bounds are **backend-specific**, chosen to match each renderer's native
bar sizing. Vega-Lite sizes a plot as `N × step`, so its bands never grow past
the base — $\ell_{\max} = \ell_0$. ECharts, Chart.js, and Plotly instead fill
their plot area natively, so their bands expand up to a much larger $\ell_{\max}$
before compressing.

| Backend | Native sizing | $\ell_{\min}$ | $\ell_0$ (base) | $\ell_{\max}$ |
|---|---|---:|---:|---:|
| Vega-Lite | `width: { step }` grows the plot to `N × step` | 6 | 20 | 20 |
| ECharts | fills the grid (`barCategoryGap`) | 6 | 24 | 100 |
| Chart.js | fills the canvas (`categoryPercentage`) | 6 | 30 | 100 |
| Plotly | fills the plot area (`bargap`) | 6 | 20 | 100 |

*(Reference sizes at a 300 px canvas; scaled with actual size. Chart templates
may override any bound — e.g. boxplot widens the base, jitter widens both.)*

## §2.3 Three Regimes

### Regime 1: Sparse — expand to fill

**Condition:** $N \cdot \ell_0 \leq L_0$

Items would leave gaps at their base size, so each band grows to fill the base
axis, capped at the maximum:

$$\ell = \min\!\left(\ell_{\max},\; \frac{L_0}{N}\right), \quad L = N \cdot \ell$$

The axis does **not** grow past its base $L_0$ here — expansion happens *inside*
the base width. When $\ell_{\max} = \ell_0$ (Vega-Lite), bands simply stay at the
base size.

### Regime 2: Dense — compress and stretch

**Condition:** $N \cdot \ell_0 > L_0$ and $N \cdot \ell_{\min} < L_{\max}$

Items overflow the base axis. Bands compress and the axis stretches up to
$L_{\max}$, governed by the elastic budget in [§2.4](#24-power-law-elastic-budget).

### Regime 3: Overflow beyond recovery

**Condition:** $N \cdot \ell_{\min} \geq L_{\max}$

Even at minimum band size and maximum stretch, not all items fit. Excess items
are truncated:

$$N' = \left\lfloor \frac{L_{\max}}{\ell_{\min}} \right\rfloor, \quad \ell = \ell_{\min}, \quad L = L_{\max}$$

## §2.4 Power-Law Elastic Budget

This is the **implemented model** for the dense regime. The axis budget stretches
using a power-law of the pressure ratio:

**Pressure:**

$$p = \frac{N \cdot \ell_0}{L_0}$$

**Stretch factor:**

$$s = \min(\beta,\; \max(1, p)^{\alpha})$$

**Axis budget and step size:**

$$L = L_0 \cdot s, \qquad \ell = \operatorname{clamp}\!\left(\frac{L}{N},\; \ell_{\min},\; \ell_{\max}\right)$$

For sparse charts $p \le 1$, so $s = 1$: the budget stays at $L_0$ and the step
reduces to the Regime 1 fill, $\min(\ell_{\max}, L_0/N)$. For dense charts
$p > 1$, the budget grows and bands compress. With $\alpha = 0.5$, doubling the
overflow only increases the stretch by $\sqrt{2} \approx 1.41\times$ — a
naturally progressive response.

**Clamping:** The step is clamped to $[\ell_{\min},\; \ell_{\max}]$ and the axis
length to $[L_0,\; L_{\max}]$.

> **Implementation:** `computeElasticBudget()` in `core/decisions.ts` produces the axis budget; `computeLayout()` in `core/compute-layout.ts` clamps the step to $[\ell_{\min}, \ell_{\max}]$ using the backend's `minStep` / `defaultBandSize` / `maxBandSize`.

## §2.5 Theoretical foundation (spring model)

The power-law model can be motivated by a physical analogy: $N$ identical springs packed inside a box.

**Setup:**
- Each spring (item) has natural length $\ell_0$, solid length $\ell_{\min}$, spring constant $k_1$.
- The box (axis) has natural length $L_0$, max length $L_{\max}$, spring constant $k_2$.

**Force balance at equilibrium:**

$$N \cdot k_1 \cdot (\ell_0 - \ell) = k_2 \cdot (N \cdot \ell - L_0)$$

**Equilibrium step size** (using stiffness ratio $\kappa = k_1 / k_2$):

$$\boxed{\ell = \frac{\kappa \cdot \ell_0 + L_0 / N}{1 + \kappa}}$$

**Interpretation of $\kappa$:**
- $\kappa \to \infty$: items don't compress; the wall absorbs everything ($\ell \to \ell_0$).
- $\kappa \to 0$: items compress to fit the fixed axis ($\ell \to L_0 / N$).
- $\kappa = 1$: compression is split evenly ($\ell = (\ell_0 + L_0/N) / 2$).

The linear spring model is more physically intuitive and allows independent tuning of item vs. wall stiffness ($\kappa$). It is presented here as the theoretical motivation for the power-law model.

**Nonlinear (progressive-rate) variant:** Replacing the linear spring with a hardening spring $F_1(\ell) = k_1 \cdot ((\ell_0 - \ell) / (\ell_0 - \ell_{\min}))^{\gamma}$ leads directly to the power-law formulation used in the implementation.

**Mapping to the power-law implementation:**

| Linear spring model | Power-law implementation |
|---|---|
| $\kappa$ (stiffness ratio $k_1/k_2$) | $\alpha$ (elasticity exponent) |
| $\ell = (\kappa \cdot \ell_0 + L_0/N) / (1 + \kappa)$ | $s = \min(\beta, p^{\alpha})$; $\ell = L_0 \cdot s / N$ |
| Uniform interpolation between $\ell_0$ and $L_0/N$ | Power-curve interpolation favoring $\ell_0$ |
| Two parameters ($k_1$, $k_2$) | One parameter ($\alpha$) |
| More physically intuitive | More compact; naturally progressive |

## §2.6 Grouped Items

Grouped items, such as a grouped bar chart with $m$ sub-bars per group, are treated as a special case: the **group** is the unit of compression, not the individual item.

| Parameter | Simple discrete | Grouped bar ($m$ sub-bars) |
|---|---|---|
| $\ell_0$ (natural) | `defaultStepSize` | $m \times$ `defaultStepSize` |
| $\ell_{\min}$ (solid) | `minStep` (8 px) | $2m$ px (2 px per sub-bar) |
| $N$ (item count) | Field cardinality | Number of **groups** |

The elastic budget formula is unchanged — only the parameter values change.

**Example:** 15 groups × 3 sub-bars on a 400 px axis:
- $N = 15$, $\ell_0 = 60$, ideal $= 900 > 400$ → Regime 3.
- With $\alpha = 0.5$: $p = 900/400 = 2.25$, $s = \min(1.5, 2.25^{0.5}) = 1.50$.
- Budget $= 400 \times 1.5 = 600$, step $= 600/15 = 40$ px per group.

> **Implementation:** In `computeLayout()`, grouping is detected via the `group` channel. When `xHasGrouping` is true, step is computed per-group with `xStepUnit = 'group'` and a minimum group gap of 3 px is enforced.

## §2.7 Per-Mark-Type Guidelines

Different mark types have different visual footprints and compression tolerances. Templates can tune behavior via `defaultStepMultiplier` and `overrideDefaultSettings`.

**Design guidelines** (for a 300 px reference canvas, `defaultStepSize` ≈ 20 px):

| Mark type | $\ell_0$ | $\ell_{\min}$ | Compression tolerance | Rationale |
|---|---|---|---|---|
| **Bar** | 20 px | 6 px | Moderate | Width encodes the item, so it cannot shrink too much |
| **Stacked bar** | 20 px | 6 px | Low | Stacked segments unreadable when thin |
| **Grouped bar** ($m$) | $20m$ px | $2m$ px | Low | Losing sub-bar distinction is costly |
| **Lollipop** | 14 px | 4 px | High | Dot (position) carries encoding, not width |
| **Heatmap / rect** | 20 px | 8 px | Very low | Color cell needs area for color to be perceivable |
| **Boxplot** | 24 px | 10 px | Low | Internal structure (box/whiskers/median) lost early |
| **Strip / jitter** | 24 px | 6 px | Moderate | Points collapse into a line when too narrow |
| **Histogram** | 16 px | 4 px | High | Distribution shape survives compression well |
| **Candlestick** | 18 px | 8 px | Low | Open/close body + wicks need room |

**Design principles:**
1. Marks encoding value by **width/area** (bar, rect) → higher $\ell_0$, lower compression tolerance.
2. Marks encoding value by **position** (lollipop, bump) → higher compression tolerance.
3. Marks with **internal structure** (boxplot, candlestick) → higher $\ell_{\min}$.
4. Marks showing **distribution shape** (histogram) → can be narrower.

> **Note:** Templates currently adjust layout mainly through `defaultStepMultiplier` (which scales $\ell_0$ proportionally) and `overrideDefaultSettings`. Per-mark-type spring stiffness ($\kappa$) is a design aspiration, not yet individually parameterized in the code.

## §2.8 Faceted Charts

Faceting splits one chart into a grid of subplots. The canvas must accommodate $F$ panels, each with its own axis sizing. This section covers **grid layout**: stretch, subplot sizing, and wrapping. Continuous-axis AR blending within facets is covered in [§3.8](#38-faceted-continuous-layout-per-subplot-baseline--pressure--ar-blend--fit).

### §2.8.1 Facet stretch factor

The total canvas stretches to accommodate facets:

$$\lambda_f = \min(\beta,\; F^{\alpha_f})$$

where $\alpha_f$ = `facetElasticity` (default 0.3) and $\beta$ = `maxStretch` (default 1.5 when no `canvasSize` ceiling is set).

The facet stretch uses a **gentler exponent** ($\alpha_f = 0.3$ vs $\alpha = 0.5$ for discrete items) because each subplot is a self-contained chart — even a small subplot can be readable, whereas a 3 px bar cannot.

> **Implementation:** `computeLayout()` uses `facetElasticityVal = 0.3` and per-dimension caps from `resolveStretchCaps()`.

### §2.8.2 Subplot sizing

Each subplot gets a share of the stretched canvas:

$$W_{\text{sub}} = \max\!\left(S_{\min},\; \frac{W_0 \cdot \lambda_f - \text{fixedPad}}{F_c} - \text{gap}\right)$$

| Symbol | Meaning | Default |
|---|---|---|
| $F_c, F_r$ | Facet columns / rows | data-dependent |
| $\alpha_f$ | Facet elasticity | 0.3 |
| $S_{\min}$ | Minimum subplot size (continuous axis) | 60 px |

### §2.8.3 Facet-mode shrink limits

Under faceting, axes can shrink **further** than in single-chart mode because the reader compares patterns across panels rather than reading individual values precisely.

| Mark type | $\ell_{\min}^{f}$ (banded) | $S_{\min}$ (continuous) |
|---|---|---|
| Bar / stacked bar | 3 px | 60 px |
| Heatmap / rect | 4 px | 40 px |
| Boxplot | 6 px | 60 px |
| Line / area | — | 40 px |
| Ridge / density | — | 20 px |
| Scatter | — | 60 px |

### §2.8.4 Faceted discrete axis

The spring model runs **per subplot**: $W_{\text{sub}}$ becomes $L_0$ and $N_{\text{items}}$ is the per-panel count. If items still overflow, they are truncated to $N' = \lfloor W_{\text{sub}} / \ell_{\min} \rfloor$.

### §2.8.5 Faceted continuous axis

The gas pressure model (§3) runs within each subplot using $W_{\text{sub}} \times H_{\text{sub}}$ as the container. Subplot dimensions are uniform across panels for visual consistency.

### §2.8.6 Facet wrap (column-only folding)

When only a column facet is specified and $F$ exceeds the maximum columns that fit, panels wrap into a 2D grid:

1. **Maximum columns:** $F_{c,\max} = \lfloor \text{effectiveW} / (S_{\min} + \text{gap}) \rfloor$, where $\text{effectiveW} = W_0 \times \beta - \text{fixPad}$.
2. **Single row:** If $F \leq F_{c,\max}$, all panels fit in one row, so no wrapping is needed.
3. **Wrapping:** Otherwise, start with $F_c = F_{c,\max}$ columns and compute $F_r = \lceil F / F_c \rceil$ rows.
4. **Widow avoidance:** If the last row would contain exactly 1 panel (a "widow"), reduce $F_c$ by 1 and recompute. Repeat while $F_c > 2$ and a widow remains. This redistributes panels more evenly: 11 panels with maxCols=5 would produce 5×3 with 1 orphan, so the algorithm tries 4×3 instead, leaving 3 panels in the last row.

The minimum subplot size ($S_{\min}$) is axis-aware:
- **Discrete/banded axes:** $S_{\min} = \ell_{\min} \times N$ (minStep × value count per axis).
- **Continuous axes:** $S_{\min} = \text{baseMinSubplot}$ (default 60 px), adjusted by banking AR when both axes are continuous — the shorter dimension stays at base, the longer gets up to $\beta \times$ base. This ensures line charts (landscape AR) get wider min subplots, producing fewer wider panels.

> **Implementation:** `computeFacetGrid()` in `compute-layout.ts`. Runs **before** `computeLayout()` to break the circularity between wrapping and axis sizing.

## §2.9 Summary

| Symbol | Meaning | Default |
|---|---|---|
| $N$ | Number of discrete items | data-dependent |
| $\ell_0$ | Natural step size | ~20 px |
| $\ell_{\min}$ | Minimum step size | 8 px |
| $\alpha$ | Elasticity exponent | 0.5 |
| $\beta$ | Maximum stretch | 1.5 |

```
Given: N items, natural length ℓ₀, solid length ℓ_min,
       axis rest length L₀, maxStretch β, elasticity α

pressure = N · ℓ₀ / L₀

if pressure ≤ 1:
    ℓ = ℓ₀                              # Regime 1: fits

elif N · ℓ_min ≥ β · L₀:
    ℓ = ℓ_min, truncate to N' items      # Regime 2: overflow

else:
    stretch = min(β, pressure^α)          # Regime 3: elastic
    ℓ = L₀ · stretch / N
    ℓ = clamp(ℓ, ℓ_min, ℓ₀)
```

> **Key functions:** `computeElasticBudget()`, `computeAxisStep()` in `core/decisions.ts`; `computeLayout()` in `core/compute-layout.ts`.

---

# §3 Continuous Axis (Gas Pressure Model)

## §3.1 Problem

A continuous axis displays $N$ point-like items, such as scatter dots or line vertices, across a 2D canvas. Unlike discrete items, these marks do not occupy fixed bands; they sit at data-determined positions. Each mark has a visual cross-section $\sigma$ (px²).

**Why springs do not apply:** Continuous marks do not own slots. A scatter plot with 100 points and one with 10 can both fit in the same canvas; the difference is **density**, not per-item allocation. That makes a pressure model a better fit than a per-item spring model.

## §3.2 Parameters

| Symbol | Meaning | Code mapping | Default |
|---|---|---|---|
| $W_0, H_0$ | Natural canvas dimensions | `subplotWidth`, `subplotHeight` | 400 × 320 px |
| $\sigma$ | Mark cross-section (px²) | `markCrossSection` | 30 px² |
| $\sigma_x, \sigma_y$ | Per-axis cross-sections | `markCrossSectionX/Y` | chart-type specific |
| $\alpha_c$ | Elasticity exponent | `elasticity` | 0.3 |
| $\beta_c$ | Maximum stretch | `maxStretch` | 1.5 |

> **Code defaults:** `DEFAULT_GAS_PRESSURE_PARAMS` in `core/decisions.ts` — `markCrossSection: 30`, `elasticity: 0.3`, `maxStretch: 1.5`.

**Why $\beta_c$ is smaller than discrete $\beta$:** Continuous axes encode by **position along a scale** — the most perceptually robust channel (Cleveland & McGill, 1984). A scatter plot remains readable even when compressed because relative positions are preserved. Discrete axes encode by **length/area of bands**, which degrades faster.

| | Discrete axis | Continuous axis |
|---|---|---|
| Primary encoding | Length / area of band | Position along scale |
| Recommended $\beta$ | 2.0 | 1.5 |

## §3.3 Per-Axis Stretch

Crowding is almost always asymmetric. On a line chart, for example, X is driven by time points while Y is driven by overlapping series. Each axis is stretched independently.

### Mode 1: Positional (default)

Count unique pixel positions along the axis (bucketed at ~1 px resolution). Each position needs $\sigma_{1d} = \sqrt{\sigma}$ pixels:

$$p_{1d} = \frac{\text{uniquePos} \cdot \sigma_{1d}}{\text{dim}_0}$$

$$
s = \begin{cases}
1 & \text{if } p_{1d} \leq 1 \cr
\min(\beta_c,\; p_{1d}^{\,\alpha_c}) & \text{if } p_{1d} > 1
\end{cases}
$$

### Mode 2: Series-count (`seriesCountAxis`)

When `seriesCountAxis` is set (`'x'`, `'y'`, or `'auto'`), the designated axis uses the number of distinct series (color ∪ detail fields) for pressure. `'auto'` resolves to:
- 2D path (both axes continuous): Y axis.
- 1D path (one continuous + one discrete): the continuous axis.

$$p_{\text{series}} = \frac{n_{\text{series}} \cdot \sigma}{\text{dim}_0}$$

Here $\sigma$ is used **directly** rather than square-rooted because series count is inherently 1D.

> **Implementation:** `computeGasPressure()` in `core/decisions.ts` (lines ~442–508). The 2D path (both axes continuous) and 1D path (one axis continuous) are handled separately in `computeLayout()` lines ~275–425.

## §3.4 Positional ≥ Series Constraint

For charts where both axes are continuous (line, area), more series means more visual clutter on the **positional** axis too — more overlapping lines means more crossings and parallel strokes competing for the reader's attention. The positional axis ideal stretch is lifted to at least the series axis ideal stretch:

$$\text{ideal}_{\text{positional}} = \max(\text{ideal}_{\text{positional}},\; \text{ideal}_{\text{series}})$$

When `maintainContinuousAxisRatio` is set, both axes use the maximum of the two stretches.

## §3.5 Parameter Table

| Chart type | $\sigma_x$ | $\sigma_y$ | $\alpha_c$ | $\beta_c$ | seriesCountAxis |
|---|---|---|---|---|---|
| Scatter | 30 | 30 | 0.3 | 1.5 | — |
| Line | 100 | 20 | 0.3 | 1.5 | auto (→ Y) |
| Dotted Line | 100 | 20 | 0.3 | 1.5 | auto (→ Y) |
| Area | 100 | 20 | 0.3 | 1.5 | auto (→ Y) |
| Streamgraph | 100 | 20 | 0.3 | 1.5 | auto (→ Y) |
| Bump | 80 | 20 | 0.3 | 1.5 | auto (→ Y) |
| Stacked Bar | 20 | 20 | 0.3 | 1.5 | auto (→ Y*) |

\* For stacked bar, X is discrete (§2), Y is continuous. `auto` resolves to Y via the 1D path.

## §3.6 Worked Examples

### Series-axis stretch ($\sigma = 20$, $\text{dim}_0 = 300$, $\alpha_c = 0.3$, $\beta_c = 1.5$)

| Scenario | nSeries | pressure | stretch | Final dim |
|---|---|---|---|---|
| 8 series (typical) | 8 | 0.53 | 1.0 | 300 |
| 15 series (moderate) | 15 | 1.0 | 1.0 | 300 |
| 20 series (busy) | 20 | 1.33 | 1.09 | 328 |
| 40 series (extreme) | 40 | 2.67 | 1.35 | 406 |

### Combined positional + series (positional ≥ series constraint)

| Scenario | nDates | nSeries | raw X | raw Y | final X | final Y |
|---|---|---|---|---|---|---|
| 12 dates × 20 series | 12 | 20 | 1.0 | 1.09 | **1.09** | 1.09 |
| 100 dates × 40 series | 100 | 40 | 1.32 | 1.35 | **1.35** | 1.35 |
| 100 dates × 60 series | 100 | 60 | 1.32 | 1.50 | **1.50** | 1.50 |
| 200 dates × 3 series | 200 | 3 | 1.50 | 1.0 | 1.50 | 1.0 |
| 200 dates × 20 series | 200 | 20 | 1.50 | 1.09 | 1.50 | 1.09 |

## §3.7 Summary

| Symbol | Meaning | Default |
|---|---|---|
| $\sigma$ | 2D mark cross-section (px²) | 30 |
| $\sigma_{1d}$ | 1D projection: $\sqrt{\sigma}$ | ~5.5 |
| $\alpha_c$ | Elasticity exponent | 0.3 |
| $\beta_c$ | Max stretch | 1.5 |

```
Given: data points with x/y values, per-axis cross-sections σ_x σ_y,
       canvas W₀×H₀, elasticity αc, maxStretch βc,
       optional seriesCountAxis

For each axis (X, Y):
    if seriesCountAxis resolves to this axis:
        nSeries = |distinct color ∪ detail values|
        pressure = nSeries · σ / dim₀
    else:
        uniquePos = |{ round(v · px_per_unit) : v ∈ data }|
        σ_1d = √σ
        pressure = uniquePos · σ_1d / dim₀

    if pressure ≤ 1:
        stretch = 1
    else:
        stretch = min(βc, pressure^αc)

// Positional ≥ Series constraint (when seriesCountAxis is set):
stretch_positional = max(stretch_positional, stretch_series)

W = W₀ · stretch_x
H = H₀ · stretch_y
```

> **Key functions:** `computeGasPressure()` in `core/decisions.ts`; gas-pressure integration in `computeLayout()` in `core/compute-layout.ts`.

## §3.8 Faceted Continuous Layout (Per-Subplot Baseline → Pressure → AR Blend → Fit)

### §3.8.1 Problem

When a chart is faceted, the gas pressure model must answer one question first: **what canvas does each subplot's data crowd against?**

Naive approach: run gas pressure against the full canvas, then divide by column/row count. This overestimates available space because each subplot only gets a fraction of the canvas. Subplots end up too large and exceed the total budget.

Alternative naive approach: divide the raw canvas by column/row count first, then run gas pressure per subplot. This underestimates available space because it ignores the facet stretch the layout engine will apply. Gas pressure sees an artificially tiny canvas and immediately saturates.

The correct answer is: **gas pressure runs against the per-subplot canvas after facet elasticity has been applied**. This uses the same stretch formula as discrete axes.

### §3.8.2 Per-Subplot Baseline Canvas

Before gas pressure runs, we compute what each subplot would get from facet stretch alone:

$$W_{\text{sub}} = \max\!\left(S_{\min},\; \frac{W_0 \cdot \lambda_f - \text{fixPad}}{F_c} - \text{gap}\right)$$

where $\lambda_f = \min(\beta,\; F_c^{\,\alpha_f})$ is the facet elasticity stretch (§2.8.1). For a single-panel chart ($F_c = 1$), $W_{\text{sub}} = W_0$.

This gives gas pressure a realistic baseline: the space the subplot will occupy before any additional gas-pressure stretch.

> **Implementation:** `perSubplotCanvasW/H` in `computeLayout()` (~line 410–420). Uses `facetElasticityVal = 0.3` and per-dimension caps from `resolveStretchCaps()`.

### §3.8.3 Banking AR (Multi-Scale Slope Optimization)

For charts with connected marks (line, area, streamgraph), the data has a **perceptually optimal aspect ratio** determined by the slopes of the line segments. This is the *banking to 45°* principle (Cleveland, 1993): the chart should be shaped so that the median line segment slope approaches 45°, making trends maximally visible.

We use a **multi-scale banking** approach (Heer & Agrawala, 2006) that considers slopes at multiple smoothing levels:

**Algorithm:**

1. **Group by series** (color ∪ detail fields). Sort each series by X.
2. **For each scale** $k = 0, 1, 2, \ldots$ (window size $= 2^k$):
   - Smooth each series with non-overlapping box filters of width $2^k$.
   - Compute absolute slopes between consecutive smoothed points: $|s| = |\Delta y / \Delta x|$ (in normalized data coordinates).
   - Take the **median** absolute slope at this scale.
3. **Combine** per-scale medians via geometric mean:
   $$\text{combinedSlope} = \exp\!\left(\frac{1}{K}\sum_{k=0}^{K}\ln(\text{median}_k)\right)$$
4. **Clamp** to $[0.5,\; 3.0]$.
5. **Landscape floor** (connected marks only): $\text{AR} = \max(1.0,\; \text{combinedSlope})$. Time series are conventionally landscape; banking should push wider (when slopes are steep) but never portrait — the gentle-slope majority in typical time series would otherwise dominate the median and produce portrait, compressing the time axis.

**For scatter plots** (non-connected): Instead of line slopes, use the standard-deviation ratio $\sigma_x / \sigma_y$ in normalized coordinates, with a dampened response: $\text{AR} = 1 + 0.3 \times (\text{sdRatio} - 1)$.

**No extra dampening.** The raw combined slope is returned without multiplicative dampening. The 50/50 blend with gas pressure (§3.8.4) is the sole moderation; adding dampening here would moderate the signal twice.

> **Implementation:** `computeBankingAR()` in `compute-layout.ts` (~line 819). Returns W/H aspect ratio in $[0.5,\; 3.0]$.

### §3.8.4 Gas–Banking AR Blend

Gas pressure knows which axis is more crowded (density asymmetry). Banking knows the perceptual ideal AR (slope optimization). We blend both signals in **log space** with equal weight:

$$\text{gasAR} = \frac{\text{rawW}}{\text{rawH}} \qquad \text{(from gas pressure per-axis stretches)}$$

$$\text{blendedAR} = \exp\!\left(0.5 \cdot \ln(\text{gasAR}) + 0.5 \cdot \ln(\text{bankingAR})\right)$$

This is the geometric mean: if gas pressure says 2:1 (X crowded) and banking says 1:1 (slopes are gentle), the blend yields $\sqrt{2} \approx 1.41$.

**Coverage gate:** Banking is only applied when both X and Y data cover at least 20% of their respective domains. When data is concentrated in a small region (e.g., a cluster in one corner), slopes are unreliable and gas pressure alone drives the AR.

### §3.8.5 Area Budget and Shape

The blend decides the AR; gas pressure decides the total area:

$$\text{rawArea} = \text{rawW} \times \text{rawH}$$

Capped to prevent the subplot from exceeding its per-subplot budget before the fit step:

$$\text{area} = \min(\text{rawArea},\; W_{\text{sub}} \times H_{\text{sub}} \times \beta)$$

Distribute area to match the blended AR:

$$\text{idealW} = \sqrt{\text{area} \times \text{blendedAR}} \qquad \text{idealH} = \sqrt{\text{area} / \text{blendedAR}}$$

### §3.8.6 Fit to Budget (Preserving AR)

Hard ceiling per subplot: $W_0 \times \beta$ total, shared across facet panels:

$$\text{availW} = \frac{W_0 \cdot \beta - \text{fixPad}}{F_c} - \text{gap} \qquad \text{availH} = \frac{H_0 \cdot \beta - \text{fixPad}}{F_r} - \text{gap}$$

Scale down uniformly to preserve the blended AR:

$$\text{fitScale} = \min\!\left(\frac{\text{availW}}{\text{idealW}},\; \frac{\text{availH}}{\text{idealH}},\; 1\right)$$

$$\text{finalW} = \max(S_{\min},\; \text{idealW} \times \text{fitScale}) \qquad \text{finalH} = \max(S_{\min},\; \text{idealH} \times \text{fitScale})$$

The uniform `fitScale` ensures neither axis exceeds its budget while preserving the blended AR, except at minimum-size extremes.

### §3.8.7 Worked Example

150 dates × 8 series × 3 column facets, with an explicit $\beta = 2.0$ cap for easy arithmetic (base $400 \times 300$, line chart: $\sigma_x = 100$, $\sigma_y = 20$, `seriesCountAxis: auto → Y`, `facetElasticity = 0.3`):

**Per-subplot baseline:**
- Facet stretch: $\lambda_f = \min(2, 3^{0.3}) = 1.35$
- $W_{\text{sub}} = (400 \times 1.35) / 3 = 180$ px

**Gas pressure** (against $180 \times 300$):
- X positional: 150 unique, $\sigma_{1d} = 10$ → $p = 8.33$ → raw stretch $= 8.33^{0.3} = 1.93$
- Y series: 8 series, $\sigma = 20$ → $p = 0.53$ → raw stretch $= 1.0$
- rawW $= 180 \times 1.93 = 347$, rawH $= 300 \times 1.0 = 300$, gasAR $= 1.16$

**Banking AR** (multi-scale slopes): Suppose combinedSlope yields bankingAR $= 1.8$ (landscape).

**Blend:** $\text{blendedAR} = \exp(0.5 \ln 1.16 + 0.5 \ln 1.8) = \sqrt{1.16 \times 1.8} = 1.44$

**Area:** rawArea $= 347 \times 300 = 104{,}100$. maxArea $= 180 \times 300 \times 2 = 108{,}000$. area $= 104{,}100$.
- idealW $= \sqrt{104100 \times 1.44} = 387$, idealH $= \sqrt{104100 / 1.44} = 269$

**Fit:** availW $= (800 - 0) / 3 = 267$, availH $= 600$.
- fitScale $= \min(267/387, 600/269, 1) = 0.69$
- finalW $= 387 \times 0.69 = 267$, finalH $= 269 \times 0.69 = 186$
- **Final: 267 × 186, AR = 1.44** ✓ landscape preserved, total width = 800

> **Implementation:** `computeLayout()` in `core/compute-layout.ts` — the cont×cont path (~lines 370–530). `computeBankingAR()` (~line 819). `computeGasPressure()` in `core/decisions.ts`.

## §3.9 Band AR Blending

### §3.9.1 Problem

When one axis is banded and the other is continuous, such as a bar chart with categories on X and values on Y, the step size from §2 determines the band width while the continuous axis uses the default canvas height. With few categories on a tall canvas, each band can become excessively elongated. Labels crowd, bar proportions look distorted, and the chart wastes vertical space.

### §3.9.2 Target Band AR

The **band aspect ratio** is the ratio of the continuous dimension to the step size:

$$\text{bandAR} = \frac{\text{continuousDim}}{\text{stepSize}}$$

When `bandAR` is large (e.g., 20:1), each bar is 20× taller than it is wide — visually extreme. A `targetBandAR` parameter (default: 10) defines the maximum acceptable ratio.

### §3.9.3 Log-Space Blend

When the actual band AR exceeds the target, the continuous axis is **shrunk** toward the ideal via a 50/50 log-space blend (same mechanism as §3.8.4):

$$\text{idealDim} = \text{stepSize} \times \text{targetBandAR}$$

$$\text{blendedDim} = \exp\!\left(0.5 \cdot \ln(\text{actualDim}) + 0.5 \cdot \ln(\text{idealDim})\right)$$

The result is clamped to $[S_{\min},\; \text{actualDim}]$ — the blend only **shrinks**, never grows. If `bandAR ≤ targetBandAR`, no adjustment is made.

### §3.9.4 Orientation Handling

| Axis layout | Band AR formula | Adjusted dimension |
|---|---|---|
| X banded, Y continuous | $H / \text{xStep}$ | Shrink $H$ |
| Y banded, X continuous | $W / \text{yStep}$ | Shrink $W$ |

### §3.9.5 Worked Example

5 categories on X, step = 40 px, canvas height = 300 px, targetBandAR = 10:

- bandAR $= 300 / 40 = 7.5 \leq 10$ → **no adjustment**.

3 categories on X, step = 60 px, canvas height = 300 px, targetBandAR = 10:

- bandAR $= 300 / 60 = 5.0 \leq 10$ → **no adjustment**.

20 categories on X, step = 12 px, canvas height = 300 px, targetBandAR = 10:

- bandAR $= 300 / 12 = 25 > 10$ → blend.
- idealH $= 12 \times 10 = 120$.
- blendedH $= \exp(0.5 \ln 300 + 0.5 \ln 120) = \sqrt{300 \times 120} = 190$ px.
- **Result: height shrinks from 300 → 190.**

> **Implementation:** Band AR blending block in `computeLayout()` (~lines 702–735). Controlled by `options.targetBandAR` (`AssembleOptions`). VL backend sets default `targetBandAR = 10` in `assemble.ts`.

---

# §4 Circumference (Radial Pressure Model)

## §4.1 Problem

Radial charts (pie, rose, sunburst, radar) arrange data items around a **circle**, so the relevant dimension is the **circumference**. When many items crowd that circumference, the chart grows to keep slices and spokes legible.

**Why axis models don't apply:**
- **§2 (Spring):** Assumes a 1D axis with endpoints. Radial charts have a closed loop — growing means increasing the **radius**, which increases circumference as $C = 2\pi r$.
- **§3 (Gas):** Assumes 2D free-floating points. Radial items are angularly constrained to their slice/spoke positions.

The circumference model maps the spring intuition to polar geometry: treat the circumference as a "bent axis" and stretch the radius.

## §4.2 Parameters

| Symbol | Meaning | Default |
|---|---|---|
| $r_0$ | Base radius: $\max(r_{\min},\; \min(W_0, H_0)/2 - m)$ | derived |
| $C_0$ | Base circumference: $2\pi r_0$ | derived |
| $N_{\text{eff}}$ | Effective item count (§4.3) | data-dependent |
| $\ell_{\text{arc}}$ | Minimum arc-length per item (px) | 45 |
| $\alpha$ | Elasticity exponent | 0.5 |
| $\beta$ | Per-dimension max stretch | 2.0 |
| $r_{\min}$ | Minimum radius | 60 px |
| $r_{\max}$ | Maximum radius (absolute cap) | 400 px |
| $m$ | Margin around circle (px) | 20 |

> **Code defaults:** `CircumferencePressureParams` in `core/decisions.ts` — `minArcPx: 45`, `minRadius: 60`, `maxRadius: 400`, `elasticity: 0.5`, `maxStretch: 2.0`, `margin: 20`.

## §4.3 Effective Item Count

Different radial chart types crowd in different ways. The model abstracts those differences into a single number, $N_{\text{eff}}$.

**Uniform slices/spokes** (rose, radar): $N_{\text{eff}} = N$.

**Variable-width slices** (pie, sunburst):

$$N_{\text{eff}} = \frac{\sum v_i}{\min(v_i)}$$

This answers: "how many of the smallest slice would fill the entire circle?" The result is capped at 100 to prevent degenerate cases.

**Sunburst:** Compute $N_{\text{eff}}$ on the **outer ring** (leaf nodes only) — the most crowded ring.

> **Implementation:** `computeEffectiveBarCount()` in `core/decisions.ts` (lines ~906–920).

## §4.4 Pressure and Stretch

**Pressure:**

$$p = \frac{N_{\text{eff}} \cdot \ell_{\text{arc}}}{C_0} = \frac{N_{\text{eff}} \cdot \ell_{\text{arc}}}{2\pi r_0}$$

**Effective max stretch** (respects per-dimension canvas cap):

$$s_{\max} = \min\!\left(\frac{r_{\max}}{r_0},\; \frac{\min(W_0 \cdot \beta,\; H_0 \cdot \beta) - 2m}{2 r_0}\right)$$

**Stretch:**

$$
s = \begin{cases}
1 & \text{if } p \leq 1 \cr
\min(s_{\max},\; p^{\alpha}) & \text{if } p > 1
\end{cases}
$$

**Radius:** $r = \text{clamp}(r_0 \cdot s,\; r_{\min},\; r_{\max})$

> **Implementation:** `computeCircumferencePressure()` in `core/decisions.ts` (lines ~850–893).

## §4.5 Canvas Sizing

After computing the final radius $r$:

$$W = \max(W_0,\; 2r + 2m), \quad H = \max(H_0,\; 2r + 2m)$$

Both canvas dimensions grow equally (maintaining circular aspect ratio).

## §4.6 Gauge Faceting

Gauge charts are a special case: each gauge is a single-item radial chart. Multiple gauges are laid out in a facet-style grid computed by the template, because the assembler's facet path does not apply to axis-less charts.

All gauge element sizes scale **continuously** with the computed radius:

$$\text{elementSize} = \text{baseline} \times (r / r_{\text{ref}})$$

where $r_{\text{ref}} = 100$ px. Each element is clamped to a minimum. This avoids threshold artifacts.

## §4.7 Parameter Table

| Chart type | $N_{\text{eff}}$ source | $\ell_{\text{arc}}$ | $\alpha$ | $\beta$ | $m$ |
|---|---|---|---|---|---|
| **Pie** | `total / min(values)` | 45 | 0.5 | 2.0 | 50 |
| **Rose** | N categories | 45 | 0.5 | 2.0 | 20 |
| **Sunburst** | outer-ring `total / min` | 45 | 0.5 | 2.0 | 20 |
| **Radar** | N spokes | 45 | 0.5 | 2.0 | 20 |
| **Gauge** | N dials (facet grid) | — | — | 2.0 | 20 |

## §4.8 Summary

```
Given: N_eff items, minArc ℓ_arc, base canvas W₀×H₀,
       margin m, elasticity α, maxStretch β, minRadius, maxRadius

r₀ = max(minRadius, (min(W₀, H₀) / 2) - m)
C₀ = 2π · r₀
p  = N_eff · ℓ_arc / C₀

// Effective max stretch on radius (per-dimension cap)
s_max = min(maxRadius / r₀,
            (min(W₀·β, H₀·β) - 2m) / (2·r₀))

if p ≤ 1:
    r = r₀
else:
    r = r₀ · min(s_max, p^α)

r = clamp(r, minRadius, maxRadius)
W = max(W₀, 2r + 2m)
H = max(H₀, 2r + 2m)
```

> **Key functions:** `computeCircumferencePressure()`, `computeEffectiveBarCount()` in `core/decisions.ts`.

---

# §5 Area Layout (2D Pressure Model)

## §5.1 Problem

Area-filling charts, such as treemaps, divide a 2D canvas into rectangles whose area encodes value. Unlike Cartesian charts, the fundamental resource is **total area**. When many items crowd the space, every item becomes too small for labels or visual distinction.

**Why other models don't apply:**
- **§2 / §3:** Reason about 1D axes independently. Treemap items do not have stable positions on either axis; the squarify algorithm decides the partition on the fly.
- **§4:** Reasons about a closed loop. Treemap items occupy 2D area, not angular sectors.

## §5.2 Parameters

| Symbol | Meaning | Default |
|---|---|---|
| $W_0, H_0$ | Base canvas dimensions | from context |
| $A_0$ | Base canvas area: $W_0 \times H_0$ | derived |
| $N_{\text{eff}}$ | Effective item count (§5.3) | data-dependent |
| $\ell_{\min}$ | Minimum width per effective item (px) | 30 |
| $\alpha$ | Elasticity exponent | 0.5 |
| $\beta$ | Per-dimension max stretch | 2.0 |
| $b$ | X-bias factor | 1.5 |

> **Implementation note:** The area model is currently implemented **inline** in `echarts/templates/treemap.ts` (lines ~91–115), not as a shared core function in `decisions.ts`. The formulas and defaults match this document exactly.

## §5.3 Effective Item Count

Uses the same formula as §4.3:

$$N_{\text{eff}} = \min\!\left(100,\; \frac{\sum v_i}{\min(v_i)}\right)$$

This captures the worst case: how many copies of the smallest item would fill the entire space.

> **Implementation:** Calls `computeEffectiveBarCount()` from `core/decisions.ts`.

## §5.4 Pressure and Biased Split

### Step 1: 1D Pressure

Imagine all treemap items laid out as vertical bars along X. Pressure is measured against the base width:

$$p = \frac{N_{\text{eff}} \cdot \ell_{\min}}{W_0}$$

### Step 2: Area stretch

$$
A_{\text{stretch}} = \begin{cases}
1 & \text{if } p \leq 1 \cr
\min(\beta^2,\; p^{\alpha}) & \text{if } p > 1
\end{cases}
$$

The cap is $\beta^2$ because $A = W \times H$ and each dimension is capped at $\beta$.

### Step 3: Biased split to X and Y

X gets more stretch because most reading happens left-to-right and labels are horizontal.

Given X-bias factor $b$:

$$s_x = \min(\beta,\; A_{\text{stretch}}^{\,b/(b+1)})$$
$$s_y = \min(\beta,\; A_{\text{stretch}}^{\,1/(b+1)})$$

**Invariant:** $s_x \times s_y = A_{\text{stretch}}$.

| $b$ | X share | Y share | Effect |
|---|---|---|---|
| 1.0 | 50% | 50% | Uniform: $s_x = s_y = \sqrt{A_{\text{stretch}}}$ |
| 1.5 (default) | 60% | 40% | X takes more |
| 2.0 | 67% | 33% | Strongly X-biased |

### Step 4: Canvas sizing

$$W = \lfloor W_0 \cdot s_x \rceil, \quad H = \lfloor H_0 \cdot s_y \rceil$$

## §5.5 Worked Examples

Base canvas 400×300, $\ell_{\min} = 30$, $\alpha = 0.5$, $\beta = 2.0$, $b = 1.5$:

| Scenario | $N_{\text{eff}}$ | Pressure | $A_{\text{stretch}}$ | $s_x$ | $s_y$ | W | H |
|---|---|---|---|---|---|---|---|
| 5 equal items | 5 | 0.38 | 1.0 | 1.0 | 1.0 | 400 | 300 |
| 10 equal items | 10 | 0.75 | 1.0 | 1.0 | 1.0 | 400 | 300 |
| 20 equal items | 20 | 1.50 | 1.22 | 1.13 | 1.08 | 452 | 324 |
| 50 equal items | 50 | 3.75 | 1.94 | 1.52 | 1.27 | 608 | 381 |
| Skewed (1 large + 20 tiny) | 100 | 7.50 | 2.74 | 1.87 | 1.46 | 748 | 438 |

**Why biased split?** Treemap squarify algorithms produce nearly square cells when the canvas is square. Giving X more stretch prioritizes horizontal readability: labels inside treemap cells are horizontal, so extra width is more valuable for fitting text.

## §5.6 Summary

| Symbol | Meaning | Default |
|---|---|---|
| $N_{\text{eff}}$ | Effective item count ($\sum v / \min v$, cap 100) | data-dependent |
| $\ell_{\min}$ | Minimum width per effective item (px) | 30 |
| $\alpha$ | Elasticity exponent | 0.5 |
| $\beta$ | Per-dimension max stretch | 2.0 |
| $b$ | X-bias factor (1 = uniform, >1 = X takes more) | 1.5 |

```
Given: leaf values, base canvas W₀×H₀,
       minBarPx, elasticity α, maxStretch β, xBias b

N_eff = min(100, sum(values) / min(values))
p     = N_eff · minBarPx / W₀

if p ≤ 1:
    A_stretch = 1
else:
    A_stretch = min(β², p^α)

s_x = min(β, A_stretch^(b/(b+1)))
s_y = min(β, A_stretch^(1/(b+1)))

W = round(W₀ · s_x)
H = round(H₀ · s_y)
```

> **Key function:** Inline in `echarts/templates/treemap.ts`. Uses `computeEffectiveBarCount()` from `core/decisions.ts`.

---

# §6 Unified Summary

The four models adapt the same core idea, **pressure → elastic stretch → clamped output**, to different geometric contexts:

| § | Model | Geometry | Pressure formula | Stretch dimension(s) | Chart types |
|---|---|---|---|---|---|
| §2 | Elastic Budget | 1D axis | $N \cdot \ell_0 / L_0$ | 1D (axis length) | Bar, Histogram, Heatmap, Boxplot |
| §3 | Gas Pressure | 2D point cloud | $\text{uniquePos} \cdot \sigma_{1d} / \text{dim}$ | Per-axis (X, Y independent) | Scatter, Line, Area |
| §4 | Circumference | 1D closed loop | $N_{\text{eff}} \cdot \ell_{\text{arc}} / C_0$ | Radius (both W, H equally) | Pie, Rose, Sunburst, Radar, Gauge |
| §5 | Area | 2D filled space | $N_{\text{eff}} \cdot \ell_{\min} / W_0$ | Area (biased X/Y split) | Treemap |

### Shared concepts

1. **Pressure = demand / supply.** Items need space; the base canvas provides it. Pressure > 1 means overflow.
2. **Elastic stretch.** $s = \min(\beta,\; p^\alpha)$. The power-law exponent $\alpha$ controls how aggressively the chart grows (0.3 for gas, 0.5 for discrete/radial/area).
3. **Per-dimension cap $\beta$.** No axis grows beyond $\beta \times$ base. For radial/area models this translates to radius or area caps.
4. **Effective item count.** For variable-width items (pie, treemap), $N_{\text{eff}} = \sum v_i / \min(v_i)$ measures worst-case crowding.

### AR-aware extensions (§3.8–§3.9)

For continuous axes, raw pressure is augmented with aspect-ratio intelligence:

5. **Banking AR (§3.8.3).** Multi-scale slope analysis (Heer & Agrawala 2006) determines the perceptual ideal W/H ratio. Connected marks get a landscape floor (AR ≥ 1). Scatter uses σ-ratio.
6. **Gas–Banking blend (§3.8.4).** 50/50 geometric mean in log space: gasAR (density) × bankingAR (perception).
7. **Per-subplot baseline (§3.8.2).** Faceted charts feed per-subplot canvas (with facet elasticity) to gas pressure, not the full canvas.
8. **Band AR blending (§3.9).** When one axis is banded and the other continuous, `targetBandAR` prevents excessively elongated bands via log-space blend.

### Decision tree

```
Is the chart axis-based?
├── YES: Does it have banded (discrete) axes?
│   ├── Both banded  → §2 Elastic Budget on each axis
│   ├── One banded   → §2 for banded axis, §3 for continuous axis
│   │                  + §3.9 Band AR blending if targetBandAR set
│   └── Neither      → §3 Gas Pressure (both axes continuous)
│                      + §3.8 Banking AR + Gas–Banking blend
└── NO:  Is the layout radial (items around a circle)?
    ├── YES → §4 Circumference Model
    └── NO  → §5 Area Model (2D space-filling)
```

### Implementation map

| Function | File | Model |
|---|---|---|
| `computeElasticBudget()` | `core/decisions.ts` | §2 |
| `computeAxisStep()` | `core/decisions.ts` | §2 |
| `computeGasPressure()` | `core/decisions.ts` | §3 |
| `computeBankingAR()` | `core/compute-layout.ts` | §3.8 |
| `computeCircumferencePressure()` | `core/decisions.ts` | §4 |
| `computeEffectiveBarCount()` | `core/decisions.ts` | §4, §5 |
| `computeLayout()` | `core/compute-layout.ts` | §2, §3, §3.8, §3.9 orchestration |
| `computeFacetGrid()` | `core/compute-layout.ts` | §2.8 faceting, §3.8 min subplot |
| `computeChannelBudgets()` | `core/compute-layout.ts` | §2.8 overflow budgets |
| Area pressure (inline) | `echarts/templates/treemap.ts` | §5 |
