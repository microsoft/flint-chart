"""Port of src/lib/agents-chart/core/semantic-types.ts."""

from __future__ import annotations

import re
from typing import Any, Optional

from .type_registry import (
    TYPE_REGISTRY,
    get_registered_types,
    get_registry_entry,
    is_registered,
)


# ---------------------------------------------------------------------------
# Semantic Types — string constants
# ---------------------------------------------------------------------------

SemanticTypes: dict[str, str] = {
    # Temporal
    "DateTime": "DateTime", "Date": "Date", "Time": "Time", "Timestamp": "Timestamp",
    "Year": "Year", "Quarter": "Quarter", "Month": "Month", "Week": "Week", "Day": "Day", "Hour": "Hour",
    "YearMonth": "YearMonth", "YearQuarter": "YearQuarter", "YearWeek": "YearWeek", "Decade": "Decade",
    "Duration": "Duration",

    # Numeric measures
    "Quantity": "Quantity", "Count": "Count", "Amount": "Amount", "Price": "Price",
    "Percentage": "Percentage", "Temperature": "Temperature",
    "Profit": "Profit", "PercentageChange": "PercentageChange",
    "Sentiment": "Sentiment", "Correlation": "Correlation",

    # Numeric discrete
    "Rank": "Rank", "ID": "ID", "Score": "Score",

    # Geographic
    "Latitude": "Latitude", "Longitude": "Longitude",
    "Country": "Country", "State": "State", "City": "City",
    "Region": "Region", "Address": "Address", "ZipCode": "ZipCode",

    # Categorical entity
    "Category": "Category", "Name": "Name",

    # Categorical coded
    "Status": "Status", "Boolean": "Boolean", "Direction": "Direction",

    # Range / fallback
    "Range": "Range",
    "Number": "Number", "Unknown": "Unknown",
}


# ---------------------------------------------------------------------------
# Type sets — derived from the registry
# ---------------------------------------------------------------------------

measureTypes: set[str] = {
    t for t in get_registered_types()
    if get_registry_entry(t)["aggRole"] in ("additive", "intensive", "signed-additive", "measure")
    and get_registry_entry(t)["t1"] != "Score"
}

nonMeasureNumericTypes: set[str] = {
    "Rank", "ID", "Score",
    "Year", "Month", "Day", "Hour",
    "Latitude", "Longitude",
}

categoricalTypes: set[str] = {
    t for t in get_registered_types()
    if ("nominal" in get_registry_entry(t)["visEncodings"] and get_registry_entry(t)["aggRole"] != "identifier")
    or get_registry_entry(t)["t1"] == "Binned"
}

ordinalTypes: set[str] = {
    t for t in get_registered_types()
    if "ordinal" in get_registry_entry(t)["visEncodings"]
}


# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------

def get_vis_category(semantic_type: Optional[str]) -> Optional[str]:
    if not semantic_type or not is_registered(semantic_type):
        return None
    enc = get_registry_entry(semantic_type)["visEncodings"]
    return enc[0] if enc else None


_DATE_LIKE_RE = re.compile(r"^\d|^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)", re.IGNORECASE)


def _is_boolean(v: Any) -> bool:
    return isinstance(v, bool)


def _is_number_like(v: Any) -> bool:
    """Mirrors JS `!isNaN(+v) && !(v instanceof Date)`."""
    if isinstance(v, bool):
        # In JS, +true === 1 and +false === 0, both pass !isNaN.
        return True
    if isinstance(v, (int, float)):
        return v == v  # exclude NaN
    if v is None:
        # +null === 0, !isNaN(0) → true
        return True
    if isinstance(v, str):
        s = v.strip()
        if s == "":
            return True  # +"" === 0
        try:
            float(s)
            return True
        except ValueError:
            return False
    return False


def _looks_like_date_string(s: str) -> bool:
    return bool(_DATE_LIKE_RE.match(s.strip()))


