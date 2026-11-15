"""Port of src/lib/agents-chart/core/field-semantics.ts."""

from __future__ import annotations

import math
from typing import Any, Optional

from .semantic_types import (
    get_zero_class,
    infer_ordinal_sort_order,
    infer_vis_category,
    is_measure_type,
)
from .type_registry import get_registry_entry, is_registered


# ---------------------------------------------------------------------------
# Annotation normalization
# ---------------------------------------------------------------------------

def to_type_string(input_value: Any) -> str:
    if not input_value:
        return ""
    if isinstance(input_value, str):
        return input_value
    if isinstance(input_value, dict):
        return input_value.get("semanticType", "") or ""
    return ""


def normalize_annotation(input_value: Any) -> dict[str, Any]:
    if not input_value:
        return {"semanticType": "Unknown"}
    if isinstance(input_value, str):
        return {"semanticType": input_value or "Unknown"}
    if isinstance(input_value, dict):
        out = {**input_value}
        out["semanticType"] = input_value.get("semanticType") or "Unknown"
        return out
    return {"semanticType": "Unknown"}


# ---------------------------------------------------------------------------
# Format resolution
# ---------------------------------------------------------------------------

CURRENCY_MAP: dict[str, str] = {
    "USD": "$", "EUR": "€", "GBP": "£", "JPY": "¥", "CNY": "¥",
    "KRW": "₩", "INR": "₹", "BRL": "R$", "CAD": "CA$", "AUD": "A$",
    "CHF": "CHF", "SEK": "kr", "NOK": "kr", "DKK": "kr",
}


UNIT_SUFFIX_MAP: dict[str, str] = {
    "°C": "°C", "°F": "°F", "C": "°C", "F": "°F",
    "kg": " kg", "lb": " lb",
    "km": " km", "mi": " mi", "m": " m", "ft": " ft",
    "km/h": " km/h", "mph": " mph",
    "sec": " s", "min": " min", "hr": " hr",
    "seconds": " s", "minutes": " min", "hours": " hr",
    "%": "%",
}


def _is_number(v: Any) -> bool:
    if isinstance(v, bool):
        return False
    return isinstance(v, (int, float)) and not (isinstance(v, float) and math.isnan(v))


def _detect_percentage_representation(values: list[float]) -> str:
    if len(values) == 0:
        return "0-100"
    abs_vals = [abs(v) for v in values]
    count_below_1 = sum(1 for v in abs_vals if v <= 1)
    if count_below_1 / len(abs_vals) >= 0.8:
        return "0-1"
    return "0-100"


def _detect_precision(values: list[float]) -> int:
    max_decimals = 0
    for v in values:
        if not (isinstance(v, (int, float)) and math.isfinite(v)):
            continue
        s = "{:.10f}".format(float(v))
        dot = s.find(".")
        if dot == -1:
            continue
        end = len(s) - 1
        while end > dot and s[end] == "0":
            end -= 1
        decimals = end - dot if end > dot else 0
        if decimals > max_decimals:
            max_decimals = decimals
    return min(max_decimals, 4)


def _precision_format(values: list[float], use_grouping: bool = True, sign_mode: str = "") -> str:
    p = _detect_precision(values)
    group = "," if use_grouping else ""
    if p == 0:
        return f"{sign_mode}{group}d"
    return f"{sign_mode}{group}.{p}f"


