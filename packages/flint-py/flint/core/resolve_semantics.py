"""Port of src/lib/agents-chart/core/resolve-semantics.ts."""

from __future__ import annotations

import copy
import math
import re
from datetime import datetime, timezone
from typing import Any, Optional

from .decisions import resolve_encoding_type
from .field_semantics import (
    normalize_annotation,
    resolve_color_scheme_hint,
    resolve_diverging_info,
    resolve_field_semantics,
    resolve_nice,
    resolve_reversed,
    resolve_stackable,
    resolve_tick_constraint,
    to_type_string,
)
from .semantic_types import (
    get_recommended_color_scheme,
    get_vis_category,
    infer_ordinal_sort_order,
    infer_vis_category,
)
from .js_date import js_date_parse


MAX_TIMESTAMP_SEC = 4_102_444_800
MAX_TIMESTAMP_MS = 4_102_444_800_000


def is_likely_timestamp(val: float) -> bool:
    if 1e9 <= val <= MAX_TIMESTAMP_SEC:
        return True
    if MAX_TIMESTAMP_SEC < val <= MAX_TIMESTAMP_MS:
        return True
    return False


def timestamp_to_ms(val: float) -> float:
    return val * 1000 if val <= MAX_TIMESTAMP_SEC else val


def infer_implicit_semantic_type(field_name: str, values: list[Any]) -> str:
    tokenized = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", field_name).lower()
    tokens = [token for token in re.split(r"[^a-z0-9]+", tokenized) if token]
    if "year" not in tokens:
        return ""

    observed = [value for value in values if value is not None and value != ""]
    if len({str(value) for value in observed}) <= 1:
        return ""
    for value in observed:
        if isinstance(value, bool):
            return ""
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            return ""
        if not numeric.is_integer() or not 1500 <= numeric <= 2200:
            return ""
    return "Year"


def looks_like_date_string(s: str) -> bool:
    t = s.strip()
    return bool(re.match(r"^\d|^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)", t, re.IGNORECASE))


# ---------------------------------------------------------------------------
# Temporal analysis
# ---------------------------------------------------------------------------

def _parse_date(v: Any) -> Optional[datetime]:
    """Mirror JavaScript ``new Date(v)`` parsing. Returns a timezone-aware
    ``datetime`` or ``None`` (matching V8's NaN). Delegated to the shared
    :mod:`flint.core.js_date` helpers so all date-parsing paths agree.
    """
    if isinstance(v, datetime):
        return v
    return js_date_parse(v)


def _utc_attrs(d: datetime) -> tuple[int, int, int, int, int, int]:
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    u = d.astimezone(timezone.utc)
    return (u.year, u.month - 1, u.day, u.hour, u.minute, u.second)


def analyze_temporal_field(field_values: list[Any]) -> Optional[dict[str, Any]]:
    dates: list[datetime] = []
    non_null = 0
    for v in field_values[:100]:
        if v is None:
            continue
        non_null += 1
        d = _parse_date(v)
        if d is not None:
            dates.append(d)
    if len(dates) < 2 or len(dates) < non_null * 0.5:
        return None

    years, months, days, hours, minutes, seconds = (set() for _ in range(6))
    for d in dates:
        y, mo, da, h, mi, se = _utc_attrs(d)
        years.add(y); months.add(mo); days.add(da)
        hours.add(h); minutes.add(mi); seconds.add(se)

    def is_small_spread(s: set, max_spread: int = 1) -> bool:
        if len(s) <= 1:
            return True
        arr = list(s)
        return max(arr) - min(arr) <= max_spread

    same = {
        "month": len(months) == 1,
        "day": len(days) == 1,
        "hour": is_small_spread(hours, 1),
        "minute": len(minutes) == 1,
        "second": len(seconds) == 1,
    }
    same_year = len(years) == 1
    same_month = same_year and same["month"]
    same_day = same_month and same["day"]

    return {
        "dates": dates,
        "same": same,
        "sameYear": same_year,
        "sameMonth": same_month,
        "sameDay": same_day,
    }