def _is_date_like(v: Any) -> bool:
    # JS: Date instance, or string that looks like date and parses, or generic Date.parse(v).
    if isinstance(v, str):
        if not _looks_like_date_string(v):
            return False
        return _date_parse_succeeds(v)
    return _date_parse_succeeds(v)


def _date_parse_succeeds(v: Any) -> bool:
    """Approximate JS Date.parse. Used only after looksLikeDate gating for strings."""
    if v is None:
        return False
    if isinstance(v, str):
        s = v.strip()
        # Try common formats. JS Date.parse handles ISO 8601 and RFC 2822 reliably.
        # For our fixture corpus, ISO-ish formats dominate.
        if not s:
            return False
        # Try ISO 8601 fast path
        try:
            from datetime import datetime
            datetime.fromisoformat(s.replace("Z", "+00:00"))
            return True
        except Exception:
            pass
        # Fall back to month-name detection for "Jan 2024" etc.
        try:
            from email.utils import parsedate_to_datetime
            parsedate_to_datetime(s)
            return True
        except Exception:
            pass
        return False
    return False


def infer_vis_category(values: list) -> str:
    if len(values) == 0:
        return "nominal"
    non_null = [v for v in values if v is not None]
    if len(non_null) == 0:
        return "nominal"
    if all(_is_boolean(v) for v in non_null):
        return "nominal"
    if all(_is_number_like(v) for v in non_null):
        return "quantitative"
    if all(_is_date_like(v) for v in non_null):
        return "temporal"
    return "nominal"


def is_measure_type(semantic_type: str) -> bool:
    return semantic_type in measureTypes


def is_time_series_type(semantic_type: str) -> bool:
    entry = get_registry_entry(semantic_type)
    return entry["t0"] == "Temporal" and entry["t1"] != "Duration"


def is_categorical_type(semantic_type: str) -> bool:
    return semantic_type in categoricalTypes


def is_ordinal_type(semantic_type: str) -> bool:
    return semantic_type in ordinalTypes


def is_geo_type(semantic_type: str) -> bool:
    return get_registry_entry(semantic_type)["t0"] == "Geographic"


def is_geo_coordinate_type(semantic_type: str) -> bool:
    return get_registry_entry(semantic_type)["t1"] == "GeoCoordinate"


def is_geo_location_string(semantic_type: str) -> bool:
    return get_registry_entry(semantic_type)["t1"] == "GeoPlace"


def is_non_measure_numeric(semantic_type: str) -> bool:
    return semantic_type in nonMeasureNumericTypes


# ---------------------------------------------------------------------------
# Zero baseline
# ---------------------------------------------------------------------------

def get_zero_class(semantic_type: str) -> str:
    baseline = get_registry_entry(semantic_type)["zeroBaseline"]
    if baseline == "none":
        return "unknown"
    return baseline


# Above this ratio of dataMin/dataMax, strictly-positive data sits far enough
# above zero that anchoring at zero would leave at least half the axis empty —
# a big enough gap that "zoom into the data" vs "keep the zero reference" is a
# genuine toss-up worth offering as a toggle. Below it, the data spans most of
# the way to zero already, so including zero barely changes anything and we
# keep it on silently.
ZERO_BASELINE_GAP_THRESHOLD = 0.5


def _data_far_from_zero(values: Optional[list[float]]) -> bool:
    """True when strictly-positive data sits far enough from zero that anchoring
    at zero would noticeably compress the view (see
    ``ZERO_BASELINE_GAP_THRESHOLD``). Returns False for empty data or any data
    that touches/crosses zero."""
    if not values:
        return False
    data_min = min(values)
    data_max = max(values)
    if data_min <= 0 or data_max <= 0:
        return False
    return data_min / data_max >= ZERO_BASELINE_GAP_THRESHOLD


