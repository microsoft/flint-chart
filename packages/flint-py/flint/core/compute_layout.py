"""Port of src/lib/agents-chart/core/compute-layout.ts."""

from __future__ import annotations

import math
import re
from datetime import datetime, timezone
from typing import Any, Optional

from .decisions import (
    DEFAULT_GAS_PRESSURE_PARAMS,
    compute_axis_step,
    compute_gas_pressure,
    compute_label_sizing,
)
from . import js_round


DEFAULT_MIN_STEP = 8
VL_SHORT_DISCRETE_CATEGORY_COUNT = 4
VL_SHORT_DISCRETE_LABEL_MAX_LEN = 8

# Approximate width (px) of one label character at the given font size.
APPROX_CHAR_WIDTH_RATIO = 0.62


def _is_finite_number(s: str) -> bool:
    """Mirror JS isFinite(Number(s)) for a label string."""
    try:
        return math.isfinite(float(s))
    except (ValueError, TypeError):
        return False


def _compute_discrete_label_stats(
    field: Optional[str], table: list[dict[str, Any]],
) -> Optional[dict[str, Any]]:
    """Distinct label strings for a discrete axis field, plus derived stats.

    Returns None when the field is missing or has no labels. ``allNumeric`` is
    True when every label parses as a finite number (e.g. years, bins, IDs).
    """
    if not field:
        return None
    uniques: set[str] = set()
    for row in table:
        v = row.get(field)
        if v is None or v == "":
            continue
        uniques.add(str(v))
    if not uniques:
        return None
    labels = list(uniques)
    return {
        "count": len(labels),
        "maxLen": max(len(s) for s in labels),
        "allNumeric": all(s.strip() != "" and _is_finite_number(s) for s in labels),
    }


def _discrete_y_axis_should_use_horizontal_labels(
    field: Optional[str], channel_type: Optional[str], table: list[dict[str, Any]],
) -> bool:
    """Few, short category strings -> keep Y axis labels horizontal.

    Banded Y labels read horizontally in the left margin regardless of band
    height (so quantitative/numeric labels stay horizontal).
    """
    if not field:
        return False
    if channel_type == "quantitative":
        return True
    stats = _compute_discrete_label_stats(field, table)
    if stats is None:
        return False
    if stats["count"] > VL_SHORT_DISCRETE_CATEGORY_COUNT:
        return False
    return stats["maxLen"] <= VL_SHORT_DISCRETE_LABEL_MAX_LEN


def _js_to_number(v: Any) -> float:
    """Mirror JS +v coercion. Returns NaN for unparseable strings."""
    if v is None:
        return 0.0  # +null = 0
    if isinstance(v, bool):
        return 1.0 if v else 0.0
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        s = v.strip()
        if s == "":
            return 0.0
        try:
            return float(s)
        except ValueError:
            return float("nan")
    return float("nan")


def _js_to_date_number(v: Any) -> float:
    """Mirror JS ``+new Date(v)``. Returns NaN if unparseable."""
    from .js_date import js_date_parse_ms
    ms = js_date_parse_ms(v)
    return float("nan") if ms is None else ms


def _is_nan(v: float) -> bool:
    return isinstance(v, float) and math.isnan(v)


# ---------------------------------------------------------------------------
# Stretch caps (per-dimension)
# ---------------------------------------------------------------------------

DEFAULT_BASE_SIZE = {"width": 400, "height": 320}


def resolve_base_size(
    spec_base_size: Optional[dict[str, float]],
    ceiling: Optional[dict[str, float]],
) -> dict[str, float]:
    """Resolve the effective base (target) size the layout pipeline aims for.

    Defaults to ``DEFAULT_BASE_SIZE`` when the spec omits ``baseSize``, then
    clamps each dimension to the optional ``canvasSize`` ceiling so the target
    never exceeds the hard maximum: a smaller ``canvasSize`` (or a ``baseSize``
    larger than the ceiling) shrinks the chart to fit instead of overflowing.
    After clamping, ``derive_stretch_caps`` yields betaX/betaY = 1 in any
    clamped dimension. Mirrors JS ``resolveBaseSize``.
    """
    base = spec_base_size or {**DEFAULT_BASE_SIZE}
    if not ceiling:
        return {"width": base["width"], "height": base["height"]}
    return {
        "width": min(base["width"], ceiling["width"]),
        "height": min(base["height"], ceiling["height"]),
    }


def resolve_stretch_caps(options: dict[str, Any]) -> tuple[float, float]:
    """Resolve per-dimension stretch caps (betaX, betaY).

    Falls back to ``maxStretch`` (default 2) when an explicit per-dimension cap
    is absent; each cap is clamped to >= 1. Mirrors JS ``resolveStretchCaps``.
    """
    default = options.get("maxStretch", 2)
    if default is None:
        default = 2
    x = options.get("maxStretchX")
    y = options.get("maxStretchY")
    x = default if x is None else x
    y = default if y is None else y
    return (max(1, x), max(1, y))


def derive_stretch_caps(
    base_size: dict[str, float],
    ceiling: Optional[dict[str, float]],
    options: dict[str, Any],
) -> dict[str, float]:
    """Derive per-dimension stretch ceilings (betaX, betaY) for an assembler.

    When an explicit ``ceiling`` (hard canvas limit) is given, the caps are the
    ratio of ceiling to base size (clamped to >= 1). Otherwise both caps fall
    back to ``maxStretch`` (default 2). Mirrors JS ``deriveStretchCaps``.
    """
    default = options.get("maxStretch", 2)
    if default is None:
        default = 2
    if ceiling:
        return {
            "maxStretchX": max(1, ceiling["width"] / base_size["width"]),
            "maxStretchY": max(1, ceiling["height"] / base_size["height"]),
        }
    return {"maxStretchX": default, "maxStretchY": default}


# ---------------------------------------------------------------------------
# Public API: compute_layout
# ---------------------------------------------------------------------------