def compute_data_votes(same: dict[str, bool]) -> list[int]:
    votes = [0, 0, 0, 0, 0, 0]

    if same["second"]: votes[5] += 1
    if same["minute"] and same["second"]: votes[5] += 1
    if same["hour"] and same["minute"] and same["second"]: votes[5] += 1
    if same["day"] and same["hour"] and same["minute"] and same["second"]: votes[5] += 2
    if same["month"] and same["day"] and same["hour"] and same["minute"] and same["second"]: votes[5] += 3

    if same["second"]: votes[4] += 1
    if same["minute"] and same["second"]: votes[4] += 1
    if same["hour"] and same["minute"] and same["second"]: votes[4] += 1
    if same["day"] and same["hour"] and same["minute"] and same["second"]: votes[4] += 2
    if (not same["month"]) and same["day"] and same["hour"] and same["minute"] and same["second"]: votes[4] += 3

    if same["second"]: votes[3] += 1
    if same["minute"] and same["second"]: votes[3] += 1
    if same["hour"] and same["minute"] and same["second"]: votes[3] += 1
    if (not same["day"]) and same["hour"] and same["minute"] and same["second"]: votes[3] += 3

    if same["second"]: votes[2] += 1
    if same["minute"] and same["second"]: votes[2] += 1
    if (not same["hour"]) and same["minute"] and same["second"]: votes[2] += 3

    if same["second"]: votes[1] += 1
    if (not same["minute"]) and same["second"]: votes[1] += 3

    if not same["second"]: votes[0] += 4

    return votes


SEMANTIC_LEVEL: dict[str, int] = {
    "Year": 5, "Decade": 5,
    "YearMonth": 4, "Month": 4, "YearQuarter": 4, "Quarter": 4,
    "Date": 3, "Day": 3,
    "Hour": 2,
    "DateTime": 1,
    "Timestamp": 0,
}


def pick_best_level(votes: list[int]) -> dict[str, int]:
    best_level = 0
    best_score = votes[0]
    for i in range(1, 6):
        if votes[i] >= best_score:
            best_score = votes[i]
            best_level = i
    return {"level": best_level, "score": best_score}


def level_to_format(level: int, analysis: dict[str, Any]) -> Optional[str]:
    if level == 5:
        return "%Y"
    if level == 4:
        return "%b" if analysis["sameYear"] else "%b %Y"
    if level == 3:
        return "%b %d" if analysis["sameYear"] else "%b %d, %Y"
    if level == 2:
        return "%H:00" if analysis["sameDay"] else "%b %d %H:00"
    if level == 1:
        return "%H:%M" if analysis["sameDay"] else "%b %d %H:%M"
    if level == 0:
        return "%H:%M:%S" if analysis["sameDay"] else "%b %d %H:%M:%S"
    return None


def _resolve_temporal_format(field_values: list[Any], semantic_type: str) -> Optional[str]:
    analysis = analyze_temporal_field(field_values)
    if not analysis:
        return None
    votes = compute_data_votes(analysis["same"])
    sem_level = SEMANTIC_LEVEL.get(semantic_type)
    if sem_level is not None:
        votes[sem_level] += 3
    pick = pick_best_level(votes)
    return level_to_format(pick["level"], analysis)


# ---------------------------------------------------------------------------
# Temporal data conversion
# ---------------------------------------------------------------------------

def _expand_to_full_year(val: str) -> str:
    trimmed = val.strip()
    if re.match(r"^\d{2}$", trimmed):
        n = int(trimmed)
        return str(2000 + n if n <= 49 else 1900 + n)
    return val