def resolve_format(
    semantic_type: str,
    annotation: dict[str, Any],
    values: list[Any],
) -> dict[str, Any]:
    entry = get_registry_entry(semantic_type)
    unit = annotation.get("unit")

    currency_prefix = None
    if unit:
        currency_prefix = CURRENCY_MAP.get(unit.upper()) or CURRENCY_MAP.get(unit)
    unit_suffix = UNIT_SUFFIX_MAP.get(unit) if unit else None

    nums = [v for v in values if _is_number(v)]

    fmt_class = entry["formatClass"]

    if fmt_class == "currency":
        if currency_prefix:
            axis_pattern = ",.2f" if semantic_type == "Price" else _precision_format(nums)
            return {
                "format": {"pattern": axis_pattern, "prefix": currency_prefix},
                "tooltipFormat": {"pattern": ",.2f", "prefix": currency_prefix},
            }
        return {"tooltipFormat": {"pattern": ",.2f"}}

    if fmt_class == "percent":
        if not annotation.get("intrinsicDomain"):
            return {"tooltipFormat": {"pattern": _precision_format(nums)}}
        rep = _detect_percentage_representation(nums)
        if rep == "0-1":
            p = _detect_precision(nums)
            axis_p = max(0, p - 2)
            tip_p = min(axis_p + 1, 4)
            return {
                "format": {"pattern": f".{axis_p}~%"},
                "tooltipFormat": {"pattern": f".{tip_p}%"},
            }
        return {
            "tooltipFormat": {"pattern": _precision_format(nums, False), "suffix": "%"},
        }

    if fmt_class == "unit-suffix":
        if unit_suffix:
            return {"tooltipFormat": {"pattern": _precision_format(nums), "suffix": unit_suffix}}
        return {"tooltipFormat": {"pattern": _precision_format(nums)}}

    if fmt_class == "integer":
        if semantic_type in ("Year", "Decade"):
            return {}
        return {"tooltipFormat": {"pattern": ",d"}}

    if fmt_class == "decimal":
        return {"tooltipFormat": {"pattern": _precision_format(nums)}}

    return {}


# ---------------------------------------------------------------------------
# Default vis type
# ---------------------------------------------------------------------------

def resolve_default_vis_type(semantic_type: str, values: list[Any]) -> str:
    if not is_registered(semantic_type):
        return infer_vis_category(values)

    entry = get_registry_entry(semantic_type)
    candidates = entry["visEncodings"]
    if len(candidates) == 1:
        if candidates[0] == "quantitative":
            non_null = [v for v in values if v is not None]
            all_numeric = len(non_null) > 0 and all(
                isinstance(v, (int, float)) and not isinstance(v, bool)
                or (isinstance(v, str) and v.strip() != "" and _try_float(v))
                for v in non_null
            )
            if not all_numeric:
                return infer_vis_category(values)
        return candidates[0]

    if "quantitative" in candidates and "ordinal" in candidates:
        distinct = len({v for v in values if v is not None})
        return "ordinal" if distinct <= 12 else "quantitative"

    if "temporal" in candidates and "ordinal" in candidates:
        distinct = len({v for v in values if v is not None})
        return "ordinal" if distinct <= 6 else "temporal"

    if "geographic" in candidates and "quantitative" in candidates:
        return "quantitative"

    return candidates[0]


def _try_float(s: str) -> bool:
    try:
        float(s)
        return True
    except ValueError:
        return False


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------

def resolve_aggregation_default(semantic_type: str) -> Optional[str]:
    entry = get_registry_entry(semantic_type)
    role = entry["aggRole"]
    if role in ("additive", "signed-additive"):
        return "sum"
    if role == "intensive":
        return "average"
    return None


def resolve_display_aggregate(cs: Optional[dict], aggregate: Optional[str] = None) -> Optional[str]:
    """Port of resolveDisplayAggregate: how a chart combines a measure's rows per category.

    Types with a default keep it; a measure with none (``Number``) takes the
    encoding's own aggregate, else the mean.
    """
    if not cs or cs.get("aggregationDefault"):
        return (cs or {}).get("aggregationDefault")
    semantic_type = (cs.get("semanticAnnotation") or {}).get("semanticType")
    if not semantic_type or not is_measure_type(semantic_type):
        return None
    return "sum" if aggregate in ("sum", "count") else "average"


# ---------------------------------------------------------------------------
# Zero baseline
# ---------------------------------------------------------------------------

