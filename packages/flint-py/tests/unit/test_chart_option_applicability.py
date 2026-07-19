"""Port of tests/frontend/unit/lib/agents-chart/vegalite/chartOptionApplicability.test.ts."""
from __future__ import annotations

from typing import Any

from flint.vegalite import assemble_vegalite

CANVAS = {"width": 600, "height": 400}


def _applicable_keys(spec: dict[str, Any]) -> list[str]:
    return [o["key"] for o in spec.get("_options", []) if o.get("applicable")]


def _has_option(spec: dict[str, Any], key: str) -> bool:
    return any(o.get("key") == key for o in spec.get("_options", []))


# ── stackMode ───────────────────────────────────────────────────────────────

STACK_ROWS = [
    {"region": "N", "cat": "a", "val": 3}, {"region": "N", "cat": "b", "val": 5},
    {"region": "S", "cat": "a", "val": 2}, {"region": "S", "cat": "b", "val": 4},
]


def test_stack_mode_applicable_when_color_bound():
    spec = assemble_vegalite({
        "data": {"values": STACK_ROWS},
        "semantic_types": {"region": "Category", "cat": "Category", "val": "Quantity"},
        "chart_spec": {
            "chartType": "Stacked Bar Chart",
            "encodings": {"x": {"field": "region"}, "y": {"field": "val"}, "color": {"field": "cat"}},
            "baseSize": CANVAS,
        },
    })
    assert "stackMode" in _applicable_keys(spec)


def test_stack_mode_not_applicable_without_color_channel():
    spec = assemble_vegalite({
        "data": {"values": STACK_ROWS},
        "semantic_types": {"region": "Category", "val": "Quantity"},
        "chart_spec": {
            "chartType": "Stacked Bar Chart",
            "encodings": {"x": {"field": "region"}, "y": {"field": "val"}},
            "baseSize": CANVAS,
        },
    })
    assert _has_option(spec, "stackMode") is True
    assert "stackMode" not in _applicable_keys(spec)


def _area_spec(*, layered: bool, with_color: bool = True) -> dict[str, Any]:
    return assemble_vegalite({
        "data": {"values": STACK_ROWS},
        "semantic_types": {"region": "Category", "cat": "Category", "val": "Quantity"},
        "chart_spec": {
            "chartType": "Area Chart",
            "encodings": {
                "x": {"field": "region"},
                "y": {"field": "val"},
                **({"color": {"field": "cat"}} if with_color else {}),
            },
            "chartProperties": {"stackMode": "layered"} if layered else {},
            "baseSize": CANVAS,
        },
    })


def test_area_opacity_only_applicable_for_layered_multi_series():
    assert "opacity" not in _applicable_keys(_area_spec(layered=False))
    assert "opacity" not in _applicable_keys(_area_spec(layered=True, with_color=False))
    assert "opacity" in _applicable_keys(_area_spec(layered=True))


# ── independentYAxis ────────────────────────────────────────────────────────

FACET_ROWS = [
    {"g": "A", "x": "p", "y": 1}, {"g": "A", "x": "q", "y": 2},
    {"g": "B", "x": "p", "y": 100}, {"g": "B", "x": "q", "y": 300},
]


def test_independent_y_axis_applicable_when_faceted():
    spec = assemble_vegalite({
        "data": {"values": FACET_ROWS},
        "semantic_types": {"g": "Category", "x": "Category", "y": "Quantity"},
        "chart_spec": {
            "chartType": "Bar Chart",
            "encodings": {"x": {"field": "x"}, "y": {"field": "y"}, "column": {"field": "g"}},
            "baseSize": CANVAS,
        },
    })
    assert "independentYAxis" in _applicable_keys(spec)


def test_independent_y_axis_not_applicable_when_not_faceted():
    spec = assemble_vegalite({
        "data": {"values": FACET_ROWS},
        "semantic_types": {"x": "Category", "y": "Quantity"},
        "chart_spec": {
            "chartType": "Bar Chart",
            "encodings": {"x": {"field": "x"}, "y": {"field": "y"}},
            "baseSize": CANVAS,
        },
    })
    assert "independentYAxis" not in _applicable_keys(spec)


# ── showPercent ─────────────────────────────────────────────────────────────

