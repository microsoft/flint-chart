import copy
import importlib

import pytest

from flint.core.resolve_semantics import _resolve_channel_types, resolve_channel_semantics


assemble = importlib.import_module("flint.vegalite.assemble")

ROWS = [
    {"category": "B", "value": 2, "year": 2020, "when": "2020-01-01T00:00:00Z"},
    {"category": "A", "value": 5, "year": 2021, "when": "2021-01-01T00:00:00Z"},
]
TYPES = {"category": {"semanticType": "Category", "sortOrder": ["B", "A"]}, "value": "Quantity"}


def test_preliminary_types_match_full_semantics():
    encodings = {
        "x": {"field": "year"},
        "y": {"field": "value", "aggregate": "sum"},
        "color": {"field": "category"},
        "column": {"field": "value"},
        "row": {"field": "when", "type": "quantitative"},
        "size": {"aggregate": "count"},
        "shape": {"value": "circle"},
    }
    full = resolve_channel_semantics(encodings, ROWS, TYPES)
    types = _resolve_channel_types(encodings, ROWS, TYPES)
    for channel, encoding in encodings.items():
        if not encoding.get("type"):
            assert types.get(channel) == (full.get(channel) or {}).get("type")
    assert types["column"] == "nominal"
    assert types["size"] == "quantitative"


def test_iso_dates_and_missing_fields_match_full_semantics():
    encodings = {
        "x": {"field": "when"},
        "y": {"field": "value"},
        "column": {"field": "when"},
        "size": {"aggregate": "count"},
        "shape": {},
    }
    full = resolve_channel_semantics(encodings, ROWS, {"when": "Quantity", "value": "Quantity"})
    types = _resolve_channel_types(encodings, ROWS, {"when": "Quantity", "value": "Quantity"})
    assert types == {ch: cs["type"] for ch, cs in full.items()}
    assert types["x"] == "temporal"
    assert types["column"] == "nominal"


@pytest.mark.parametrize(
    "encodings,properties",
    [
        ({"x": "category", "y": "value", "color": "category"}, {"sort": "value-desc"}),
        ({"y": "category", "x": {"aggregate": "count"}}, {"sort": "value-desc"}),
        ({"x": {"field": "category", "type": "ordinal"}, "y": "value"}, {"sort": "value-desc"}),
        ({"x": "year", "y": "value", "column": "year"}, {"xAxisType": "nominal", "sort": "value-desc"}),
        ({"y": "year", "x": "value"}, {"yAxisType": "nominal", "sort": "value-desc"}),
        ({"x": "when", "y": "value", "color": "category"}, {"sort": "value-desc"}),
    ],
)
def test_assembly_matches_full_preliminary_pass(monkeypatch, encodings, properties):
    doc = {
        "data": {"values": ROWS},
        "semantic_types": TYPES,
        "chart_spec": {
            "chartType": "Bar Chart", "encodings": encodings,
            "chartProperties": properties, "baseSize": {"width": 600, "height": 400},
        },
    }
    optimized = assemble.assemble_vegalite(copy.deepcopy(doc))

    def full_types(raw, data, semantic_types):
        full = resolve_channel_semantics(raw, data, semantic_types)
        return {ch: cs["type"] for ch, cs in full.items()}

    monkeypatch.setattr(assemble, "_resolve_channel_types", full_types)
    assert optimized == assemble.assemble_vegalite(copy.deepcopy(doc))
    if properties.get("xAxisType") == "nominal":
        assert optimized["encoding"]["x"]["sort"] == "-y"
    if properties.get("yAxisType") == "nominal":
        assert optimized["encoding"]["y"]["sort"] == "-x"