def compute_layout(
    channel_semantics: dict[str, dict[str, Any]],
    declaration: dict[str, Any],
    table: list[dict[str, Any]],
    canvas_size: dict[str, float],
    options: Optional[dict[str, Any]] = None,
    facet_grid: Optional[dict[str, int]] = None,
) -> dict[str, Any]:
    options = options or {}
    elasticity_val = options.get("elasticity", 0.5)
    max_stretch_x, max_stretch_y = resolve_stretch_caps(options)
    facet_elasticity_val = options.get("facetElasticity", 0.3)
    min_step_val = options.get("minStep", DEFAULT_MIN_STEP)
    min_subplot_val = options.get("minSubplotSize", 60)
    step_padding_val = options.get("stepPadding", 0.1)
    maintain_continuous_axis_ratio = options.get("maintainContinuousAxisRatio", False)
    continuous_mark_cross_section = options.get("continuousMarkCrossSection")
    facet_aspect_ratio_resistance = options.get("facetAspectRatioResistance", 0)

    default_chart_width = canvas_size["width"]
    default_chart_height = canvas_size["height"]

    facet_fixed_padding = options.get("facetFixedPadding") or {}
    fix_w = facet_fixed_padding.get("width", 0)
    fix_h = facet_fixed_padding.get("height", 0)
    gap = options.get("facetGap", 0)

    base_ref_size = 300
    size_ratio = max(default_chart_width, default_chart_height) / base_ref_size
    base_band_size = options.get("defaultBandSize", 20)
    default_step_size = js_round(base_band_size * max(1, size_ratio))

    def is_discrete_type(t: Optional[str]) -> bool:
        return t == "nominal" or t == "ordinal"

    effective_types: dict[str, str] = {}
    for ch, cs in channel_semantics.items():
        resolved = (declaration.get("resolvedTypes") or {}).get(ch)
        effective_types[ch] = resolved or cs.get("type")

    axis_flags = declaration.get("axisFlags") or {}
    x_banded = (axis_flags.get("x") or {}).get("banded", False)
    y_banded = (axis_flags.get("y") or {}).get("banded", False)

    nominal_count: dict[str, int] = {"x": 0, "y": 0, "column": 0, "row": 0, "group": 0}

    for channel in ["x", "y", "column", "row", "color"]:
        cs = channel_semantics.get(channel)
        if not cs or not cs.get("field"):
            continue
        effective_type = effective_types.get(channel) or cs.get("type")
        if not is_discrete_type(effective_type):
            continue
        unique_values = list(dict.fromkeys(r.get(cs["field"]) for r in table))
        nominal_count[channel] = len(unique_values)

    group_field = (channel_semantics.get("group") or {}).get("field")
    group_axis: Optional[str] = None
    if group_field:
        nominal_count["group"] = len({r.get(group_field) for r in table})
        x_type = effective_types.get("x") or (channel_semantics.get("x") or {}).get("type")
        y_type = effective_types.get("y") or (channel_semantics.get("y") or {}).get("type")
        if is_discrete_type(x_type):
            group_axis = "x"
        elif is_discrete_type(y_type):
            group_axis = "y"

    x_group_multiplier = nominal_count["group"] if (group_axis == "x" and nominal_count["group"] > 1) else 1
    y_group_multiplier = nominal_count["group"] if (group_axis == "y" and nominal_count["group"] > 1) else 1
    x_total_nominal_count = nominal_count["x"] * x_group_multiplier
    y_total_nominal_count = nominal_count["y"] * y_group_multiplier

    MIN_GROUP_GAP_PX = 3
    x_min_group_step = max(math.ceil(MIN_GROUP_GAP_PX / step_padding_val), 2 * x_group_multiplier) if x_group_multiplier > 1 else min_step_val
    y_min_group_step = max(math.ceil(MIN_GROUP_GAP_PX / step_padding_val), 2 * y_group_multiplier) if y_group_multiplier > 1 else min_step_val

    x_continuous_as_discrete = 0
    y_continuous_as_discrete = 0
    for axis in ["x", "y"]:
        cs = channel_semantics.get(axis)
        if not cs or not cs.get("field"):
            continue
        effective_type = effective_types.get(axis) or cs.get("type")
        if is_discrete_type(effective_type):
            continue
        is_banded = (x_banded if axis == "x" else y_banded)
        is_binned = (declaration.get("binnedAxes") or {}).get(axis)
        if not is_banded and not is_binned:
            continue
        if is_binned:
            bin_def = (declaration.get("binnedAxes") or {})[axis]
            if isinstance(bin_def, dict) and bin_def.get("maxbins"):
                count = bin_def["maxbins"]
            else:
                count = 10
        else:
            count = len({r.get(cs["field"]) for r in table})
        if count <= 1:
            continue
        if axis == "x":
            x_continuous_as_discrete = count
        else:
            y_continuous_as_discrete = count

    # Facet grid
    facet_cols = 1
    facet_rows = 1
    if facet_grid:
        facet_cols = facet_grid["columns"]
        facet_rows = facet_grid["rows"]
    else:
        if nominal_count["column"] > 0:
            facet_cols = nominal_count["column"]
        if nominal_count["row"] > 0:
            facet_rows = nominal_count["row"]

    # Log boost
    LOG_PX_PER_DECADE = 40
    log_boost_x = 0
    log_boost_y = 0
    for axis in ["x", "y"]:
        cs = channel_semantics.get(axis)
        if not cs or not cs.get("field") or not cs.get("scaleType"):
            continue
        if cs["scaleType"] not in ("log", "symlog"):
            continue
        vals = [
            r.get(cs["field"]) for r in table
            if isinstance(r.get(cs["field"]), (int, float))
            and not isinstance(r.get(cs["field"]), bool)
            and r.get(cs["field"]) > 0 and math.isfinite(r.get(cs["field"]))
        ]
        if len(vals) < 2:
            continue
        decades = math.log10(max(vals)) - math.log10(min(vals))
        needed = math.ceil(max(1, decades)) * LOG_PX_PER_DECADE
        if axis == "x":
            log_boost_x = needed
        else:
            log_boost_y = needed

    min_continuous_size = max(10, min_step_val)
    min_continuous_size_x = max(min_continuous_size, log_boost_x)
    min_continuous_size_y = max(min_continuous_size, log_boost_y)

    if facet_cols > 1:
        stretch = min(max_stretch_x, facet_cols ** facet_elasticity_val)
        subplot_width = js_round(max(min_continuous_size_x,
            (default_chart_width * stretch - fix_w) / facet_cols - gap))
    else:
        subplot_width = default_chart_width

    if facet_rows > 1:
        stretch = min(max_stretch_y, facet_rows ** facet_elasticity_val)
        subplot_height = js_round(max(min_continuous_size_y,
            (default_chart_height * stretch - fix_h) / facet_rows - gap))
    else:
        subplot_height = default_chart_height

    # Facet aspect-ratio resistance
    x_is_continuous_non_banded = x_total_nominal_count == 0 and x_continuous_as_discrete == 0
    y_is_continuous_non_banded = y_total_nominal_count == 0 and y_continuous_as_discrete == 0
    both_continuous_non_banded = x_is_continuous_non_banded and y_is_continuous_non_banded

    if facet_aspect_ratio_resistance > 0 and not both_continuous_non_banded \
            and (facet_cols > 1 or facet_rows > 1):
        base_ar = default_chart_width / default_chart_height
        facet_ar = subplot_width / subplot_height
        ar_drift = facet_ar / base_ar
        if ar_drift < 1:
            subplot_height = js_round(max(min_continuous_size_y, subplot_height * (ar_drift ** facet_aspect_ratio_resistance)))
        elif ar_drift > 1:
            subplot_width = js_round(max(min_continuous_size_x, subplot_width * ((1 / ar_drift) ** facet_aspect_ratio_resistance)))

    # Gas pressure for both continuous non-banded
    if both_continuous_non_banded:
        x_cs = channel_semantics.get("x")
        y_cs = channel_semantics.get("y")
        if x_cs and x_cs.get("field") and y_cs and y_cs.get("field"):
            is_temp_x = (effective_types.get("x") or x_cs.get("type")) == "temporal"
            is_temp_y = (effective_types.get("y") or y_cs.get("type")) == "temporal"
            x_numeric: list[float] = []
            y_numeric: list[float] = []
            for row in table:
                xv = row.get(x_cs["field"])
                yv = row.get(y_cs["field"])
                if xv is None or yv is None:
                    continue
                xv2 = _js_to_date_number(xv) if is_temp_x else _js_to_number(xv)
                yv2 = _js_to_date_number(yv) if is_temp_y else _js_to_number(yv)
                if _is_nan(xv2) or _is_nan(yv2):
                    continue
                x_numeric.append(xv2)
                y_numeric.append(yv2)

            if len(x_numeric) > 1:
                x_min = min(x_numeric); x_max = max(x_numeric)
                y_min = min(y_numeric); y_max = max(y_numeric)

                x_domain = [x_min, x_max]
                y_domain = [y_min, y_max]
                if (x_cs.get("zero") or {}).get("zero"):
                    if x_domain[0] > 0:
                        x_domain[0] = 0
                    if x_domain[1] < 0:
                        x_domain[1] = 0
                if (y_cs.get("zero") or {}).get("zero"):
                    if y_domain[0] > 0:
                        y_domain[0] = 0
                    if y_domain[1] < 0:
                        y_domain[1] = 0

                x_data_coverage = (x_max - x_min) / (x_domain[1] - x_domain[0]) if (x_domain[1] - x_domain[0]) > 0 else 1
                y_data_coverage = (y_max - y_min) / (y_domain[1] - y_domain[0]) if (y_domain[1] - y_domain[0]) > 0 else 1
                BANKING_COVERAGE_THRESHOLD = 0.2

                gas_pressure_params = dict(DEFAULT_GAS_PRESSURE_PARAMS)
                if continuous_mark_cross_section is not None:
                    if isinstance(continuous_mark_cross_section, (int, float)):
                        gas_pressure_params = {**DEFAULT_GAS_PRESSURE_PARAMS, "markCrossSection": continuous_mark_cross_section}
                    else:
                        max_cs = max(continuous_mark_cross_section["x"], continuous_mark_cross_section["y"])
                        gas_pressure_params = {
                            **DEFAULT_GAS_PRESSURE_PARAMS,
                            "markCrossSection": max_cs,
                            "markCrossSectionX": continuous_mark_cross_section["x"],
                            "markCrossSectionY": continuous_mark_cross_section["y"],
                        }
                        if continuous_mark_cross_section.get("elasticity") is not None:
                            gas_pressure_params["elasticity"] = continuous_mark_cross_section["elasticity"]
                        if continuous_mark_cross_section.get("maxStretch") is not None:
                            gas_pressure_params["maxStretch"] = continuous_mark_cross_section["maxStretch"]
                        if continuous_mark_cross_section.get("seriesCountAxis"):
                            resolved_axis = "y" if continuous_mark_cross_section["seriesCountAxis"] == "auto" else continuous_mark_cross_section["seriesCountAxis"]
                            n_series = count_distinct_series(channel_semantics, table)
                            if resolved_axis == "y":
                                gas_pressure_params["yItemCountOverride"] = n_series
                            else:
                                gas_pressure_params["xItemCountOverride"] = n_series

                if facet_cols > 1:
                    per_subplot_canvas_w = max(min_continuous_size_x,
                        (default_chart_width * min(max_stretch_x, facet_cols ** facet_elasticity_val) - fix_w) / facet_cols - gap)
                else:
                    per_subplot_canvas_w = default_chart_width
                if facet_rows > 1:
                    per_subplot_canvas_h = max(min_continuous_size_y,
                        (default_chart_height * min(max_stretch_y, facet_rows ** facet_elasticity_val) - fix_h) / facet_rows - gap)
                else:
                    per_subplot_canvas_h = default_chart_height

                ideal_result = compute_gas_pressure(
                    x_numeric, y_numeric, x_domain, y_domain,
                    per_subplot_canvas_w, per_subplot_canvas_h, gas_pressure_params,
                )

                is_connected = isinstance(continuous_mark_cross_section, dict) and bool(continuous_mark_cross_section.get("seriesCountAxis"))
                use_banking = x_data_coverage >= BANKING_COVERAGE_THRESHOLD and y_data_coverage >= BANKING_COVERAGE_THRESHOLD

                raw_w = per_subplot_canvas_w * ideal_result["rawStretchX"]
                raw_h = per_subplot_canvas_h * ideal_result["rawStretchY"]

                if use_banking:
                    series_fields: list[str] = []
                    color_field = (channel_semantics.get("color") or {}).get("field")
                    detail_field = (channel_semantics.get("detail") or {}).get("field")
                    if color_field:
                        series_fields.append(color_field)
                    if detail_field and detail_field != color_field:
                        series_fields.append(detail_field)

                    per_point_series_keys: list[str] = [""] * len(x_numeric)
                    if series_fields:
                        idx = 0
                        for row in table:
                            xv = row.get(x_cs["field"]) if x_cs.get("field") else None
                            yv = row.get(y_cs["field"]) if y_cs.get("field") else None
                            if xv is None or yv is None:
                                continue
                            xn = _js_to_date_number(xv) if is_temp_x else _js_to_number(xv)
                            yn = _js_to_date_number(yv) if is_temp_y else _js_to_number(yv)
                            if _is_nan(xn) or _is_nan(yn):
                                continue
                            per_point_series_keys[idx] = "\x00".join(
                                str(row.get(f) if row.get(f) is not None else "") for f in series_fields
                            )
                            idx += 1

                    banking_ar = compute_banking_ar(
                        x_numeric, y_numeric, x_domain, y_domain,
                        per_point_series_keys, is_connected,
                    )

                    BANKING_BLEND = 0.5
                    gas_ar = raw_w / raw_h
                    if gas_ar > 0 and banking_ar > 0:
                        blended_ar = math.exp((1 - BANKING_BLEND) * math.log(gas_ar) + BANKING_BLEND * math.log(banking_ar))
                    else:
                        blended_ar = banking_ar

                    raw_area = raw_w * raw_h
                    max_area = per_subplot_canvas_w * per_subplot_canvas_h * max(max_stretch_x, max_stretch_y)
                    area = min(raw_area, max_area)

                    ideal_w = math.sqrt(area * blended_ar)
                    ideal_h = math.sqrt(area / blended_ar)
                else:
                    ideal_w = raw_w
                    ideal_h = raw_h

                if facet_cols > 1:
                    avail_w = max(min_continuous_size_x, (default_chart_width * max_stretch_x - fix_w) / facet_cols - gap)
                else:
                    avail_w = default_chart_width * max_stretch_x
                if facet_rows > 1:
                    avail_h = max(min_continuous_size_y, (default_chart_height * max_stretch_y - fix_h) / facet_rows - gap)
                else:
                    avail_h = default_chart_height * max_stretch_y

                scale_x = avail_w / ideal_w if ideal_w > avail_w else 1
                scale_y = avail_h / ideal_h if ideal_h > avail_h else 1
                fit_scale = min(scale_x, scale_y)

                final_w = ideal_w * fit_scale
                final_h = ideal_h * fit_scale

                final_w = max(final_w, min_continuous_size_x)
                final_h = max(final_h, min_continuous_size_y)

                subplot_width = js_round(final_w)
                subplot_height = js_round(final_h)

    elif x_is_continuous_non_banded or y_is_continuous_non_banded:
        cont_axis = "x" if x_is_continuous_non_banded else "y"
        other_axis_has_discrete = (
            (y_total_nominal_count > 0 or y_continuous_as_discrete > 0)
            if cont_axis == "x"
            else (x_total_nominal_count > 0 or x_continuous_as_discrete > 0)
        )

        series_stretch_applied = False
        if isinstance(continuous_mark_cross_section, dict) and continuous_mark_cross_section.get("seriesCountAxis"):
            resolved_axis = cont_axis if continuous_mark_cross_section["seriesCountAxis"] == "auto" else continuous_mark_cross_section["seriesCountAxis"]
            if resolved_axis == cont_axis:
                sigma_per_series = continuous_mark_cross_section["x"] if cont_axis == "x" else continuous_mark_cross_section["y"]
                base_dim = subplot_width if cont_axis == "x" else subplot_height
                n_series = count_distinct_series(channel_semantics, table)
                pressure = (n_series * sigma_per_series) / base_dim
                elast = continuous_mark_cross_section.get("elasticity", DEFAULT_GAS_PRESSURE_PARAMS["elasticity"])
                max_s = continuous_mark_cross_section.get("maxStretch", DEFAULT_GAS_PRESSURE_PARAMS["maxStretch"])
                if pressure > 1:
                    stretch = min(max_s, pressure ** elast)
                    if cont_axis == "x":
                        subplot_width = js_round(subplot_width * stretch)
                    else:
                        subplot_height = js_round(subplot_height * stretch)
                series_stretch_applied = True

        if not series_stretch_applied and not other_axis_has_discrete:
            cont_cs = channel_semantics.get(cont_axis)
            if cont_cs and cont_cs.get("field"):
                is_temporal = (effective_types.get(cont_axis) or cont_cs.get("type")) == "temporal"
                cont_values: list[float] = []
                for row in table:
                    v = row.get(cont_cs["field"])
                    if v is None:
                        continue
                    v = _js_to_date_number(v) if is_temporal else _js_to_number(v)
                    if not _is_nan(v):
                        cont_values.append(v)
                sigma1d = math.sqrt(DEFAULT_GAS_PRESSURE_PARAMS["markCrossSection"])
                base_dim = subplot_width if cont_axis == "x" else subplot_height
                pressure1d = (len(cont_values) * sigma1d) / base_dim
                if pressure1d > 1:
                    stretch1d = min(DEFAULT_GAS_PRESSURE_PARAMS["maxStretch"], pressure1d ** DEFAULT_GAS_PRESSURE_PARAMS["elasticity"])
                    if cont_axis == "x":
                        subplot_width = js_round(subplot_width * stretch1d)
                    else:
                        subplot_height = js_round(subplot_height * stretch1d)

    # Elastic stretch for discrete axes
    elastic_params_x = {
        "elasticity": elasticity_val,
        "maxStretch": max_stretch_x,
        "defaultStepSize": default_step_size,
        "minStep": min_step_val,
    }
    elastic_params_y = {
        "elasticity": elasticity_val,
        "maxStretch": max_stretch_y,
        "defaultStepSize": default_step_size,
        "minStep": min_step_val,
    }
    x_axis = compute_axis_step(x_total_nominal_count, x_continuous_as_discrete, subplot_width, elastic_params_x)
    y_axis = compute_axis_step(y_total_nominal_count, y_continuous_as_discrete, subplot_height, elastic_params_y)

    x_is_discrete = x_total_nominal_count > 0
    y_is_discrete = y_total_nominal_count > 0
    x_has_grouping = group_axis == "x" and nominal_count["group"] > 0
    y_has_grouping = group_axis == "y" and nominal_count["group"] > 0

    x_step_unit: Optional[str] = None
    y_step_unit: Optional[str] = None

    if x_is_discrete and x_has_grouping:
        items_per_group = nominal_count["group"]
        default_group_step = items_per_group * default_step_size
        min_group_step = max(math.ceil(MIN_GROUP_GAP_PX / step_padding_val), 2 * items_per_group)
        group_axis_step = compute_axis_step(nominal_count["x"], 0, subplot_width, elastic_params_x)
        x_step_size = max(min_group_step, min(default_group_step, group_axis_step["step"]))
        x_step_unit = "group"
    elif x_is_discrete:
        x_step_size = max(min_step_val, min(default_step_size, x_axis["step"]))
    elif x_continuous_as_discrete > 0:
        x_step_size = max(min_step_val, min(default_step_size, x_axis["step"]))
    else:
        x_step_size = default_step_size

    if y_is_discrete and y_has_grouping:
        items_per_group = nominal_count["group"]
        default_group_step = items_per_group * default_step_size
        min_group_step = max(math.ceil(MIN_GROUP_GAP_PX / step_padding_val), 2 * items_per_group)
        group_axis_step = compute_axis_step(nominal_count["y"], 0, subplot_height, elastic_params_y)
        y_step_size = max(min_group_step, min(default_group_step, group_axis_step["step"]))
        y_step_unit = "group"
    elif y_is_discrete:
        y_step_size = max(min_step_val, min(default_step_size, y_axis["step"]))
    elif y_continuous_as_discrete > 0:
        y_step_size = max(min_step_val, min(default_step_size, y_axis["step"]))
    else:
        y_step_size = default_step_size

    # Banded continuous canvas size
    for axis in ["x", "y"]:
        count = x_continuous_as_discrete if axis == "x" else y_continuous_as_discrete
        if count <= 0:
            continue
        step_size = x_step_size if axis == "x" else y_step_size
        continuous_size = js_round(step_size * (count + 1))
        if axis == "x":
            subplot_width = continuous_size
        else:
            subplot_height = continuous_size

    # Unified stretch budget
    max_subplot_w = (default_chart_width * max_stretch_x - fix_w) / facet_cols - gap
    max_subplot_h = (default_chart_height * max_stretch_y - fix_h) / facet_rows - gap

    if x_total_nominal_count > 0:
        divisor = nominal_count["x"] if x_step_unit == "group" else x_total_nominal_count
        cap = max(min_step_val, math.floor(max_subplot_w / divisor))
        if x_step_size > cap:
            x_step_size = cap
    if x_continuous_as_discrete > 0:
        cap = max(min_step_val, math.floor(max_subplot_w / (x_continuous_as_discrete + 1)))
        if x_step_size > cap:
            x_step_size = cap
    if y_total_nominal_count > 0:
        divisor = nominal_count["y"] if y_step_unit == "group" else y_total_nominal_count
        cap = max(min_step_val, math.floor(max_subplot_h / divisor))
        if y_step_size > cap:
            y_step_size = cap
    if y_continuous_as_discrete > 0:
        cap = max(min_step_val, math.floor(max_subplot_h / (y_continuous_as_discrete + 1)))
        if y_step_size > cap:
            y_step_size = cap

    for axis in ["x", "y"]:
        count = x_continuous_as_discrete if axis == "x" else y_continuous_as_discrete
        if count <= 0:
            continue
        step_size = x_step_size if axis == "x" else y_step_size
        if axis == "x":
            subplot_width = js_round(step_size * (count + 1))
        else:
            subplot_height = js_round(step_size * (count + 1))

    # Clamp continuous subplot dimensions
    subplot_width = min(subplot_width, js_round(max_subplot_w))
    subplot_height = min(subplot_height, js_round(max_subplot_h))

    # Band AR blending
    target_band_ar = options.get("targetBandAR")
    if target_band_ar and target_band_ar > 0:
        x_is_banded_eff = x_total_nominal_count > 0 or x_continuous_as_discrete > 0
        y_is_banded_eff = y_total_nominal_count > 0 or y_continuous_as_discrete > 0
        if x_is_banded_eff and not y_is_banded_eff:
            actual_band_ar = subplot_height / x_step_size
            if actual_band_ar > target_band_ar:
                ideal_h = x_step_size * target_band_ar
                blended_h = math.exp(0.5 * math.log(subplot_height) + 0.5 * math.log(ideal_h))
                subplot_height = js_round(max(min_continuous_size_y, min(blended_h, subplot_height)))
        elif y_is_banded_eff and not x_is_banded_eff:
            actual_band_ar = subplot_width / y_step_size
            if actual_band_ar > target_band_ar:
                ideal_w = y_step_size * target_band_ar
                blended_w = math.exp(0.5 * math.log(subplot_width) + 0.5 * math.log(ideal_w))
                subplot_width = js_round(max(min_continuous_size_x, min(blended_w, subplot_width)))

    # Label sizing
    x_has_discrete_items = x_total_nominal_count > 0
    y_has_discrete_items = y_total_nominal_count > 0
    x_label = compute_label_sizing(x_step_size, x_has_discrete_items)
    y_label = compute_label_sizing(y_step_size, y_has_discrete_items)

    if x_has_discrete_items:
        xf = (channel_semantics.get("x") or {}).get("field")
        xt = effective_types.get("x") or (channel_semantics.get("x") or {}).get("type")
        stats = _compute_discrete_label_stats(xf, table)
        if stats is not None:
            # Numeric-like labels (declared quantitative, or all values parse as
            # numbers - years, bins, IDs) compete for the band's width when laid
            # out horizontally. A continuous field split into many narrow bands
            # yields many/wide numbers that crowd. Decide horizontal vs. angled
            # by whether the widest label fits within one band.
            numeric_like = xt == "quantitative" or stats["allNumeric"]
            label_px = stats["maxLen"] * x_label["fontSize"] * APPROX_CHAR_WIDTH_RATIO
            few_short_strings = (
                not numeric_like
                and stats["count"] <= VL_SHORT_DISCRETE_CATEGORY_COUNT
                and stats["maxLen"] <= VL_SHORT_DISCRETE_LABEL_MAX_LEN
            )
            if few_short_strings or (numeric_like and label_px <= x_step_size):
                # We want horizontal labels here. But a small number of short
                # string categories can still collide when the band step is
                # narrower than the widest label (e.g. box marks declare a tiny
                # defaultBandSize). Before committing to horizontal, make sure
                # the label actually fits - widen the band within the stretch
                # budget if it can, otherwise angle the labels instead of
                # letting them overlap. (x_step_size is the per-label band width:
                # the item step when ungrouped, the group step when grouped.)
                if label_px > x_step_size:
                    desired_step = math.ceil(label_px) + 6  # label width + inter-label gap
                    cap = max(min_step_val, math.floor(max_subplot_w / stats["count"]))
                    if desired_step <= cap:
                        x_step_size = max(x_step_size, desired_step)
                        x_label = compute_label_sizing(x_step_size, x_has_discrete_items)
                        label_px = stats["maxLen"] * x_label["fontSize"] * APPROX_CHAR_WIDTH_RATIO

                if label_px <= x_step_size:
                    # Fits horizontally (already, or after widening the band).
                    # Must be explicit: omitting labelAngle leaves VL defaults (e.g. -45 on ordinal).
                    x_label = {**x_label, "labelAngle": 0, "labelAlign": "center", "labelBaseline": "top"}
                else:
                    # Even the stretch budget can't fit a wide-enough band ->
                    # angle the labels rather than let them run together.
                    x_label = {**x_label, "labelAngle": -45, "labelAlign": "right", "labelBaseline": "top"}
            elif numeric_like and label_px > x_step_size and x_label.get("labelAngle") is None:
                # Numeric labels that don't fit horizontally and weren't already
                # rotated by step-based sizing (which only rotates at narrow
                # steps). Without this, VL keeps them horizontal and the numbers
                # overlap. Rotate to -45.
                x_label = {**x_label, "labelAngle": -45, "labelAlign": "right", "labelBaseline": "top"}
    if y_has_discrete_items:
        yf = (channel_semantics.get("y") or {}).get("field")
        yt = effective_types.get("y") or (channel_semantics.get("y") or {}).get("type")
        if _discrete_y_axis_should_use_horizontal_labels(yf, yt, table):
            y_label = {**y_label, "labelAngle": 0, "labelAlign": "right", "labelBaseline": "middle"}

    result: dict[str, Any] = {
        "subplotWidth": subplot_width,
        "subplotHeight": subplot_height,
        "xStep": x_step_size,
        "yStep": y_step_size,
        "xStepUnit": x_step_unit,
        "yStepUnit": y_step_unit,
        "xContinuousAsDiscrete": x_continuous_as_discrete,
        "yContinuousAsDiscrete": y_continuous_as_discrete,
        "xNominalCount": x_total_nominal_count,
        "yNominalCount": y_total_nominal_count,
        "xLabel": x_label,
        "yLabel": y_label,
        "stepPadding": step_padding_val,
        "effectiveFacetGap": gap,
        "truncations": [],
    }
    if facet_cols > 1 or facet_rows > 1:
        result["facet"] = {
            "columns": facet_cols, "rows": facet_rows,
            "subplotWidth": subplot_width, "subplotHeight": subplot_height,
        }
    else:
        result["facet"] = None
    return result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def count_distinct_series(channel_semantics: dict[str, Any], data: list[dict[str, Any]]) -> int:
    series_fields: list[str] = []
    color_field = (channel_semantics.get("color") or {}).get("field")
    detail_field = (channel_semantics.get("detail") or {}).get("field")
    if color_field:
        series_fields.append(color_field)
    if detail_field and detail_field != color_field:
        series_fields.append(detail_field)
    if not series_fields:
        return 1
    series_keys = set()
    for row in data:
        key = "\x00".join(str(row.get(f) if row.get(f) is not None else "") for f in series_fields)
        series_keys.add(key)
    return len(series_keys)