def _to_iso_z(dt: datetime) -> str:
    """Mirror JS Date.toISOString(): YYYY-MM-DDTHH:mm:ss.sssZ (always Zulu)."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    u = dt.astimezone(timezone.utc)
    ms = int(u.microsecond / 1000)
    return f"{u.year:04d}-{u.month:02d}-{u.day:02d}T{u.hour:02d}:{u.minute:02d}:{u.second:02d}.{ms:03d}Z"


def convert_temporal_data(
    data: list[dict[str, Any]],
    semantic_types: dict[str, Any],
) -> list[dict[str, Any]]:
    if not data:
        return data

    keys = list(data[0].keys())
    field_values = {key: [row.get(key) for row in data] for key in keys}
    effective_semantic_types = {
        key: to_type_string(semantic_types.get(key))
        or infer_implicit_semantic_type(key, field_values[key])
        for key in keys
    }
    temporal_keys: list[str] = []
    for k in keys:
        st = effective_semantic_types[k]
        vc = infer_vis_category(field_values[k])
        st_category = get_vis_category(st) if st else None
        if vc == "temporal" or st_category == "temporal" or st == "Decade":
            temporal_keys.append(k)

    if not temporal_keys:
        return data

    values = copy.deepcopy(data)
    for r in values:
        for temporal_key in temporal_keys:
            val = r.get(temporal_key)
            st = effective_semantic_types[temporal_key]

            if isinstance(val, bool):
                # JS treats booleans as numbers via +true=1 etc, but they don't reach here in practice
                r[temporal_key] = str(val).lower()
                continue
            if isinstance(val, (int, float)):
                if st in ("Year", "Decade"):
                    r[temporal_key] = f"{int(math.floor(val))}"
                elif is_likely_timestamp(val):
                    dt = datetime.fromtimestamp(timestamp_to_ms(val) / 1000.0, tz=timezone.utc)
                    r[temporal_key] = _to_iso_z(dt)
                else:
                    r[temporal_key] = _js_number_to_string(val)
            elif isinstance(val, datetime):
                r[temporal_key] = _to_iso_z(val)
            elif isinstance(val, str):
                if st in ("Year", "Decade"):
                    r[temporal_key] = _expand_to_full_year(val)
                else:
                    r[temporal_key] = val
            elif val is None:
                # JS String(null) => "null"; but JSON null typically not in temporal fields; preserve
                r[temporal_key] = "null"
            else:
                r[temporal_key] = str(val)
    return values


def _js_number_to_string(v: float) -> str:
    """Mirror JS String(<number>) — integers without trailing zeros."""
    if isinstance(v, float):
        if v.is_integer():
            return str(int(v))
        return repr(v)
    return str(v)


# ---------------------------------------------------------------------------
# Public API: resolve_channel_semantics
# ---------------------------------------------------------------------------

def resolve_channel_semantics(
    encodings: dict[str, dict[str, Any]],
    data: list[dict[str, Any]],
    semantic_types: dict[str, Any],
    converted_data: Optional[list[dict[str, Any]]] = None,
) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    temporal_data = converted_data if converted_data is not None else data

    for channel, encoding in encodings.items():
        field_name = encoding.get("field")
        if not field_name and encoding.get("aggregate") != "count":
            continue

        if not field_name and encoding.get("aggregate") == "count":
            result[channel] = {
                "field": "_count",
                "semanticAnnotation": {"semanticType": "Count"},
                "type": "quantitative",
                "aggregationDefault": "sum",
            }
            continue

        if not field_name:
            continue

        raw_annotation = semantic_types.get(field_name)
        if isinstance(raw_annotation, str):
            supplied_semantic_type = raw_annotation or ""
        elif isinstance(raw_annotation, dict):
            supplied_semantic_type = raw_annotation.get("semanticType") or ""
        else:
            supplied_semantic_type = ""
        field_values = [r.get(field_name) for r in data]
        semantic_type = supplied_semantic_type or infer_implicit_semantic_type(field_name, field_values)

        type_decision = resolve_encoding_type(
            semantic_type, field_values, channel, data, field_name,
        )

        resolved_type = type_decision["vlType"]
        if encoding.get("type"):
            resolved_type = encoding["type"]
        elif channel in ("column", "row"):
            if resolved_type not in ("nominal", "ordinal"):
                resolved_type = "nominal"

        if resolved_type == "quantitative":
            sample_values = [
                r.get(field_name) for r in data[:15] if r.get(field_name) is not None
            ]
            iso_re = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$")
            if sample_values and all(iso_re.match(str(v).strip()) for v in sample_values):
                resolved_type = "temporal"

        fc = resolve_field_semantics(raw_annotation or semantic_type, field_name, field_values)
        annotation = fc["semanticAnnotation"]

        tick_constraint = resolve_tick_constraint(annotation["semanticType"], annotation.get("intrinsicDomain"))
        reversed_ = resolve_reversed(annotation["semanticType"], channel)
        nice = resolve_nice(annotation["semanticType"], fc.get("domainConstraint"))
        stackable = resolve_stackable(annotation["semanticType"])

        cs: dict[str, Any] = {
            "field": field_name,
            "semanticAnnotation": annotation,
            "type": resolved_type,
        }
        # FieldSemantics-derived
        if fc.get("format") is not None:
            cs["format"] = fc["format"]
        if fc.get("tooltipFormat") is not None:
            cs["tooltipFormat"] = fc["tooltipFormat"]
        if fc.get("aggregationDefault") is not None:
            cs["aggregationDefault"] = fc["aggregationDefault"]
        if fc.get("scaleType") is not None:
            cs["scaleType"] = fc["scaleType"]
        if fc.get("domainConstraint") is not None:
            cs["domainConstraint"] = fc["domainConstraint"]
        if fc.get("cyclic"):
            cs["cyclic"] = True
        if fc.get("sortDirection") is not None:
            cs["sortDirection"] = fc["sortDirection"]
        if fc.get("binningSuggested"):
            cs["binningSuggested"] = True

        # Channel-level
        cs["nice"] = nice
        if tick_constraint is not None:
            cs["tickConstraint"] = tick_constraint
        if reversed_:
            cs["reversed"] = True
        cs["stackable"] = stackable

        # Adjust aggregated field name
        if encoding.get("aggregate"):
            if encoding["aggregate"] == "count":
                cs["field"] = "_count"
                cs["type"] = "quantitative"
            else:
                cs["field"] = f"{field_name}_{encoding['aggregate']}"
                cs["type"] = "quantitative"

        # Color scheme
        if channel in ("color", "group") and field_name:
            if encoding.get("scheme") and encoding["scheme"] != "default":
                cs["colorScheme"] = {
                    "scheme": encoding["scheme"],
                    "type": "categorical",
                    "reason": "explicit user scheme",
                }
            else:
                encoding_vl_type = cs["type"]
                color_hint = resolve_color_scheme_hint(semantic_type, annotation, field_values)
                unique_values = list({v for v in field_values})
                cs["colorScheme"] = get_recommended_color_scheme(
                    semantic_type, encoding_vl_type, len(unique_values), field_name,
                    field_values, {"type": color_hint["type"]},
                )
                if cs["colorScheme"]["type"] == "diverging" and encoding_vl_type == "quantitative":
                    nums = [v for v in field_values if isinstance(v, (int, float)) and not isinstance(v, bool) and not (isinstance(v, float) and math.isnan(v))]
                    div_info = resolve_diverging_info(semantic_type, annotation, nums)
                    if div_info:
                        cs["colorScheme"]["domainMid"] = div_info["midpoint"]

        # Temporal format
        if cs["type"] == "temporal" or (semantic_type and get_vis_category(semantic_type) == "temporal"):
            converted_field_values = [r.get(field_name) for r in temporal_data]
            fmt = _resolve_temporal_format(converted_field_values, semantic_type)
            if fmt:
                cs["temporalFormat"] = fmt

        # Ordinal sort
        if cs["type"] in ("ordinal", "nominal"):
            if not encoding.get("sortOrder") and not encoding.get("sortBy"):
                ordinal_sort = infer_ordinal_sort_order(semantic_type, field_values)
                if ordinal_sort:
                    cs["ordinalSortOrder"] = ordinal_sort

        result[channel] = cs

    return result
