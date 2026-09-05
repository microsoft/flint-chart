"""Port of src/lib/agents-chart/core/decisions.ts."""

from __future__ import annotations

import math
from typing import Any, Optional

from .semantic_types import infer_vis_category
from .type_registry import get_registry_entry, is_registered
from . import js_round


def _vis_category_to_vl_type(vc: str) -> str:
    if vc == "quantitative":
        return "quantitative"
    if vc == "ordinal":
        return "ordinal"
    if vc == "temporal":
        return "temporal"
    if vc == "geographic":
        return "quantitative"
    return "nominal"


def _looks_temporal_value(val: Any) -> bool:
    if isinstance(val, bool):
        return False
    if isinstance(val, (int, float)):
        if 1500 <= val <= 2200 and val == int(val):
            return True
        if 86400000 < val < 4_200_000_000_000:
            return True
        return False
    if isinstance(val, str):
        trimmed = val.strip()
        if not trimmed:
            return False
        # Mirror V8 `!Number.isNaN(Date.parse(trimmed))` — accept any free-form
        # date string V8 would parse (including "FY 2018" / "hello world 2018"),
        # and reject formats V8 doesn't parse (e.g. "15.01.2020").
        from .js_date import is_js_parseable
        return is_js_parseable(trimmed)
    return False


def _validate_temporal_parsing(data: list, field_name: str, from_registry: bool) -> bool:
    sample = [r.get(field_name) for r in data[:15]]
    sample = [v for v in sample if v is not None]
    if not sample:
        return False
    unique = {str(v) for v in sample}
    if len(unique) <= 1:
        return False
    passing = sum(1 for v in sample if _looks_temporal_value(v))
    threshold = 0.3 if from_registry else 0.5
    return passing / len(sample) >= threshold


def _resolve_temporal_encoding(
    vis_category: str,
    channel: str,
    data: list,
    field_name: str,
    from_registry: bool,
) -> dict[str, Any]:
    if channel in ("size", "column", "row"):
        return {
            "vlType": "ordinal", "visCategory": vis_category,
            "channelOverride": True, "cardinalityGuard": False,
        }
    if channel in ("color", "group"):
        unique_count = len({r.get(field_name) for r in data})
        if unique_count <= 12:
            return {
                "vlType": "ordinal", "visCategory": vis_category,
                "channelOverride": True, "cardinalityGuard": False,
            }
    if not _validate_temporal_parsing(data, field_name, from_registry):
        return {
            "vlType": "ordinal", "visCategory": vis_category,
            "channelOverride": False, "cardinalityGuard": False,
        }
    return {
        "vlType": "temporal", "visCategory": vis_category,
        "channelOverride": False, "cardinalityGuard": False,
    }


def _apply_ordinal_guards(
    vis_category: str,
    channel: str,
    data: list,
    field_name: str,
    field_values: list,
    from_registry: bool,
) -> dict[str, Any]:
    numeric_vals: list[float] = []
    for v in field_values:
        if v is None:
            continue
        if isinstance(v, bool):
            continue
        if isinstance(v, (int, float)):
            if not (isinstance(v, float) and math.isnan(v)):
                numeric_vals.append(float(v))
        elif isinstance(v, str):
            try:
                numeric_vals.append(float(v))
            except ValueError:
                pass

    if numeric_vals:
        unique_count = len(set(numeric_vals))
        has_fractions = any(v % 1 != 0 for v in numeric_vals)

        if not from_registry and has_fractions and unique_count > 20:
            return {
                "vlType": "quantitative", "visCategory": vis_category,
                "channelOverride": False, "cardinalityGuard": True,
            }
        if not has_fractions and unique_count > 12 and channel in ("color", "group"):
            return {
                "vlType": "quantitative", "visCategory": vis_category,
                "channelOverride": True, "cardinalityGuard": True,
            }
        if not has_fractions and unique_count > 12 and channel in ("x", "y"):
            return {
                "vlType": "quantitative", "visCategory": vis_category,
                "channelOverride": True, "cardinalityGuard": True,
            }
    return {
        "vlType": "ordinal", "visCategory": vis_category,
        "channelOverride": False, "cardinalityGuard": False,
    }


