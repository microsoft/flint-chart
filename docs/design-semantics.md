# Semantic Type

Semantic types describe what each data field *means*, not just how it is stored. They tell Flint how a field should be encoded, formatted, aggregated, sorted, and colored. The compiler first resolves each field's semantic type plus optional annotations into `FieldSemantics`, then promotes the relevant decisions into per-channel `ChannelSemantics` for layout and backend spec generation.

---

## Table of Contents

- [§1 Overview](#1-overview)
- [§2 Type hierarchy](#2-type-hierarchy)
  - [§2.1 Tiered type system](#21-tiered-type-system)
  - [§2.2 Tier 0 — Families](#22-tier-0-families)
  - [§2.3 Tier 1 — Categories](#23-tier-1-categories)
  - [§2.4 Tier 2 — Specific types](#24-tier-2-specific-types)
  - [§2.5 The hierarchy as a DAG](#25-the-hierarchy-as-a-dag)
  - [§2.6 Cyclic domain types](#26-cyclic-domain-types)
  - [§2.7 LLM annotation strategies](#27-llm-annotation-strategies)
  - [§2.8 Type registry](#28-type-registry)
- [§3 Field annotations](#3-field-annotations)
  - [§3.1 Why metadata matters](#31-why-metadata-matters)
  - [§3.2 SemanticAnnotation](#32-semanticannotation)
  - [§3.3 Which types need metadata?](#33-which-types-need-metadata)
  - [§3.4 Numeric representation detection](#34-numeric-representation-detection)
  - [§3.5 Accepting string or object](#35-accepting-string-or-object)
- [§4 Compilation pipeline](#4-compilation-pipeline)
  - [§4.1 Four-stage overview](#41-four-stage-overview)
  - [§4.2 Field vs channel responsibilities](#42-field-vs-channel-responsibilities)
  - [§4.3 resolveFieldSemantics](#43-resolvefieldsemantics)
  - [§4.4 resolveChannelSemantics](#44-resolvechannelsemantics)
  - [§4.5 FieldSemantics interface](#45-fieldsemantics-interface)
  - [§4.6 ChannelSemantics interface](#46-channelsemantics-interface)
  - [§4.7 Supporting types](#47-supporting-types)
  - [§4.8 Layout and spec generation](#48-layout-and-spec-generation)
  - [§4.9 Caching](#49-caching)
- [§5 Resolution rules](#5-resolution-rules)
  - [§5.1 Format and parsing](#51-format-and-parsing)
  - [§5.2 Aggregation defaults](#52-aggregation-defaults)
  - [§5.3 Scale, domain, and ticks](#53-scale-domain-and-ticks)
  - [§5.4 Axes and marks](#54-axes-and-marks)
  - [§5.5 Diverging and color](#55-diverging-and-color)
- [§6 Examples](#6-examples)
  - [§6.1 Revenue bar chart](#61-revenue-bar-chart)
  - [§6.2 Temperature line chart](#62-temperature-line-chart)
  - [§6.3 Rank bump chart](#63-rank-bump-chart)
  - [§6.4 Rating with domain](#64-rating-with-domain)
- [§7 Related](#7-related)

---

# §1 Overview

A **semantic type** is a named label, such as `Revenue`, `Month`, or `Rating`, that tells the compiler how to treat a field. Types are organized in three tiers that map to Flint's semantic levels:

| Flint level | Code tier | Count | Decides |
|-------------|-----------|-------|---------|
| L1 Semantic Domain | **T0** Family | 6 | Parser class, encoding family (temporal / measure / categorical / …) |
| L2 Semantic Family | **T1** Category | 17 | Aggregation role, zero class, format class, diverging hints |
| L3 Semantic Type | **T2** Specific | 46 | Exact format, domain, tick strategy, type-specific presentation |

The LLM or user may annotate at any tier. The result degrades gracefully rather than failing: `Revenue` (T2) yields currency format, sum aggregation, and log-scale hints; `Amount` (T1) still gets currency class and sum; `Measure` (T0) still gets quantitative encoding and meaningful zero, but no format prefix.

**Design principles:**

1. **Semantic type is the source of truth.** Compilation context is a deterministic function of (semanticType, dataValues, channel, markType). No hidden state.
2. **Decisions are structured, not scattered.** One builder produces typed context objects; downstream code reads those objects instead of re-inspecting semantic type strings.
3. **Per-field, then per-channel.** Format and aggregation are field-intrinsic; zero-baseline, reversal, and color scheme depend on channel and mark.
4. **Override-friendly.** Every decision has a type-derived default; users, templates, or the agent can override individual fields explicitly.
5. **Backend-agnostic.** Context describes abstract intent, such as currency format or reversed axis, before it is translated to Vega-Lite, ECharts, or another target.
6. **Semantic type + optional metadata.** Bounded scales, units, and custom orderings can need structured annotations alongside the type string.

For where semantic resolution sits in the full compile path, see [Architecture](/documentation/architecture).

---

# §2 Type hierarchy

## §2.1 Tiered type system

Different tasks need different levels of specificity. Three tiers let the LLM choose the right cost/quality tradeoff:

| Tier | Count | Purpose | LLM cost | Viz config quality |
|---|---|---|---|---|
| **T0 — Family** | 6 | Coarsest: encoding type and basic defaults | Lowest — rule-based fallback possible | Correct encoding, generic formatting |
| **T1 — Category** | 17 | Format class, aggregation default, zero-baseline, color class | Moderate — small closed list | Good formatting, sensible defaults |
| **T2 — Specific** | 46 | Diverging midpoints, domain constraints, tick strategies | Higher — larger vocabulary | Full compilation context |

## §2.2 Tier 0 — Families

Broad categories inferred by heuristics (no LLM required):

| T0 Family | Data type | Default vis encoding | What it determines |
|---|---|---|---|
| **Temporal** | date/string | temporal | Time axis, date parsing, temporal sort |
| **Measure** | number | quantitative | Numeric axis, aggregation=sum, meaningful zero |
| **Discrete** | number | ordinal | Integer ticks, no aggregation, arbitrary zero |
| **Geographic** | number/string | geographic/nominal | Map layer, geocoding |
| **Categorical** | string | nominal | Color/shape/facet, no axis ordering |
| **Identifier** | number/string | nominal | Tooltip only, never encode on axis/color |

T0 alone gives correct encoding, basic aggregation, and zero-baseline class. It does not capture format prefix/suffix, specific aggregation, diverging detection, domain constraints, or scale hints.

## §2.3 Tier 1 — Categories

Each T1 maps to exactly one T0 family:

| T0 Family | T1 Categories | What T1 adds over T0 |
|---|---|---|
| **Temporal** | `DateTime`, `DateGranule`, `Duration` | Point-in-time vs granule vs span; temporal vs ordinal encoding |
| **Measure** | `Amount`, `Physical`, `Proportion`, `SignedMeasure`, `GenericMeasure` | Format class ($, %, °), aggregation, diverging detection |
| **Discrete** | `Rank`, `Score`, `Index` | Reversed axis (Rank), integer ticks, domain hints |
| **Geographic** | `GeoCoordinate`, `GeoPlace` | Lat/lon pairing vs geocodable name |
| **Categorical** | `Entity`, `Coded`, `Binned` | Cardinality expectations, ordinal-ness of bins |
| **Identifier** | `ID` | Never aggregate, never encode |

**Full T1 table:**

| T1 Type | T0 Family | Vis encoding | What it determines |
|---|---|---|---|
| `DateTime` | Temporal | temporal | Full date/time parsing, temporal axis |
| `DateGranule` | Temporal | ordinal or temporal | Month/Year/Quarter — ordinal sort, canonical order |
| `Duration` | Temporal | quantitative | Time span formatting, sum/avg aggregation |
| `Amount` | Measure | quantitative | Currency prefix, sum, meaningful zero |
| `Physical` | Measure | quantitative | Unit suffix, avg aggregation, arbitrary zero for Temperature |
| `Proportion` | Measure | quantitative | % formatting, bounded domain, avg aggregation |
| `SignedMeasure` | Measure | quantitative | Diverging midpoint (0), signed data |
| `GenericMeasure` | Measure | quantitative | No special format, sum/avg from field name |
| `Rank` | Discrete | ordinal | Reversed axis, integer ticks, not aggregable |
| `Score` | Discrete | quantitative | Bounded domain, integer ticks, avg aggregation |
| `Index` | Discrete | ordinal/nominal | Row number — not aggregable |
| `GeoCoordinate` | Geographic | quantitative | Fixed domain (lat/lon), map projection |
| `GeoPlace` | Geographic | nominal | Geocodable name, choropleth/symbol-map |
| `Entity` | Categorical | nominal | High cardinality, tooltip-friendly |
| `Coded` | Categorical | nominal | Low cardinality, discrete colors (Status, Type, Boolean, Direction) |
| `Binned` | Categorical | ordinal | Pre-binned ranges, ordinal axis |
| `ID` | Identifier | nominal | Never aggregate, tooltip only |

## §2.4 Tier 2 — Specific types

Each T2 maps to exactly one T1. The inventory keeps only types that **change compilation behavior** relative to their T1 parent. Domain-specific diverging midpoints, such as pH=7 or NPS=0, come from `intrinsicDomain` or type-intrinsic logic rather than dedicated T2 types.

| T1 Category | T2 Specific Types |
|---|---|
| `DateTime` | DateTime, Date, Time, Timestamp |
| `DateGranule` | Year, Quarter, Month, Week, Day, Hour, YearMonth, YearQuarter, YearWeek, Decade |
| `Duration` | Duration |
| `Amount` | Amount, Price, Revenue, Cost |
| `Physical` | Quantity, Temperature |
| `Proportion` | Percentage |
| `SignedMeasure` | Profit, PercentageChange, Sentiment, Correlation |
| `GenericMeasure` | Count, Number |
| `Rank` | Rank |
| `Score` | Score, Rating |
| `Index` | Index |
| `GeoCoordinate` | Latitude, Longitude |
| `GeoPlace` | Country, State, City, Region, ZipCode, Address |
| `Entity` | PersonName, Company, Product, Category, Name, String, Unknown |
| `Coded` | Status, Type, Boolean, Direction |
| `Binned` | Range, AgeGroup |
| `ID` | ID |

**Dropped types** (removed from `TYPE_REGISTRY` and `SemanticTypes`; unknown strings fall back to `UNKNOWN_ENTRY`):

| Dropped T2 | Use instead | Rationale |
|---|---|---|
| TimeRange | Duration | Same compilation |
| Distance, Area, Volume, Weight, Speed | Quantity / `Physical` T1 | Unit from annotation |
| Rate | Percentage | Same format + aggregation |
| Ratio | Number | Open domain, decimal format |
| Level | Score | Same bounded/avg compilation |
| Coordinates | Latitude + Longitude | Ambiguous pair |
| Location | Country / State / City | Generic fallback |
| Username, Email, Brand, Department | PersonName / Company / Name | Same nominal compilation |
| Binary, Code | Boolean / Status | Same categorical compilation |
| Bucket | Range | Same compilation |
| SKU | ID | Same identifier role |

**What T2 adds over T1:** `Revenue` vs `Price` (additive vs intensive); `Temperature` vs `Quantity` (conditional diverging); `Month` vs `Year` (cyclic(12) vs open); `Sentiment` vs `Profit` vs `Correlation` (inherent vs conditional diverging).

## §2.5 The hierarchy as a DAG

```text
T0 Family         T1 Category          T2 Specific
─────────         ───────────          ──────────────────────

Temporal ─────┬── DateTime ──────────── DateTime, Date, Time, Timestamp
              ├── DateGranule ───────── Year, Quarter, Month, Week, Day, Hour,
              │                         YearMonth, YearQuarter, YearWeek, Decade
              └── Duration ─────────── Duration

Measure ──────┬── Amount ────────────── Amount, Price, Revenue, Cost
              ├── Physical ─────────── Quantity, Temperature
              ├── Proportion ────────── Percentage
              ├── SignedMeasure ─────── Profit, PercentageChange, Sentiment, Correlation
              └── GenericMeasure ────── Count, Number

Discrete ─────┬── Rank ─────────────── Rank
              ├── Score ────────────── Score, Rating
              └── Index ────────────── Index

Geographic ───┬── GeoCoordinate ────── Latitude, Longitude
              └── GeoPlace ─────────── Country, State, City, Region, ZipCode, Address

Categorical ──┬── Entity ───────────── PersonName, Company, Product, Category, Name, String, Unknown
              ├── Coded ────────────── Status, Type, Boolean, Direction
              └── Binned ───────────── Range, AgeGroup

Identifier ───┴── ID ───────────────── ID
```

Resolution walks T2 → T1 → T0, applying progressively finer rules and falling back whenever a tier has no specific decision:

```typescript
function resolveFieldSemantics(annotation, fieldName, values) {
    const { semanticType } = normalizeAnnotation(annotation);
    const t2 = T2_REGISTRY[semanticType];
    const t1 = t2?.t1 ?? T1_REGISTRY[semanticType];
    const t0 = t1?.t0 ?? T0_REGISTRY[semanticType];

    // T0: encoding, agg role, zero class (always available)
    // T1: format class, agg default, diverging class (if T1 or finer)
    // T2: format detail, domain, ticks, interpolation (if T2)
    return mergeContext(t0Defaults, t1Refinements, t2Specifics);
}
```

## §2.6 Cyclic domain types

Types with wrap-around domains need canonical sort, no extrapolation beyond the cycle, cyclic palettes, and radar/polar hints:

| Type | Cycle | Values | Visualization concern |
|---|---|---|---|
| Month | 12 | Jan–Dec or 1–12 | Axis shouldn't show "13"; color wraps |
| Day (weekday) | 7 | Mon–Sun | Same |
| Hour | 24 | 0–23 | Circular charts natural |
| Direction | 8/16+ | N, NE, E, … | Polar/radar natural |
| Quarter | 4 | Q1–Q4 | Axis ordering |

## §2.7 LLM annotation strategies

| Strategy | Types used | When to use | LLM prompt size |
|---|---|---|---|
| **Full T2** | All specific types | High-value dashboards | Largest (~46 types) |
| **T1 only** | Category-level | Bulk annotation, cost-sensitive | Medium (~17 types) |
| **T0 only** | Family-level | Quick preview, rule-based fallback | Smallest (~6 types) |
| **Mixed** | T2 for key fields, T1 for rest | Typical interactive session | Adaptive |

**Mixed strategy example** — T2 for chart-critical fields, T1 for the rest:

```json
{
    "revenue": { "semantic_type": "Revenue", "unit": "USD" },
    "month":   { "semantic_type": "Month" },
    "product_category": { "semantic_type": "Coded" },
    "customer_name":    { "semantic_type": "Entity" },
    "customer_age":     { "semantic_type": "GenericMeasure" },
    "region":           { "semantic_type": "GeoPlace" },
    "order_date":       { "semantic_type": "DateTime" },
    "satisfaction":     { "semantic_type": "Score", "intrinsic_domain": [1, 5] }
}
```

## §2.8 Type registry

The tier hierarchy controls *which* rules fire and at what granularity. Every type also carries **five orthogonal dimensions** that directly drive visualization properties. These dimensions live in `TypeRegistryEntry` alongside the type's tier position:

| Dimension | Values | What it controls |
|---|---|---|
| **Vis encoding candidates** | `quantitative`, `ordinal`, `nominal`, `temporal` (preference order) | Axis type, scale type, mark compatibility, sort |
| **Aggregation role** | `additive`, `intensive`, `signed-additive`, `dimension`, `identifier` | Aggregate function, group-by, tooltip-only |
| **Domain shape** | `open`, `bounded`, `fixed`, `cyclic` | Domain clamping, ticks, extrapolation, polar hints |
| **Diverging nature** | `none`, `conditional`, `inherent` | Sequential vs diverging color, midpoint, legend |
| **Format class** | `currency`, `percent`, `unit-suffix`, `date`, `time`, `integer`, `plain` | Axis/tooltip format, prefix/suffix, precision |

**Exemplar types** (tier position + dimension values):

| Type (T2) | T1 | T0 | Vis encoding | Agg role | Domain | Diverging | Format |
|---|---|---|---|---|---|---|---|
| Month | DateGranule | Temporal | ordinal, temporal | dimension | cyclic (12) | none | date |
| Year | DateGranule | Temporal | temporal, ordinal | dimension | open | none | integer |
| Rating | Score | Discrete | quantitative, ordinal | intensive | bounded [1,N] | conditional | integer |
| Temperature | Physical | Measure | quantitative | intensive | open | conditional | unit-suffix |
| Quantity | Physical | Measure | quantitative | intensive | open, ≥0 | none | unit-suffix |
| Sentiment | SignedMeasure | Measure | quantitative | signed-additive | bounded [-1,1] | inherent | plain |
| Correlation | SignedMeasure | Measure | quantitative | signed-additive | bounded [-1,1] | inherent | plain |
| Profit | SignedMeasure | Measure | quantitative | signed-additive | open | conditional | currency |
| PercentageChange | SignedMeasure | Measure | quantitative | signed-additive | open | conditional | percent |
| Revenue | Amount | Measure | quantitative | additive | open, ≥0 | none | currency |
| Price | Amount | Measure | quantitative | intensive | open, ≥0 | none | currency |
| Percentage | Proportion | Measure | quantitative | intensive | bounded [0,1] or [0,100] | none | percent |
| Count | GenericMeasure | Measure | quantitative | additive | open, ≥0 | none | integer |
| Country | GeoPlace | Geographic | nominal | dimension | open | none | plain |
| Latitude | GeoCoordinate | Geographic | quantitative | dimension | fixed [-90,90] | none | plain |
| Rank | Rank | Discrete | ordinal | dimension | open | none | integer |
| Status | Coded | Categorical | nominal | dimension | fixed | none | plain |
| Direction | Coded | Categorical | nominal | dimension | cyclic (8/16) | none | plain |

At T1, the builder inherits the category's dimension values. At T2, specific overrides apply. At T0 only, conservative defaults apply. Downstream code reads resolved `FieldSemantics` / `ChannelSemantics` rather than tiers or dimensions directly. Some dimension values are data-dependent, such as choosing the `Rating` encoding from distinct-value count; that disambiguation happens in `resolveFieldSemantics`, not in the registry.

```typescript
interface TypeRegistryEntry {
    t0: T0Family;
    t1: T1Category;
    visEncodings: VisCategory[];
    aggRole: AggRole;
    domainShape: DomainShape;
    diverging: DivergingClass;
    formatClass: FormatClass;
    zeroBaseline: ZeroBaseline;
    zeroPad: number;
}
```

---

# §3 Field annotations

## §3.1 Why metadata matters

A bare type string like `"Rating"` is ambiguous: is the scale 1–5, 1–10, or 0–100? Other bounded or unit-bearing types have similar gaps:

| Type | What's missing | Why it matters |
|---|---|---|
| **Rating** / **Score** | Scale range | Tick marks, domain, zero decision |
| **Percentage** | Representation (0–1 vs 0–100) | Format: `.1%` vs `.1f` + "%" |
| **Temperature** | Unit (°C, °F, K) | Suffix, diverging midpoint (0°C vs 32°F) |
| **Physical measures** | Unit (kg, km, mph) | Format suffix |
| **Price / Revenue / Cost** | Currency (USD, EUR) | Format prefix ($, €) |
| **Duration** | Unit (seconds, hours) | Display strategy |
| **Ordinal categoricals** | Custom sort order | Non-alphabetical ordering (severity, size) |

Open-ended measures (`Count`, `Revenue`, `Rank`) and nominal fields (`Country`, `Status`) typically need no metadata.

## §3.2 SemanticAnnotation

```typescript
/**
 * Enriched semantic annotation for a single field.
 * Only `semanticType` is required. Compact form: bare string equals
 * `{ semanticType: "..." }`.
 */
interface SemanticAnnotation {
    /** Semantic type string (e.g. 'Rating', 'Temperature', 'Price') */
    semanticType: string;

    /**
     * Intrinsic domain for bounded/scaled types.
     * Drives domainConstraint, exactTicks, zeroBaseline, diverging midpoint.
     * NOT for open-ended measures (Revenue, Count, Temperature).
     */
    intrinsicDomain?: [number, number];

    /**
     * Unit of measurement — cosmetic when present; omit if mixed units.
     * Drives format prefix/suffix and diverging midpoint (°C → 0, °F → 32).
     */
    unit?: string;

    /**
     * Canonical sort order for domain-specific ordinals.
     * Well-known types (Month, DayOfWeek) need not provide this.
     */
    sortOrder?: string[];
}
```

## §3.3 Which types need metadata?

| Type | `intrinsicDomain` | `unit` | `sortOrder` | Why |
|---|---|---|---|---|
| **Rating** | yes — [1,5], [1,10], [0,100] | no | no | Scale determines ticks, domain, zero |
| **Score** | yes — [0,100], [0,10] | no | no | Same as Rating |
| **Percentage** | semi — inferred from data | no | no | Representation affects format |
| **Temperature** | no | optional — °C, °F, K | no | Suffix + diverging hint |
| **Physical** (any) | no | optional | no | Suffix only |
| **Duration** | no | optional | no | Display hint |
| **Price / Revenue / Cost / Amount** | no | optional — USD, EUR | no | Currency prefix |
| **Latitude / Longitude** | fixed (type-intrinsic) | no | no | No annotation needed |
| Count, Quantity, Rank, ID, … | no | no | no | No ambiguity |
| **Ordinal categoricals** (Severity, Size) | no | no | **yes** | Domain-specific order |
| Well-known ordinals (Month, DayOfWeek) | no | no | no | Built-in order |
| Nominal categoricals | no | no | no | No inherent order |
| **Sentiment, Correlation, Profit** | no | optional currency | no | Midpoint from type |
| **Domain-specific diverging** (pH, NPS) | yes — e.g. [0, 14] | no | no | Midpoint from domain |

## §3.4 Numeric representation detection

Some types appear in different numeric encodings. The builder resolves these representations while determining field context:

| Type | Representations | Detection |
|---|---|---|
| **Percentage** | 0–1 fractional vs 0–100 whole | `max(data) ≤ 1` → fractional; else whole; or `intrinsicDomain` |
| **Timestamp** | Unix s, Unix ms, ISO string | Magnitude >1e12 → ms; >1e9 → s; string → parse |
| **Month / Day** | Numeric vs abbreviated vs full name | Data type + pattern matching |
| **Boolean** | true/false, 0/1, Yes/No | Data type + distinct values |

**Percentage impact:**

| Concern | Fractional (0–1) | Whole-number (0–100) |
|---|---|---|
| Format | `.1%` (d3 ×100) | `.0f` + suffix `%` |
| Domain | [0, 1] | [0, 100] |
| Ticks | 0, 0.25, 0.5, 0.75, 1.0 | 0, 25, 50, 75, 100 |

Priority: (1) explicit `intrinsicDomain`, (2) data inspection, (3) conservative default. If at least 80% of absolute values are ≤1, treat the field as fractional.

## §3.5 Accepting string or object

```typescript
function normalizeAnnotation(
    input: string | SemanticAnnotation
): SemanticAnnotation {
    if (typeof input === 'string') {
        return { semanticType: input };
    }
    return input;
}
```

`semantic_types` in chart input accepts `Record<string, string | SemanticAnnotation>`. Annotation metadata flows into `FieldSemantics` during `resolveFieldSemantics`: `intrinsicDomain` → domain, ticks, zero, and diverging midpoint; `unit` → format prefix/suffix; `sortOrder` → `canonicalOrder` and ordinal encoding.

---

# §4 Compilation pipeline

## §4.1 Four-stage overview

| Stage | Function | Input → Output | Concern |
|-------|----------|---------------|---------|
| **1. Field Semantics** | `resolveFieldSemantics()` | Annotation + data → `FieldSemantics` | What *is* this field? |
| **2. Channel Semantics** | `resolveChannelSemantics()` | FieldSemantics + channel → `ChannelSemantics` | How should it render on this channel? |
| **3. Layout** | `computeLayout()` | ChannelSemantics + data → `LayoutResult` | How big? What gets filtered? |
| **4. Spec Generation** | `assembleVegaLite()` etc. | ChannelSemantics + template → backend spec | Backend-specific output |

`ChannelSemantics` is the **intermediate representation (IR)**: a flat, target-agnostic record that decouples upstream semantics from layout and all backends (Vega-Lite, ECharts, Chart.js).

```text
┌──────────────────────────────────────────────────────────────────────┐
│  Stage 1: Field Semantics                                            │
│  resolveFieldSemantics(annotation, fieldName, values)                │
│  → FieldSemantics (format, agg, domain, ordering)                    │
├──────────────────────────────────────────────────────────────────────┤
│  Stage 2: Channel Semantics                                          │
│  resolveChannelSemantics(encodings, data, semanticTypes, converted)  │
│  → ChannelSemantics (encoding type, color, ticks, reversal, …)         │
├──────────────────────────────────────────────────────────────────────┤
│  IR boundary: ChannelSemantics (flat, target-agnostic)                 │
├──────────────────────────────────────────────────────────────────────┤
│  Stage 3: Layout — computeLayout(), filterOverflow()                 │
├──────────────────────────────────────────────────────────────────────┤
│  Stage 4: Spec Generation — assembleVegaLite / ECharts / …         │
│  finalize zero-baseline, template.instantiate, apply layout            │
└──────────────────────────────────────────────────────────────────────┘
```

Stage boundaries are intentionally narrow: `convertTemporalData()` runs once before Stage 2; `FieldSemantics` stays internal to Stage 2; zero-baseline finalization waits until Stage 4 because it needs the template mark type.

## §4.2 Field vs channel responsibilities

| Decision | Source | Output field |
|---|---|---|
| **From field semantics (data identity)** | | |
| Semantic annotation | `resolveFieldSemantics()` | `ChannelSemantics.semanticAnnotation` |
| Number format | `resolveFieldSemantics()` → `resolveFormat()` | `ChannelSemantics.format` |
| Tooltip format | `resolveFieldSemantics()` → `resolveFormat()` | `ChannelSemantics.tooltipFormat` |
| Aggregation default | `resolveFieldSemantics()` → `resolveAggregationDefault()` | `ChannelSemantics.aggregationDefault` |
| Scale type | `resolveFieldSemantics()` → `resolveScaleType()` | `ChannelSemantics.scaleType` |
| Domain constraint | `resolveFieldSemantics()` → `resolveDomainConstraint()` | `ChannelSemantics.domainConstraint` |
| Canonical order | `resolveFieldSemantics()` → `resolveCanonicalOrder()` | promoted from `FieldSemantics` |
| Cyclic ordering | `resolveFieldSemantics()` → `resolveCyclic()` | `ChannelSemantics.cyclic` |
| Sort direction | `resolveFieldSemantics()` → `resolveSortDirection()` | `ChannelSemantics.sortDirection` |
| Zero baseline class | `resolveFieldSemantics()` → `resolveZeroBaseline()` | internal hint for Stage 4 |
| Binning suggested | `resolveFieldSemantics()` → `resolveBinningSuggested()` | `ChannelSemantics.binningSuggested` |
| **Channel-specific (visualization)** | | |
| Encoding type (Q/O/N/T) | `resolveEncodingTypeDecision()` | `ChannelSemantics.type` |
| Zero-baseline boolean | `computeZeroDecision()` (Stage 4) | `ChannelSemantics.zero` |
| Color scheme | `getRecommendedColorSchemeWithMidpoint()` | `ChannelSemantics.colorScheme` |
| Temporal format | `resolveTemporalFormat()` | `ChannelSemantics.temporalFormat` |
| Ordinal sort order | `inferOrdinalSortOrder()` | `ChannelSemantics.ordinalSortOrder` |
| Nice rounding | `resolveNice()` | `ChannelSemantics.nice` |
| Tick constraint | `resolveTickConstraint()` | `ChannelSemantics.tickConstraint` |
| Axis reversal | `resolveReversed()` | `ChannelSemantics.reversed` |
| Interpolation | `resolveInterpolation()` | `ChannelSemantics.interpolation` |
| Stackable | `resolveStackable()` | `ChannelSemantics.stackable` |

## §4.3 resolveFieldSemantics

```typescript
function resolveFieldSemantics(
    annotation: string | SemanticAnnotation,
    fieldName: string,
    values: any[],
): FieldSemantics;
```

Internal flow (field-intrinsic only):

- `normalizeAnnotation(annotation)` → semantic type + optional metadata
- `resolveTiers(semanticType)` → T0/T1 for rule selection
- `resolveDefaultVisType(semanticType, values)` → encoding with data disambiguation
- `resolveFormat(semanticType, unit, fieldName, values)` → `FormatSpec` + tooltip; `detectPrecision(values)` for data-driven decimals
- `resolveAggregationDefault(semanticType)` → sum / average / undefined
- `resolveZeroBaseline(semanticType, domain)` → meaningful / arbitrary / contextual
- `resolveScaleType(semanticType, values)` → linear / log / sqrt (data-dependent)
- `resolveDomainConstraint(semanticType, domain, values)` → annotation > type-intrinsic > data-inferred
- `resolveCanonicalOrder(semanticType, sortOrder, values)` → annotation or built-in
- `resolveCyclic(semanticType)` → boolean
- `resolveSortDirection(semanticType)` → ascending / descending
- `resolveBinningSuggested(semanticType, domain, values)` → boolean

Channel-level functions (`resolveTickConstraint`, `resolveReversed`, `resolveNice`, color scheme, interpolation, stackable) are exported from the same module and called by Stage 2.

## §4.4 resolveChannelSemantics

```typescript
// Stage 2 entry point → Record<channel, ChannelSemantics>
function resolveChannelSemantics(encodings, data, semanticTypes, convertedData?) {
    for each channel:
        fc = resolveFieldSemantics(normalizeAnnotation(semanticTypes[field]), field, values)
        cs = {
            field, semanticAnnotation: fc.semanticAnnotation,
            type: resolveEncodingType(...),
            // promoted from FieldSemantics:
            format, tooltipFormat, aggregationDefault, scaleType,
            domainConstraint, canonicalOrder, cyclic, sortDirection, binningSuggested,
            // channel-resolved:
            nice: resolveNice(semanticType, domainShape),
            tickConstraint: resolveTickConstraint(semanticType, domain, values),
            reversed: resolveReversed(semanticType),
            colorScheme: resolveColorScheme(semanticType, annotation, values),
            temporalFormat: resolveTemporalFormat(...),
            ordinalSortOrder: inferOrdinalSortOrder(...),
            interpolation: resolveInterpolation(semanticType),
            stackable: resolveStackable(semanticType),
        }
    return Record<channel, ChannelSemantics>
}
```

Stage 2 does **not** set `zero`. Stage 4 calls `computeZeroDecision()` with the mark type: bar → include zero for length integrity; scatter → data-fitted.

## §4.5 FieldSemantics interface

```typescript
/**
 * Field-intrinsic properties — semantic type, annotation, and data.
 * NOT channel-dependent. Computed in Stage 1.
 */
interface FieldSemantics {
    semanticAnnotation: SemanticAnnotation;
    defaultVisType: 'quantitative' | 'ordinal' | 'nominal' | 'temporal';
    format: FormatSpec;
    tooltipFormat?: FormatSpec;
    aggregationDefault?: 'sum' | 'average';
    zeroBaseline: ZeroBaseline | 'unknown';
    scaleType?: 'linear' | 'log' | 'sqrt' | 'symlog';
    domainConstraint?: DomainConstraint;
    canonicalOrder?: string[];
    cyclic: boolean;
    sortDirection: 'ascending' | 'descending';
    binningSuggested: boolean;
}
```

Properties **not** on `FieldSemantics` (channel/mark-dependent): `nice`, `tickConstraint`, `reversed`, `interpolation`, `stackable`, `colorScheme`, `zero`, `temporalFormat`, `ordinalSortOrder`.

## §4.6 ChannelSemantics interface

```typescript
/** Flat IR — sole public interface for layout, templates, and all backends. */
interface ChannelSemantics {
    field: string;
    semanticAnnotation: SemanticAnnotation;
    type: 'quantitative' | 'nominal' | 'ordinal' | 'temporal';
    format?: FormatSpec;
    tooltipFormat?: FormatSpec;
    temporalFormat?: string;
    aggregationDefault?: 'sum' | 'average';
    zero?: ZeroDecision;           // finalized in Stage 4
    scaleType?: 'linear' | 'log' | 'sqrt' | 'symlog';
    nice?: boolean;
    domainConstraint?: DomainConstraint;
    tickConstraint?: TickConstraint;
    ordinalSortOrder?: string[];
    cyclic?: boolean;
    reversed?: boolean;
    sortDirection?: 'ascending' | 'descending';
    colorScheme?: ColorSchemeRecommendation;
    interpolation?: 'linear' | 'step' | 'step-after' | 'monotone';
    binningSuggested?: boolean;
    stackable?: 'sum' | 'normalize' | false;
}

type SemanticResult = Record<string, ChannelSemantics>;
```

## §4.7 Supporting types

```typescript
interface FormatSpec {
    pattern?: string;       // d3-format, e.g. "$,.0f", ".1%"
    prefix?: string;        // "$", "€"
    suffix?: string;        // "%", "°C", " kg"
    decimals?: number;
    abbreviate?: boolean;   // 1234567 → "1.2M"
    temporalPattern?: string; // "%Y", "%b %d"
}

interface DomainConstraint {
    min?: number;
    max?: number;
    clamp?: boolean;        // true = hard clip; false = soft suggestion
}

interface TickConstraint {
    integersOnly?: boolean;
    exactTicks?: number[];  // e.g. Rating 1–5 → [1,2,3,4,5]
    suggestedCount?: number;
    minStep?: number;
}
```

## §4.8 Layout and spec generation

**Stage 3** operates on `ChannelSemantics` and data only. See [Auto Layout Algorithm](/documentation/layout-model) for stretch sizing, overflow filtering, and facet grids. `declareLayoutMode()` is the template hook that lets Stage 4 influence Stage 3 through a narrow interface.

**Stage 4** is backend-specific: (1) finalize zero via `computeZeroDecision()` with mark type; (2) translate encodings; (3) run `template.instantiate()`; (4) apply layout. Templates read flat `ChannelSemantics` directly.

## §4.9 Caching

Field semantics can be expensive because they include format detection and distribution analysis. Cache per field with key `${fieldName}::${semanticType}::${dataHash}`, where `dataHash` fingerprints the first ~100 values.

---

# §5 Resolution rules

## §5.1 Format and parsing

Only override native formatting when semantic context adds value: prefix/suffix, abbreviation, sign, or no-comma years. Generic decimals (`Number`, `Score`, `Rating`) use empty `format: {}` so Vega-Lite can adapt precision. When format is provided, `detectPrecision(values)` caps meaningful decimals at 0–4.

| Semantic Type | `pattern` | `prefix` | `suffix` | `abbreviate` | Notes |
|---|---|---|---|---|---|
| **Count** | `,d` | — | — | — | Integer with thousands sep |
| **Amount** | data-driven | `$` | — | yes | Tooltip `,.2f` |
| **Price** | `,.2f` | `$` | — | yes | Always shows cents |
| **Revenue / Cost** | data-driven | `$` | — | yes | Tooltip `,.2f` |
| **Percentage** (0–1) | `.Xp%` | — | — | — | Auto-detects representation |
| **Percentage** (0–100) | data-driven + `d` | — | `%` | — | No ×100 |
| **PercentageChange** | `+.X%` or `+.Xf` | — | `%` if 0–100 | — | Always-show sign |
| **Temperature** | data-driven | — | from unit | — | Unit from annotation |
| **Score / Rating** | — (empty) | — | — | — | VL native axis |
| **Rank** | `,d` | — | — | — | Integer |
| **Year** | `d` | — | — | — | No comma |
| **Number** | — (empty) | — | — | — | VL native |
| **Quantity** | data-driven | — | from unit | yes | Unit from annotation |
| **Profit** | `+` + data-driven | `$` | — | yes | Signed currency |
| **Sentiment / Correlation** | `+` + data-driven | — | — | — | Signed decimal |
| **Latitude / Longitude** | — (empty) | — | — | — | VL native |

Visible unit text requires `annotation.unit`; semantic types, column names, and
data values do not authorize display by themselves. Conventional compact units
such as `$`, `%`, `°C`, `kg`, or `min` may accompany values. Lexical units such
as `years` are stated once with the field title (`field (years)`).

**Parsing** is the compiler's job, guided by semantic type rather than stored on context:

| Semantic Type | Raw examples | Compiler action |
|---|---|---|
| Amount, Price, Revenue | `"$1,234.56"` | Strip currency + separators |
| Percentage | `"45.2%"`, `"+12.3%"` | Strip `%` and sign |
| Temperature, Quantity | `"23.5°C"`, `"75 kg"` | Strip unit suffix |
| Duration | `"2h 30m"` | Parse to seconds |
| Timestamp | epoch or ISO string | Detect representation → Date |
| Boolean | `"Yes"`, `0/1` | Normalize to boolean |
| Month | `"January"`, `1` | Canonical form |

## §5.2 Aggregation defaults

| Family | Types | Default | Rationale |
|---|---|---|---|
| Additive measures | Count, Amount, Revenue, Cost, Quantity, Duration | `sum` | Totals — summing is natural |
| Intensive measures | Percentage, Temperature, Score, Rating, Price, Correlation, Sentiment | `average` | Rates/conditions — averaging is natural |
| Signed additive | Profit | `sum` | Can be negative; sum preserves sign |
| Discrete numeric | Rank, Index, ID | — | Not aggregable |
| Temporal / Categorical | DateTime, Name, Status, … | — | Not aggregable |

Auto-aggregation injects the correct aggregate when multiple rows map to the same positional encoding: Revenue → sum, Temperature → mean. The wrong aggregation, such as summing temperatures, produces nonsensical charts. This is an explicit compiler option, because some contexts suppress it:

```typescript
interface CompilerOptions {
    /** When true, instantiator injects aggregate transforms for measure fields
     *  when multiple rows share the same positional encoding (e.g. same X in bar/line). */
    autoAggregate: boolean;
}
```

## §5.3 Scale, domain, and ticks

**Scale type** (data-dependent in builder):

| Condition | Scale | Example |
|---|---|---|
| Measure + >2 orders of magnitude | `log` | Revenue $1K–$1B |
| Measure + long tail (skew > 2) | `sqrt` | Population |
| Signed + wide range | `symlog` | Profit −$10M to +$500M |
| Percentage (0–100) | `linear` | Completion rate |
| Default quantitative | `linear` | — |

**Domain constraints** — effective domain = union of intrinsic bounds and data range. Soft domains never clip legitimate outliers:

| Source | Type | Intrinsic | Data | Effective | Clamp |
|---|---|---|---|---|---|
| Annotation | Rating [1,5] | [1,5] | [1,4] | min 1, max 5 | soft |
| Annotation | Score [0,100] | [0,100] | [0,120] | min 0, max 120 | soft |
| Data-inferred | Percentage 0–100 | [0,100] | [0,155] | min 0, max 155 | soft |
| Type-intrinsic | Latitude | [-90,90] | any | [-90,90] | hard |
| Type-intrinsic | Correlation | [-1,1] | any | [-1,1] | hard |

Priority is `annotation.intrinsicDomain` > type-intrinsic > data-inferred. Small intrinsic spans (≤20) also set `exactTicks`, `binningSuggested: false`, and refine `zeroBaseline`.

**Tick constraints:**

| Type | `integersOnly` | `exactTicks` | `minStep` | Source |
|---|---|---|---|---|
| Count, Year, Rank, Index | true | — | 1 | Type-intrinsic |
| Rating [1,5] | true | [1,2,3,4,5] | 1 | Annotation |
| Rating [1,10] | true | [1..10] | 1 | Annotation |
| Score [0,100] | true | — (span > 20) | 1 | Annotation |
| Month (1–12) | true | [1..12] | 1 | Type-intrinsic |

## §5.4 Axes and marks

| Concern | Rule |
|---|---|
| **Reversed axis** | `Rank` → `true` (1st at top); all others → `false`. Template may override. |
| **Stacking** | Sum stack: Count, Amount, Revenue, Cost, Quantity, Duration, Profit. Normalize: Percentage. No stack: Temperature, Score, Rating, Rank, Correlation, Sentiment. |
| **Interpolation** | Rank/Index → `step`; Temperature, Revenue, Profit → `monotone`; default → `linear`. |
| **Binning** | Suggest: Quantity, Amount, Temperature, Percentage, Duration, high-card Count. Don't: Rating (1–5), Rank, Year, categorical. |

## §5.5 Diverging and color

Diverging treatment needs a **midpoint**, resolved in priority order:

1. `annotation.unit` lookup (°C → 0, °F → 32)
2. Type-intrinsic midpoint
3. `intrinsicDomain` midpoint (Rating [1,5] → 3)
4. Data spans zero → midpoint 0
5. Data range midpoint (fallback)

| Type | Midpoint | Inherent? | Notes |
|---|---|---|---|
| Temperature | 0 / 32 / 273.15 by unit | conditional | Sequential if all positive |
| Profit, PercentageChange | 0 | conditional | Sequential if one-sided |
| Sentiment, Correlation | 0 | inherent | Always meaningful center |
| Score (0–100) | 50 | conditional | From domain midpoint |
| Rating (1–5) | 3 | conditional | Rarely diverging |

**Inherent** types always use diverging palettes because positive and negative values have semantic meaning. **Conditional** types use diverging palettes only when data spans both sides of the midpoint; otherwise they use sequential palettes.

```typescript
interface ColorSchemeHint {
    type: 'categorical' | 'sequential' | 'diverging';
    reversed?: boolean;              // Rank: 1 = best = darkest
    divergingMidpoint?: number;
    inherentlyDiverging?: boolean;
}

function resolveColorSchemeHint(semanticType, annotation, values): ColorSchemeHint {
    const divInfo = resolveDivergingInfo(semanticType, annotation, values);
    if (divInfo) {
        const spansBoth = min < divInfo.midpoint && max > divInfo.midpoint;
        if (divInfo.inherent || spansBoth) {
            return { type: 'diverging', divergingMidpoint: divInfo.midpoint,
                     inherentlyDiverging: divInfo.inherent };
        }
    }
    return { type: isQuantitative ? 'sequential' : 'categorical' };
}
```

---

# §6 Examples

## §6.1 Revenue bar chart

**Input:** `revenue`, `{ semanticType: "Revenue", unit: "EUR" }`, values ~[124500, 89200, …], channel Y, mark bar.

```json
{
    "semanticAnnotation": { "semanticType": "Revenue", "unit": "EUR" },
    "defaultVisType": "quantitative",
    "format": { "pattern": "€,.0f", "prefix": "€", "abbreviate": true },
    "tooltipFormat": { "pattern": "€,.2f", "prefix": "€" },
    "aggregationDefault": "sum",
    "zeroBaseline": "meaningful",
    "scaleType": "linear",
    "binningSuggested": true
}
```

Channel additions: `nice: true`, `stackable: 'sum'`, `interpolation: 'monotone'`, sequential color. The Y axis shows €0, €100K, …; the zero baseline is included; tooltip shows €124,500.00.

## §6.2 Temperature line chart

**Input:** `avg_temp`, `{ semanticType: "Temperature", unit: "°C" }`, values ~[16.8, 31.7, …], channel Y, mark line.

```json
{
    "semanticAnnotation": { "semanticType": "Temperature", "unit": "°C" },
    "defaultVisType": "quantitative",
    "format": { "pattern": ".1f", "suffix": "°C" },
    "tooltipFormat": { "pattern": ".2f", "suffix": "°C" },
    "aggregationDefault": "average",
    "zeroBaseline": "arbitrary",
    "binningSuggested": true
}
```

Channel additions: diverging color midpoint 0°C, `interpolation: 'monotone'`, `stackable: false`. The axis is data-fitted with no forced 0°C; ticks show 16°C, 20°C, …; the line is smoothed.

## §6.3 Rank bump chart

**Input:** `rank`, `Rank`, values [1..10], channel Y, mark line (bump).

```json
{
    "semanticAnnotation": { "semanticType": "Rank" },
    "defaultVisType": "ordinal",
    "format": { "pattern": "d" },
    "aggregationDefault": null,
    "zeroBaseline": "arbitrary",
    "sortDirection": "ascending",
    "binningSuggested": false
}
```

Channel additions: `reversed: true`, `tickConstraint: { integersOnly: true, minStep: 1 }`, `interpolation: 'step'`. The Y axis is reversed (1 at top), ticks are integers, and stacking is disabled.

## §6.4 Rating with domain

**Input:** `rating`, `{ semanticType: "Rating", intrinsicDomain: [1, 5] }`, values [4,3,5,2,4,…], channel Y, mark bar.

```json
{
    "semanticAnnotation": { "semanticType": "Rating", "intrinsicDomain": [1, 5] },
    "defaultVisType": "quantitative",
    "format": {},
    "tooltipFormat": { "pattern": ".1f" },
    "aggregationDefault": "average",
    "zeroBaseline": "arbitrary",
    "domainConstraint": { "min": 1, "max": 5, "clamp": false },
    "binningSuggested": false
}
```

Channel additions: `nice: false`, `tickConstraint: { integersOnly: true, exactTicks: [1,2,3,4,5] }`. The domain [1,5] comes from the annotation; zero is arbitrary because this is a 1-based scale; ticks are exact integers; bars use proportional lengths from zero because Stage 4 keeps `scale.zero` for bar marks.

---

# §7 Related

- [Architecture](/documentation/architecture) — full compile pipeline and repo layout
- [API reference](/documentation/api-reference) — `ChartAssemblyInput`, encodings, overflow
- [Auto Layout Algorithm](/documentation/layout-model) — Stage 3 sizing, stretch, and overflow

Explicit overrides in `chart_spec.encodings` or `chartProperties` always take precedence over compiler defaults.
