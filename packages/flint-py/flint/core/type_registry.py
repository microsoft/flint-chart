"""Port of src/lib/agents-chart/core/type-registry.ts.

Static registry mapping every recognized semantic type to its tier
membership and orthogonal compilation dimensions.
"""

from __future__ import annotations

from typing import Any


VisCategory = str  # 'quantitative' | 'ordinal' | 'nominal' | 'temporal' | 'geographic'
T0Family = str
T1Category = str
DomainShape = str
AggRole = str
DivergingClass = str
FormatClass = str
ZeroBaseline = str


TYPE_REGISTRY: dict[str, dict[str, Any]] = {
    # --- Temporal: DateTime ---
    "DateTime":    {"t0": "Temporal", "t1": "DateTime", "visEncodings": ["temporal"],            "aggRole": "dimension",  "domainShape": "open",    "diverging": "none", "formatClass": "plain",       "zeroBaseline": "none",      "zeroPad": 0},
    "Date":        {"t0": "Temporal", "t1": "DateTime", "visEncodings": ["temporal"],            "aggRole": "dimension",  "domainShape": "open",    "diverging": "none", "formatClass": "plain",       "zeroBaseline": "none",      "zeroPad": 0},
    "Time":        {"t0": "Temporal", "t1": "DateTime", "visEncodings": ["temporal"],            "aggRole": "dimension",  "domainShape": "open",    "diverging": "none", "formatClass": "plain",       "zeroBaseline": "none",      "zeroPad": 0},
    "Timestamp":   {"t0": "Temporal", "t1": "DateTime", "visEncodings": ["temporal"],            "aggRole": "dimension",  "domainShape": "open",    "diverging": "none", "formatClass": "plain",       "zeroBaseline": "none",      "zeroPad": 0},

    # --- Temporal: DateGranule ---
    "Year":        {"t0": "Temporal", "t1": "DateGranule", "visEncodings": ["temporal", "ordinal"], "aggRole": "dimension", "domainShape": "open",   "diverging": "none", "formatClass": "integer",     "zeroBaseline": "arbitrary", "zeroPad": 0.03},
    "Quarter":     {"t0": "Temporal", "t1": "DateGranule", "visEncodings": ["ordinal"],             "aggRole": "dimension", "domainShape": "cyclic", "diverging": "none", "formatClass": "plain",       "zeroBaseline": "none",      "zeroPad": 0},
    "Month":       {"t0": "Temporal", "t1": "DateGranule", "visEncodings": ["ordinal"],             "aggRole": "dimension", "domainShape": "cyclic", "diverging": "none", "formatClass": "plain",       "zeroBaseline": "none",      "zeroPad": 0},
    "Week":        {"t0": "Temporal", "t1": "DateGranule", "visEncodings": ["ordinal"],             "aggRole": "dimension", "domainShape": "cyclic", "diverging": "none", "formatClass": "plain",       "zeroBaseline": "none",      "zeroPad": 0},
    "Day":         {"t0": "Temporal", "t1": "DateGranule", "visEncodings": ["ordinal"],             "aggRole": "dimension", "domainShape": "cyclic", "diverging": "none", "formatClass": "plain",       "zeroBaseline": "none",      "zeroPad": 0},
    "Hour":        {"t0": "Temporal", "t1": "DateGranule", "visEncodings": ["ordinal"],             "aggRole": "dimension", "domainShape": "cyclic", "diverging": "none", "formatClass": "integer",     "zeroBaseline": "arbitrary", "zeroPad": 0},
    "YearMonth":   {"t0": "Temporal", "t1": "DateGranule", "visEncodings": ["temporal", "ordinal"], "aggRole": "dimension", "domainShape": "open",   "diverging": "none", "formatClass": "plain",       "zeroBaseline": "none",      "zeroPad": 0},
    "YearQuarter": {"t0": "Temporal", "t1": "DateGranule", "visEncodings": ["temporal", "ordinal"], "aggRole": "dimension", "domainShape": "open",   "diverging": "none", "formatClass": "plain",       "zeroBaseline": "none",      "zeroPad": 0},
    "YearWeek":    {"t0": "Temporal", "t1": "DateGranule", "visEncodings": ["temporal", "ordinal"], "aggRole": "dimension", "domainShape": "open",   "diverging": "none", "formatClass": "plain",       "zeroBaseline": "none",      "zeroPad": 0},
    "Decade":      {"t0": "Temporal", "t1": "DateGranule", "visEncodings": ["temporal", "ordinal"], "aggRole": "dimension", "domainShape": "open",   "diverging": "none", "formatClass": "integer",     "zeroBaseline": "arbitrary", "zeroPad": 0.03},

    # --- Temporal: Duration ---
    "Duration":    {"t0": "Temporal", "t1": "Duration", "visEncodings": ["quantitative"],         "aggRole": "additive",   "domainShape": "open",    "diverging": "none", "formatClass": "unit-suffix", "zeroBaseline": "meaningful", "zeroPad": 0},

    # --- Measure: Amount ---
    "Amount":      {"t0": "Measure", "t1": "Amount", "visEncodings": ["quantitative"],            "aggRole": "additive",   "domainShape": "open",    "diverging": "none",        "formatClass": "currency",    "zeroBaseline": "meaningful", "zeroPad": 0},
    "Price":       {"t0": "Measure", "t1": "Amount", "visEncodings": ["quantitative"],            "aggRole": "intensive",  "domainShape": "open",    "diverging": "none",        "formatClass": "currency",    "zeroBaseline": "meaningful", "zeroPad": 0},

    # --- Measure: Physical ---
    "Quantity":    {"t0": "Measure", "t1": "Physical", "visEncodings": ["quantitative"],          "aggRole": "additive",   "domainShape": "open",    "diverging": "none",        "formatClass": "unit-suffix", "zeroBaseline": "meaningful", "zeroPad": 0},
    "Temperature": {"t0": "Measure", "t1": "Physical", "visEncodings": ["quantitative"],          "aggRole": "intensive",  "domainShape": "open",    "diverging": "conditional", "formatClass": "unit-suffix", "zeroBaseline": "arbitrary",  "zeroPad": 0.05},

    # --- Measure: Proportion ---
    "Percentage":  {"t0": "Measure", "t1": "Proportion", "visEncodings": ["quantitative"],        "aggRole": "intensive",  "domainShape": "bounded", "diverging": "none",        "formatClass": "percent",     "zeroBaseline": "contextual", "zeroPad": 0},

    # --- Measure: SignedMeasure ---
    "Profit":             {"t0": "Measure", "t1": "SignedMeasure", "visEncodings": ["quantitative"], "aggRole": "signed-additive", "domainShape": "open",    "diverging": "conditional", "formatClass": "decimal", "zeroBaseline": "meaningful", "zeroPad": 0},
    "PercentageChange":   {"t0": "Measure", "t1": "SignedMeasure", "visEncodings": ["quantitative"], "aggRole": "intensive",       "domainShape": "open",    "diverging": "conditional", "formatClass": "percent", "zeroBaseline": "contextual", "zeroPad": 0.05},
    "Sentiment":          {"t0": "Measure", "t1": "SignedMeasure", "visEncodings": ["quantitative"], "aggRole": "intensive",       "domainShape": "open",    "diverging": "inherent",    "formatClass": "decimal", "zeroBaseline": "meaningful", "zeroPad": 0},
    "Correlation":        {"t0": "Measure", "t1": "SignedMeasure", "visEncodings": ["quantitative"], "aggRole": "intensive",       "domainShape": "bounded", "diverging": "inherent",    "formatClass": "decimal", "zeroBaseline": "meaningful", "zeroPad": 0},

    # --- Measure: GenericMeasure ---
    "Count":       {"t0": "Measure", "t1": "GenericMeasure", "visEncodings": ["quantitative"],     "aggRole": "additive",   "domainShape": "open",    "diverging": "none",        "formatClass": "integer", "zeroBaseline": "meaningful", "zeroPad": 0},
    # A measure whose values should not be added up (or whose additivity is unknown); use Count, Amount, Quantity or Profit for totals.
    "Number":      {"t0": "Measure", "t1": "GenericMeasure", "visEncodings": ["quantitative"],     "aggRole": "measure",    "domainShape": "open",    "diverging": "none",        "formatClass": "decimal", "zeroBaseline": "meaningful", "zeroPad": 0},

    # --- Discrete ---
    "Rank":        {"t0": "Discrete", "t1": "Rank",  "visEncodings": ["ordinal"],                  "aggRole": "dimension",  "domainShape": "open",    "diverging": "none",        "formatClass": "integer", "zeroBaseline": "arbitrary",  "zeroPad": 0.08},
    "Score":       {"t0": "Discrete", "t1": "Score", "visEncodings": ["quantitative", "ordinal"], "aggRole": "intensive", "domainShape": "bounded", "diverging": "conditional", "formatClass": "decimal", "zeroBaseline": "contextual", "zeroPad": 0.05},
    "ID":          {"t0": "Identifier", "t1": "ID",  "visEncodings": ["nominal"],                 "aggRole": "identifier", "domainShape": "open",    "diverging": "none",        "formatClass": "plain",   "zeroBaseline": "arbitrary",  "zeroPad": 0},

    # --- Geographic ---
    "Latitude":    {"t0": "Geographic", "t1": "GeoCoordinate", "visEncodings": ["quantitative", "geographic"], "aggRole": "dimension", "domainShape": "fixed", "diverging": "none", "formatClass": "decimal", "zeroBaseline": "arbitrary", "zeroPad": 0.02},
    "Longitude":   {"t0": "Geographic", "t1": "GeoCoordinate", "visEncodings": ["quantitative", "geographic"], "aggRole": "dimension", "domainShape": "fixed", "diverging": "none", "formatClass": "decimal", "zeroBaseline": "arbitrary", "zeroPad": 0.02},
    "Country":     {"t0": "Geographic", "t1": "GeoPlace",      "visEncodings": ["nominal"],     "aggRole": "dimension",  "domainShape": "open",  "diverging": "none", "formatClass": "plain", "zeroBaseline": "none", "zeroPad": 0},
    "State":       {"t0": "Geographic", "t1": "GeoPlace",      "visEncodings": ["nominal"],     "aggRole": "dimension",  "domainShape": "open",  "diverging": "none", "formatClass": "plain", "zeroBaseline": "none", "zeroPad": 0},
    "City":        {"t0": "Geographic", "t1": "GeoPlace",      "visEncodings": ["nominal"],     "aggRole": "dimension",  "domainShape": "open",  "diverging": "none", "formatClass": "plain", "zeroBaseline": "none", "zeroPad": 0},
    "Region":      {"t0": "Geographic", "t1": "GeoPlace",      "visEncodings": ["nominal"],     "aggRole": "dimension",  "domainShape": "open",  "diverging": "none", "formatClass": "plain", "zeroBaseline": "none", "zeroPad": 0},
    "Address":     {"t0": "Geographic", "t1": "GeoPlace",      "visEncodings": ["nominal"],     "aggRole": "dimension",  "domainShape": "open",  "diverging": "none", "formatClass": "plain", "zeroBaseline": "none", "zeroPad": 0},
    "ZipCode":     {"t0": "Geographic", "t1": "GeoPlace",      "visEncodings": ["nominal"],     "aggRole": "identifier", "domainShape": "open",  "diverging": "none", "formatClass": "plain", "zeroBaseline": "none", "zeroPad": 0},

    # --- Categorical: Entity ---
    "Category":    {"t0": "Categorical", "t1": "Entity", "visEncodings": ["nominal"],          "aggRole": "dimension",  "domainShape": "open",  "diverging": "none", "formatClass": "plain", "zeroBaseline": "none", "zeroPad": 0},
    "Name":        {"t0": "Categorical", "t1": "Entity", "visEncodings": ["nominal"],          "aggRole": "dimension",  "domainShape": "open",  "diverging": "none", "formatClass": "plain", "zeroBaseline": "none", "zeroPad": 0},

    # --- Categorical: Coded ---
    "Status":      {"t0": "Categorical", "t1": "Coded", "visEncodings": ["nominal"],           "aggRole": "dimension",  "domainShape": "open",  "diverging": "none", "formatClass": "plain", "zeroBaseline": "none", "zeroPad": 0},
    "Boolean":     {"t0": "Categorical", "t1": "Coded", "visEncodings": ["nominal"],           "aggRole": "dimension",  "domainShape": "fixed", "diverging": "none", "formatClass": "plain", "zeroBaseline": "none", "zeroPad": 0},
    "Direction":   {"t0": "Categorical", "t1": "Coded", "visEncodings": ["ordinal", "nominal"], "aggRole": "dimension",  "domainShape": "cyclic", "diverging": "none", "formatClass": "plain", "zeroBaseline": "none", "zeroPad": 0},

    # --- Categorical: Binned ---
    "Range":       {"t0": "Categorical", "t1": "Binned", "visEncodings": ["ordinal"],          "aggRole": "dimension",  "domainShape": "open",  "diverging": "none", "formatClass": "plain", "zeroBaseline": "none", "zeroPad": 0},

    # --- Fallbacks ---
    "Unknown":     {"t0": "Categorical", "t1": "Entity", "visEncodings": ["nominal"],          "aggRole": "dimension",  "domainShape": "open",  "diverging": "none", "formatClass": "plain", "zeroBaseline": "none", "zeroPad": 0},
}


UNKNOWN_ENTRY: dict[str, Any] = {
    "t0": "Categorical", "t1": "Entity",
    "visEncodings": ["nominal"],
    "aggRole": "dimension",
    "domainShape": "open",
    "diverging": "none",
    "formatClass": "plain",
    "zeroBaseline": "none",
    "zeroPad": 0,
}


def get_registry_entry(semantic_type: str) -> dict[str, Any]:
    """Look up a semantic type in the registry. Falls back to UNKNOWN_ENTRY."""
    return TYPE_REGISTRY.get(semantic_type, UNKNOWN_ENTRY)


def is_registered(semantic_type: str) -> bool:
    return semantic_type in TYPE_REGISTRY


def get_registered_types() -> list[str]:
    return list(TYPE_REGISTRY.keys())
