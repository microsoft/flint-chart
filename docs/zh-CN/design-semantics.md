# 语义类型

语义类型描述每个数据字段*代表什么*，而不仅仅是如何存储。它们告诉 Flint 字段应如何编码、格式化、聚合、排序和着色。编译器首先将每个字段的语义类型及可选注解解析为 `FieldSemantics`，然后将相关决策提升为各通道的 `ChannelSemantics`，用于布局和后端规范生成。

---

## 目录

- [§1 概览](#1-overview)
- [§2 类型层级](#2-type-hierarchy)
  - [§2.1 分层类型系统](#21-tiered-type-system)
  - [§2.2 第 0 层 — 族（Family）](#22-tier-0-families)
  - [§2.3 第 1 层 — 类别（Category）](#23-tier-1-categories)
  - [§2.4 第 2 层 — 具体类型](#24-tier-2-specific-types)
  - [§2.5 层级作为 DAG](#25-the-hierarchy-as-a-dag)
  - [§2.6 循环域类型](#26-cyclic-domain-types)
  - [§2.7 LLM 注解策略](#27-llm-annotation-strategies)
  - [§2.8 类型注册表](#28-type-registry)
- [§3 字段注解](#3-field-annotations)
  - [§3.1 为何元数据重要](#31-why-metadata-matters)
  - [§3.2 SemanticAnnotation](#32-semanticannotation)
  - [§3.3 哪些类型需要元数据？](#33-which-types-need-metadata)
  - [§3.4 数值表示检测](#34-numeric-representation-detection)
  - [§3.5 接受字符串或对象](#35-accepting-string-or-object)
- [§4 编译流水线](#4-compilation-pipeline)
  - [§4.1 四阶段概览](#41-four-stage-overview)
  - [§4.2 字段与通道职责](#42-field-vs-channel-responsibilities)
  - [§4.3 resolveFieldSemantics](#43-resolvefieldsemantics)
  - [§4.4 resolveChannelSemantics](#44-resolvechannelsemantics)
  - [§4.5 FieldSemantics 接口](#45-fieldsemantics-interface)
  - [§4.6 ChannelSemantics 接口](#46-channelsemantics-interface)
  - [§4.7 辅助类型](#47-supporting-types)
  - [§4.8 布局与规范生成](#48-layout-and-spec-generation)
  - [§4.9 缓存](#49-caching)
- [§5 解析规则](#5-resolution-rules)
  - [§5.1 格式与解析](#51-format-and-parsing)
  - [§5.2 聚合默认值](#52-aggregation-defaults)
  - [§5.3 比例尺、域与刻度](#53-scale-domain-and-ticks)
  - [§5.4 坐标轴与标记](#54-axes-and-marks)
  - [§5.5 发散与颜色](#55-diverging-and-color)
- [§6 示例](#6-examples)
  - [§6.1 收入柱状图](#61-revenue-bar-chart)
  - [§6.2 温度折线图](#62-temperature-line-chart)
  - [§6.3 排名 bump 图](#63-rank-bump-chart)
  - [§6.4 带域的 Rating](#64-rating-with-domain)
- [§7 相关文档](#7-related)

---

# §1 概览

**语义类型**是一个命名标签，例如 `Revenue`、`Month` 或 `Rating`，用于告诉编译器如何处理字段。类型组织为三个层级，对应 Flint 的语义级别：

| Flint 级别 | 代码层级 | 数量 | 决定内容 |
|-------------|-----------|-------|---------|
| L1 语义域 | **T0** Family | 6 | 解析器类别、编码族（temporal / measure / categorical / …） |
| L2 语义族 | **T1** Category | 17 | 聚合角色、零点类别、格式类别、发散提示 |
| L3 语义类型 | **T2** Specific | 46 | 精确格式、域、刻度策略、类型特定呈现 |

LLM 或用户可在任意层级进行注解。结果会优雅降级而非失败：`Revenue`（T2）产生货币格式、求和聚合和对数比例尺提示；`Amount`（T1）仍获得货币类别和求和；`Measure`（T0）仍获得定量编码和有意义零点，但无格式前缀。

**设计原则：**

1. **语义类型是单一事实来源。** 编译上下文是（semanticType、dataValues、channel、markType）的确定性函数。无隐藏状态。
2. **决策结构化，而非分散。** 一个构建器产生类型化上下文对象；下游代码读取这些对象，而非重新检查语义类型字符串。
3. **先按字段，再按通道。** 格式和聚合是字段内在的；零点基线、反转和配色方案取决于通道和标记。
4. **易于覆盖。** 每个决策都有类型推导的默认值；用户、模板或智能体可显式覆盖单个字段。
5. **后端无关。** 上下文在翻译为 Vega-Lite、ECharts 或其他目标之前，描述抽象意图，如货币格式或反转坐标轴。
6. **语义类型 + 可选元数据。** 有界比例尺、单位和自定义排序可能需要与类型字符串并行的结构化注解。

关于语义解析在完整编译路径中的位置，请参阅[架构](/documentation/architecture)。

---

# §2 类型层级

## §2.1 分层类型系统

不同任务需要不同粒度的 specificity。三个层级让 LLM 选择合适的花费/质量权衡：

| 层级 | 数量 | 用途 | LLM 成本 | 可视化配置质量 |
|---|---|---|---|---|
| **T0 — Family** | 6 | 最粗：编码类型和基本默认值 | 最低 — 可基于规则回退 | 正确编码，通用格式化 |
| **T1 — Category** | 17 | 格式类别、聚合默认、零点基线、颜色类别 | 中等 — 小型封闭列表 | 良好格式化，合理默认值 |
| **T2 — Specific** | 46 | 发散中点、域约束、刻度策略 | 较高 — 更大词汇表 | 完整编译上下文 |

## §2.2 第 0 层 — 族（Family）

由启发式推断的宽泛类别（无需 LLM）：

| T0 Family | 数据类型 | 默认可视化编码 | 决定内容 |
|---|---|---|---|
| **Temporal** | date/string | temporal | 时间轴、日期解析、时间排序 |
| **Measure** | number | quantitative | 数值轴、aggregation=sum、有意义零点 |
| **Discrete** | number | ordinal | 整数刻度、无聚合、任意零点 |
| **Geographic** | number/string | geographic/nominal | 地图图层、地理编码 |
| **Categorical** | string | nominal | 颜色/形状/分面、无轴排序 |
| **Identifier** | number/string | nominal | 仅 tooltip，永不编码到轴/颜色 |

T0 单独即可提供正确编码、基本聚合和零点基线类别。它无法捕获格式前缀/后缀、特定聚合、发散检测、域约束或比例尺提示。

## §2.3 第 1 层 — 类别（Category）

每个 T1 精确映射到一个 T0 family：

| T0 Family | T1 Categories | T1 相对 T0 的增量 |
|---|---|---|
| **Temporal** | `DateTime`, `DateGranule`, `Duration` | 时点 vs 粒度 vs 跨度；temporal vs ordinal 编码 |
| **Measure** | `Amount`, `Physical`, `Proportion`, `SignedMeasure`, `GenericMeasure` | 格式类别（$、%、°）、聚合、发散检测 |
| **Discrete** | `Rank`, `Score`, `Index` | 反转轴（Rank）、整数刻度、域提示 |
| **Geographic** | `GeoCoordinate`, `GeoPlace` | 经纬度配对 vs 可地理编码名称 |
| **Categorical** | `Entity`, `Coded`, `Binned` | 基数期望、分箱的顺序性 |
| **Identifier** | `ID` | 永不聚合、永不编码 |

**完整 T1 表：**

| T1 Type | T0 Family | 可视化编码 | 决定内容 |
|---|---|---|---|
| `DateTime` | Temporal | temporal | 完整日期/时间解析、时间轴 |
| `DateGranule` | Temporal | ordinal or temporal | Month/Year/Quarter — 顺序排序、规范顺序 |
| `Duration` | Temporal | quantitative | 时间跨度格式化、sum/avg 聚合 |
| `Amount` | Measure | quantitative | 货币前缀、sum、有意义零点 |
| `Physical` | Measure | quantitative | 单位后缀、avg 聚合、Temperature 的任意零点 |
| `Proportion` | Measure | quantitative | % 格式化、有界域、avg 聚合 |
| `SignedMeasure` | Measure | quantitative | 发散中点（0）、有符号数据 |
| `GenericMeasure` | Measure | quantitative | 无特殊格式，sum/avg 来自字段名 |
| `Rank` | Discrete | ordinal | 反转轴、整数刻度、不可聚合 |
| `Score` | Discrete | quantitative | 有界域、整数刻度、avg 聚合 |
| `Index` | Discrete | ordinal/nominal | 行号 — 不可聚合 |
| `GeoCoordinate` | Geographic | quantitative | 固定域（lat/lon）、地图投影 |
| `GeoPlace` | Geographic | nominal | 可地理编码名称、choropleth/symbol-map |
| `Entity` | Categorical | nominal | 高基数、适合 tooltip |
| `Coded` | Categorical | nominal | 低基数、离散颜色（Status、Type、Boolean、Direction） |
| `Binned` | Categorical | ordinal | 预分箱区间、顺序轴 |
| `ID` | Identifier | nominal | 永不聚合、仅 tooltip |

## §2.4 第 2 层 — 具体类型

每个 T2 精确映射到一个 T1。清单仅保留**相对其 T1 父级会改变编译行为**的类型。领域特定的发散中点（如 pH=7 或 NPS=0）来自 `intrinsicDomain` 或类型内在逻辑，而非专用 T2 类型。

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

**已移除类型**（从 `TYPE_REGISTRY` 和 `SemanticTypes` 中删除；未知字符串回退到 `UNKNOWN_ENTRY`）：

| 已移除 T2 | 改用 | 理由 |
|---|---|---|
| TimeRange | Duration | 相同编译 |
| Distance, Area, Volume, Weight, Speed | Quantity / `Physical` T1 | 单位来自注解 |
| Rate | Percentage | 相同格式 + 聚合 |
| Ratio | Number | 开放域、小数格式 |
| Level | Score | 相同有界/avg 编译 |
| Coordinates | Latitude + Longitude | 配对歧义 |
| Location | Country / State / City | 通用回退 |
| Username, Email, Brand, Department | PersonName / Company / Name | 相同 nominal 编译 |
| Binary, Code | Boolean / Status | 相同 categorical 编译 |
| Bucket | Range | 相同编译 |
| SKU | ID | 相同标识符角色 |

**T2 相对 T1 的增量：** `Revenue` vs `Price`（可加性 vs 强度型）；`Temperature` vs `Quantity`（条件发散）；`Month` vs `Year`（cyclic(12) vs open）；`Sentiment` vs `Profit` vs `Correlation`（固有 vs 条件发散）。

## §2.5 层级作为 DAG

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

解析沿 T2 → T1 → T0 遍历，应用 progressively finer 规则，并在某层级无特定决策时回退：

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

## §2.6 循环域类型

具有环绕域的类型需要规范排序、不在循环外外推、循环调色板和 radar/polar 提示：

| Type | Cycle | Values | 可视化关注点 |
|---|---|---|---|
| Month | 12 | Jan–Dec 或 1–12 | 轴不应显示 "13"；颜色环绕 |
| Day (weekday) | 7 | Mon–Sun | 同上 |
| Hour | 24 | 0–23 | 圆形图表自然 |
| Direction | 8/16+ | N, NE, E, … | polar/radar 自然 |
| Quarter | 4 | Q1–Q4 | 轴排序 |

## §2.7 LLM 注解策略

| 策略 | 使用的类型 | 适用场景 | LLM 提示规模 |
|---|---|---|---|
| **完整 T2** | 所有具体类型 | 高价值仪表板 | 最大（约 46 种类型） |
| **仅 T1** | 类别级 | 批量注解、成本敏感 | 中等（约 17 种类型） |
| **仅 T0** | 族级 | 快速预览、基于规则回退 | 最小（约 6 种类型） |
| **混合** | 关键字段用 T2，其余用 T1 | 典型交互会话 | 自适应 |

**混合策略示例** — 图表关键字段用 T2，其余用 T1：

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

## §2.8 类型注册表

层级控制*哪些*规则在何种粒度触发。每种类型还携带**五个正交维度**，直接驱动可视化属性。这些维度与类型的层级位置一起存在于 `TypeRegistryEntry` 中：

| 维度 | 取值 | 控制内容 |
|---|---|---|
| **Vis encoding candidates** | `quantitative`, `ordinal`, `nominal`, `temporal`（偏好顺序） | 轴类型、比例尺类型、标记兼容性、排序 |
| **Aggregation role** | `additive`, `intensive`, `signed-additive`, `dimension`, `identifier` | 聚合函数、group-by、仅 tooltip |
| **Domain shape** | `open`, `bounded`, `fixed`, `cyclic` | 域钳制、刻度、外推、polar 提示 |
| **Diverging nature** | `none`, `conditional`, `inherent` | 顺序 vs 发散颜色、中点、图例 |
| **Format class** | `currency`, `percent`, `unit-suffix`, `date`, `time`, `integer`, `plain` | 轴/tooltip 格式、前缀/后缀、精度 |

**典型类型**（层级位置 + 维度值）：

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

在 T1，构建器继承类别的维度值。在 T2，应用具体覆盖。在 T0，应用保守默认值。下游代码读取解析后的 `FieldSemantics` / `ChannelSemantics`，而非直接读取层级或维度。部分维度值依赖数据，例如根据 distinct-value 数量选择 `Rating` 编码；该消歧在 `resolveFieldSemantics` 中完成，而非注册表中。

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

# §3 字段注解

## §3.1 为何元数据重要

裸类型字符串如 `"Rating"` 存在歧义：比例尺是 1–5、1–10 还是 0–100？其他有界或带单位的类型也有类似缺口：

| Type | 缺失内容 | 为何重要 |
|---|---|---|
| **Rating** / **Score** | 比例尺范围 | 刻度、域、零点决策 |
| **Percentage** | 表示（0–1 vs 0–100） | 格式：`.1%` vs `.1f` + "%" |
| **Temperature** | 单位（°C、°F、K） | 后缀、发散中点（0°C vs 32°F） |
| **Physical measures** | 单位（kg、km、mph） | 格式后缀 |
| **Price / Revenue / Cost** | 货币（USD、EUR） | 格式前缀（$、€） |
| **Duration** | 单位（seconds、hours） | 显示策略 |
| **Ordinal categoricals** | 自定义排序 | 非字母顺序（severity、size） |

开放式度量（`Count`、`Revenue`、`Rank`）和 nominal 字段（`Country`、`Status`）通常无需元数据。

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

## §3.3 哪些类型需要元数据？

| Type | `intrinsicDomain` | `unit` | `sortOrder` | 原因 |
|---|---|---|---|---|
| **Rating** | 是 — [1,5]、[1,10]、[0,100] | 否 | 否 | 比例尺决定刻度、域、零点 |
| **Score** | 是 — [0,100]、[0,10] | 否 | 否 | 同 Rating |
| **Percentage** | 半 — 从数据推断 | 否 | 否 | 表示影响格式 |
| **Temperature** | 否 | 可选 — °C、°F、K | 否 | 后缀 + 发散提示 |
| **Physical**（任意） | 否 | 可选 | 否 | 仅后缀 |
| **Duration** | 否 | 可选 | 否 | 显示提示 |
| **Price / Revenue / Cost / Amount** | 否 | 可选 — USD、EUR | 否 | 货币前缀 |
| **Latitude / Longitude** | 固定（类型内在） | 否 | 否 | 无需注解 |
| Count, Quantity, Rank, ID, … | 否 | 否 | 否 | 无歧义 |
| **Ordinal categoricals**（Severity、Size） | 否 | 否 | **是** | 领域特定顺序 |
| Well-known ordinals (Month, DayOfWeek) | 否 | 否 | 否 | 内置顺序 |
| Nominal categoricals | 否 | 否 | 否 | 无固有顺序 |
| **Sentiment, Correlation, Profit** | 否 | 可选 currency | 否 | 中点来自类型 |
| **Domain-specific diverging**（pH、NPS） | 是 — 如 [0, 14] | 否 | 否 | 中点来自域 |

## §3.4 数值表示检测

部分类型以不同数值编码出现。构建器在确定字段上下文时解析这些表示：

| Type | Representations | Detection |
|---|---|---|
| **Percentage** | 0–1 分数 vs 0–100 整数 | `max(data) ≤ 1` → fractional；否则 whole；或 `intrinsicDomain` |
| **Timestamp** | Unix s、Unix ms、ISO string | Magnitude >1e12 → ms；>1e9 → s；string → parse |
| **Month / Day** | Numeric vs abbreviated vs full name | Data type + pattern matching |
| **Boolean** | true/false、0/1、Yes/No | Data type + distinct values |

**Percentage 影响：**

| Concern | Fractional (0–1) | Whole-number (0–100) |
|---|---|---|
| Format | `.1%`（d3 ×100） | `.0f` + suffix `%` |
| Domain | [0, 1] | [0, 100] |
| Ticks | 0, 0.25, 0.5, 0.75, 1.0 | 0, 25, 50, 75, 100 |

优先级：（1）显式 `intrinsicDomain`，（2）数据检查，（3）保守默认。若至少 80% 的绝对值 ≤1，则将字段视为 fractional。

## §3.5 接受字符串或对象

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

图表输入中的 `semantic_types` 接受 `Record<string, string | SemanticAnnotation>`。注解元数据在 `resolveFieldSemantics` 期间流入 `FieldSemantics`：`intrinsicDomain` → 域、刻度、零点和发散中点；`unit` → 格式前缀/后缀；`sortOrder` → `canonicalOrder` 和 ordinal 编码。

---

# §4 编译流水线

## §4.1 四阶段概览

| Stage | Function | Input → Output | Concern |
|-------|----------|---------------|---------|
| **1. Field Semantics** | `resolveFieldSemantics()` | Annotation + data → `FieldSemantics` | 这个字段*是什么*？ |
| **2. Channel Semantics** | `resolveChannelSemantics()` | FieldSemantics + channel → `ChannelSemantics` | 在此通道上应如何渲染？ |
| **3. Layout** | `computeLayout()` | ChannelSemantics + data → `LayoutResult` | 多大？过滤什么？ |
| **4. Spec Generation** | `assembleVegaLite()` 等 | ChannelSemantics + template → backend spec | 后端特定输出 |

`ChannelSemantics` 是**中间表示（IR）**：扁平、目标无关的记录，将上游语义与布局及所有后端（Vega-Lite、ECharts、Chart.js）解耦。

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

阶段边界有意收窄：`convertTemporalData()` 在 Stage 2 之前运行一次；`FieldSemantics` 仅内部用于 Stage 2；零点基线最终确定等到 Stage 4，因为需要模板 mark type。

## §4.2 字段与通道职责

| Decision | Source | Output field |
|---|---|---|
| **来自字段语义（数据身份）** | | |
| Semantic annotation | `resolveFieldSemantics()` | `ChannelSemantics.semanticAnnotation` |
| Number format | `resolveFieldSemantics()` → `resolveFormat()` | `ChannelSemantics.format` |
| Tooltip format | `resolveFieldSemantics()` → `resolveFormat()` | `ChannelSemantics.tooltipFormat` |
| Aggregation default | `resolveFieldSemantics()` → `resolveAggregationDefault()` | `ChannelSemantics.aggregationDefault` |
| Scale type | `resolveFieldSemantics()` → `resolveScaleType()` | `ChannelSemantics.scaleType` |
| Domain constraint | `resolveFieldSemantics()` → `resolveDomainConstraint()` | `ChannelSemantics.domainConstraint` |
| Canonical order | `resolveFieldSemantics()` → `resolveCanonicalOrder()` | 从 `FieldSemantics` 提升 |
| Cyclic ordering | `resolveFieldSemantics()` → `resolveCyclic()` | `ChannelSemantics.cyclic` |
| Sort direction | `resolveFieldSemantics()` → `resolveSortDirection()` | `ChannelSemantics.sortDirection` |
| Zero baseline class | `resolveFieldSemantics()` → `resolveZeroBaseline()` | Stage 4 的内部提示 |
| Binning suggested | `resolveFieldSemantics()` → `resolveBinningSuggested()` | `ChannelSemantics.binningSuggested` |
| **通道特定（可视化）** | | |
| Encoding type (Q/O/N/T) | `resolveEncodingTypeDecision()` | `ChannelSemantics.type` |
| Zero-baseline boolean | `computeZeroDecision()`（Stage 4） | `ChannelSemantics.zero` |
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

内部流程（仅字段内在）：

- `normalizeAnnotation(annotation)` → semantic type + 可选元数据
- `resolveTiers(semanticType)` → T0/T1 用于规则选择
- `resolveDefaultVisType(semanticType, values)` → 带数据消歧的编码
- `resolveFormat(semanticType, unit, fieldName, values)` → `FormatSpec` + tooltip；`detectPrecision(values)` 用于数据驱动小数位
- `resolveAggregationDefault(semanticType)` → sum / average / undefined
- `resolveZeroBaseline(semanticType, domain)` → meaningful / arbitrary / contextual
- `resolveScaleType(semanticType, values)` → linear / log / sqrt（依赖数据）
- `resolveDomainConstraint(semanticType, domain, values)` → annotation > type-intrinsic > data-inferred
- `resolveCanonicalOrder(semanticType, sortOrder, values)` → annotation 或内置
- `resolveCyclic(semanticType)` → boolean
- `resolveSortDirection(semanticType)` → ascending / descending
- `resolveBinningSuggested(semanticType, domain, values)` → boolean

通道级函数（`resolveTickConstraint`、`resolveReversed`、`resolveNice`、color scheme、interpolation、stackable）从同一模块导出，由 Stage 2 调用。

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

Stage 2 **不**设置 `zero`。Stage 4 调用 `computeZeroDecision()` 并传入 mark type：bar → 为长度完整性包含零；scatter → 数据拟合。

## §4.5 FieldSemantics 接口

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

**不在** `FieldSemantics` 上的属性（依赖通道/标记）：`nice`、`tickConstraint`、`reversed`、`interpolation`、`stackable`、`colorScheme`、`zero`、`temporalFormat`、`ordinalSortOrder`。

## §4.6 ChannelSemantics 接口

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

## §4.7 辅助类型

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

## §4.8 布局与规范生成

**Stage 3** 仅对 `ChannelSemantics` 和数据操作。关于 stretch 尺寸、overflow 过滤和 facet 网格，请参阅[自动布局算法](/documentation/layout-model)。`declareLayoutMode()` 是模板钩子，通过窄接口让 Stage 4 影响 Stage 3。

**Stage 4** 是后端特定的：（1）通过 `computeZeroDecision()` 与 mark type 最终确定零点；（2）翻译 encodings；（3）运行 `template.instantiate()`；（4）应用布局。模板直接读取扁平 `ChannelSemantics`。

## §4.9 缓存

字段语义可能开销较大，因为包含格式检测和分布分析。按字段缓存，键为 `${fieldName}::${semanticType}::${dataHash}`，其中 `dataHash` 对前约 100 个值做指纹。

---

# §5 解析规则

## §5.1 格式与解析

仅当语义上下文增加价值时才覆盖原生格式化：前缀/后缀、缩写、符号或无逗号年份。通用小数（`Number`、`Score`、`Rating`）使用空 `format: {}`，以便 Vega-Lite 自适应精度。提供格式时，`detectPrecision(values)` 将有意义小数位限制在 0–4。

| Semantic Type | `pattern` | `prefix` | `suffix` | `abbreviate` | Notes |
|---|---|---|---|---|---|
| **Count** | `,d` | — | — | — | 带千位分隔的整数 |
| **Amount** | data-driven | `$` | — | yes | Tooltip `,.2f` |
| **Price** | `,.2f` | `$` | — | yes | 始终显示分 |
| **Revenue / Cost** | data-driven | `$` | — | yes | Tooltip `,.2f` |
| **Percentage** (0–1) | `.Xp%` | — | — | — | 自动检测表示 |
| **Percentage** (0–100) | data-driven + `d` | — | `%` | — | 无 ×100 |
| **PercentageChange** | `+.X%` 或 `+.Xf` | — | `%` if 0–100 | — | 始终显示符号 |
| **Temperature** | data-driven | — | from unit | — | 单位来自注解 |
| **Score / Rating** | — (empty) | — | — | — | VL 原生轴 |
| **Rank** | `,d` | — | — | — | 整数 |
| **Year** | `d` | — | — | — | 无逗号 |
| **Number** | — (empty) | — | — | — | VL native |
| **Quantity** | data-driven | — | from unit | yes | 单位来自注解 |
| **Profit** | `+` + data-driven | `$` | — | yes | 有符号货币 |
| **Sentiment / Correlation** | `+` + data-driven | — | — | — | 有符号小数 |
| **Latitude / Longitude** | — (empty) | — | — | — | VL native |

单位/货币优先级为 `annotation.unit` > 列名启发式 > 数据值扫描 > 类型默认。

**解析**是编译器职责，由语义类型引导，而非存储在上下文中：

| Semantic Type | Raw examples | Compiler action |
|---|---|---|
| Amount, Price, Revenue | `"$1,234.56"` | 剥离货币和分隔符 |
| Percentage | `"45.2%"`, `"+12.3%"` | 剥离 `%` 和符号 |
| Temperature, Quantity | `"23.5°C"`, `"75 kg"` | 剥离单位后缀 |
| Duration | `"2h 30m"` | 解析为秒 |
| Timestamp | epoch 或 ISO string | 检测表示 → Date |
| Boolean | `"Yes"`, `0/1` | 规范化为 boolean |
| Month | `"January"`, `1` | 规范形式 |

## §5.2 聚合默认值

| Family | Types | Default | Rationale |
|---|---|---|---|
| Additive measures | Count, Amount, Revenue, Cost, Quantity, Duration | `sum` | 合计 — 求和自然 |
| Intensive measures | Percentage, Temperature, Score, Rating, Price, Correlation, Sentiment | `average` | 比率/状态 — 平均自然 |
| Signed additive | Profit | `sum` | 可为负；求和保留符号 |
| Discrete numeric | Rank, Index, ID | — | 不可聚合 |
| Temporal / Categorical | DateTime, Name, Status, … | — | 不可聚合 |

自动聚合在多行映射到相同位置编码时注入正确 aggregate：Revenue → sum，Temperature → mean。错误聚合（如对温度求和）会产生荒谬图表。这是显式编译器选项，因为部分上下文会抑制它：

```typescript
interface CompilerOptions {
    /** When true, instantiator injects aggregate transforms for measure fields
     *  when multiple rows share the same positional encoding (e.g. same X in bar/line). */
    autoAggregate: boolean;
}
```

## §5.3 比例尺、域与刻度

**比例尺类型**（构建器中依赖数据）：

| Condition | Scale | Example |
|---|---|---|
| Measure + >2 orders of magnitude | `log` | Revenue $1K–$1B |
| Measure + long tail (skew > 2) | `sqrt` | Population |
| Signed + wide range | `symlog` | Profit −$10M to +$500M |
| Percentage (0–100) | `linear` | Completion rate |
| Default quantitative | `linear` | — |

**域约束** — 有效域 = 内在边界与数据范围的并集。软域从不裁剪合法离群值：

| Source | Type | Intrinsic | Data | Effective | Clamp |
|---|---|---|---|---|---|
| Annotation | Rating [1,5] | [1,5] | [1,4] | min 1, max 5 | soft |
| Annotation | Score [0,100] | [0,100] | [0,120] | min 0, max 120 | soft |
| Data-inferred | Percentage 0–100 | [0,100] | [0,155] | min 0, max 155 | soft |
| Type-intrinsic | Latitude | [-90,90] | any | [-90,90] | hard |
| Type-intrinsic | Correlation | [-1,1] | any | [-1,1] | hard |

优先级为 `annotation.intrinsicDomain` > type-intrinsic > data-inferred。小内在跨度（≤20）还会设置 `exactTicks`、`binningSuggested: false`，并细化 `zeroBaseline`。

**刻度约束：**

| Type | `integersOnly` | `exactTicks` | `minStep` | Source |
|---|---|---|---|---|
| Count, Year, Rank, Index | true | — | 1 | Type-intrinsic |
| Rating [1,5] | true | [1,2,3,4,5] | 1 | Annotation |
| Rating [1,10] | true | [1..10] | 1 | Annotation |
| Score [0,100] | true | — (span > 20) | 1 | Annotation |
| Month (1–12) | true | [1..12] | 1 | Type-intrinsic |

## §5.4 坐标轴与标记

| Concern | Rule |
|---|---|
| **Reversed axis** | `Rank` → `true`（第 1 名在顶部）；其余 → `false`。模板可覆盖。 |
| **Stacking** | Sum stack：Count、Amount、Revenue、Cost、Quantity、Duration、Profit。Normalize：Percentage。No stack：Temperature、Score、Rating、Rank、Correlation、Sentiment。 |
| **Interpolation** | Rank/Index → `step`；Temperature、Revenue、Profit → `monotone`；default → `linear`。 |
| **Binning** | 建议：Quantity、Amount、Temperature、Percentage、Duration、高基数 Count。不建议：Rating (1–5)、Rank、Year、categorical。 |

## §5.5 发散与颜色

发散处理需要**中点**，按以下优先级解析：

1. `annotation.unit` 查找（°C → 0，°F → 32）
2. 类型内在中点
3. `intrinsicDomain` 中点（Rating [1,5] → 3）
4. 数据跨越零 → 中点 0
5. 数据范围中点（回退）

| Type | Midpoint | Inherent? | Notes |
|---|---|---|---|
| Temperature | 0 / 32 / 273.15 by unit | conditional | 全为正时用 sequential |
| Profit, PercentageChange | 0 | conditional | 单侧时用 sequential |
| Sentiment, Correlation | 0 | inherent | 中心始终有意义 |
| Score (0–100) | 50 | conditional | 来自域中点 |
| Rating (1–5) | 3 | conditional | 很少发散 |

**Inherent** 类型始终使用发散调色板，因为正负值有语义含义。**Conditional** 类型仅当数据跨越中点两侧时使用发散调色板；否则使用 sequential 调色板。

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

# §6 示例

## §6.1 收入柱状图

**Input：** `revenue`，`{ semanticType: "Revenue", unit: "EUR" }`，values ~[124500, 89200, …]，channel Y，mark bar。

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

通道增量：`nice: true`，`stackable: 'sum'`，`interpolation: 'monotone'`，sequential color。Y 轴显示 €0、€100K、…；包含零点基线；tooltip 显示 €124,500.00。

## §6.2 温度折线图

**Input：** `avg_temp`，`{ semanticType: "Temperature", unit: "°C" }`，values ~[16.8, 31.7, …]，channel Y，mark line。

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

通道增量：发散颜色中点 0°C，`interpolation: 'monotone'`，`stackable: false`。轴为数据拟合，不强制 0°C；刻度显示 16°C、20°C、…；线条平滑。

## §6.3 排名 bump 图

**Input：** `rank`，`Rank`，values [1..10]，channel Y，mark line (bump)。

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

通道增量：`reversed: true`，`tickConstraint: { integersOnly: true, minStep: 1 }`，`interpolation: 'step'`。Y 轴反转（1 在顶部），刻度为整数，禁用堆叠。

## §6.4 带域的 Rating

**Input：** `rating`，`{ semanticType: "Rating", intrinsicDomain: [1, 5] }`，values [4,3,5,2,4,…]，channel Y，mark bar。

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

通道增量：`nice: false`，`tickConstraint: { integersOnly: true, exactTicks: [1,2,3,4,5] }`。域 [1,5] 来自注解；零点为 arbitrary，因为这是 1-based 比例尺；刻度为精确整数；柱状图从零点使用比例长度，因为 Stage 4 对 bar marks 保留 `scale.zero`。

---

# §7 相关文档

- [Architecture](/documentation/architecture) — 完整编译流水线与仓库布局
- [API reference](/documentation/api-reference) — `ChartAssemblyInput`、encodings、overflow
- [Auto Layout Algorithm](/documentation/layout-model) — Stage 3 尺寸、stretch 与 overflow

`chart_spec.encodings` 或 `chartProperties` 中的显式覆盖始终优先于编译器默认值。
