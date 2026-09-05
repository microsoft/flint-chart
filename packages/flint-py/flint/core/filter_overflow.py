"""Port of src/lib/agents-chart/core/filter-overflow.ts."""

from __future__ import annotations

import json
import math
from typing import Any, Callable, Optional

from .semantic_types import infer_vis_category


def filter_overflow(
    channel_semantics: dict[str, dict[str, Any]],
    declaration: dict[str, Any],
    encodings: dict[str, dict[str, Any]],
    data: list[dict[str, Any]],
    budgets: dict[str, Any],
    all_mark_types: set,
) -> dict[str, Any]:
    def effective_type(ch: str) -> Optional[str]:
        rt = (declaration.get("resolvedTypes") or {}).get(ch)
        if rt is not None:
            return rt
        cs = channel_semantics.get(ch)
        return cs.get("type") if cs else None

    def effective_field(ch: str) -> Optional[str]:
        cs = channel_semantics.get(ch)
        if cs and cs.get("field"):
            return cs["field"]
        return None

    def is_discrete_type(t: Optional[str]) -> bool:
        return t == "nominal" or t == "ordinal"

    nominal_counts: dict[str, int] = {"x": 0, "y": 0, "column": 0, "row": 0, "group": 0}
    truncations: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []
    viewports: list[dict[str, Any]] = []
    filtered_data = data

    group_cs = channel_semantics.get("group")
    group_field = group_cs.get("field") if group_cs else None
    if group_field:
        nominal_counts["group"] = len({r.get(group_field) for r in data})

    strategy_context = {
        "data": data,
        "channelSemantics": channel_semantics,
        "encodings": encodings,
        "allMarkTypes": all_mark_types,
    }

    strategy: Callable = declaration.get("overflowStrategy") or _default_overflow_strategy

    for channel in ["x", "y", "column", "row", "color"]:
        field_name = effective_field(channel)
        type_ = effective_type(channel)
        if not field_name:
            continue

        max_to_keep = (budgets.get("maxValues") or {}).get(channel)
        if max_to_keep is None:
            max_to_keep = math.inf

        if not is_discrete_type(type_):
            if channel in ("column", "row"):
                unique_values = list(dict.fromkeys(r.get(field_name) for r in filtered_data))
                nominal_counts[channel] = int(min(len(unique_values), max_to_keep))
                if len(unique_values) > max_to_keep:
                    sorted_values = sorted(unique_values, key=_js_sort_key)
                    values_to_keep = sorted_values[:int(max_to_keep)]
                    omitted_count = len(unique_values) - len(values_to_keep)
                    warnings.append({
                        "severity": "warning", "code": "overflow",
                        "message": f"{omitted_count} of {len(unique_values)} values in '{field_name}' were omitted (showing first {len(values_to_keep)}).",
                        "channel": channel, "field": field_name,
                    })
                    keep_set = set(values_to_keep)
                    filtered_data = [row for row in filtered_data if row.get(field_name) in keep_set]
            continue

        unique_values = list(dict.fromkeys(r.get(field_name) for r in filtered_data))
        nominal_counts[channel] = int(min(len(unique_values), max_to_keep))

        if len(unique_values) > max_to_keep:
            ordered_values = (
                strategy(channel, field_name, unique_values, len(unique_values), strategy_context)
                if strategy is _default_overflow_strategy else None
            )
            values_to_keep = (
                ordered_values[:int(max_to_keep)] if ordered_values is not None
                else strategy(channel, field_name, unique_values, int(max_to_keep), strategy_context)
            )

            if channel in ("x", "y") and ordered_values is not None:
                viewports.append({
                    "channel": channel,
                    "field": field_name,
                    "orderedValues": ordered_values,
                    "visibleCount": len(values_to_keep),
                    "totalCount": len(ordered_values),
                })

            omitted_count = len(unique_values) - len(values_to_keep)
            placeholder = f"...{omitted_count} items omitted"

            warnings.append({
                "severity": "warning", "code": "overflow",
                "message": f"{omitted_count} of {len(unique_values)} values in '{field_name}' were omitted (showing first {len(values_to_keep)} in sort order).",
                "channel": channel, "field": field_name,
            })

            truncations.append({
                "severity": "warning", "code": "overflow",
                "message": f"{omitted_count} of {len(unique_values)} values in '{field_name}' were omitted (showing first {len(values_to_keep)} in sort order).",
                "channel": channel, "field": field_name,
                "keptValues": values_to_keep, "omittedCount": omitted_count,
                "placeholder": placeholder,
            })

            if channel != "color":
                vk_set = set(values_to_keep)
                filtered_data = [row for row in filtered_data if row.get(field_name) in vk_set]

    return {
        "filteredData": filtered_data,
        "nominalCounts": nominal_counts,
        "truncations": truncations,
        "warnings": warnings,
        "viewports": viewports,
    }