def resolve_zero_class_from_annotation(
    semantic_type: str,
    domain: Optional[list[float]] = None,
) -> str:
    if domain and domain[0] > 0:
        return "arbitrary"
    return get_zero_class(semantic_type)


# ---------------------------------------------------------------------------
# Scale type
# ---------------------------------------------------------------------------

def resolve_scale_type(semantic_type: str, values: list[float]) -> Optional[str]:
    entry = get_registry_entry(semantic_type)
    eligible = (
        entry["aggRole"] == "additive"
        and entry["domainShape"] == "open"
        and entry["t1"] != "GenericMeasure"
    )
    if not eligible:
        return None
    if len(values) < 10:
        return None
    filtered = [v for v in values if isinstance(v, (int, float)) and not (isinstance(v, float) and math.isnan(v)) and math.isfinite(v)]
    if len(filtered) < 10:
        return None
    mn = min(filtered)
    mx = max(filtered)
    if mx <= 0 or mn == mx:
        return None
    if mn < 0:
        return None
    positives = [v for v in filtered if v > 0]
    if positives:
        positive_min = min(positives)
        if mx / positive_min >= 1_000_000:
            has_zeros = any(v == 0 for v in filtered)
            return "symlog" if has_zeros else "log"
    return None


# ---------------------------------------------------------------------------
# Domain constraints
# ---------------------------------------------------------------------------

def _merge_intrinsic_with_data(
    intrinsic: list[float],
    values: list[Any],
    hard: bool,
) -> dict[str, Any]:
    if hard:
        return {"min": intrinsic[0], "max": intrinsic[1], "clamp": True}
    nums = [v for v in values if _is_number(v)]
    if len(nums) == 0:
        return {"min": intrinsic[0], "max": intrinsic[1], "clamp": False}
    data_min = min(nums)
    data_max = max(nums)
    return {
        "min": min(intrinsic[0], data_min),
        "max": max(intrinsic[1], data_max),
        "clamp": False,
    }


def snap_to_bound_heuristic(
    intrinsic: list[float],
    values: list[Any],
) -> Optional[dict[str, Any]]:
    nums = [v for v in values if _is_number(v)]
    if len(nums) == 0:
        return None
    lo, hi = intrinsic
    rng = hi - lo
    if rng <= 0:
        return None
    data_min = min(nums)
    data_max = max(nums)

    zero_inside = lo < 0 and hi > 0
    threshold_lo = 0.25 * ((0 - lo) if zero_inside else rng)
    threshold_hi = 0.25 * (hi if zero_inside else rng)

    snap_min: Optional[float] = None
    snap_max: Optional[float] = None

    if data_min >= lo and data_min <= lo + threshold_lo:
        snap_min = lo
    if data_max <= hi and data_max >= hi - threshold_hi:
        snap_max = hi

    if snap_min is None and snap_max is None:
        return None
    out: dict[str, Any] = {"clamp": False}
    if snap_min is not None:
        out["min"] = snap_min
    if snap_max is not None:
        out["max"] = snap_max
    return out


def resolve_domain_constraint(
    semantic_type: str,
    annotation: dict[str, Any],
    values: list[Any],
) -> Optional[dict[str, Any]]:
    entry = get_registry_entry(semantic_type)

    if annotation.get("intrinsicDomain"):
        if entry["t1"] in ("Proportion", "SignedMeasure"):
            return snap_to_bound_heuristic(annotation["intrinsicDomain"], values)
        return _merge_intrinsic_with_data(annotation["intrinsicDomain"], values, False)

    if semantic_type == "Latitude":
        return _merge_intrinsic_with_data([-90, 90], values, True)
    if semantic_type == "Longitude":
        return _merge_intrinsic_with_data([-180, 180], values, True)
    if semantic_type == "Correlation":
        return _merge_intrinsic_with_data([-1, 1], values, True)

    if semantic_type == "Percentage":
        nums = [v for v in values if _is_number(v)]
        if len(nums) > 0:
            rep = _detect_percentage_representation(nums)
            M = 1 if rep == "0-1" else 100
            return snap_to_bound_heuristic([0, M], values)

    return None


