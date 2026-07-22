from __future__ import annotations

from flint.core.filter_overflow import filter_overflow


BUDGETS = {"maxValues": {"x": 3}}
MARKS = {"bar"}


def kept_categories(data, category_semantics, category_encoding):
    result = filter_overflow(
        {
            "x": {
                "field": "Category",
                "semanticAnnotation": {"semanticType": "Category"},
                **category_semantics,
            },
            "y": {
                "field": "Value",
                "type": "quantitative",
                "semanticAnnotation": {"semanticType": "Quantity"},
            },
        },
        {"axisFlags": {"x": {"banded": True}}},
        {
            "x": {"field": "Category", **category_encoding},
            "y": {"field": "Value"},
        },
        data,
        BUDGETS,
        MARKS,
    )
    return result["truncations"][0]["keptValues"]


def test_preserves_encounter_order_when_no_sort_is_selected():
    data = [
        {"Category": "Delta", "Value": 100},
        {"Category": "Alpha", "Value": 1},
        {"Category": "Charlie", "Value": 80},
        {"Category": "Bravo", "Value": 50},
    ]

    assert kept_categories(data, {"type": "nominal"}, {}) == ["Delta", "Alpha", "Charlie"]


def test_uses_canonical_semantic_order_when_available():
    data = [
        {"Category": "Mar", "Value": 100},
        {"Category": "Jan", "Value": 1},
        {"Category": "Apr", "Value": 80},
        {"Category": "Feb", "Value": 50},
    ]

    assert kept_categories(
        data,
        {"type": "ordinal", "ordinalSortOrder": ["Jan", "Feb", "Mar", "Apr"]},
        {},
    ) == ["Jan", "Feb", "Mar"]


def test_uses_selected_value_sort():
    data = [
        {"Category": "Delta", "Value": 100},
        {"Category": "Alpha", "Value": 1},
        {"Category": "Charlie", "Value": 80},
        {"Category": "Bravo", "Value": 50},
    ]

    assert kept_categories(
        data,
        {"type": "nominal"},
        {"sortBy": "y", "sortOrder": "descending"},
    ) == ["Delta", "Charlie", "Bravo"]