def compute_zero_decision(
    semantic_type: str,
    channel: str,
    mark_type: str,
    values: Optional[list[float]] = None,
) -> dict[str, Any]:
    is_bar_like = mark_type in ("bar", "area", "rect")
    is_scatter_mark = mark_type in ("circle", "point")
    is_positional = channel in ("x", "y")
    entry = get_registry_entry(semantic_type)
    zero_class = get_zero_class(semantic_type)

    if zero_class == "meaningful":
        # Length marks: zero is structurally required (a bar's length is
        # meaningless without it). Not debatable.
        if is_bar_like:
            return {"zero": True, "domainPadFraction": 0, "zeroClass": zero_class,
                    "forced": True, "uncertain": False}
        # Scatter (circle/point position): the read is correlation / cloud shape,
        # not distance from zero — data-fit is the conventional default. Offer
        # Zero X/Y as an opt-in toggle when the user wants a zero reference.
        if is_positional and is_scatter_mark:
            if values is not None and len(values) > 0 and min(values) <= 0:
                return {"zero": True, "domainPadFraction": 0, "zeroClass": zero_class,
                        "forced": True, "uncertain": False}
            return {"zero": False, "domainPadFraction": entry.get("zeroPad") or 0.05,
                    "zeroClass": zero_class, "forced": False, "uncertain": True}
        # Position marks (line/strip): zero is the conventional reference, so
        # default ON. Only offer a toggle when the data sits far enough from zero
        # that anchoring at zero would noticeably compress the view.
        return {"zero": True, "domainPadFraction": 0, "zeroClass": zero_class,
                "forced": False, "uncertain": _data_far_from_zero(values)}

    if zero_class == "arbitrary":
        if is_bar_like and values is not None and len(values) > 0:
            data_min = min(values)
            if data_min <= 0:
                return {"zero": True, "domainPadFraction": 0, "zeroClass": zero_class,
                        "forced": True, "uncertain": False}
        return {
            "zero": False,
            "domainPadFraction": entry.get("zeroPad") or 0.05,
            "zeroClass": zero_class,
            "forced": False,
            "uncertain": False,
        }

    if zero_class == "contextual" and values is not None and len(values) > 0:
        data_min = min(values)
        data_max = max(values)

        if data_min <= 0:
            return {"zero": True, "domainPadFraction": 0, "zeroClass": zero_class,
                    "forced": True, "uncertain": False}

        proximity = data_min / data_max if data_max > 0 else 0
        if proximity < 0.3:
            return {"zero": True, "domainPadFraction": 0, "zeroClass": zero_class,
                    "forced": False, "uncertain": False}
        if is_bar_like:
            return {"zero": True, "domainPadFraction": 0, "zeroClass": zero_class,
                    "forced": True, "uncertain": False}
        return {"zero": False, "domainPadFraction": 0.05, "zeroClass": zero_class,
                "forced": False, "uncertain": False}

    # Unknown class is never debatable: we have no basis for a toggle.
    if is_bar_like and is_positional:
        return {"zero": True, "domainPadFraction": 0, "zeroClass": "unknown",
                "forced": True, "uncertain": False}
    return {"zero": False, "domainPadFraction": 0.05, "zeroClass": "unknown",
            "forced": True, "uncertain": False}


def compute_padded_domain(values: list[float], pad_fraction: float) -> Optional[list[float]]:
    if pad_fraction <= 0 or len(values) < 2:
        return None
    data_min = min(values)
    data_max = max(values)
    span = data_max - data_min
    if span <= 0:
        return None
    padding = span * pad_fraction
    return [data_min - padding, data_max + padding]


# ---------------------------------------------------------------------------
# Color schemes
# ---------------------------------------------------------------------------

def _pick_scheme(schemes: list[str], name: str) -> str:
    # JS:  hash = ((hash << 5) - hash) + name.charCodeAt(i); hash = hash & hash;
    # Emulate signed 32-bit arithmetic.
    h = 0
    for ch in name:
        code = ord(ch)
        h = ((h << 5) - h) + code
        # Truncate to 32 bits, then convert to signed.
        h &= 0xFFFFFFFF
        if h & 0x80000000:
            h -= 0x100000000
    return schemes[abs(h) % len(schemes)]


