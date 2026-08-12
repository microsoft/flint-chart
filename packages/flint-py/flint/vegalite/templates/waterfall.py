"""Waterfall Chart template."""
from __future__ import annotations

from .utils import resolve_discrete_type


def _waterfall_declare(cs, table, chart_properties):
    # The steps are drawn on a band scale whatever the column holds — a month is
    # a step here, not a date — so the layout has to size it as a category.
    x_cs = (cs or {}).get("x") or {}
    return {
        "axisFlags": {"x": {"banded": True}},
        "resolvedTypes": {
            "x": resolve_discrete_type(x_cs.get("type") or "nominal", x_cs.get("field"), table or []),
        },
    }


def _waterfall_instantiate(spec, ctx):
    encs = ctx["resolvedEncodings"]
    x = encs.get("x")
    y = encs.get("y")
    color = encs.get("color")
    column = encs.get("column")
    row = encs.get("row")
    config = ctx.get("chartProperties") or {}

    x_field = (x or {}).get("field") or "Category"
    y_field = (y or {}).get("field") or "Amount"
    color_field = (color or {}).get("field")

    if "encoding" not in spec:
        spec["encoding"] = {}
    if column:
        spec["encoding"]["column"] = column
    if row:
        spec["encoding"]["row"] = row

    has_type_col = bool(color_field)
    type_field = color_field or "__wf_type"

    transforms = []
    if not has_type_col:
        transforms.extend([
            {"window": [{"op": "row_number", "as": "__wf_row"}]},
            {"joinaggregate": [{"op": "count", "as": "__wf_total"}]},
            {
                "calculate": "datum.__wf_row === 1 ? 'start' : datum.__wf_row === datum.__wf_total ? 'end' : 'delta'",
                "as": type_field,
            },
        ])

    transforms.append({"window": [{"op": "sum", "field": y_field, "as": "__wf_sum_raw"}]})
    transforms.append({
        "calculate": f"datum['{type_field}'] === 'end' ? datum.__wf_sum_raw - datum['{y_field}'] : datum.__wf_sum_raw",
        "as": "__wf_sum",
    })
    transforms.append({
        "calculate": f"datum['{type_field}'] === 'end' ? 0 : datum.__wf_sum - datum['{y_field}']",
        "as": "__wf_prev_sum",
    })
    transforms.append({
        "calculate": f"datum['{type_field}'] !== 'delta' ? 'total' : datum['{y_field}'] >= 0 ? 'increase' : 'decrease'",
        "as": "__wf_color",
    })

    spec["transform"] = transforms

    x_enc = {
        "field": x_field,
        "type": "ordinal",
        "sort": None,
        "axis": {"labelAngle": -45},
    }

    facet_encodings = {}
    cur_enc = spec.get("encoding") or {}
    if cur_enc.get("column"):
        facet_encodings["column"] = cur_enc["column"]
    if cur_enc.get("row"):
        facet_encodings["row"] = cur_enc["row"]

    corner_radius = config.get("cornerRadius")
    if not corner_radius or corner_radius <= 0:
        corner_radius = 0

    spec["encoding"] = {"x": x_enc, **facet_encodings}

    bar_mark = {"type": "bar"}
    if corner_radius > 0:
        bar_mark["cornerRadius"] = corner_radius

    spec["layer"] = [
        {
            "mark": bar_mark,
            "encoding": {
                "y": {
                    "field": "__wf_prev_sum",
                    "type": "quantitative",
                    "title": y_field,
                },
                "y2": {"field": "__wf_sum"},
                "color": {
                    "field": "__wf_color",
                    "type": "nominal",
                    "scale": {
                        "domain": ["total", "increase", "decrease"],
                        "range": ["#f7e0b6", "#93c4aa", "#f78a64"],
                    },
                    "legend": {"title": "Type"},
                },
            },
        },
    ]

    if "mark" in spec:
        del spec["mark"]


waterfall_chart_def = {
    "chart": "Waterfall Chart",
    "template": {"mark": "bar", "encoding": {}},
    "channels": ["x", "y", "color", "column", "row"],
    "markCognitiveChannel": "length",
    "declareLayoutMode": _waterfall_declare,
    "instantiate": _waterfall_instantiate,
    "properties": [
        {"key": "cornerRadius", "label": "Corners", "type": "continuous",
         "min": 0, "max": 8, "step": 1, "defaultValue": 0},
    ],
}