def _disambiguate_multi_encoding(
    candidates: list[str],
    channel: str,
    data: list,
    field_name: str,
    field_values: list,
) -> dict[str, Any]:
    has = lambda vc: vc in candidates  # noqa: E731

    if has("temporal") and has("ordinal"):
        return _resolve_temporal_encoding("temporal", channel, data, field_name, True)

    if has("quantitative") and has("ordinal"):
        if channel in ("color", "group"):
            unique_count = len({r.get(field_name) for r in data})
            if unique_count <= 12:
                return {"vlType": "ordinal", "visCategory": "ordinal", "channelOverride": False, "cardinalityGuard": False}
            return {"vlType": "quantitative", "visCategory": "quantitative", "channelOverride": False, "cardinalityGuard": True}
        if channel in ("column", "row"):
            return {"vlType": "ordinal", "visCategory": "ordinal", "channelOverride": False, "cardinalityGuard": False}
        return {"vlType": "quantitative", "visCategory": "quantitative", "channelOverride": False, "cardinalityGuard": False}

    if has("quantitative") and has("geographic"):
        return {"vlType": "quantitative", "visCategory": "quantitative", "channelOverride": False, "cardinalityGuard": False}

    if has("ordinal") and has("nominal"):
        if channel in ("color", "group"):
            return {"vlType": "nominal", "visCategory": "nominal", "channelOverride": False, "cardinalityGuard": False}
        return {"vlType": "ordinal", "visCategory": "ordinal", "channelOverride": False, "cardinalityGuard": False}

    fallback = candidates[0]
    return {"vlType": _vis_category_to_vl_type(fallback), "visCategory": fallback, "channelOverride": False, "cardinalityGuard": False}


def resolve_encoding_type(
    semantic_type: str,
    field_values: list,
    channel: str,
    data: list,
    field_name: str,
) -> dict[str, Any]:
    if semantic_type and is_registered(semantic_type):
        entry = get_registry_entry(semantic_type)
        candidates = entry["visEncodings"]
        if len(candidates) > 1:
            return _disambiguate_multi_encoding(candidates, channel, data, field_name, field_values)
        base_type = candidates[0]
        if base_type == "quantitative":
            non_null = [v for v in field_values if v is not None]
            all_numeric = len(non_null) > 0 and all(
                (isinstance(v, (int, float)) and not isinstance(v, bool))
                or (isinstance(v, str) and v.strip() != "" and _can_parse_float(v))
                for v in non_null
            )
            if not all_numeric:
                inferred = infer_vis_category(field_values)
                return {
                    "vlType": _vis_category_to_vl_type(inferred),
                    "visCategory": inferred,
                    "channelOverride": False, "cardinalityGuard": False,
                }
        if base_type == "temporal":
            return _resolve_temporal_encoding(base_type, channel, data, field_name, True)
        if base_type == "ordinal":
            return _apply_ordinal_guards(base_type, channel, data, field_name, field_values, True)
        return {
            "vlType": _vis_category_to_vl_type(base_type), "visCategory": base_type,
            "channelOverride": False, "cardinalityGuard": False,
        }

    vc = infer_vis_category(field_values)
    if vc == "temporal":
        return _resolve_temporal_encoding(vc, channel, data, field_name, False)
    if vc == "ordinal":
        return _apply_ordinal_guards(vc, channel, data, field_name, field_values, False)
    if vc == "quantitative":
        return {"vlType": "quantitative", "visCategory": vc, "channelOverride": False, "cardinalityGuard": False}
    if vc == "geographic":
        return {"vlType": "quantitative", "visCategory": vc, "channelOverride": False, "cardinalityGuard": False}
    return {"vlType": "nominal", "visCategory": vc, "channelOverride": False, "cardinalityGuard": False}


def _can_parse_float(s: str) -> bool:
    try:
        float(s)
        return True
    except ValueError:
        return False


# ---------------------------------------------------------------------------
# Gas pressure model
# ---------------------------------------------------------------------------

DEFAULT_GAS_PRESSURE_PARAMS: dict[str, Any] = {
    "markCrossSection": 30,
    "elasticity": 0.3,
    "maxStretch": 1.5,
}