def get_recommended_color_scheme(
    semantic_type: Optional[str],
    encoding_type: str,
    unique_value_count: int = 10,
    field_name: str = "",
    values: Optional[list] = None,
    color_hint: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    if not semantic_type:
        if encoding_type == "quantitative":
            return {"scheme": "viridis", "type": "sequential", "reason": "default for quantitative"}
        if encoding_type == "ordinal":
            return {"scheme": "blues", "type": "sequential", "reason": "default for ordinal"}
        return {
            "scheme": "tableau20" if unique_value_count > 10 else "tableau10",
            "type": "categorical",
            "reason": "default for categorical",
        }

    if semantic_type == "Temperature":
        if color_hint and color_hint.get("type") == "diverging":
            return {"scheme": "redblue", "type": "diverging", "reason": "temperature diverging around freezing point"}
        return {"scheme": "reds", "type": "sequential", "reason": "temperature single-direction uses sequential"}

    if semantic_type == "Percentage":
        if color_hint and color_hint.get("type") == "diverging":
            return {"scheme": "redblue", "type": "diverging", "reason": "percentage spans positive and negative"}
        return {"scheme": "oranges", "type": "sequential", "reason": "percentage all same sign uses sequential"}

    if semantic_type in ("Price", "Amount"):
        if color_hint and color_hint.get("type") == "diverging":
            return {"scheme": "redblue", "type": "diverging", "reason": "financial data spans positive and negative"}
        return {"scheme": "goldgreen", "type": "sequential", "reason": "financial data uses gold-green"}

    if semantic_type == "Score":
        if color_hint and color_hint.get("type") == "diverging":
            return {"scheme": "redblue", "type": "diverging", "reason": "score/rating diverging around midpoint"}
        return {"scheme": "yelloworangebrown", "type": "sequential", "reason": "scores use warm sequential"}

    if semantic_type == "Rank":
        return {"scheme": "purples", "type": "sequential", "reason": "ranks use single-hue sequential"}

    if semantic_type == "Range":
        return {"scheme": "blues", "type": "sequential", "reason": "range groups use sequential"}

    if semantic_type in ordinalTypes and semantic_type in (
        "Year", "Quarter", "Month", "Week", "Day", "Hour", "Decade",
    ):
        return {"scheme": "viridis", "type": "sequential", "reason": "temporal granules use perceptually uniform"}

    if get_registry_entry(semantic_type or "")["t1"] == "GeoPlace":
        if unique_value_count <= 10:
            return {"scheme": "set2", "type": "categorical", "reason": "geographic regions use distinct pastels"}
        return {"scheme": "tableau20", "type": "categorical", "reason": "many regions use large categorical"}

    if semantic_type in ("Status", "Boolean"):
        return {"scheme": "set1", "type": "categorical", "reason": "status uses high-contrast categorical"}

    if semantic_type == "Category":
        return {
            "scheme": "tableau20" if unique_value_count > 10 else "tableau10",
            "type": "categorical",
            "reason": "categories use standard categorical",
        }

    if semantic_type == "Name":
        return {
            "scheme": "tableau20" if unique_value_count > 8 else "set2",
            "type": "categorical",
            "reason": "names use readable categorical",
        }

    if semantic_type == "Duration":
        return {"scheme": "oranges", "type": "sequential", "reason": "duration uses intensity-based sequential"}

    if semantic_type in measureTypes:
        if color_hint and color_hint.get("type") == "diverging":
            return {"scheme": "redblue", "type": "diverging", "reason": "measure with diverging nature"}
        sequential_schemes = ["viridis", "blues", "greens", "reds", "yelloworangebrown", "goldgreen"]
        return {
            "scheme": _pick_scheme(sequential_schemes, field_name),
            "type": "sequential",
            "reason": "measures use perceptually uniform sequential",
        }

    if semantic_type in ordinalTypes or encoding_type == "ordinal":
        ordinal_schemes = ["blues", "greens", "purples", "oranges"]
        return {
            "scheme": _pick_scheme(ordinal_schemes, field_name),
            "type": "sequential",
            "reason": "ordinal data uses sequential scheme",
        }

    if encoding_type in ("nominal", "temporal"):
        return {
            "scheme": "tableau20" if unique_value_count > 10 else "tableau10",
            "type": "categorical",
            "reason": "default categorical palette",
        }

    return {"scheme": "viridis", "type": "sequential", "reason": "universal fallback"}


# ---------------------------------------------------------------------------
# Canonical ordinal sort orders
# ---------------------------------------------------------------------------

_MONTH_FULL = ["January", "February", "March", "April", "May", "June",
               "July", "August", "September", "October", "November", "December"]
_MONTH_ABBR3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
_MONTH_NUM = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]

