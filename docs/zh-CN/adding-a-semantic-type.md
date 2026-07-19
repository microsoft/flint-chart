# 扩展语义类型

语义类型是 LLM 和用户为字段附加的标签。当新的字段含义需要改变 Flint 如何格式化数值、聚合数据、选择比例尺或分配颜色时，应扩展语义类型。若 Flint 无法识别某类型，会优雅地回退到 `Unknown`。

完整类型层级与解析规则见 [Semantic Type](/documentation/semantic-types)。

---

## 目录

- [§1 判断是否需要新类型](#1-判断是否需要新类型)
- [§2 注册类型](#2-注册类型)
- [§3 同步常量与注解](#3-同步常量与注解)
- [§4 测试与验证](#4-测试与验证)
- [§5 相关文档](#5-相关文档)

---

# §1 判断是否需要新类型

在添加类型之前，确认它与 T1 父类型相比**确实会改变编译行为**。避免注册同义词，例如 `Money`、`Price` 和 `Currency`；在注册表中选定一个名称，必要时在 agent 提示词中为其他名称做别名。

| 问题 | 若答案为是 |
|---|---|
| 是否已有 T2 类型以相同方式编译？ | 使用该类型，并通过 `SemanticAnnotation` 元数据补充 |
| 该类型是否需要有界比例尺或单位？ | 保留该类型；在注解中记录所需的 `intrinsicDomain` / `unit` |
| 是否仅为 agent 提供更友好的标签？ | 优先使用 T1（`Amount`、`SignedMeasure`），而非新建 T2 |

已弃用类型的说明与完整清单见 [Semantic Type §2.4](/documentation/semantic-types#24-tier-2-specific-types)。

---

# §2 注册类型

**单一事实来源：** `packages/flint-js/src/core/type-registry.ts`

在 `TYPE_REGISTRY` 中添加一条记录。记录的键是 **T2 类型名称**，也是用户在 `semantic_types` 中传入的字符串。

```typescript
PercentageChange: {
    t0: 'Measure',
    t1: 'SignedMeasure',
    visEncodings: ['quantitative'],
    aggRole: 'signed-additive',
    domainShape: 'open',
    diverging: 'conditional',
    formatClass: 'percent',
    zeroBaseline: 'contextual',
    zeroPad: 0.05,
},
```

### `TypeRegistryEntry` 字段

| 字段 | 取值 | 驱动 |
|---|---|---|
| `t0` | `T0Family` | 解析器 / 编码族 |
| `t1` | `T1Category` | 中层规则选择 |
| `visEncodings` | `VisCategory[]`（优先级顺序） | 默认 Q/O/N/T 编码 |
| `aggRole` | `additive`, `intensive`, `signed-additive`, `dimension`, `identifier` | 通过 `resolveAggregationDefault()` 得到 `aggregationDefault` |
| `domainShape` | `open`, `bounded`, `fixed`, `cyclic` | 域约束、刻度、极坐标提示 |
| `diverging` | `none`, `conditional`, `inherent` | 发散色与中点 |
| `formatClass` | `currency`, `percent`, `unit-suffix`, `integer`, `decimal`, `plain` | 通过 `resolveFormat()` 设置轴/工具提示格式 |
| `zeroBaseline` | `meaningful`, `arbitrary`, `contextual`, `none` | Stage 4 中 `computeZeroDecision()` 的提示 |
| `zeroPad` | `number`（0–1 的小数） | 轴不包含零时的内边距 |

查询 API：同文件中的 `getRegistryEntry()`、`isRegistered()`、`getRegisteredTypes()`。

**不在注册表中**（在其他位置解析）：显式 `pattern` 字符串、轴反转、`colorScheme` 名称以及 `stackable`。这些来自 `field-semantics.ts` / `resolve-semantics.ts`，它们将注册表维度与数据和通道上下文结合。

---

# §3 同步常量与注解

### `SemanticTypes` 常量

在 `packages/flint-js/src/core/semantic-types.ts` 中添加对应键，以便调用点安全引用该类型：

```typescript
export const SemanticTypes = {
    // ...
    PercentageChange: 'PercentageChange',
} as const;
```

### 字段级元数据（可选）

**不属于**类型内在属性的逐字段细节应放在 `SemanticAnnotation`（`field-semantics.ts`）上，而非 `TYPE_REGISTRY`：

```typescript
interface SemanticAnnotation {
    semanticType: string;
    intrinsicDomain?: [number, number];  // e.g. Rating [1, 5]
    unit?: string;                        // e.g. USD, °C
    sortOrder?: string[];                 // custom ordinal order
}
```

图表输入接受 `Record<string, string | SemanticAnnotation>` 作为 `semantic_types`。

---

# §4 测试与验证

1. **Gallery 用例** — 在 `packages/flint-js/src/test-data/semantic-tests.ts` 中添加或扩展生成器，在相关通道上使用新类型。
2. **注册生成器** — 若这会创建新的 gallery 页面，在 `packages/flint-js/src/test-data/index.ts`（`TEST_GENERATORS`）中接线，并可选地在 `gallery-tree.ts` 中注册。
3. **运行检查：**

```bash
npm run typecheck
npm run test
npm run site    # open Gallery → Semantic Context (or your new page)
```

验证：

- 轴格式符合 `formatClass`（以及注解中的 `unit`）
- 在 `autoAggregate` 适用时，聚合遵循 `aggRole`
- 零基线与反转符合类型 + 标记（条形 vs 折线）
- 仅在 `diverging` 与数据需要时出现发散色

---

# §5 相关文档

- [Semantic Type](/documentation/semantic-types) — T0/T1/T2 层级、注解、解析规则
- [Architecture](/documentation/architecture) — `resolveChannelSemantics` 在流水线中的位置
- [API reference](/documentation/api-reference) — `ChartAssemblyInput` 上的 `semantic_types`