# ---------------------------------------------------------------------------
# Tick constraints
# ---------------------------------------------------------------------------

def resolve_tick_constraint(
    semantic_type: str,
    domain: Optional[list[float]] = None,
) -> Optional[dict[str, Any]]:
    entry = get_registry_entry(semantic_type)

    if entry["formatClass"] == "integer":
        tc: dict[str, Any] = {"integersOnly": True, "minStep": 1}
        if domain:
            span = domain[1] - domain[0]
            if 0 < span <= 20:
                tc["exactTicks"] = list(range(int(domain[0]), int(domain[1]) + 1))
        return tc

    if semantic_type == "Score" and domain:
        span = domain[1] - domain[0]
        if span >= 2:
            tc = {"integersOnly": True, "minStep": 1}
            if span <= 20:
                tc["exactTicks"] = list(range(int(domain[0]), int(domain[1]) + 1))
            return tc

    return None


# ---------------------------------------------------------------------------
# Canonical ordering
# ---------------------------------------------------------------------------

def resolve_canonical_order(
    semantic_type: str,
    annotation: dict[str, Any],
    values: list[Any],
) -> Optional[list[str]]:
    if annotation.get("sortOrder") and len(annotation["sortOrder"]) > 0:
        return annotation["sortOrder"]
    return infer_ordinal_sort_order(semantic_type, values)


def resolve_cyclic(semantic_type: str) -> bool:
    return get_registry_entry(semantic_type)["domainShape"] == "cyclic"


# ---------------------------------------------------------------------------
# Reversed axis
# ---------------------------------------------------------------------------

def resolve_reversed(semantic_type: str, channel: Optional[str] = None) -> bool:
    if semantic_type == "Rank":
        return channel != "x"
    return False


# ---------------------------------------------------------------------------
# Nice
# ---------------------------------------------------------------------------

def resolve_nice(
    semantic_type: str,
    domain_constraint: Optional[dict[str, Any]] = None,
) -> bool:
    if domain_constraint and domain_constraint.get("clamp"):
        return False
    if (
        domain_constraint
        and domain_constraint.get("min") is not None
        and domain_constraint.get("max") is not None
    ):
        return False
    entry = get_registry_entry(semantic_type)
    if entry["domainShape"] == "fixed":
        return False
    return True


# ---------------------------------------------------------------------------
# Diverging info + color scheme hint
# ---------------------------------------------------------------------------

def resolve_diverging_info(
    semantic_type: str,
    annotation: dict[str, Any],
    values: list[float],
) -> Optional[dict[str, Any]]:
    entry = get_registry_entry(semantic_type)

    if semantic_type == "Temperature" and annotation.get("unit"):
        unit_midpoints = {"°C": 0, "°F": 32, "K": 273.15, "C": 0, "F": 32}
        mid = unit_midpoints.get(annotation["unit"])
        if mid is not None:
            return {"midpoint": mid, "inherent": False, "source": "unit"}

    if entry["diverging"] == "inherent":
        return {"midpoint": 0, "inherent": True, "source": "type-intrinsic"}
    if entry["diverging"] == "conditional":
        return {"midpoint": 0, "inherent": False, "source": "type-intrinsic"}

    if annotation.get("intrinsicDomain"):
        d = annotation["intrinsicDomain"]
        return {"midpoint": (d[0] + d[1]) / 2, "inherent": False, "source": "domain"}

    if len(values) > 0:
        mn = min(values)
        mx = max(values)
        if mn < 0 and mx > 0:
            return {"midpoint": 0, "inherent": False, "source": "data"}

    return None


