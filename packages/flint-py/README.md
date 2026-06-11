# flint-py

A Python port of the flint-chart semantic chart compiler. It takes the same
`ChartAssemblyInput` shape as the TypeScript `assembleVegaLite()` function
and produces an identical Vega-Lite specification.

The project mirrors the TypeScript source tree under `packages/flint-js/src/`:

```
flint_chart/
├── core/                  ← target-agnostic
│   ├── types.py
│   ├── type_registry.py
│   ├── semantic_types.py
│   ├── field_semantics.py
│   ├── decisions.py
│   ├── resolve_semantics.py
│   ├── color_decisions.py
│   ├── filter_overflow.py
│   └── compute_layout.py
└── vegalite/              ← Vega-Lite backend
    ├── assemble.py
    ├── instantiate_spec.py
    └── templates/
        ├── ...
```

## Usage

```python
from flint_chart.vegalite import assemble_vegalite

spec = assemble_vegalite({
    "data": {"values": rows},
    "semantic_types": {"weight": "Quantity", "mpg": "Quantity"},
    "chart_spec": {
        "chartType": "Scatter Plot",
        "encodings": {"x": {"field": "weight"}, "y": {"field": "mpg"}},
        "canvasSize": {"width": 400, "height": 300},
    },
    "options": {"addTooltips": True},
})
```

## Testing

The TypeScript source is treated as ground truth. Shared test fixtures live
in `shared/test-data/` at the repo root. Each fixture directory contains an
`input.json` and `expected.json` pair.

`tests/test_fixtures.py` runs the Python `assemble_vegalite()` on each input
and asserts deep equality against the recorded JS spec.

```bash
# Run the Python compatibility tests
cd packages/flint-py
uv pip install -e .[test]
uv run pytest -q
```