def compute_banking_ar(
    x_values: list[float], y_values: list[float],
    x_domain: list[float], y_domain: list[float],
    series_keys: list[str], is_connected: bool,
) -> float:
    MIN_AR = 0.5
    MAX_AR = 3.0
    x_range = x_domain[1] - x_domain[0]
    y_range = y_domain[1] - y_domain[0]
    if x_range <= 0 or y_range <= 0:
        return 1

    if not is_connected:
        n = len(x_values)
        sum_x = sum((x_values[i] - x_domain[0]) / x_range for i in range(n))
        sum_y = sum((y_values[i] - y_domain[0]) / y_range for i in range(n))
        mean_x = sum_x / n
        mean_y = sum_y / n
        var_x = 0.0
        var_y = 0.0
        for i in range(n):
            dx = (x_values[i] - x_domain[0]) / x_range - mean_x
            dy = (y_values[i] - y_domain[0]) / y_range - mean_y
            var_x += dx * dx
            var_y += dy * dy
        sd_x = math.sqrt(var_x / n)
        sd_y = math.sqrt(var_y / n)
        if sd_y <= 0:
            return MAX_AR
        if sd_x <= 0:
            return MIN_AR
        sd_ratio = sd_x / sd_y
        if sd_ratio > 1:
            ar = 1 + (sd_ratio - 1) * 0.3
        else:
            ar = 1 - (1 - sd_ratio) * 0.3
        return min(MAX_AR, max(MIN_AR, ar))

    series_map: dict[str, list[dict[str, float]]] = {}
    for i in range(len(x_values)):
        key = series_keys[i]
        arr = series_map.get(key)
        if arr is None:
            arr = []
            series_map[key] = arr
        arr.append({"x": x_values[i], "y": y_values[i]})
    for pts in series_map.values():
        pts.sort(key=lambda p: p["x"])

    scale_medians: list[float] = []
    max_series_len = 0
    for pts in series_map.values():
        if len(pts) > max_series_len:
            max_series_len = len(pts)
    if max_series_len <= 0:
        return 1
    max_scale = max(0, math.floor(math.log2(max_series_len)) - 1)

    for scale in range(max_scale + 1):
        window_size = 1 << scale
        abs_slopes: list[float] = []
        for pts in series_map.values():
            n = len(pts)
            if n < 2:
                continue
            smoothed: list[dict[str, float]] = []
            for i in range(0, n, window_size):
                end = min(i + window_size, n)
                sx = 0.0; sy = 0.0
                for j in range(i, end):
                    sx += pts[j]["x"]
                    sy += pts[j]["y"]
                cnt = end - i
                smoothed.append({"x": sx / cnt, "y": sy / cnt})
            for i in range(1, len(smoothed)):
                dx = (smoothed[i]["x"] - smoothed[i - 1]["x"]) / x_range
                dy = (smoothed[i]["y"] - smoothed[i - 1]["y"]) / y_range
                if dx == 0:
                    continue
                abs_slopes.append(abs(dy / dx))
        if not abs_slopes:
            continue
        abs_slopes.sort()
        mid = len(abs_slopes) >> 1
        if len(abs_slopes) % 2 == 1:
            median = abs_slopes[mid]
        else:
            median = (abs_slopes[mid - 1] + abs_slopes[mid]) / 2
        if median > 0:
            scale_medians.append(median)

    if not scale_medians:
        return 1
    log_sum = sum(math.log(m) for m in scale_medians)
    combined_slope = math.exp(log_sum / len(scale_medians))
    if combined_slope <= 0:
        return MAX_AR
    ar = max(1.0, combined_slope)
    return min(MAX_AR, max(MIN_AR, ar))


