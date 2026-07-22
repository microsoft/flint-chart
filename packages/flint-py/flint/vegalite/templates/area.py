"""Area Chart template."""
from __future__ import annotations

from .utils import default_build_encodings, set_mark_prop


def _apply_interpolate(vg_spec, config):
    if not config or not config.get("interpolate"):
        return
    vg_spec["mark"] = set_mark_prop(vg_spec.get("mark"), "interpolate", config["interpolate"])


def _area_declare_layout(cs, table, chart_properties):
    return {
        "paramOverrides": {
            "continuousMarkCrossSection": {"x": 100, "y": 20, "seriesCountAxis": "auto"},
            "facetAspectRatioResistance": 0.5,
        },
    }


def _area_instantiate(spec, ctx):
    default_build_encodings(spec, ctx["resolvedEncodings"])
    config = ctx.get("chartProperties")
    _apply_interpolate(spec, config)
    if config:
        opacity = config.get("opacity")
        if opacity is not None and opacity < 1:
            spec["mark"] = set_mark_prop(spec.get("mark"), "opacity", opacity)
        stack_mode = config.get("stackMode")
        if stack_mode:
            for axis in ("x", "y"):
                enc = (spec.get("encoding") or {}).get(axis)
                if enc and (enc.get("type") == "quantitative" or enc.get("aggregate")):
                    spec["encoding"][axis]["stack"] = None if stack_mode == "layered" else stack_mode
                    break


area_chart_def = {
    "chart": "Area Chart",
    "template": {"mark": "area", "encoding": {}},
    "channels": ["x", "y", "color", "opacity", "column", "row"],
    "markCognitiveChannel": "area",
    "declareLayoutMode": _area_declare_layout,
    "instantiate": _area_instantiate,
    "properties": [
        {
            "key": "interpolate", "label": "Curve", "type": "discrete",
            "options": [
                {"value": None, "label": "Default (linear)"},
                {"value": "linear", "label": "Linear"},
                {"value": "monotone", "label": "Monotone (smooth)"},
                {"value": "step", "label": "Step"},
                {"value": "step-before", "label": "Step Before"},
                {"value": "step-after", "label": "Step After"},
                {"value": "basis", "label": "Basis (smooth)"},
                {"value": "cardinal", "label": "Cardinal"},
                {"value": "catmull-rom", "label": "Catmull-Rom"},
            ],
        },
        {"key": "opacity", "label": "Opacity", "type": "continuous",
         "min": 0.1, "max": 1, "step": 0.05, "defaultValue": 0.7,
         "check": lambda ctx: {"applicable": bool(
             ((ctx.get("encodings") or {}).get("color") or {}).get("field")
             and (ctx.get("chartProperties") or {}).get("stackMode") == "layered"
         )}},
        {"key": "stackMode", "label": "Stack", "type": "discrete",
         # A stack mode only does something when a series dimension (color) is
         # present to stack; without it there is a single area band.
         "check": lambda ctx: {"applicable": bool(((ctx.get("encodings") or {}).get("color") or {}).get("field"))},
         "options": [
             {"value": None, "label": "Stacked (default)"},
             {"value": "normalize", "label": "Normalize (100%)"},
             {"value": "center", "label": "Center"},
             {"value": "layered", "label": "Layered (overlap)"},
         ]},
    ],
}


# ─── Streamgraph ────────────────────────────────────────────────────────────

def _streamgraph_instantiate(spec, ctx):
    default_build_encodings(spec, ctx["resolvedEncodings"])
    encoding = spec.get("encoding") or {}
    y_enc = encoding.get("y")
    x_enc = encoding.get("x")
    if y_enc and not y_enc.get("stack"):
        y_enc["stack"] = "center"
        y_enc["axis"] = None
    elif x_enc and not x_enc.get("stack"):
        x_enc["stack"] = "center"
        x_enc["axis"] = None
    _apply_interpolate(spec, ctx.get("chartProperties"))


streamgraph_def = {
    "chart": "Streamgraph",
    "template": {"mark": "area", "encoding": {}},
    "channels": ["x", "y", "color", "column", "row"],
    "markCognitiveChannel": "area",
    "declareLayoutMode": _area_declare_layout,
    "instantiate": _streamgraph_instantiate,
    "properties": [
        {
            "key": "interpolate", "label": "Curve", "type": "discrete",
            "options": [
                {"value": None, "label": "Default (linear)"},
                {"value": "linear", "label": "Linear"},
                {"value": "monotone", "label": "Monotone (smooth)"},
                {"value": "step", "label": "Step"},
                {"value": "step-before", "label": "Step Before"},
                {"value": "step-after", "label": "Step After"},
                {"value": "basis", "label": "Basis (smooth)"},
                {"value": "cardinal", "label": "Cardinal"},
                {"value": "catmull-rom", "label": "Catmull-Rom"},
            ],
        },
    ],
}
