# agent-skills/

Agent skill for **flint-chart** — teaches LLMs and IDE agents how to
produce correct, idiomatic `ChartAssemblyInput` JSON.

## How agents should use flint-chart

The whole point of flint-chart is that LLMs **don't have to know low-level
chart knobs**. The agent contract is:

1. Pick a `chartType` from the registry.
2. Map fields to channels (`x`, `y`, `color`, …).
3. Annotate each field with a **semantic type** (`Quantity`, `Price`,
   `Country`, `Date`, …).

That's it. Sizing, zero baselines, color schemes, number formatting,
sort order — all derived deterministically by the compiler.

See [SKILL.md](SKILL.md) for the full contract, worked examples, and
the validation checklist.
