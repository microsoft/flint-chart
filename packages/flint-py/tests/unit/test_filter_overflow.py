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


def _explicit_order_result(data, sort_by, sort_order=None):
    encoding = {"field": "Category", "sortBy": sort_by}
    if sort_order:
        encoding["sortOrder"] = sort_order
    return filter_overflow(
        {
            "x": {"field": "Category", "type": "nominal", "semanticAnnotation": {"semanticType": "Category"}},
            "y": {"field": "Value", "type": "quantitative", "semanticAnnotation": {"semanticType": "Quantity"}},
        },
        {"axisFlags": {"x": {"banded": True}}},
        {"x": encoding, "y": {"field": "Value"}},
        data,
        BUDGETS,
        MARKS,
    )


def test_explicit_order_keeps_duplicates_and_drops_missing_values():
    data = [{"Category": c, "Value": 1} for c in ["Delta", "Alpha", "Charlie", "Bravo"]]
    sort_by = '["Bravo", "Missing", "Delta", "Bravo", "Alpha", "Charlie"]'

    ascending = _explicit_order_result(data, sort_by)
    # The default strategy is capped at the distinct-value count, so duplicates shorten the tail.
    assert ascending["viewports"][0]["orderedValues"] == ["Bravo", "Delta", "Bravo", "Alpha"]
    assert ascending["truncations"][0]["keptValues"] == ["Bravo", "Delta", "Bravo"]
    assert ascending["warnings"][0]["message"] == (
        "1 of 4 values in 'Category' were omitted (showing first 3 in sort order)."
    )
    assert ascending["filteredData"] == [data[0], data[3]]

    descending = _explicit_order_result(data, sort_by, "descending")
    assert descending["viewports"][0]["orderedValues"] == ["Charlie", "Alpha", "Bravo", "Delta"]
    assert descending["truncations"][0]["keptValues"] == ["Charlie", "Alpha", "Bravo"]


def test_explicit_order_uses_python_equality_and_skips_unhashable_entries():
    data = [{"Category": c, "Value": 1} for c in [1, 2, 3, 4]]

    result = _explicit_order_result(data, '[["nested"], true, 2.0, 9, 3, 4]')
    assert result["viewports"][0]["orderedValues"] == [True, 2.0, 3, 4]
    assert result["truncations"][0]["keptValues"] == [True, 2.0, 3]