def compute_channel_budgets(
    channel_semantics: dict[str, dict[str, Any]],
    declaration: dict[str, Any],
    data: list[dict[str, Any]],
    canvas_size: dict[str, float],
    options: dict[str, Any],
) -> dict[str, Any]:
    max_stretch_x, max_stretch_y = resolve_stretch_caps(options)
    min_step_val = options.get("minStep", DEFAULT_MIN_STEP)
    step_padding_val = options.get("stepPadding", 0.1)
    max_color_val = options.get("maxColorValues", 24)

    facet_fixed_padding = options.get("facetFixedPadding") or {}
    fix_w = facet_fixed_padding.get("width", 0)
    fix_h = facet_fixed_padding.get("height", 0)
    gap = options.get("facetGap", 0)

    def is_discrete_type(t: Optional[str]) -> bool:
        return t == "nominal" or t == "ordinal"

    def effective_type(ch: str) -> Optional[str]:
        rt = (declaration.get("resolvedTypes") or {}).get(ch)
        return rt if rt is not None else (channel_semantics.get(ch) or {}).get("type")

    facet_grid = compute_facet_grid(channel_semantics, declaration, data, canvas_size, options)
    facet_cols = facet_grid["columns"] if facet_grid else 1
    facet_rows = facet_grid["rows"] if facet_grid else 1

    max_subplot_w = max(
        options.get("minSubplotSize", 60),
        (canvas_size["width"] * max_stretch_x - fix_w) / facet_cols - gap,
    )
    max_subplot_h = max(
        options.get("minSubplotSize", 60),
        (canvas_size["height"] * max_stretch_y - fix_h) / facet_rows - gap,
    )

    group_field = (channel_semantics.get("group") or {}).get("field")
    group_count = 0
    group_axis: Optional[str] = None
    if group_field:
        group_count = len({r.get(group_field) for r in data})
        if is_discrete_type(effective_type("x")):
            group_axis = "x"
        elif is_discrete_type(effective_type("y")):
            group_axis = "y"

    x_group_multiplier = group_count if (group_axis == "x" and group_count > 1) else 1
    y_group_multiplier = group_count if (group_axis == "y" and group_count > 1) else 1

    MIN_GROUP_GAP_PX = 3
    x_min_group_step = max(math.ceil(MIN_GROUP_GAP_PX / step_padding_val), 2 * x_group_multiplier) if x_group_multiplier > 1 else min_step_val
    y_min_group_step = max(math.ceil(MIN_GROUP_GAP_PX / step_padding_val), 2 * y_group_multiplier) if y_group_multiplier > 1 else min_step_val

    max_x_to_keep = math.floor(max_subplot_w / x_min_group_step)
    max_y_to_keep = math.floor(max_subplot_h / y_min_group_step)

    if facet_grid:
        canvas_x_cap = max(1, math.floor(canvas_size["width"] / x_min_group_step))
        canvas_y_cap = max(1, math.floor(canvas_size["height"] / y_min_group_step))

        if max_x_to_keep > canvas_x_cap or max_y_to_keep > canvas_y_cap:
            max_x_to_keep = min(max_x_to_keep, canvas_x_cap)
            max_y_to_keep = min(max_y_to_keep, canvas_y_cap)

            col_field = (channel_semantics.get("column") or {}).get("field")
            row_field = (channel_semantics.get("row") or {}).get("field")
            col_count = len({r.get(col_field) for r in data}) if col_field else 0

            if col_count > 1 and not row_field:
                tighter_w = max(options.get("minSubplotSize", 60), max_x_to_keep * x_min_group_step)
                total_w = canvas_size["width"] * max_stretch_x - fix_w
                total_h = canvas_size["height"] * max_stretch_y - fix_h
                revised_max_cols = max(1, math.floor(total_w / (tighter_w + gap)))
                revised_max_rows = max(1, math.floor(total_h / (options.get("minSubplotSize", 60) + gap)))
                max_total = revised_max_cols * revised_max_rows
                effective_count = min(col_count, max_total)
                vis_rows = math.ceil(effective_count / revised_max_cols)
                vis_cols = math.ceil(effective_count / vis_rows)
                facet_grid["columns"] = vis_cols
                facet_grid["rows"] = vis_rows
                facet_grid["maxColumnValues"] = max_total

    max_values = {
        "x": max_x_to_keep,
        "y": max_y_to_keep,
        "column": (facet_grid.get("maxColumnValues") if facet_grid else None) if facet_grid else math.inf,
        "row": (facet_grid.get("maxRowValues") if facet_grid else None) if facet_grid else math.inf,
        "color": max_color_val,
    }
    if max_values["column"] is None:
        max_values["column"] = math.inf
    if max_values["row"] is None:
        max_values["row"] = math.inf

    return {"maxValues": max_values, "facetGrid": facet_grid}