def resolve_category_viewport(viewport: dict[str, Any], requested_start: int = 0) -> dict[str, Any]:
    max_start = max(0, viewport["totalCount"] - viewport["visibleCount"])
    start = min(max_start, max(0, math.floor(requested_start)))
    end = min(viewport["totalCount"], start + viewport["visibleCount"])
    return {"start": start, "end": end, "values": viewport["orderedValues"][start:end]}


def apply_category_viewports(
    data: list[dict[str, Any]],
    viewports: list[dict[str, Any]],
    starts: Optional[dict[str, int]] = None,
) -> list[dict[str, Any]]:
    starts = starts or {}
    windows = [
        (viewport["field"], set(resolve_category_viewport(viewport, starts.get(viewport["channel"], 0))["values"]))
        for viewport in viewports
    ]
    return [row for row in data if all(row.get(field) in values for field, values in windows)]


def _js_sort_key(v: Any) -> str:
    """JS Array.prototype.sort() default coerces to string."""
    if v is None:
        return "null"
    return str(v)


def _default_overflow_strategy(
    channel: str,
    field_name: str,
    unique_values: list,
    max_to_keep: int,
    context: dict[str, Any],
) -> list:
    data = context["data"]
    channel_semantics = context["channelSemantics"]
    encodings = context["encodings"]
    all_mark_types = context["allMarkTypes"]

    encoding = encodings.get(channel) or {}
    sort_by = encoding.get("sortBy")
    sort_order = encoding.get("sortOrder")

    sort_field: Optional[str] = None
    sort_field_type: Optional[str] = None
    is_descending = False

    if sort_by:
        if sort_by in ("x", "y", "color"):
            sort_cs = channel_semantics.get(sort_by)
            sort_field = sort_cs.get("field") if sort_cs else None
            sort_field_type = sort_cs.get("type") if sort_cs else None
            is_descending = sort_order == "descending" or (sort_order != "ascending" and sort_by != channel)
        else:
            try:
                sorted_list = json.loads(sort_by)
                if isinstance(sorted_list, list):
                    ordered_values = list(reversed(sorted_list)) if sort_order == "descending" else sorted_list
                    return [v for v in ordered_values if v in unique_values][:max_to_keep]
            except Exception:
                pass
            is_descending = sort_order == "descending"
    if sort_field and sort_field_type == "quantitative":
        is_bar = ("bar" in all_mark_types) and (
            sort_field != (channel_semantics.get("color", {}) or {}).get("field")
        )
        if is_bar:
            aggregate_op = lambda x, y: x + y  # noqa: E731
            initial_value = 0
        else:
            aggregate_op = max
            initial_value = float("-inf")

        value_aggregates: dict[Any, float] = {}
        for row in data:
            field_value = row.get(field_name)
            sort_value = row.get(sort_field) or 0
            if field_value in value_aggregates:
                value_aggregates[field_value] = aggregate_op(value_aggregates[field_value], sort_value)
            else:
                value_aggregates[field_value] = aggregate_op(initial_value, sort_value)

        entries = [(v, a) for v, a in value_aggregates.items()]
        entries.sort(key=lambda e: -e[1] if is_descending else e[1])
        return [e[0] for e in entries[:max_to_keep]]

    canonical_order = (channel_semantics.get(channel) or {}).get("ordinalSortOrder")
    if not sort_by and not sort_order and canonical_order:
        ordered = [value for value in canonical_order if value in unique_values]
        ordered_set = set(ordered)
        ordered.extend(value for value in unique_values if value not in ordered_set)
        return ordered[:max_to_keep]

    field_original_type = infer_vis_category([r.get(field_name) for r in data])
    if field_original_type == "quantitative" or channel == "color":
        # JS sort: a - b; if values are strings of numbers, JS still treats them
        # as numbers via -; preserve that
        def numeric_key(v: Any) -> float:
            try:
                return float(v)
            except (TypeError, ValueError):
                return float("nan")
        return sorted(unique_values, key=numeric_key)[:max_to_keep]

    if channel in ("column", "row"):
        return unique_values[:max_to_keep]

    if sort_order == "descending":
        return sorted(unique_values, key=_js_sort_key, reverse=True)[:max_to_keep]

    if sort_order == "ascending":
        return sorted(unique_values, key=_js_sort_key)[:max_to_keep]

    return unique_values[:max_to_keep]