def resolve_color_scheme_hint(
    semantic_type: str,
    annotation: dict[str, Any],
    values: list[Any],
) -> dict[str, Any]:
    entry = get_registry_entry(semantic_type)
    nums = [v for v in values if _is_number(v)]

    div_info = resolve_diverging_info(semantic_type, annotation, nums)
    if div_info:
        mn = min(nums) if nums else 0
        mx = max(nums) if nums else 0
        spans_both = mn < div_info["midpoint"] and mx > div_info["midpoint"]
        if div_info["inherent"] or spans_both:
            return {
                "type": "diverging",
                "divergingMidpoint": div_info["midpoint"],
                "inherentlyDiverging": div_info["inherent"],
            }

    if "quantitative" in entry["visEncodings"]:
        return {"type": "sequential"}
    return {"type": "categorical"}


# ---------------------------------------------------------------------------
# Binning
# ---------------------------------------------------------------------------

def resolve_binning_suggested(
    semantic_type: str,
    domain: Optional[list[float]] = None,
) -> bool:
    entry = get_registry_entry(semantic_type)
    if "quantitative" not in entry["visEncodings"]:
        return False
    if entry["aggRole"] in ("identifier", "dimension"):
        return False
    if semantic_type in ("Year", "Decade"):
        return False
    if domain and (domain[1] - domain[0]) <= 20:
        return False
    if semantic_type == "Score" and not domain:
        return False
    return True


# ---------------------------------------------------------------------------
# Stacking
# ---------------------------------------------------------------------------

def resolve_stackable(semantic_type: str):
    entry = get_registry_entry(semantic_type)
    role = entry["aggRole"]
    if role in ("additive", "signed-additive"):
        return "sum"
    if role == "intensive":
        if semantic_type == "Percentage":
            return "normalize"
        return False
    return False


# ---------------------------------------------------------------------------
# Sort direction
# ---------------------------------------------------------------------------

def resolve_sort_direction(semantic_type: str) -> str:
    if semantic_type == "Rank":
        return "descending"
    return "ascending"


# ---------------------------------------------------------------------------
# Builder: resolveFieldSemantics
# ---------------------------------------------------------------------------

def resolve_field_semantics(
    input_value: Any,
    field_name: str,
    values: list[Any],
) -> dict[str, Any]:
    annotation = normalize_annotation(input_value)
    semantic_type = annotation["semanticType"]

    numeric_values = [
        v for v in values
        if isinstance(v, (int, float)) and not isinstance(v, bool)
        and not (isinstance(v, float) and math.isnan(v))
        and math.isfinite(v)
    ]

    default_vis_type = resolve_default_vis_type(semantic_type, values)
    fmt_result = resolve_format(semantic_type, annotation, values)
    aggregation_default = resolve_aggregation_default(semantic_type)
    zero_class = resolve_zero_class_from_annotation(semantic_type, annotation.get("intrinsicDomain"))
    scale_type = resolve_scale_type(semantic_type, numeric_values)
    domain_constraint = resolve_domain_constraint(semantic_type, annotation, values)
    canonical_order = resolve_canonical_order(semantic_type, annotation, values)
    cyclic = resolve_cyclic(semantic_type)
    binning_suggested = resolve_binning_suggested(semantic_type, annotation.get("intrinsicDomain"))
    sort_direction = resolve_sort_direction(semantic_type)

    if not is_registered(semantic_type) and default_vis_type == "quantitative":
        if not aggregation_default:
            aggregation_default = "sum"
        if zero_class == "unknown":
            zero_class = "meaningful"
        binning_suggested = True

    out: dict[str, Any] = {
        "semanticAnnotation": annotation,
        "defaultVisType": default_vis_type,
        "aggregationDefault": aggregation_default,
        "zeroClass": zero_class,
        "scaleType": scale_type,
        "domainConstraint": domain_constraint,
        "canonicalOrder": canonical_order,
        "cyclic": cyclic,
        "sortDirection": sort_direction,
        "binningSuggested": binning_suggested,
    }
    if "format" in fmt_result:
        out["format"] = fmt_result["format"]
    if "tooltipFormat" in fmt_result:
        out["tooltipFormat"] = fmt_result["tooltipFormat"]
    return out
