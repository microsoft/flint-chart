"""Shared helper functions for chart template hooks (v2 pipeline).
Pure logic — no UI dependencies.
"""
from __future__ import annotations

import math
from typing import Any, Optional
from ...core import js_round


def _is_discrete(t: Optional[str]) -> bool:
    return t == "nominal" or t == "ordinal"


def is_equally_strided(field: str, table: list) -> bool:
    """Check whether a numeric field's values are equally strided (uniform spacing)."""
    seen: dict = {}
    for r in table:
        v = r.get(field) if isinstance(r, dict) else None
        if v is None or not isinstance(v, (int, float)) or isinstance(v, bool):
            continue
        if v not in seen:
            seen[v] = True
    vals = list(seen.keys())
    if len(vals) <= 1:
        return True
    vals.sort()
    diffs = [vals[i] - vals[i - 1] for i in range(1, len(vals))]
    sorted_diffs = sorted(diffs)
    median_diff = sorted_diffs[len(diffs) // 2]
    if median_diff == 0:
        return False
    tolerance = 0.01 * abs(median_diff)
    return all(abs(d - median_diff) <= tolerance for d in diffs)


def get_field_cardinality(field: str, table: list) -> int:
    """Get the number of unique non-null values for a field."""
    seen = set()
    for r in table:
        v = r.get(field) if isinstance(r, dict) else None
        if v is None:
            continue
        seen.add(v)
    return len(seen)


def resolve_discrete_type(current_type: Optional[str], field: Optional[str], table: list) -> str:
    """Determine the discrete type for a given encoding type."""
    if current_type == "nominal":
        return "nominal"
    if current_type == "ordinal":
        return "ordinal"
    if current_type == "temporal":
        return "ordinal"
    if current_type == "quantitative" and field and len(table) > 0:
        cardinality = get_field_cardinality(field, table)
        return "ordinal" if cardinality <= 20 else "nominal"
    return "nominal"


def resolve_as_discrete(encoding_obj: Optional[dict], table: list) -> str:
    """Convert a single encoding to a discrete VL type in-place."""
    if not encoding_obj:
        return "nominal"
    result = resolve_discrete_type(encoding_obj.get("type"), encoding_obj.get("field"), table)
    encoding_obj["type"] = result
    return result


def detect_banded_axis_from_semantics(
    channel_semantics: dict,
    table: list,
    options: Optional[dict] = None,
) -> Optional[dict]:
    """Detect which positional axis should be the banded/category axis."""
    options = options or {}
    x_cs = channel_semantics.get("x") or {}
    y_cs = channel_semantics.get("y") or {}
    x_type = x_cs.get("type")
    y_type = y_cs.get("type")

    if x_type and _is_discrete(x_type):
        return {"axis": "x"}
    if y_type and _is_discrete(y_type):
        return {"axis": "y"}

    if x_type and y_type:
        if x_type == "quantitative" and y_type != "quantitative":
            return {"axis": "y"}
        if y_type == "quantitative" and x_type != "quantitative":
            return {"axis": "x"}
        return {"axis": options.get("preferAxis") or "x"}

    if x_type:
        new_type = resolve_discrete_type(x_type, x_cs.get("field"), table)
        return {"axis": "x", "resolvedTypes": {"x": new_type}}
    if y_type:
        new_type = resolve_discrete_type(y_type, y_cs.get("field"), table)
        return {"axis": "y", "resolvedTypes": {"y": new_type}}

    return None


def detect_banded_axis_force_discrete(
    channel_semantics: dict,
    table: list,
    options: Optional[dict] = None,
) -> Optional[dict]:
    """Detect which axis is banded, and also force discrete conversion."""
    result = detect_banded_axis_from_semantics(channel_semantics, table, options)
    if result is None:
        return None
    axis = result["axis"]
    cs = channel_semantics.get(axis)
    if not cs:
        return result
    if not _is_discrete(cs.get("type")):
        new_type = resolve_discrete_type(cs.get("type"), cs.get("field"), table)
        merged: dict = {}
        if "resolvedTypes" in result and result["resolvedTypes"]:
            merged.update(result["resolvedTypes"])
        merged[axis] = new_type
        return {"axis": axis, "resolvedTypes": merged}
    return result


def default_build_encodings(spec: dict, encodings: dict) -> None:
    """Default instantiate implementation for simple templates."""
    if "encoding" not in spec:
        spec["encoding"] = {}
    for channel, encoding_obj in encodings.items():
        if len(encoding_obj.keys()) > 0:
            existing = spec["encoding"].get(channel)
            if existing and isinstance(existing, dict):
                spec["encoding"][channel] = {**existing, **encoding_obj}
            else:
                spec["encoding"][channel] = encoding_obj


def set_mark_prop(mark: Any, key: str, value: Any) -> Any:
    """Set a property on a mark object (handles both string and object forms)."""
    if isinstance(mark, str):
        return {"type": mark, key: value}
    return {**(mark or {}), key: value}


def apply_point_size_scaling(
    vg_spec: dict,
    table: list,
    plot_width: Optional[float] = 400,
    plot_height: Optional[float] = 300,
    target_coverage: float = 0.15,
    default_size: float = 30,
    min_size: float = 4,
) -> dict:
    """Coverage-based point sizing."""
    if not table or len(table) == 0:
        return vg_spec
    plot_width = plot_width if plot_width is not None else 400
    plot_height = plot_height if plot_height is not None else 300

    mark = vg_spec.get("mark")
    mark_type = mark if isinstance(mark, str) else (mark.get("type") if isinstance(mark, dict) else None)
    if mark_type not in ("circle", "point", "square"):
        return vg_spec

    enc = vg_spec.get("encoding") or {}
    size_enc = enc.get("size") or {}
    if size_enc.get("field"):
        return vg_spec
    if isinstance(mark, dict) and mark.get("size") is not None:
        return vg_spec

    n = len(table)
    plot_area = plot_width * plot_height
    current_coverage = (n * default_size) / plot_area
    if current_coverage <= target_coverage:
        return vg_spec

    size = js_round(max(min_size, (target_coverage * plot_area) / n))
    vg_spec["mark"] = set_mark_prop(vg_spec.get("mark"), "size", size)
    return vg_spec


def _parse_date_ms(v: Any) -> float:
    """JS +new Date() semantics — returns NaN on parse failure."""
    from ...core.js_date import js_date_parse_ms
    if v is None:
        return float("nan")
    if isinstance(v, bool):
        return float(int(v))
    if isinstance(v, (int, float)):
        return float(v)
    result = js_date_parse_ms(v)
    return float("nan") if result is None else float(result)


def _to_number(v: Any) -> float:
    if v is None:
        return float("nan")
    if isinstance(v, bool):
        return float(int(v))
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(v)
    except (TypeError, ValueError):
        return float("nan")


def max_non_overlap_size(
    field: str,
    table: list,
    is_temporal: bool,
    subplot_dim: float,
    count: int,
    min_size: float = 2,
) -> float:
    """Compute the maximum non-overlapping mark size (in pixels)."""
    seen: dict = {}
    for r in table:
        v = r.get(field) if isinstance(r, dict) else None
        if v is None:
            continue
        n = _parse_date_ms(v) if is_temporal else _to_number(v)
        if not math.isnan(n):
            if n not in seen:
                seen[n] = True
    nums = list(seen.keys())
    if len(nums) < 2:
        return float("inf")
    nums.sort()

    min_gap = float("inf")
    for i in range(1, len(nums)):
        gap = nums[i] - nums[i - 1]
        if gap > 0 and gap < min_gap:
            min_gap = gap
    if not math.isfinite(min_gap):
        return float("inf")
    data_range = nums[-1] - nums[0]
    if data_range <= 0:
        return float("inf")

    pixels_per_unit = subplot_dim * (count - 1) / (data_range * count)
    max_width = math.floor(min_gap * pixels_per_unit)
    return max(min_size, max_width)


def align_stack_order_to_color_order(spec: dict, ctx: dict) -> None:
    """Make a stacked mark's segment order match its colour order.

    The assembler expresses "keep the order the data arrived in" as
    ``color.sort: None``. That governs the legend, but NOT the stack:
    Vega-Lite derives the stack's sort from the colour *scale*, and a scale
    with no explicit domain falls back to sorting the field ascending — i.e.
    alphabetically. The result is a chart whose legend reads
    ``A great deal, Some, Not much, None at all`` while its bars stack
    ``A great deal, None at all, Not much, Some``. For any ordered series
    (a Likert scale, an age band, a size class) that silently destroys the
    meaning of the stack.

    Pinning ``scale.domain`` to the same order makes Vega-Lite emit a
    ``_<field>_sort_index`` and sort the stack by it, so legend and stack
    agree. An explicit ``sort`` array does NOT achieve this — Vega-Lite
    applies it to the legend only — which is why the domain is what gets set.
    """
    encoding = spec.get("encoding") or {}
    color = encoding.get("color")
    # Only meaningful for a discrete colour series.
    if not color or not color.get("field"):
        return
    if color.get("type") not in ("nominal", "ordinal"):
        return
    # Called from stacked templates, where stacking is implicit unless it has
    # been explicitly switched off (``stackMode: 'layered'`` -> ``stack: None``).
    for axis in ("x", "y"):
        ae = encoding.get(axis)
        if ae and "stack" in ae and ae["stack"] in (None, False):
            return
    # An explicit domain already pins the order; don't override the caller.
    if (color.get("scale") or {}).get("domain"):
        return

    # ``sort: None`` means data order; a list means that list. Anything else
    # (a field-driven sort spec, "ascending"/"descending") is left alone.
    sort = color.get("sort", "__missing__")
    field = color["field"]
    if sort is None:
        order = []
        seen = set()
        for row in ctx.get("table") or []:
            value = (row or {}).get(field)
            if value is None or value in seen:
                continue
            seen.add(value)
            order.append(value)
    elif isinstance(sort, list):
        order = list(sort)
    else:
        return
    if len(order) < 2:
        return

    color["scale"] = {**(color.get("scale") or {}), "domain": order}


def adjust_bar_marks(spec: dict, ctx: dict) -> None:
    """Adjust bar/rect marks for continuous-as-discrete axes."""
    layout = ctx["layout"]
    for axis in ("x", "y"):
        count = layout["xContinuousAsDiscrete"] if axis == "x" else layout["yContinuousAsDiscrete"]
        if count <= 0:
            continue
        enc = (spec.get("encoding") or {}).get(axis)
        if enc and enc.get("bin"):
            continue

        eff_step = layout["xStep"] if axis == "x" else layout["yStep"]

        all_mark_types = set()
        mark = spec.get("mark")
        mt = mark if isinstance(mark, str) else (mark.get("type") if isinstance(mark, dict) else None)
        if mt:
            all_mark_types.add(mt)
        if isinstance(spec.get("layer"), list):
            for layer in spec["layer"]:
                lmark = layer.get("mark")
                lm = lmark if isinstance(lmark, str) else (lmark.get("type") if isinstance(lmark, dict) else None)
                if lm:
                    all_mark_types.add(lm)
        size_key = ("width" if axis == "x" else "height") if "rect" in all_mark_types else "size"

        subplot_dim = layout["subplotWidth"] if axis == "x" else layout["subplotHeight"]
        is_temporal = bool(enc and enc.get("type") == "temporal")
        max_size = (
            max_non_overlap_size(enc["field"], ctx["table"], is_temporal, subplot_dim, count)
            if enc and enc.get("field")
            else float("inf")
        )
        cell_size = max(2, min(js_round(eff_step * 0.9), max_size if math.isfinite(max_size) else js_round(eff_step * 0.9)))

        if isinstance(spec.get("layer"), list):
            for layer in spec["layer"]:
                lmark = layer.get("mark")
                lm = lmark if isinstance(lmark, str) else (lmark.get("type") if isinstance(lmark, dict) else None)
                if lm == "bar" or lm == "rect":
                    layer["mark"] = set_mark_prop(layer.get("mark"), size_key, cell_size)
        elif spec.get("mark"):
            mark_type = mark if isinstance(mark, str) else mark.get("type")
            if mark_type == "bar" or mark_type == "rect":
                spec["mark"] = set_mark_prop(spec.get("mark"), size_key, cell_size)


def adjust_rect_tiling(spec: dict, ctx: dict) -> None:
    """Adjust rect marks for edge-to-edge tiling on continuous axes."""
    layout = ctx["layout"]

    for axis in ("x", "y"):
        enc = (spec.get("encoding") or {}).get(axis)
        if not enc or not enc.get("field"):
            continue
        t = enc.get("type")
        if t == "nominal" or t == "ordinal":
            continue
        if enc.get("aggregate"):
            continue

        seen = set()
        for r in ctx["table"]:
            v = r.get(enc["field"]) if isinstance(r, dict) else None
            seen.add(v)
        cardinality = len(seen)
        if cardinality <= 1:
            continue

        count = layout["xContinuousAsDiscrete"] if axis == "x" else layout["yContinuousAsDiscrete"]
        eff_step = layout["xStep"] if axis == "x" else layout["yStep"]
        pixel_spacing = eff_step * (count + 1) / count if count > 0 else eff_step

        subplot_dim = layout["subplotWidth"] if axis == "x" else layout["subplotHeight"]
        is_temporal = t == "temporal"
        max_size = max_non_overlap_size(enc["field"], ctx["table"], is_temporal, subplot_dim, count)
        cell_size = max(1, min(math.floor(pixel_spacing * 0.98), max_size if math.isfinite(max_size) else math.floor(pixel_spacing * 0.98)))

        size_key = "width" if axis == "x" else "height"
        spec["mark"] = set_mark_prop(spec.get("mark"), size_key, cell_size)


def ensure_discrete_types(channel_semantics: dict, table: list) -> dict:
    """Convert both positional axes to discrete types if they aren't already."""
    resolved_types: dict = {}
    for axis in ("x", "y"):
        cs = channel_semantics.get(axis)
        if not cs or not cs.get("field") or _is_discrete(cs.get("type")):
            continue
        resolved_types[axis] = resolve_discrete_type(cs.get("type"), cs.get("field"), table)
    return resolved_types