def compute_facet_grid(
    channel_semantics: dict[str, dict[str, Any]],
    declaration: dict[str, Any],
    data: list[dict[str, Any]],
    canvas_size: dict[str, float],
    options: dict[str, Any],
) -> Optional[dict[str, Any]]:
    ms_x, ms_y = resolve_stretch_caps(options)
    facet_fixed_padding = options.get("facetFixedPadding") or {}
    fix_w = facet_fixed_padding.get("width", 0)
    fix_h = facet_fixed_padding.get("height", 0)
    gap = options.get("facetGap", 0)
    min_step = options.get("minStep", DEFAULT_MIN_STEP)
    step_padding = options.get("stepPadding", 0.1)
    base_min_subplot = options.get("minSubplotSize", 60)

    def is_discrete_type(t: Optional[str]) -> bool:
        return t == "nominal" or t == "ordinal"

    max_w = canvas_size["width"] * ms_x - fix_w
    max_h = canvas_size["height"] * ms_y - fix_h
    MIN_GROUP_GAP_PX = 3

    group_field = (channel_semantics.get("group") or {}).get("field")
    group_count = 0
    group_axis: Optional[str] = None
    if group_field:
        group_count = len({r.get(group_field) for r in data})
        x_type = (declaration.get("resolvedTypes") or {}).get("x") or (channel_semantics.get("x") or {}).get("type")
        y_type = (declaration.get("resolvedTypes") or {}).get("y") or (channel_semantics.get("y") or {}).get("type")
        if is_discrete_type(x_type):
            group_axis = "x"
        elif is_discrete_type(y_type):
            group_axis = "y"

    min_subplot_width = base_min_subplot
    min_subplot_height = base_min_subplot

    LOG_PX_PER_DECADE_FACET = 40
    for axis in ["x", "y"]:
        cs = channel_semantics.get(axis)
        if not cs or not cs.get("field") or not cs.get("scaleType"):
            continue
        if cs["scaleType"] not in ("log", "symlog"):
            continue
        vals = [
            r.get(cs["field"]) for r in data
            if isinstance(r.get(cs["field"]), (int, float))
            and not isinstance(r.get(cs["field"]), bool)
            and r.get(cs["field"]) > 0 and math.isfinite(r.get(cs["field"]))
        ]
        if len(vals) < 2:
            continue
        decades = math.log10(max(vals)) - math.log10(min(vals))
        needed = math.ceil(max(1, decades)) * LOG_PX_PER_DECADE_FACET
        if axis == "x":
            min_subplot_width = max(min_subplot_width, needed)
        else:
            min_subplot_height = max(min_subplot_height, needed)

    for axis in ["x", "y"]:
        cs = channel_semantics.get(axis)
        if not cs or not cs.get("field"):
            continue
        effective_type = (declaration.get("resolvedTypes") or {}).get(axis) or cs.get("type")
        is_banded = ((declaration.get("axisFlags") or {}).get(axis) or {}).get("banded") is True
        if not is_discrete_type(effective_type) and not is_banded:
            continue
        value_count = len({r.get(cs["field"]) for r in data})
        axis_group_count = group_count if (group_axis == axis and group_count > 1) else 1
        max_dim = max_w if axis == "x" else max_h
        if axis_group_count > 1:
            min_group_step = max(math.ceil(MIN_GROUP_GAP_PX / step_padding), 2 * axis_group_count)
            per_category_step = max(min_step * axis_group_count, min_group_step)
        else:
            per_category_step = min_step
        data_driven_min = min(per_category_step * value_count, max_dim)
        min_dim = max(base_min_subplot, data_driven_min)
        if axis == "x":
            min_subplot_width = min_dim
        else:
            min_subplot_height = min_dim

    def x_is_cont() -> bool:
        cs = channel_semantics.get("x")
        if not cs or not cs.get("field"):
            return False
        t = (declaration.get("resolvedTypes") or {}).get("x") or cs.get("type")
        return not is_discrete_type(t) and not (((declaration.get("axisFlags") or {}).get("x") or {}).get("banded") is True)

    def y_is_cont() -> bool:
        cs = channel_semantics.get("y")
        if not cs or not cs.get("field"):
            return False
        t = (declaration.get("resolvedTypes") or {}).get("y") or cs.get("type")
        return not is_discrete_type(t) and not (((declaration.get("axisFlags") or {}).get("y") or {}).get("banded") is True)

    if x_is_cont() and y_is_cont():
        x_cs = channel_semantics.get("x")
        y_cs = channel_semantics.get("y")
        if x_cs and x_cs.get("field") and y_cs and y_cs.get("field"):
            is_temp_x = ((declaration.get("resolvedTypes") or {}).get("x") or x_cs.get("type")) == "temporal"
            is_temp_y = ((declaration.get("resolvedTypes") or {}).get("y") or y_cs.get("type")) == "temporal"
            cmcs = options.get("continuousMarkCrossSection")
            is_conn = isinstance(cmcs, dict) and bool(cmcs.get("seriesCountAxis"))

            x_num: list[float] = []
            y_num: list[float] = []
            s_keys: list[str] = []
            s_fields: list[str] = []
            col_f = (channel_semantics.get("column") or {}).get("field")
            row_f = (channel_semantics.get("row") or {}).get("field")
            if col_f:
                s_fields.append(col_f)
            if row_f:
                s_fields.append(row_f)
            cf = (channel_semantics.get("color") or {}).get("field")
            df = (channel_semantics.get("detail") or {}).get("field")
            if cf:
                s_fields.append(cf)
            if df and df != cf:
                s_fields.append(df)

            for row in data:
                xv = row.get(x_cs["field"])
                yv = row.get(y_cs["field"])
                if xv is None or yv is None:
                    continue
                xn = _js_to_date_number(xv) if is_temp_x else _js_to_number(xv)
                yn = _js_to_date_number(yv) if is_temp_y else _js_to_number(yv)
                if _is_nan(xn) or _is_nan(yn):
                    continue
                x_num.append(xn)
                y_num.append(yn)
                s_keys.append("\x00".join(str(row.get(f) if row.get(f) is not None else "") for f in s_fields) if s_fields else "")

            if len(x_num) > 1:
                x_min = min(x_num); x_max = max(x_num)
                y_min = min(y_num); y_max = max(y_num)
                x_dom = [x_min, x_max]
                y_dom = [y_min, y_max]
                if (x_cs.get("zero") or {}).get("zero"):
                    if x_dom[0] > 0:
                        x_dom[0] = 0
                    if x_dom[1] < 0:
                        x_dom[1] = 0
                if (y_cs.get("zero") or {}).get("zero"):
                    if y_dom[0] > 0:
                        y_dom[0] = 0
                    if y_dom[1] < 0:
                        y_dom[1] = 0
                ar = compute_banking_ar(x_num, y_num, x_dom, y_dom, s_keys, is_conn)
                if ar >= 1:
                    min_subplot_width = max(min_subplot_width, js_round(base_min_subplot * min(ar, ms_x)))
                    min_subplot_height = max(min_subplot_height, base_min_subplot)
                else:
                    min_subplot_width = max(min_subplot_width, base_min_subplot)
                    min_subplot_height = max(min_subplot_height, js_round(base_min_subplot * min(1 / ar, ms_y)))

    effective_w = max_w
    effective_h = max_h
    max_facet_columns = max(1, math.floor(effective_w / (min_subplot_width + gap)))
    max_facet_rows = max(1, math.floor(effective_h / (min_subplot_height + gap)))

    col_field = (channel_semantics.get("column") or {}).get("field")
    row_field = (channel_semantics.get("row") or {}).get("field")
    if not col_field and not row_field:
        return None

    col_count = len({r.get(col_field) for r in data}) if col_field else 0
    row_count = len({r.get(row_field) for r in data}) if row_field else 0
    if col_count == 0 and row_count == 0:
        return None

    if col_count > 0 and row_count == 0:
        if col_count <= max_facet_columns:
            return {
                "columns": col_count, "rows": 1,
                "maxColumnValues": col_count, "maxRowValues": max_facet_rows,
            }
        n_cols = max_facet_columns
        n_rows = math.ceil(col_count / n_cols)
        while n_cols > 2 and (col_count % n_cols) == 1:
            n_cols -= 1
            n_rows = math.ceil(col_count / n_cols)
        vis_rows = min(n_rows, max_facet_rows)
        max_total = n_cols * vis_rows
        return {
            "columns": n_cols, "rows": vis_rows,
            "maxColumnValues": max_total, "maxRowValues": max_facet_rows,
        }

    return {
        "columns": max(1, min(col_count, max_facet_columns)),
        "rows": max(1, min(row_count, max_facet_rows)),
        "maxColumnValues": max_facet_columns,
        "maxRowValues": max_facet_rows,
    }