def compute_gas_pressure(
    x_values: list[float],
    y_values: list[float],
    x_domain: list[float],
    y_domain: list[float],
    canvas_width: float,
    canvas_height: float,
    params: Optional[dict[str, Any]] = None,
) -> dict[str, float]:
    p = {**DEFAULT_GAS_PRESSURE_PARAMS, **(params or {})}
    N = len(x_values)
    if N <= 1 or canvas_width <= 0 or canvas_height <= 0:
        return {"stretchX": 1, "stretchY": 1, "rawStretchX": 1, "rawStretchY": 1}

    sigma1d_default = math.sqrt(p["markCrossSection"])

    def compute_axis_stretch(values, domain, base_dim, sigma1d):
        if base_dim <= 0 or len(values) <= 1:
            return (1.0, 1.0)
        rng = domain[1] - domain[0]
        if rng <= 0:
            return (1.0, 1.0)
        px_per_unit = base_dim / rng
        seen = set()
        for v in values:
            seen.add(js_round((v - domain[0]) * px_per_unit))
        unique_positions = len(seen)
        pressure = (unique_positions * sigma1d) / base_dim
        if pressure <= 1:
            return (1.0, 1.0)
        raw = pressure ** p["elasticity"]
        return (min(p["maxStretch"], raw), raw)

    sigma1d_x = math.sqrt(p["markCrossSectionX"]) if p.get("markCrossSectionX") is not None else sigma1d_default
    sigma1d_y = math.sqrt(p["markCrossSectionY"]) if p.get("markCrossSectionY") is not None else sigma1d_default

    def compute_stretch_for_axis(values, domain, base_dim, sigma1d, sigma_raw, item_count_override):
        if item_count_override is not None and sigma_raw > 0:
            pressure = (item_count_override * sigma_raw) / base_dim
            if pressure <= 1:
                return (1.0, 1.0)
            raw = pressure ** p["elasticity"]
            return (min(p["maxStretch"], raw), raw)
        if sigma1d > 0:
            return compute_axis_stretch(values, domain, base_dim, sigma1d)
        return (1.0, 1.0)

    sigma_raw_x = p.get("markCrossSectionX") if p.get("markCrossSectionX") is not None else p["markCrossSection"]
    sigma_raw_y = p.get("markCrossSectionY") if p.get("markCrossSectionY") is not None else p["markCrossSection"]

    stretch_x, raw_x = compute_stretch_for_axis(
        x_values, x_domain, canvas_width, sigma1d_x, sigma_raw_x, p.get("xItemCountOverride"),
    )
    stretch_y, raw_y = compute_stretch_for_axis(
        y_values, y_domain, canvas_height, sigma1d_y, sigma_raw_y, p.get("yItemCountOverride"),
    )

    return {"stretchX": stretch_x, "stretchY": stretch_y, "rawStretchX": raw_x, "rawStretchY": raw_y}


# ---------------------------------------------------------------------------
# Elastic budget
# ---------------------------------------------------------------------------

def compute_elastic_budget(item_count: int, base_dimension: float, params: dict[str, Any]) -> dict[str, float]:
    if item_count <= 0:
        return {"budget": base_dimension, "stretchFactor": 1.0}
    pressure = (item_count * params["defaultStepSize"]) / base_dimension
    if pressure <= 1:
        return {"budget": base_dimension, "stretchFactor": 1.0}
    stretch_factor = min(params["maxStretch"], pressure ** params["elasticity"])
    return {"budget": base_dimension * stretch_factor, "stretchFactor": stretch_factor}


def compute_axis_step(
    nominal_count: int, continuous_count: int, base_dimension: float, params: dict[str, Any],
) -> dict[str, Any]:
    if nominal_count > 0:
        b = compute_elastic_budget(nominal_count, base_dimension, params)
        return {"step": math.floor(b["budget"] / nominal_count), "budget": b["budget"], "itemCount": nominal_count}
    if continuous_count > 0:
        b = compute_elastic_budget(continuous_count, base_dimension, params)
        return {"step": math.floor(b["budget"] / continuous_count), "budget": b["budget"], "itemCount": continuous_count}
    return {"step": params["defaultStepSize"], "budget": base_dimension, "itemCount": 0}


# ---------------------------------------------------------------------------
# Facet layout
# ---------------------------------------------------------------------------

def compute_facet_layout(
    facet_cols: int, facet_rows: int,
    base_width: float, base_height: float,
    params: dict[str, Any],
) -> dict[str, Any]:
    min_continuous = params["minSubplotSize"]
    if facet_cols > 1:
        stretch = min(params["maxStretch"], facet_cols ** params["facetElasticity"])
        subplot_width = js_round(max(min_continuous, base_width * stretch / facet_cols))
    else:
        subplot_width = base_width
    if facet_rows > 1:
        stretch = min(params["maxStretch"], facet_rows ** params["facetElasticity"])
        subplot_height = js_round(max(min_continuous, base_height * stretch / facet_rows))
    else:
        subplot_height = base_height
    return {"columns": facet_cols, "rows": facet_rows, "subplotWidth": subplot_width, "subplotHeight": subplot_height}