def _bar_table(values: list[dict], semantic_types: dict) -> dict:
    return assemble_vegalite({
        "data": {"values": values},
        "semantic_types": semantic_types,
        "chart_spec": {
            "chartType": "Bar Table",
            "encodings": {"y": {"field": "cat"}, "x": {"field": "val"}},
            "baseSize": CANVAS,
        },
    })


def test_show_percent_applicable_for_additive_single_sign_measure():
    spec = _bar_table(
        [{"cat": "a", "val": 10}, {"cat": "b", "val": 20}, {"cat": "c", "val": 30}],
        {"cat": "Category", "val": "Quantity"},
    )
    assert "showPercent" in _applicable_keys(spec)


def test_show_percent_not_applicable_for_mixed_sign_measure():
    spec = _bar_table(
        [{"cat": "a", "val": 10}, {"cat": "b", "val": -20}, {"cat": "c", "val": 5}],
        {"cat": "Category", "val": "Number"},
    )
    assert _has_option(spec, "showPercent") is True
    assert "showPercent" not in _applicable_keys(spec)


# ── xAxisType / yAxisType ───────────────────────────────────────────────────

MONTH_ROWS = [
    {"month": "2010-01", "cost": 17.8}, {"month": "2011-04", "cost": 20.1},
    {"month": "2012-06", "cost": 19.0}, {"month": "2013-09", "cost": 19.9},
    {"month": "2014-11", "cost": 21.0},
]


def _bar_with_x(values, semantic_types, chart_properties=None):
    cs = {
        "chartType": "Bar Chart",
        "encodings": {"x": {"field": "month"}, "y": {"field": "cost"}},
        "baseSize": CANVAS,
    }
    if chart_properties:
        cs["chartProperties"] = chart_properties
    return assemble_vegalite({
        "data": {"values": values},
        "semantic_types": semantic_types,
        "chart_spec": cs,
    })


def test_x_axis_type_applicable_for_date_like_x_with_modest_distinct():
    spec = _bar_with_x(MONTH_ROWS, {"month": "YearMonth", "cost": "Quantity"})
    assert "xAxisType" in _applicable_keys(spec)


def test_x_axis_type_forces_discrete_nominal_when_user_picks_nominal():
    spec = _bar_with_x(MONTH_ROWS, {"month": "YearMonth", "cost": "Quantity"}, {"xAxisType": "nominal"})
    assert spec.get("encoding", {}).get("x", {}).get("type") == "nominal"
    assert "xAxisType" in _applicable_keys(spec)


def test_x_axis_type_not_applicable_for_plain_categorical_x():
    spec = assemble_vegalite({
        "data": {"values": [{"region": "N", "cost": 3}, {"region": "S", "cost": 5}]},
        "semantic_types": {"region": "Category", "cost": "Quantity"},
        "chart_spec": {
            "chartType": "Bar Chart",
            "encodings": {"x": {"field": "region"}, "y": {"field": "cost"}},
            "baseSize": CANVAS,
        },
    })
    assert _has_option(spec, "xAxisType") is True
    assert "xAxisType" not in _applicable_keys(spec)


def test_y_axis_type_offered_for_date_like_temporal_y():
    spec = assemble_vegalite({
        "data": {"values": MONTH_ROWS},
        "semantic_types": {"month": "YearMonth", "cost": "Quantity"},
        "chart_spec": {
            "chartType": "Bar Chart",
            "encodings": {"y": {"field": "month"}, "x": {"field": "cost"}},
            "baseSize": CANVAS,
        },
    })
    assert "yAxisType" in _applicable_keys(spec)


def test_y_axis_type_forces_discrete_nominal_when_user_picks_nominal():
    spec = assemble_vegalite({
        "data": {"values": MONTH_ROWS},
        "semantic_types": {"month": "YearMonth", "cost": "Quantity"},
        "chart_spec": {
            "chartType": "Bar Chart",
            "encodings": {"y": {"field": "month"}, "x": {"field": "cost"}},
            "baseSize": CANVAS,
            "chartProperties": {"yAxisType": "nominal"},
        },
    })
    assert spec.get("encoding", {}).get("y", {}).get("type") == "nominal"
    assert "yAxisType" in _applicable_keys(spec)