def compute_min_subplot_dimensions(
    channel_semantics: dict[str, dict[str, Any]],
    declaration: dict[str, Any],
    data: list[dict[str, Any]],
    options: dict[str, Any],
) -> dict[str, float]:
    min_step = options.get("minStep", DEFAULT_MIN_STEP)
    min_subplot = options.get("minSubplotSize", 60)

    min_subplot_width = min_subplot
    min_subplot_height = min_subplot

    LOG_PX_PER_DECADE_MIN = 40
    for axis in ["x", "y"]:
        cs = channel_semantics.get(axis)
        if not cs or not cs.get("field") or not cs.get("scaleType"):
            continue
        if cs["scaleType"] not in ("log", "symlog"):
            continue
        vals = [
            r.get(cs["field"]) for r in data
            if isinstance(r.get(cs["field"]), (int, float))
            and not isinstance(r.get(cs["field"]), bool)
            and r.get(cs["field"]) > 0 and math.isfinite(r.get(cs["field"]))
        ]
        if len(vals) < 2:
            continue
        decades = math.log10(max(vals)) - math.log10(min(vals))
        needed = math.ceil(max(1, decades)) * LOG_PX_PER_DECADE_MIN
        if axis == "x":
            min_subplot_width = max(min_subplot_width, needed)
        else:
            min_subplot_height = max(min_subplot_height, needed)

    def is_discrete_type(t: Optional[str]) -> bool:
        return t == "nominal" or t == "ordinal"

    for axis in ["x", "y"]:
        cs = channel_semantics.get(axis)
        if not cs or not cs.get("field"):
            continue
        effective_type = (declaration.get("resolvedTypes") or {}).get(axis) or cs.get("type")
        is_banded = ((declaration.get("axisFlags") or {}).get(axis) or {}).get("banded") is True
        is_discrete = is_discrete_type(effective_type)
        item_count = 0
        if is_banded or is_discrete:
            item_count = len({r.get(cs["field"]) for r in data})
        if item_count > 0:
            min_dim = max(min_subplot, item_count * min_step)
            if axis == "x":
                min_subplot_width = max(min_subplot_width, min_dim)
            else:
                min_subplot_height = max(min_subplot_height, min_dim)

    return {"minSubplotWidth": min_subplot_width, "minSubplotHeight": min_subplot_height}