# ---------------------------------------------------------------------------
# Label sizing
# ---------------------------------------------------------------------------

def compute_label_sizing(effective_step: float, has_discrete_items: bool) -> dict[str, Any]:
    default_font_size = 10
    default_limit = 100
    if not has_discrete_items:
        return {"fontSize": default_font_size, "labelLimit": default_limit}

    font_size = max(6, min(10, effective_step - 1))
    label_limit = max(30, min(100, effective_step * 8))
    label_angle: Optional[float] = None
    label_align: Optional[str] = None
    label_baseline: Optional[str] = None

    if effective_step < 10:
        label_angle = -90
        font_size = max(6, min(8, effective_step))
        label_limit = 40
        label_align = "right"
        label_baseline = "middle"
    elif effective_step < 16:
        label_angle = -45
        font_size = max(7, min(9, effective_step))
        label_limit = 60
        label_align = "right"
        label_baseline = "top"

    out: dict[str, Any] = {"fontSize": font_size, "labelLimit": label_limit}
    if label_angle is not None:
        out["labelAngle"] = label_angle
    if label_align is not None:
        out["labelAlign"] = label_align
    if label_baseline is not None:
        out["labelBaseline"] = label_baseline
    return out


# ---------------------------------------------------------------------------
# Overflow
# ---------------------------------------------------------------------------

def compute_overflow(unique_count: int, max_dimension: float, min_step_size: float) -> dict[str, Any]:
    max_to_keep = math.floor(max_dimension / min_step_size)
    overflowed = unique_count > max_to_keep
    return {
        "overflowed": overflowed,
        "maxToKeep": max_to_keep,
        "omittedCount": (unique_count - max_to_keep) if overflowed else 0,
    }


# ---------------------------------------------------------------------------
# Circumference pressure (radial charts)
# ---------------------------------------------------------------------------

def compute_circumference_pressure(
    effective_item_count: float,
    canvas_size: dict[str, float],
    params: Optional[dict[str, Any]] = None,
) -> dict[str, float]:
    p = params or {}
    min_arc_px = p.get("minArcPx", 45)
    min_radius = p.get("minRadius", 60)
    max_radius = p.get("maxRadius", 400)
    elasticity = p.get("elasticity", 0.5)
    max_stretch = p.get("maxStretch", 2.0)
    max_stretch_x = p.get("maxStretchX")
    max_stretch_y = p.get("maxStretchY")
    max_stretch_x = max(1, max_stretch if max_stretch_x is None else max_stretch_x)
    max_stretch_y = max(1, max_stretch if max_stretch_y is None else max_stretch_y)
    margin = p.get("margin", 20)

    base_w = canvas_size["width"]
    base_h = canvas_size["height"]

    base_radius = max(min_radius, (min(base_w, base_h) / 2) - margin)
    max_canvas_w = base_w * max_stretch_x
    max_canvas_h = base_h * max_stretch_y
    max_diameter = min(max_canvas_w, max_canvas_h)
    effective_max_radius = min(max_radius, (max_diameter - 2 * margin) / 2)
    effective_max_stretch = max(1, effective_max_radius / base_radius)

    base_circumference = 2 * math.pi * base_radius
    pressure = (effective_item_count * min_arc_px) / base_circumference

    if pressure <= 1:
        radius = base_radius
    else:
        stretch = min(effective_max_stretch, pressure ** elasticity)
        radius = js_round(base_radius * stretch)

    radius = min(max_radius, max(min_radius, radius))
    diameter = 2 * radius + 2 * margin
    canvas_w = max(base_w, diameter)
    canvas_h = max(base_h, diameter)

    return {"radius": radius, "canvasW": canvas_w, "canvasH": canvas_h}


def compute_effective_bar_count(values: list[float]) -> float:
    if len(values) == 0:
        return 0
    positive_values = [v for v in values if v > 0]
    if not positive_values:
        return len(values)
    total = sum(positive_values)
    min_val = min(positive_values)
    effective = total / min_val
    return min(100, effective)
