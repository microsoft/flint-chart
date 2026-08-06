# 自动布局算法

当数据超出可用画布时，用于自动调整图表坐标轴尺寸的基于物理的模型。

初次接触 Flint 尺寸？请从[示例：自动布局](/playgrounds/auto-layout)开始，然后回到此处阅读完整算法。

**如何阅读本文档：** [§1](#1-layout-mode-classification) 区分 banded 与 continuous 轴并路由到正确模型。[§2](#2-discrete-axis-elastic-budget-model)–[§5](#5-area-layout-2d-pressure-model) 描述四种几何特定模型。[§6](#6-unified-summary) 汇总共享的 pressure–stretch 模式、决策树和实现映射。

| § | Model | Geometry | Chart types |
|---|---|---|---|
| [§2](#2-discrete-axis-elastic-budget-model) | Elastic Budget | 1D banded axis | Bar, Histogram, Heatmap, Boxplot |
| [§3](#3-continuous-axis-gas-pressure-model) | Gas Pressure | 2D point cloud | Scatter, Line, Area |
| [§4](#4-circumference-radial-pressure-model) | Circumference | 1D closed loop | Pie, Rose, Sunburst, Radar, Gauge |
| [§5](#5-area-layout-2d-pressure-model) | Area (2D) | 2D filled space | Treemap |

---

## 基准尺寸与 stretch 上限

以下每个模型都从**两个数字**开始：图表瞄准的目标尺寸，以及绝不可超过的上限。

| Field | Role in the model | Default |
|-------|-------------------|---------|
| `baseSize` | **目标。** 静息长度 $L_0$ / 基准画布 $W_0 \times H_0$，下方所有「pressure = demand ÷ supply」比率均相对此值衡量。 | $400 \times 320$ |
| `canvasSize` | **硬上限。** 任意维度（含 facet 网格）的最大 stretch 尺寸。 | none → $\text{baseSize} \times \text{maxStretch}$（默认 $1.5\times$） |

stretch 乘数 $\beta$ 限制轴相对基准可增长的距离，按维度设置：

- **无 `canvasSize`（默认）。** 各维度最多 stretch 到 `maxStretch`（默认 **1.5**），即上限为 $\text{baseSize} \times \text{maxStretch}$。
- **显式 `canvasSize` 上限。** 上限变为上限与基准之比：

  $$\beta_x = \max\!\left(1, \frac{\text{canvasSize.width}}{\text{baseSize.width}}\right), \qquad \beta_y = \max\!\left(1, \frac{\text{canvasSize.height}}{\text{baseSize.height}}\right).$$

**基准永不超过上限。** 计算上限前，基准按维度钳制到上限（$L_0 = \min(\text{baseSize}, \text{canvasSize})$）。因此 `canvasSize` *小于*基准时（例如固定槽位且 `baseSize` 保持默认），$L_0$ 会缩小以适配框体。图表压缩并降级文字，而非溢出。省略 `baseSize` 时，单独 `canvasSize` 表现为纯 **fit-to-box**：$L_0 = \text{canvasSize}$，$\beta = 1$，图表无法超出框体。

驱动宽度的模型（离散 x 轴、x 方向气压模型、矩形树图 x 分割）使用 $\beta_x$；驱动高度的模型（离散 y 轴、y 方向气压模型、矩形树图 y 分割）使用 $\beta_y$；径向和面积模型使用 $\max(\beta_x, \beta_y)$。同一上限也约束**分面**布局：小多图网格的总伸展范围不能超过 `canvasSize`。下文只写 $\beta$ 时，请根据当前维度理解为 $\beta_x$ 或 $\beta_y$。

---

## 交互式演示

这四个模型在数据溢出画布时为图表坐标轴定尺寸。拖动控件可观察各模型在添加项、改变 stretch 因子或调整画布大小时的响应。每个演示内均解释控件；下文各节为需要完整推导的读者提供公式。

### Elastic budget — discrete (banded) axis · [§2](#2-discrete-axis-elastic-budget-model)

Bar、Histogram、Heatmap。随类别增加 plot 变宽，然后压缩，stretch 上限耗尽后溢出。

```flint-playground
discrete
```

### Gas pressure — continuous axis · [§3](#3-continuous-axis-gas-pressure-model)

Scatter、Line、Area。轴随点密度温和 stretch，而非按项 snap 到 band。

```flint-playground
continuous
```

### Circumference — radial / closed loop · [§4](#4-circumference-radial-pressure-model)

Pie、Rose、Radar。随 slice 拥挤，图表增大半径以保持圆周可读。

```flint-playground
circumference
```

### Area — 2D filled space · [§5](#5-area-layout-2d-pressure-model)

Treemap。画布面积增长，使每个矩形保持足够大以便阅读，而非缩成细条。

```flint-playground
area
```

---

## 目录

- [§1 布局模式分类](#1-layout-mode-classification)
  - [§1.1 Banded vs Non-Banded](#11-banded-vs-non-banded)
  - [§1.2 决策树](#12-decision-tree)
  - [§1.3 Vega-Lite 实现说明](#13-vega-lite-implementation-notes)
- [§2 离散轴（Elastic Budget Model）](#2-discrete-axis-elastic-budget-model)
  - [§2.1 问题](#21-problem)
  - [§2.2 参数](#22-parameters)
  - [§2.3 三种状态](#23-three-regimes)
  - [§2.4 幂律 Elastic Budget](#24-power-law-elastic-budget)
  - [§2.5 理论基础](#25-theoretical-foundation-spring-model)
  - [§2.6 分组项](#26-grouped-items)
  - [§2.7 各 Mark 类型指南](#27-per-mark-type-guidelines)
  - [§2.8 分面图表](#28-faceted-charts)
  - [§2.9 摘要](#29-summary)
- [§3 连续轴（Gas Pressure Model）](#3-continuous-axis-gas-pressure-model)
  - [§3.1 问题](#31-problem)
  - [§3.2 参数](#32-parameters)
  - [§3.3 各轴 Stretch](#33-per-axis-stretch)
  - [§3.4 Positional ≥ Series 约束](#34-positional--series-constraint)
  - [§3.5 参数表](#35-parameter-table)
  - [§3.6 算例](#36-worked-examples)
  - [§3.7 摘要](#37-summary)
  - [§3.8 分面连续布局](#38-faceted-continuous-layout-per-subplot-baseline--pressure--ar-blend--fit)
    - [§3.8.1 问题](#381-problem)
    - [§3.8.2 各子图基准](#382-per-subplot-baseline-canvas)
    - [§3.8.3 Banking AR](#383-banking-ar-multi-scale-slope-optimization)
    - [§3.8.4 Gas–Banking 混合](#384-gasbanking-ar-blend)
    - [§3.8.5 面积预算](#385-area-budget-and-shape)
    - [§3.8.6 拟合预算](#386-fit-to-budget-preserving-ar)
  - [§3.9 Band AR 混合](#39-band-ar-blending)
- [§4 圆周（Radial Pressure Model）](#4-circumference-radial-pressure-model)
  - [§4.1 问题](#41-problem)
  - [§4.2 参数](#42-parameters)
  - [§4.3 有效项数](#43-effective-item-count)
  - [§4.4 Pressure 与 Stretch](#44-pressure-and-stretch)
  - [§4.5 画布尺寸](#45-canvas-sizing)
  - [§4.6 Gauge 分面](#46-gauge-faceting)
  - [§4.7 参数表](#47-parameter-table)
  - [§4.8 摘要](#48-summary)
- [§5 面积布局（2D Pressure Model）](#5-area-layout-2d-pressure-model)
  - [§5.1 问题](#51-problem)
  - [§5.2 参数](#52-parameters)
  - [§5.3 有效项数](#53-effective-item-count)
  - [§5.4 Pressure 与偏置分割](#54-pressure-and-biased-split)
  - [§5.5 算例](#55-worked-examples)
  - [§5.6 摘要](#56-summary)
- [§6 统一摘要](#6-unified-summary)

---

# §1 布局模式分类

## §1.1 Banded vs Non-Banded

布局模型需决定**如何**为每个位置轴分配空间。两个独立属性驱动该决策：

1. **Scale type** — 字段的 Vega-Lite 编码类型。
2. **Mark geometry** — 标记是否占据固定宽度 band 或点状位置。

### Banded layout

**Banded** 轴为每个数据位置分配固定宽度槽位（band）。布局模型控制每槽的步长。项通过 band 的宽度/面积阅读。

| Condition | Example |
|---|---|
| **Discrete scale**（nominal / ordinal） | Bar 图上的类别、ordinal 月份 |
| **Continuous scale + band mark** | X 为 quantitative 或 temporal 的 Bar 图（年份为数字） |
| **Binned axis**（`bin: true`） | Histogram 分箱 — 无论 scale 如何，每 bin 是一个 band |

### Non-banded layout

**Non-banded** 轴在连续范围内按数据决定的位置放置项。布局模型控制整体画布尺寸，但**不**分配 per-item 槽位。

| Condition | Example |
|---|---|
| **Continuous scale + point mark** | Scatter、Line、Area |

### 摘要矩阵

|  | Band mark (bar, rect, boxplot) | Point mark (circle, line, area) |
|---|---|---|
| **Discrete scale** (N/O) | Banded — §2 | Banded — §2 (*) |
| **Continuous scale** (Q/T) | Banded — §2 | Non-banded — §3 |

(*) Discrete scale 无论 mark type 均为 banded — VL 为每个类别分配 band。

## §1.2 决策树

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

> **Implementation:** 决策在 `compute-layout.ts` 中通过 `axisFlags.x.banded` / `axisFlags.y.banded` 和 `isDiscreteType()` 检查完成。见 `computeLayout()` 约 155–230 行。

## §1.3 Vega-Lite 实现说明

§2 elastic budget 模型适用于 discrete-banded 和 continuous-banded 轴，但 **Vega-Lite 实现因 scale type 而异**：

### Discrete banded (nominal / ordinal)

VL 原生支持基于 step 的尺寸：

```json
{ "width": { "step": ℓ } }
```

VL 创建 band scale，为每个类别分配 $\ell$ 像素，并将图表尺寸设为 $N \times \ell$。

分组 bar（xOffset / yOffset）：

```json
{ "width": { "step": ℓ_group, "for": "position" } }
```

### Continuous banded (quantitative / temporal + band mark)

VL **不**支持 continuous scale 上的 `{ "step": N }`，因此 Flint 分两阶段处理：

**Phase 1 — Canvas sizing (assemble.ts):**

```
continuousWidth = stepSize × (N + 1)
```

`+1` 在两侧各加 half-step padding。scale domain 扩展 ±halfStep，使位置对齐如同 discrete band scale。

**Phase 2 — Mark sizing (postProcessing):**

由于 VL 不在 continuous scale 上自动定 bar 尺寸：
1. 排序唯一字段值；找 `minGap`（最小连续差）。
2. 转为像素：`pixelsPerUnit = subplotDim × (N−1) / (dataRange × N)`。
3. `markSize = min(stepSize × 0.9, floor(minGap × pixelsPerUnit))`。
4. 通过 `{ "mark": { "size": markSize } }` 应用（rect 用 `width`/`height`，fill ratio 0.98）。

### 对比

| Aspect | Discrete banded | Continuous banded |
|---|---|---|
| VL scale type | `nominal` / `ordinal` (band scale) | `quantitative` / `temporal` (linear/time scale) |
| Step control | width/height 上的 `{ "step": ℓ }` | 手动：`config.view.continuousWidth = ℓ × (N+1)` |
| Mark sizing | 自动（VL 填充 band） | 手动：`mark.size` 来自 min-gap 计算 |
| Domain padding | 自动（band scale） | 手动：domain 扩展 ±halfStep |
| Sort control | `encoding.sort` | 数据决定（continuous scale） |

### 何时优先 continuous banded

- 数据具有**自然顺序和算术含义**（年份、日期、价格）。
- 数据具有**不规则间距** — continuous scale 保留比例位置。
- 模板声明 `axisFlags.banded = true` 同时保持 VL 编码类型为 Q/T。

`templates/utils.ts` 中的 `detectBandedAxis` 函数处理该决策。

---

# §2 离散轴（Elastic Budget Model）

## §2.1 问题

离散轴沿长度为 $L_0$ 像素的 1D 段显示 $N$ 个 banded 项（类别、分箱、组）。每项理想占据 $\ell_0$ 像素（自然长度）。当 $N \cdot \ell_0 > L_0$ 时项溢出。

需平衡两个竞争目标：

1. **项抵抗压缩** — 每项向外推以维持 $\ell_0$，且不能低于 $\ell_{\min}$。
2. **轴抵抗扩展** — 轴可超出 $L_0$ stretch，但有硬上限 $L_{\max}$。

## §2.2 参数

| Symbol | Meaning | Code mapping | Default |
|---|---|---|---|
| $L_0$ | Natural axis length | `width` / `height` (base size) | 400 px |
| $L_{\max}$ | Maximum axis length | `base × β`（β 来自 `maxStretch` 或 `canvasSize`） | 800 px |
| $N$ | Number of banded items | Field cardinality | data-dependent |
| $\ell_0$ | Natural length per item | `defaultStepSize` | ~20 px |
| $\ell_{\min}$ | Minimum length per item | `minStep` option | 6 px |
| $\alpha$ | Elasticity exponent | `elasticity` option | 0.5 |
| $\beta$ | Maximum stretch multiplier | `maxStretch`，或从 `canvasSize` 推导 | 1.5 |

> **Code defaults:** 未设置 `canvasSize` 上限时，`elasticity: 0.5`、`minStep: 6`、`maxStretch: 1.5`。`defaultStepSize` 根据画布尺寸动态计算：`round(20 × max(1, sizeRatio) × defaultStepMultiplier)`。

## §2.3 三种状态

### Regime 1: No compression needed

**Condition:** $N \cdot \ell_0 \leq L_0$

所有项以自然长度容纳：

$$\ell = \ell_0, \quad L = N \cdot \ell_0$$

### Regime 2: Overflow beyond recovery

**Condition:** $N \cdot \ell_{\min} \geq L_{\max}$

即使最小项长和最大 stretch 仍无法容纳所有项。多余项被截断：

$$N' = \left\lfloor \frac{L_{\max}}{\ell_{\min}} \right\rfloor, \quad \ell = \ell_{\min}, \quad L = L_{\max}$$

### Regime 3: Elastic equilibrium

**Condition:** $N \cdot \ell_0 > L_0$ 且 $N \cdot \ell_{\min} < L_{\max}$

项溢出但可通过压缩项和/或 stretch 轴容纳。此处应用 elastic 模型。

## §2.4 幂律 Elastic Budget

这是**已实现模型**。轴使用 pressure 比率的幂律 stretch：

**Pressure:**

$$p = \frac{N \cdot \ell_0}{L_0}$$

**Stretch factor:**

$$s = \min(\beta,\; p^{\alpha})$$

**Resulting step size:**

$$\ell = \frac{L_0 \cdot s}{N} = \frac{L_0 \cdot p^{\alpha}}{N}$$

$\alpha = 0.5$ 时，溢出加倍仅使 stretch 增加 $\sqrt{2} \approx 1.41\times$ — 自然渐进响应。

**Clamping:** step 钳制到 $[\ell_{\min},\; \ell_0]$，轴长钳制到 $[L_0,\; L_{\max}]$。

> **Implementation:** `core/decisions.ts` 中的 `computeElasticBudget()`（约 549–569 行）。由 `computeAxisStep()` 调用，处理 nominal 和 continuous-as-discrete 情况。

## §2.5 理论基础（spring model）

幂律模型可由物理类比动机：$N$ 个相同弹簧装在盒内。

**Setup:**
- 每个弹簧（项）自然长度 $\ell_0$，固体长度 $\ell_{\min}$，弹簧常数 $k_1$。
- 盒子（轴）自然长度 $L_0$，最大长度 $L_{\max}$，弹簧常数 $k_2$。

**Force balance at equilibrium:**

$$N \cdot k_1 \cdot (\ell_0 - \ell) = k_2 \cdot (N \cdot \ell - L_0)$$

**Equilibrium step size**（使用刚度比 $\kappa = k_1 / k_2$）：

$$\boxed{\ell = \frac{\kappa \cdot \ell_0 + L_0 / N}{1 + \kappa}}$$

**$\kappa$ 的解释：**
- $\kappa \to \infty$：项不压缩；墙吸收一切（$\ell \to \ell_0$）。
- $\kappa \to 0$：项压缩以适配固定轴（$\ell \to L_0 / N$）。
- $\kappa = 1$：压缩均分（$\ell = (\ell_0 + L_0/N) / 2$）。

线性 spring 模型在物理上更直观，可独立调节项与墙的刚度（$\kappa$）。此处作为幂律模型的理论动机呈现。

**Nonlinear (progressive-rate) variant:** 将线性弹簧换为硬化弹簧 $F_1(\ell) = k_1 \cdot ((\ell_0 - \ell) / (\ell_0 - \ell_{\min}))^{\gamma}$ 直接导向实现中的幂律形式。

**与幂律实现的映射：**

| Linear spring model | Power-law implementation |
|---|---|
| $\kappa$（刚度比 $k_1/k_2$） | $\alpha$（elasticity exponent） |
| $\ell = (\kappa \cdot \ell_0 + L_0/N) / (1 + \kappa)$ | $s = \min(\beta, p^{\alpha})$；$\ell = L_0 \cdot s / N$ |
| 在 $\ell_0$ 与 $L_0/N$ 间均匀插值 | 偏向 $\ell_0$ 的幂曲线插值 |
| 两参数（$k_1$、$k_2$） | 一参数（$\alpha$） |
| 物理上更直观 | 更紧凑；自然渐进 |

## §2.6 分组项

分组项（如每组 $m$ 个子 bar 的分组 bar 图）作为特例：**组**是压缩单位，而非单个项。

| Parameter | Simple discrete | Grouped bar ($m$ sub-bars) |
|---|---|---|
| $\ell_0$ (natural) | `defaultStepSize` | $m \times$ `defaultStepSize` |
| $\ell_{\min}$ (solid) | `minStep` (6 px) | $2m$ px（每子 bar 2 px） |
| $N$ (item count) | Field cardinality | **组**数量 |

elastic budget 公式不变 — 仅参数值变化。

**Example:** 400 px 轴上 15 组 × 3 子 bar：
- $N = 15$，$\ell_0 = 60$，ideal $= 900 > 400$ → Regime 3。
- $\alpha = 0.5$：$p = 900/400 = 2.25$，$s = \min(1.5, 2.25^{0.5}) = 1.50$。
- Budget $= 400 \times 1.5 = 600$，step $= 600/15 = 40$ px per group。

> **Implementation:** `computeLayout()` 中通过 `group` 通道检测分组。`xHasGrouping` 为 true 时，step 按组计算，`xStepUnit = 'group'`，并强制最小组间距 3 px。

## §2.7 各 Mark 类型指南

不同 mark type 有不同视觉占用和压缩容忍度。模板可通过 `defaultStepMultiplier` 和 `overrideDefaultSettings` 调节行为。

**设计指南**（300 px 参考画布，`defaultStepSize` ≈ 20 px）：

| Mark type | $\ell_0$ | $\ell_{\min}$ | Compression tolerance | Rationale |
|---|---|---|---|---|
| **Bar** | 20 px | 6 px | Moderate | 宽度编码项，不能缩太多 |
| **Stacked bar** | 20 px | 6 px | Low | 堆叠段过薄不可读 |
| **Grouped bar** ($m$) | $20m$ px | $2m$ px | Low | 失去子 bar 区分代价高 |
| **Lollipop** | 14 px | 4 px | High | 点（位置）承载编码，非宽度 |
| **Heatmap / rect** | 20 px | 8 px | Very low | 颜色单元需面积才可感知 |
| **Boxplot** | 24 px | 10 px | Low | 内部结构（box/whiskers/median）早失 |
| **Strip / jitter** | 24 px | 6 px | Moderate | 过窄时点坍成线 |
| **Histogram** | 16 px | 4 px | High | 分布形状抗压缩好 |
| **Candlestick** | 18 px | 8 px | Low | open/close 实体 + 影线需空间 |

**设计原则：**
1. 以**宽度/面积**编码值的 mark（bar、rect）→ 更高 $\ell_0$，更低压缩容忍。
2. 以**位置**编码值的 mark（lollipop、bump）→ 更高压缩容忍。
3. 有**内部结构**的 mark（boxplot、candlestick）→ 更高 $\ell_{\min}$。
4. 展示**分布形状**的 mark（histogram）→ 可更窄。

> **Note:** 模板目前主要通过 `defaultStepMultiplier`（按比例缩放 $\ell_0$）和 `overrideDefaultSettings` 调节布局。per-mark-type spring 刚度（$\kappa$）是设计愿景，代码中尚未单独参数化。

## §2.8 分面图表

分面将一张图拆成子图网格。画布需容纳 $F$ 个面板，各有轴尺寸。本节涵盖**网格布局**：stretch、子图尺寸、换行。分面内 continuous 轴 AR 混合见 [§3.8](#38-faceted-continuous-layout-per-subplot-baseline--pressure--ar-blend--fit)。

### §2.8.1 Facet stretch factor

总画布 stretch 以容纳分面：

$$\lambda_f = \min(\beta,\; F^{\alpha_f})$$

其中 $\alpha_f$ = `facetElasticity`（默认 0.3），$\beta$ = `maxStretch`（无 `canvasSize` 上限时默认 1.5）。

分面 stretch 使用**更温和指数**（$\alpha_f = 0.3$ vs discrete 项的 $\alpha = 0.5$），因为每个子图是自包含图表 — 小子图仍可读，而 3 px bar 不行。

> **Implementation:** `computeLayout()` 使用 `facetElasticityVal = 0.3` 和 `resolveStretchCaps()` 的 per-dimension 上限。

### §2.8.2 Subplot sizing

每个子图分得 stretch 画布的一份：

$$W_{\text{sub}} = \max\!\left(S_{\min},\; \frac{W_0 \cdot \lambda_f - \text{fixedPad}}{F_c} - \text{gap}\right)$$

| Symbol | Meaning | Default |
|---|---|---|
| $F_c, F_r$ | Facet columns / rows | data-dependent |
| $\alpha_f$ | Facet elasticity | 0.3 |
| $S_{\min}$ | Minimum subplot size (continuous axis) | 60 px |

### §2.8.3 Facet-mode shrink limits

分面下轴可比单图模式**进一步**缩小，因为读者比较面板间模式而非精确读单个值。

| Mark type | $\ell_{\min}^{f}$ (banded) | $S_{\min}$ (continuous) |
|---|---|---|
| Bar / stacked bar | 3 px | 60 px |
| Heatmap / rect | 4 px | 40 px |
| Boxplot | 6 px | 60 px |
| Line / area | — | 40 px |
| Ridge / density | — | 20 px |
| Scatter | — | 60 px |

### §2.8.4 Faceted discrete axis

spring 模型**按子图**运行：$W_{\text{sub}}$ 成为 $L_0$，$N_{\text{items}}$ 为每面板计数。若仍溢出，截断到 $N' = \lfloor W_{\text{sub}} / \ell_{\min} \rfloor$。

### §2.8.5 Faceted continuous axis

gas pressure 模型（§3）在每个子图内运行，容器为 $W_{\text{sub}} \times H_{\text{sub}}$。子图尺寸在各面板间统一以保持视觉一致。

### §2.8.6 Facet wrap (column-only folding)

仅指定 column facet 且 $F$ 超过可容纳最大列数时，面板换行成 2D 网格：

1. **Maximum columns:** $F_{c,\max} = \lfloor \text{effectiveW} / (S_{\min} + \text{gap}) \rfloor$，其中 $\text{effectiveW} = W_0 \times \beta - \text{fixPad}$。
2. **Single row:** 若 $F \leq F_{c,\max}$，所有面板一行，无需换行。
3. **Wrapping:** 否则从 $F_c = F_{c,\max}$ 列开始，$F_r = \lceil F / F_c \rceil$ 行。
4. **Widow avoidance:** 若最后一行恰好 1 个面板（"widow"），$F_c$ 减 1 重算。在 $F_c > 2$ 且仍有 widow 时重复。更均匀重分配：11 面板 maxCols=5 会得 5×3 带 1 孤儿，算法改试 4×3，末行 3 面板。

最小子图尺寸（$S_{\min}$）按轴感知：
- **Discrete/banded axes:** $S_{\min} = \ell_{\min} \times N$（minStep × 每轴值计数）。
- **Continuous axes:** $S_{\min} = \text{baseMinSubplot}$（默认 60 px），两轴均为 continuous 时由 banking AR 调整 — 较短维保持基准，较长维最多 $\beta \times$ 基准。确保 line chart（landscape AR）获得更宽最小子图，产生更少更宽面板。

> **Implementation:** `compute-layout.ts` 中的 `computeFacetGrid()`。在 `computeLayout()` **之前**运行，以打破换行与轴尺寸间的循环依赖。

## §2.9 摘要

| Symbol | Meaning | Default |
|---|---|---|
| $N$ | Number of discrete items | data-dependent |
| $\ell_0$ | Natural step size | ~20 px |
| $\ell_{\min}$ | Minimum step size | 6 px |
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

> **Key functions:** `core/decisions.ts` 中的 `computeElasticBudget()`、`computeAxisStep()`；`core/compute-layout.ts` 中的 `computeLayout()`。

---

# §3 连续轴（Gas Pressure Model）

## §3.1 问题

连续轴在 2D 画布上显示 $N$ 个点状项（scatter 点或 line 顶点）。与离散项不同，这些 mark 不占据固定 band；它们位于数据决定的位置。每个 mark 有视觉截面积 $\sigma$（px²）。

**为何不用 spring：** 连续 mark 不拥有槽位。100 点与 10 点的 scatter 可共用同一画布；差异是**密度**，非 per-item 分配。因此 pressure 模型比 per-item spring 更合适。

## §3.2 参数

| Symbol | Meaning | Code mapping | Default |
|---|---|---|---|
| $W_0, H_0$ | Natural canvas dimensions | `subplotWidth`, `subplotHeight` | 400 × 320 px |
| $\sigma$ | Mark cross-section (px²) | `markCrossSection` | 30 px² |
| $\sigma_x, \sigma_y$ | Per-axis cross-sections | `markCrossSectionX/Y` | chart-type specific |
| $\alpha_c$ | Elasticity exponent | `elasticity` | 0.3 |
| $\beta_c$ | Maximum stretch | `maxStretch` | 1.5 |

> **Code defaults:** `core/decisions.ts` 中的 `DEFAULT_GAS_PRESSURE_PARAMS` — `markCrossSection: 30`、`elasticity: 0.3`、`maxStretch: 1.5`。

**为何 $\beta_c$ 小于 discrete $\beta$：** 连续轴以**沿比例尺的位置**编码 — 感知上最稳健的通道（Cleveland & McGill, 1984）。scatter 压缩后仍可读，因为相对位置保留。离散轴以 **band 的长度/面积**编码，退化更快。

| | Discrete axis | Continuous axis |
|---|---|---|
| Primary encoding | Length / area of band | Position along scale |
| Recommended $\beta$ | 2.0 | 1.5 |

## §3.3 各轴 Stretch

拥挤几乎总是不对称。Line chart 上 X 由时间点驱动，Y 由重叠 series 驱动。各轴独立 stretch。

### Mode 1: Positional (default)

沿轴统计唯一像素位置（约 1 px 分辨率分桶）。每位置需 $\sigma_{1d} = \sqrt{\sigma}$ 像素：

$$p_{1d} = \frac{\text{uniquePos} \cdot \sigma_{1d}}{\text{dim}_0}$$

$$
s = \begin{cases}
1 & \text{if } p_{1d} \leq 1 \cr
\min(\beta_c,\; p_{1d}^{\,\alpha_c}) & \text{if } p_{1d} > 1
\end{cases}
$$

### Mode 2: Series-count (`seriesCountAxis`)

当 `seriesCountAxis` 设为（`'x'`、`'y'` 或 `'auto'`）时，指定轴用 distinct series（color ∪ detail 字段）数量计算 pressure。`'auto'` 解析为：
- 2D path（两轴 continuous）：Y 轴。
- 1D path（一 continuous + 一 discrete）：continuous 轴。

$$p_{\text{series}} = \frac{n_{\text{series}} \cdot \sigma}{\text{dim}_0}$$

此处 $\sigma$ **直接**使用（非开方），因为 series 计数本质 1D。

> **Implementation:** `core/decisions.ts` 中的 `computeGasPressure()`（约 442–508 行）。2D path（两轴 continuous）和 1D path 在 `computeLayout()` 约 275–425 行分别处理。

## §3.4 Positional ≥ Series 约束

两轴均为 continuous 的图表（line、area）中，更多 series 也意味着 **positional** 轴视觉更乱 — 更多重叠线意味着更多交叉和平行笔画争夺读者注意力。positional 轴理想 stretch 至少提升到 series 轴理想 stretch：

$$\text{ideal}_{\text{positional}} = \max(\text{ideal}_{\text{positional}},\; \text{ideal}_{\text{series}})$$

设置 `maintainContinuousAxisRatio` 时，两轴使用两者 stretch 的最大值。

## §3.5 参数表

| Chart type | $\sigma_x$ | $\sigma_y$ | $\alpha_c$ | $\beta_c$ | seriesCountAxis |
|---|---|---|---|---|---|
| Scatter | 30 | 30 | 0.3 | 1.5 | — |
| Line | 100 | 20 | 0.3 | 1.5 | auto (→ Y) |
| Dotted Line | 100 | 20 | 0.3 | 1.5 | auto (→ Y) |
| Area | 100 | 20 | 0.3 | 1.5 | auto (→ Y) |
| Streamgraph | 100 | 20 | 0.3 | 1.5 | auto (→ Y) |
| Bump | 80 | 20 | 0.3 | 1.5 | auto (→ Y) |
| Stacked Bar | 20 | 20 | 0.3 | 1.5 | auto (→ Y*) |

\* Stacked bar 的 X 为 discrete（§2），Y 为 continuous。`auto` 经 1D path 解析到 Y。

## §3.6 算例

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

## §3.7 摘要

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

> **Key functions:** `core/decisions.ts` 中的 `computeGasPressure()`；`core/compute-layout.ts` 中 gas-pressure 集成。

## §3.8 分面连续布局（Per-Subplot Baseline → Pressure → AR Blend → Fit）

### §3.8.1 问题

图表分面时，gas pressure 模型首先要回答：**每个子图的数据相对哪块画布拥挤？**

朴素做法：对全画布运行 gas pressure，再除以列/行数。高估可用空间，因为每个子图只占画布一部分。子图过大，超出总预算。

另一朴素做法：先把原始画布除以列/行数，再 per subplot 运行 gas pressure。低估可用空间，因为忽略布局引擎将应用的 facet stretch。gas pressure 看到人为微小画布并立即饱和。

正确答案是：**gas pressure 在应用 facet elasticity 后的 per-subplot 画布上运行**。与 discrete 轴使用相同 stretch 公式。

### §3.8.2 Per-Subplot Baseline Canvas

gas pressure 运行前，计算仅靠 facet stretch 每个子图会得到什么：

$$W_{\text{sub}} = \max\!\left(S_{\min},\; \frac{W_0 \cdot \lambda_f - \text{fixPad}}{F_c} - \text{gap}\right)$$

其中 $\lambda_f = \min(\beta,\; F_c^{\,\alpha_f})$ 为 facet elasticity stretch（§2.8.1）。单面板图（$F_c = 1$）时 $W_{\text{sub}} = W_0$。

这给 gas pressure 现实基准：任何额外 gas-pressure stretch 之前子图将占据的空间。

> **Implementation:** `computeLayout()` 中的 `perSubplotCanvasW/H`（约 410–420 行）。使用 `facetElasticityVal = 0.3` 和 `resolveStretchCaps()` 的 per-dimension 上限。

### §3.8.3 Banking AR (Multi-Scale Slope Optimization)

有连接 mark 的图表（line、area、streamgraph），数据有由线段斜率决定的**感知最优宽高比**。这是 *banking to 45°* 原则（Cleveland, 1993）：图表应塑形使中位线段斜率接近 45°，趋势最可见。

我们使用**多尺度 banking**（Heer & Agrawala, 2006），考虑多平滑级别的斜率：

**Algorithm:**

1. **按 series 分组**（color ∪ detail 字段）。每 series 按 X 排序。
2. **对每个 scale** $k = 0, 1, 2, \ldots$（窗口大小 $= 2^k$）：
   - 用宽度 $2^k$ 的非重叠 box filter 平滑每 series。
   - 计算连续平滑点间绝对斜率：$|s| = |\Delta y / \Delta x|$（归一化数据坐标）。
   - 取该 scale 的**中位**绝对斜率。
3. **合并** per-scale 中位数为几何平均：
   $$\text{combinedSlope} = \exp\!\left(\frac{1}{K}\sum_{k=0}^{K}\ln(\text{median}_k)\right)$$
4. **钳制**到 $[0.5,\; 3.0]$。
5. **Landscape floor**（仅 connected marks）：$\text{AR} = \max(1.0,\; \text{combinedSlope})$。时间序列惯例为 landscape；banking 应在斜率陡时推宽，但永不 portrait — 典型时间序列中 Gentle slope 多数会主导中位数并产生 portrait，压缩时间轴。

**Scatter plots**（非 connected）：不用线斜率，而用归一化坐标的标准差比 $\sigma_x / \sigma_y$，阻尼响应：$\text{AR} = 1 + 0.3 \times (\text{sdRatio} - 1)$。

**无额外阻尼。** 原始 combined slope 直接返回，无乘性阻尼。与 gas pressure 的 50/50 混合（§3.8.4）是唯一 moderation；此处再加阻尼会 moderation 两次。

> **Implementation:** `compute-layout.ts` 中的 `computeBankingAR()`（约 819 行）。返回 W/H 宽高比于 $[0.5,\; 3.0]$。

### §3.8.4 Gas–Banking AR Blend

Gas pressure 知道哪轴更拥挤（密度不对称）。Banking 知道感知理想 AR（斜率优化）。我们在**对数空间**等权混合两信号：

$$\text{gasAR} = \frac{\text{rawW}}{\text{rawH}} \qquad \text{(from gas pressure per-axis stretches)}$$

$$\text{blendedAR} = \exp\!\left(0.5 \cdot \ln(\text{gasAR}) + 0.5 \cdot \ln(\text{bankingAR})\right)$$

这是几何平均：gas pressure 说 2:1（X 拥挤）且 banking 说 1:1（斜率平缓）时，混合得 $\sqrt{2} \approx 1.41$。

**Coverage gate:** 仅当 X、Y 数据各覆盖至少 20% 各自 domain 时应用 banking。数据集中在小区域（如一角簇）时斜率不可靠，仅 gas pressure 驱动 AR。

### §3.8.5 Area Budget and Shape

混合决定 AR；gas pressure 决定总面积：

$$\text{rawArea} = \text{rawW} \times \text{rawH}$$

封顶以防止子图在 fit 步骤前超出 per-subplot 预算：

$$\text{area} = \min(\text{rawArea},\; W_{\text{sub}} \times H_{\text{sub}} \times \beta)$$

分配面积以匹配 blended AR：

$$\text{idealW} = \sqrt{\text{area} \times \text{blendedAR}} \qquad \text{idealH} = \sqrt{\text{area} / \text{blendedAR}}$$

### §3.8.6 Fit to Budget (Preserving AR)

每子图硬上限：$W_0 \times \beta$ 总量，跨 facet 面板共享：

$$\text{availW} = \frac{W_0 \cdot \beta - \text{fixPad}}{F_c} - \text{gap} \qquad \text{availH} = \frac{H_0 \cdot \beta - \text{fixPad}}{F_r} - \text{gap}$$

均匀缩小以保留 blended AR：

$$\text{fitScale} = \min\!\left(\frac{\text{availW}}{\text{idealW}},\; \frac{\text{availH}}{\text{idealH}},\; 1\right)$$

$$\text{finalW} = \max(S_{\min},\; \text{idealW} \times \text{fitScale}) \qquad \text{finalH} = \max(S_{\min},\; \text{idealH} \times \text{fitScale})$$

均匀 `fitScale` 确保两轴不超预算同时保留 blended AR，最小尺寸极端除外。

### §3.8.7 Worked Example

150 dates × 8 series × 3 column facets，显式 $\beta = 2.0$ 上限便于算术（base $400 \times 300$，line chart：$\sigma_x = 100$，$\sigma_y = 20`，`seriesCountAxis: auto → Y`，`facetElasticity = 0.3`）：

**Per-subplot baseline:**
- Facet stretch: $\lambda_f = \min(2, 3^{0.3}) = 1.35$
- $W_{\text{sub}} = (400 \times 1.35) / 3 = 180$ px

**Gas pressure**（相对 $180 \times 300$）：
- X positional: 150 unique，$\sigma_{1d} = 10$ → $p = 8.33$ → raw stretch $= 8.33^{0.3} = 1.93$
- Y series: 8 series，$\sigma = 20$ → $p = 0.53$ → raw stretch $= 1.0$
- rawW $= 180 \times 1.93 = 347$，rawH $= 300 \times 1.0 = 300$，gasAR $= 1.16$

**Banking AR**（多尺度斜率）：设 combinedSlope 得 bankingAR $= 1.8$（landscape）。

**Blend:** $\text{blendedAR} = \exp(0.5 \ln 1.16 + 0.5 \ln 1.8) = \sqrt{1.16 \times 1.8} = 1.44$

**Area:** rawArea $= 347 \times 300 = 104{,}100$。maxArea $= 180 \times 300 \times 2 = 108{,}000$。area $= 104{,}100$。
- idealW $= \sqrt{104100 \times 1.44} = 387$，idealH $= \sqrt{104100 / 1.44} = 269$

**Fit:** availW $= (800 - 0) / 3 = 267$，availH $= 600$。
- fitScale $= \min(267/387, 600/269, 1) = 0.69$
- finalW $= 387 \times 0.69 = 267$，finalH $= 269 \times 0.69 = 186$
- **Final: 267 × 186, AR = 1.44** ✓ landscape preserved，total width = 800

> **Implementation:** `core/compute-layout.ts` 中的 `computeLayout()` — cont×cont path（约 370–530 行）。`computeBankingAR()`（约 819 行）。`core/decisions.ts` 中的 `computeGasPressure()`。

## §3.9 Band AR Blending

### §3.9.1 问题

一轴 banded、另一轴 continuous 时（如 X 类别、Y 数值的 bar chart），§2 的 step size 决定 band 宽度，continuous 轴用默认画布高度。类别少而画布高时，每个 band 过度拉长。标签拥挤，bar 比例失真，浪费垂直空间。

### §3.9.2 Target Band AR

**Band aspect ratio** 是 continuous 维与 step size 之比：

$$\text{bandAR} = \frac{\text{continuousDim}}{\text{stepSize}}$$

`bandAR` 大（如 20:1）时每个 bar 宽 20 倍于高 — 视觉极端。`targetBandAR` 参数（默认：10）定义最大可接受比。

### §3.9.3 Log-Space Blend

实际 band AR 超过 target 时，continuous 轴通过 50/50 对数空间混合（同 §3.8.4 机制）向 ideal **缩小**：

$$\text{idealDim} = \text{stepSize} \times \text{targetBandAR}$$

$$\text{blendedDim} = \exp\!\left(0.5 \cdot \ln(\text{actualDim}) + 0.5 \cdot \ln(\text{idealDim})\right)$$

结果钳制到 $[S_{\min},\; \text{actualDim}]$ — 混合仅**缩小**，不增大。`bandAR ≤ targetBandAR` 时不调整。

### §3.9.4 Orientation Handling

| Axis layout | Band AR formula | Adjusted dimension |
|---|---|---|
| X banded, Y continuous | $H / \text{xStep}$ | Shrink $H$ |
| Y banded, X continuous | $W / \text{yStep}$ | Shrink $W$ |

### §3.9.5 Worked Example

X 上 5 类别，step = 40 px，canvas height = 300 px，targetBandAR = 10：

- bandAR $= 300 / 40 = 7.5 \leq 10$ → **no adjustment**。

X 上 3 类别，step = 60 px，canvas height = 300 px，targetBandAR = 10：

- bandAR $= 300 / 60 = 5.0 \leq 10$ → **no adjustment**。

X 上 20 类别，step = 12 px，canvas height = 300 px，targetBandAR = 10：

- bandAR $= 300 / 12 = 25 > 10$ → blend。
- idealH $= 12 \times 10 = 120$。
- blendedH $= \exp(0.5 \ln 300 + 0.5 \ln 120) = \sqrt{300 \times 120} = 190$ px。
- **Result: height shrinks from 300 → 190.**

> **Implementation:** `computeLayout()` 中的 Band AR blending 块（约 702–735 行）。由 `options.targetBandAR`（`AssembleOptions`）控制。VL backend 在 `assemble.ts` 中设默认 `targetBandAR = 10`。

---

# §4 圆周（Radial Pressure Model）

## §4.1 问题

Radial 图表（Pie、Rose、Sunburst、Radar）将数据项排列在**圆**周上，相关维度是**圆周**。许多项拥挤圆周时，图表增长以保持 slice 和 spoke 可读。

**为何轴模型不适用：**
- **§2 (Spring):** 假设有端点的 1D 轴。Radial 图表是闭合环 — 增长意味着增大**半径**，圆周为 $C = 2\pi r$。
- **§3 (Gas):** 假设 2D 自由浮点。Radial 项角向约束在 slice/spoke 位置。

Circumference 模型将 spring 直觉映射到极坐标：把圆周当作「弯轴」并 stretch 半径。

## §4.2 参数

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

> **Code defaults:** `core/decisions.ts` 中的 `CircumferencePressureParams` — `minArcPx: 45`、`minRadius: 60`、`maxRadius: 400`、`elasticity: 0.5`、`maxStretch: 2.0`、`margin: 20`。

## §4.3 有效项数

不同 radial chart type 拥挤方式不同。模型将这些差异抽象为单一数字 $N_{\text{eff}}$。

**Uniform slices/spokes**（Rose、Radar）：$N_{\text{eff}} = N$。

**Variable-width slices**（Pie、Sunburst）：

$$N_{\text{eff}} = \frac{\sum v_i}{\min(v_i)}$$

回答：「需要多少个最小 slice 才能填满整圆？」结果上限 100 以防退化。

**Sunburst:** 在**外环**（仅叶节点）计算 $N_{\text{eff}}$ — 最拥挤环。

> **Implementation:** `core/decisions.ts` 中的 `computeEffectiveBarCount()`（约 906–920 行）。

## §4.4 Pressure 与 Stretch

**Pressure:**

$$p = \frac{N_{\text{eff}} \cdot \ell_{\text{arc}}}{C_0} = \frac{N_{\text{eff}} \cdot \ell_{\text{arc}}}{2\pi r_0}$$

**Effective max stretch**（尊重 per-dimension 画布上限）：

$$s_{\max} = \min\!\left(\frac{r_{\max}}{r_0},\; \frac{\min(W_0 \cdot \beta,\; H_0 \cdot \beta) - 2m}{2 r_0}\right)$$

**Stretch:**

$$
s = \begin{cases}
1 & \text{if } p \leq 1 \cr
\min(s_{\max},\; p^{\alpha}) & \text{if } p > 1
\end{cases}
$$

**Radius:** $r = \text{clamp}(r_0 \cdot s,\; r_{\min},\; r_{\max})$

> **Implementation:** `core/decisions.ts` 中的 `computeCircumferencePressure()`（约 850–893 行）。

## §4.5 画布尺寸

计算最终半径 $r$ 后：

$$W = \max(W_0,\; 2r + 2m), \quad H = \max(H_0,\; 2r + 2m)$$

两画布维度等量增长（保持圆形宽高比）。

## §4.6 Gauge 分面

Gauge 图表是特例：每个 gauge 是单项 radial 图表。多个 gauge 由模板计算 facet 风格网格布局，因为 assembler 的 facet path 不适用于无轴图表。

所有 gauge 元素尺寸随计算半径**连续**缩放：

$$\text{elementSize} = \text{baseline} \times (r / r_{\text{ref}})$$

其中 $r_{\text{ref}} = 100$ px。各元素钳制到最小值。避免阈值伪影。

## §4.7 参数表

| Chart type | $N_{\text{eff}}$ source | $\ell_{\text{arc}}$ | $\alpha$ | $\beta$ | $m$ |
|---|---|---|---|---|---|
| **Pie** | `total / min(values)` | 45 | 0.5 | 2.0 | 50 |
| **Rose** | N categories | 45 | 0.5 | 2.0 | 20 |
| **Sunburst** | outer-ring `total / min` | 45 | 0.5 | 2.0 | 20 |
| **Radar** | N spokes | 45 | 0.5 | 2.0 | 20 |
| **Gauge** | N dials (facet grid) | — | — | 2.0 | 20 |

## §4.8 摘要

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

> **Key functions:** `core/decisions.ts` 中的 `computeCircumferencePressure()`、`computeEffectiveBarCount()`。

---

# §5 面积布局（2D Pressure Model）

## §5.1 问题

面积填充图表（如 Treemap）将 2D 画布划分为面积编码值的矩形。与 Cartesian 图表不同，根本资源是**总面积**。许多项拥挤时，每项过小无法标签或视觉区分。

**为何其他模型不适用：**
- **§2 / §3:** 独立推理 1D 轴。Treemap 项在任轴上无稳定位置；squarify 算法即时决定划分。
- **§4:** 推理闭合环。Treemap 项占据 2D 面积，非角向扇区。

## §5.2 参数

| Symbol | Meaning | Default |
|---|---|---|
| $W_0, H_0$ | Base canvas dimensions | from context |
| $A_0$ | Base canvas area: $W_0 \times H_0$ | derived |
| $N_{\text{eff}}$ | Effective item count (§5.3) | data-dependent |
| $\ell_{\min}$ | Minimum width per effective item (px) | 30 |
| $\alpha$ | Elasticity exponent | 0.5 |
| $\beta$ | Per-dimension max stretch | 2.0 |
| $b$ | X-bias factor | 1.5 |

> **Implementation note:** 面积模型目前**内联**实现在 `echarts/templates/treemap.ts`（约 91–115 行），非 `decisions.ts` 中的共享 core 函数。公式与默认值与本文完全一致。

## §5.3 有效项数

与 §4.3 相同公式：

$$N_{\text{eff}} = \min\!\left(100,\; \frac{\sum v_i}{\min(v_i)}\right)$$

捕获最坏情况：需要多少最小项副本才能填满整个空间。

> **Implementation:** 调用 `core/decisions.ts` 中的 `computeEffectiveBarCount()`。

## §5.4 Pressure 与偏置分割

### Step 1: 1D Pressure

想象所有 treemap 项沿 X 排成竖条。pressure 相对基准宽度衡量：

$$p = \frac{N_{\text{eff}} \cdot \ell_{\min}}{W_0}$$

### Step 2: Area stretch

$$
A_{\text{stretch}} = \begin{cases}
1 & \text{if } p \leq 1 \cr
\min(\beta^2,\; p^{\alpha}) & \text{if } p > 1
\end{cases}
$$

上限为 $\beta^2$，因为 $A = W \times H$ 且各维上限为 $\beta$。

### Step 3: Biased split to X and Y

X 获得更多 stretch，因为阅读多为从左到右，标签为水平。

给定 X-bias factor $b$：

$$s_x = \min(\beta,\; A_{\text{stretch}}^{\,b/(b+1)})$$
$$s_y = \min(\beta,\; A_{\text{stretch}}^{\,1/(b+1)})$$

**Invariant:** $s_x \times s_y = A_{\text{stretch}}$。

| $b$ | X share | Y share | Effect |
|---|---|---|---|
| 1.0 | 50% | 50% | Uniform: $s_x = s_y = \sqrt{A_{\text{stretch}}}$ |
| 1.5 (default) | 60% | 40% | X takes more |
| 2.0 | 67% | 33% | Strongly X-biased |

### Step 4: Canvas sizing

$$W = \lfloor W_0 \cdot s_x \rceil, \quad H = \lfloor H_0 \cdot s_y \rceil$$

## §5.5 算例

Base canvas 400×300，$\ell_{\min} = 30$，$\alpha = 0.5$，$\beta = 2.0$，$b = 1.5$：

| Scenario | $N_{\text{eff}}$ | Pressure | $A_{\text{stretch}}$ | $s_x$ | $s_y$ | W | H |
|---|---|---|---|---|---|---|---|
| 5 equal items | 5 | 0.38 | 1.0 | 1.0 | 1.0 | 400 | 300 |
| 10 equal items | 10 | 0.75 | 1.0 | 1.0 | 1.0 | 400 | 300 |
| 20 equal items | 20 | 1.50 | 1.22 | 1.13 | 1.08 | 452 | 324 |
| 50 equal items | 50 | 3.75 | 1.94 | 1.52 | 1.27 | 608 | 381 |
| Skewed (1 large + 20 tiny) | 100 | 7.50 | 2.74 | 1.87 | 1.46 | 748 | 438 |

**为何偏置分割？** Treemap squarify 在画布接近正方形时产生近方形单元。给 X 更多 stretch 优先水平可读性：treemap 单元内标签为水平，额外宽度对容纳文字更有价值。

## §5.6 摘要

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

> **Key function:** 内联于 `echarts/templates/treemap.ts`。使用 `core/decisions.ts` 中的 `computeEffectiveBarCount()`。

---

# §6 统一摘要

四个模型将同一核心思想 **pressure → elastic stretch → clamped output** 适配到不同几何上下文：

| § | Model | Geometry | Pressure formula | Stretch dimension(s) | Chart types |
|---|---|---|---|---|---|
| §2 | Elastic Budget | 1D axis | $N \cdot \ell_0 / L_0$ | 1D (axis length) | Bar, Histogram, Heatmap, Boxplot |
| §3 | Gas Pressure | 2D point cloud | $\text{uniquePos} \cdot \sigma_{1d} / \text{dim}$ | Per-axis (X, Y independent) | Scatter, Line, Area |
| §4 | Circumference | 1D closed loop | $N_{\text{eff}} \cdot \ell_{\text{arc}} / C_0$ | Radius (both W, H equally) | Pie, Rose, Sunburst, Radar, Gauge |
| §5 | Area | 2D filled space | $N_{\text{eff}} \cdot \ell_{\min} / W_0$ | Area (biased X/Y split) | Treemap |

### 共享概念

1. **Pressure = demand / supply.** 项需要空间；基准画布提供。Pressure > 1 表示溢出。
2. **Elastic stretch.** $s = \min(\beta,\; p^\alpha)$。幂律指数 $\alpha$ 控制图表增长激进程度（gas 为 0.3，discrete/radial/area 为 0.5）。
3. **Per-dimension cap $\beta$.** 无轴增长超过 $\beta \times$ 基准。radial/area 模型转化为半径或面积上限。
4. **Effective item count.** 可变宽度项（pie、treemap）中，$N_{\text{eff}} = \sum v_i / \min(v_i)$ 衡量最坏拥挤。

### AR-aware extensions (§3.8–§3.9)

连续轴上，原始 pressure 辅以宽高比智能：

5. **Banking AR (§3.8.3).** 多尺度斜率分析（Heer & Agrawala 2006）决定感知理想 W/H 比。Connected marks 有 landscape floor（AR ≥ 1）。Scatter 用 σ-ratio。
6. **Gas–Banking blend (§3.8.4).** 对数空间 50/50 几何平均：gasAR（密度）× bankingAR（感知）。
7. **Per-subplot baseline (§3.8.2).** 分面图表向 gas pressure 输入 per-subplot 画布（含 facet elasticity），而非全画布。
8. **Band AR blending (§3.9).** 一轴 banded、另一 continuous 时，`targetBandAR` 通过对数空间混合防止 band 过度拉长。

### 决策树

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

### 实现映射

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