_DOW_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
_DOW_ABBR3 = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
_DOW_ABBR2 = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
_DOW_FULL_SUN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
_DOW_ABBR3_SUN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

_QUARTER_LABELS = ["Q1", "Q2", "Q3", "Q4"]

_COMPASS_8 = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
_COMPASS_8_FULL = ["North", "Northeast", "East", "Southeast", "South", "Southwest", "West", "Northwest"]
_COMPASS_4 = ["N", "E", "S", "W"]
_COMPASS_4_FULL = ["North", "East", "South", "West"]


_ORDINAL_SEQUENCES: dict[str, list[dict[str, Any]]] = {
    "Month": [
        {"labels": _MONTH_FULL, "caseInsensitive": True},
        {"labels": _MONTH_ABBR3, "caseInsensitive": True},
        {"labels": _MONTH_NUM, "caseInsensitive": False},
    ],
    "Day": [
        {"labels": _DOW_FULL, "caseInsensitive": True},
        {"labels": _DOW_ABBR3, "caseInsensitive": True},
        {"labels": _DOW_ABBR2, "caseInsensitive": True},
        {"labels": _DOW_FULL_SUN, "caseInsensitive": True},
        {"labels": _DOW_ABBR3_SUN, "caseInsensitive": True},
    ],
    "Quarter": [
        {"labels": _QUARTER_LABELS, "caseInsensitive": True},
    ],
    "Direction": [
        {"labels": _COMPASS_8, "caseInsensitive": True},
        {"labels": _COMPASS_8_FULL, "caseInsensitive": True},
        {"labels": _COMPASS_4, "caseInsensitive": True},
        {"labels": _COMPASS_4_FULL, "caseInsensitive": True},
    ],
}


def _build_lookup(seq: dict[str, Any]) -> dict[str, int]:
    m: dict[str, int] = {}
    labels = seq["labels"]
    ci = seq["caseInsensitive"]
    for i, label in enumerate(labels):
        key = label.lower() if ci else label
        m[key] = i
    return m


def _match_sequence(values: list[Any], sequences: list[dict[str, Any]]) -> Optional[list[str]]:
    seen: dict[str, None] = {}
    for v in values:
        s = str(v) if v is not None else ""
        if s and s not in seen:
            seen[s] = None
    unique_values = list(seen.keys())
    if not unique_values:
        return None

    for seq in sequences:
        lookup = _build_lookup(seq)
        ci = seq["caseInsensitive"]
        matched: list[tuple[str, int]] = []
        unmatched: list[str] = []
        for val in unique_values:
            key = val.lower() if ci else val
            idx = lookup.get(key)
            if idx is not None:
                matched.append((val, idx))
            else:
                unmatched.append(val)
        if len(matched) >= len(unique_values) * 0.6 and len(matched) >= 2:
            matched.sort(key=lambda p: p[1])
            result = [v for v, _ in matched]
            result.extend(unmatched)
            return result
    return None


def infer_ordinal_sort_order(semantic_type: str, values: list[Any]) -> Optional[list[str]]:
    sequences = _ORDINAL_SEQUENCES.get(semantic_type)
    if sequences:
        return _match_sequence(values, sequences)

    if not semantic_type or semantic_type in ("Category", "Unknown"):
        for seqs in _ORDINAL_SEQUENCES.values():
            result = _match_sequence(values, seqs)
            if result:
                return result

    return None
