"""Bar Chart templates."""
from __future__ import annotations

import math

from ...core import js_round
from ...core.encoding_actions import make_sort_action
from ...core.field_semantics import snap_to_bound_heuristic
from .utils import (
    default_build_encodings,
    set_mark_prop,
    adjust_bar_marks,
    adjust_rect_tiling,
    detect_banded_axis_from_semantics,
    detect_banded_axis_force_discrete,
    resolve_as_discrete,
    align_stack_order_to_color_order,
)


HEATMAP_SCHEME_COLORS: dict[str, tuple[str, str]] = {
    "viridis": ("#440154", "#fde725"),
    "inferno": ("#000004", "#fcffa4"),
    "magma": ("#000004", "#fcfdbf"),
    "plasma": ("#0d0887", "#f0f921"),
    "turbo": ("#30123b", "#7a0403"),
    "blues": ("#f7fbff", "#08519c"),
    "reds": ("#fff5f0", "#a50f15"),
    "greens": ("#f7fcf5", "#00441b"),
    "oranges": ("#fff5eb", "#7f2704"),
    "purples": ("#fcfbfd", "#3f007d"),
    "greys": ("#ffffff", "#252525"),
}


def _hex_luma(hex_str: str) -> float:
    s = hex_str.lstrip("#")
    if len(s) != 6:
        return 0.0
    try:
        n = int(s, 16)
    except ValueError:
        return 0.0
    r = (n >> 16) & 255
    g = (n >> 8) & 255
    b = n & 255
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0


def _get_safe_heatmap_intrinsic_domain(ctx: dict, color_field):
    if not color_field:
        return None
    color_channel = (ctx.get("channelSemantics") or {}).get("color") or {}
    annotation = color_channel.get("semanticAnnotation") or {}
    if annotation.get("intrinsicDomain"):
        return annotation["intrinsicDomain"]
    semantic_type = annotation.get("semanticType")
    if semantic_type == "Correlation":
        return [-1, 1]
    if semantic_type == "Latitude":
        return [-90, 90]
    if semantic_type == "Longitude":
        return [-180, 180]
    return None


def _bar_declare_layout(cs, table, chart_properties):
    result = detect_banded_axis_from_semantics(cs, table, {"preferAxis": "x"})
    if result:
        return {
            "axisFlags": {result["axis"]: {"banded": True}},
            "resolvedTypes": result.get("resolvedTypes"),
        }
    return {
        "axisFlags": {"x": {"banded": True}},
        "resolvedTypes": None,
    }


def _bar_instantiate(spec, ctx):
    default_build_encodings(spec, ctx["resolvedEncodings"])
    config = ctx.get("chartProperties")
    if config and config.get("cornerRadius", 0) > 0:
        spec["mark"] = set_mark_prop(spec.get("mark"), "cornerRadius", config["cornerRadius"])
    adjust_bar_marks(spec, ctx)


bar_chart_def = {
    "chart": "Bar Chart",
    "template": {"mark": "bar", "encoding": {}},
    "channels": ["x", "y", "color", "opacity", "column", "row"],
    "markCognitiveChannel": "length",
    "declareLayoutMode": _bar_declare_layout,
    "instantiate": _bar_instantiate,
    "properties": [
        {"key": "cornerRadius", "label": "Corners", "type": "continuous", "min": 0, "max": 15, "step": 1, "defaultValue": 0},
    ],
    "encodingActions": [make_sort_action()],
}


# ─── Grouped Bar Chart ──────────────────────────────────────────────────────

def _grouped_bar_declare(cs, table, chart_properties):
    result = detect_banded_axis_force_discrete(cs, table, {"preferAxis": "x"})
    axis = (result["axis"] if result else None) or "x"
    return {
        "axisFlags": {axis: {"banded": True}},
        "resolvedTypes": result.get("resolvedTypes") if result else None,
    }


def _grouped_bar_instantiate(spec, ctx):
    default_build_encodings(spec, ctx["resolvedEncodings"])
    adjust_bar_marks(spec, ctx)


grouped_bar_chart_def = {
    "chart": "Grouped Bar Chart",
    "template": {"mark": "bar", "encoding": {}},
    "channels": ["x", "y", "group", "column", "row"],
    "markCognitiveChannel": "length",
    "declareLayoutMode": _grouped_bar_declare,
    "instantiate": _grouped_bar_instantiate,
    "encodingActions": [make_sort_action()],
}


# ─── Stacked Bar Chart ──────────────────────────────────────────────────────

def _stacked_bar_declare(cs, table, chart_properties):
    result = detect_banded_axis_from_semantics(cs, table, {"preferAxis": "x"})
    if result:
        return {
            "axisFlags": {result["axis"]: {"banded": True}},
            "resolvedTypes": result.get("resolvedTypes"),
            "paramOverrides": {
                "continuousMarkCrossSection": {"x": 20, "y": 20, "seriesCountAxis": "auto"},
            },
        }
    return {
        "axisFlags": {"x": {"banded": True}},
        "resolvedTypes": None,
        "paramOverrides": {
            "continuousMarkCrossSection": {"x": 20, "y": 20, "seriesCountAxis": "auto"},
        },
    }


def _stacked_bar_instantiate(spec, ctx):
    default_build_encodings(spec, ctx["resolvedEncodings"])
    config = ctx.get("chartProperties")
    if config and config.get("stackMode"):
        encoding = spec.get("encoding") or {}
        for axis in ("x", "y"):
            ae = encoding.get(axis)
            if ae and (ae.get("type") == "quantitative" or ae.get("aggregate")):
                encoding[axis]["stack"] = None if config["stackMode"] == "layered" else config["stackMode"]
                break
    align_stack_order_to_color_order(spec, ctx)
    adjust_bar_marks(spec, ctx)


def _stack_mode_check(ctx: dict) -> dict:
    # A stack mode only does something when a series dimension (color) is
    # present to stack; without it there is a single bar per category.
    return {"applicable": bool(((ctx.get("encodings") or {}).get("color") or {}).get("field"))}


stacked_bar_chart_def = {
    "chart": "Stacked Bar Chart",
    "template": {"mark": "bar", "encoding": {}},
    "channels": ["x", "y", "color", "column", "row"],
    "markCognitiveChannel": "length",
    "declareLayoutMode": _stacked_bar_declare,
    "instantiate": _stacked_bar_instantiate,
    "properties": [
        {"key": "stackMode", "label": "Stack", "type": "discrete",
         "check": _stack_mode_check,
         "options": [
            {"value": None, "label": "Stacked (default)"},
            {"value": "normalize", "label": "Normalize (100%)"},
            {"value": "center", "label": "Center"},
            {"value": "layered", "label": "Layered (overlap)"},
        ]},
    ],
    "encodingActions": [make_sort_action()],
}


# ─── Histogram ──────────────────────────────────────────────────────────────

def _histogram_instantiate(spec, ctx):
    default_build_encodings(spec, ctx["resolvedEncodings"])
    # ``binCount`` is the maxbins cap; 0 (auto) leaves the template's ``bin: True``
    # so Vega chooses. maxbins is only an upper bound — Vega snaps to "nice"
    # boundaries, so the rendered count is usually a bit below the cap.
    config = ctx.get("chartProperties") or {}
    bin_count = config.get("binCount")
    if bin_count and (spec.get("encoding") or {}).get("x"):
        spec["encoding"]["x"]["bin"] = {"maxbins": bin_count}
    adjust_bar_marks(spec, ctx)


histogram_def = {
    "chart": "Histogram",
    "template": {
        "mark": "bar",
        "encoding": {
            "x": {"bin": True},
            "y": {"aggregate": "count"},
        },
    },
    "channels": ["x", "color", "column", "row"],
    "markCognitiveChannel": "length",
    "instantiate": _histogram_instantiate,
    "properties": [
        # 0 == auto (let the engine choose); 5–50 caps the bins (maxbins).
        {"key": "binCount", "label": "Max Bins", "type": "continuous", "min": 5, "max": 50, "step": 1, "defaultValue": 0},
    ],
}


# ─── Pyramid Chart ──────────────────────────────────────────────────────────

def _pyramid_declare(cs, table, chart_properties):
    return {"axisFlags": {"y": {"banded": True}}}


def _pyramid_instantiate(spec, ctx):
    encs = ctx["resolvedEncodings"]
    y = encs.get("y")
    x = encs.get("x")
    color = encs.get("color")

    def is_discrete(enc):
        return enc and enc.get("type") in ("nominal", "ordinal")

    def is_quant(enc):
        return enc and enc.get("type") in ("quantitative", "temporal")

    if is_discrete(x) and is_quant(y):
        x, y = y, x

    if y:
        y_enc = dict(y)
        resolve_as_discrete(y_enc, ctx.get("table") or [])
        spec["hconcat"][0]["encoding"]["y"] = {**spec["hconcat"][0]["encoding"].get("y", {}), **y_enc}
        spec["hconcat"][1]["encoding"]["y"] = {**spec["hconcat"][1]["encoding"].get("y", {}), **y_enc}
    if x:
        spec["hconcat"][0]["encoding"]["x"] = {**spec["hconcat"][0]["encoding"].get("x", {}), **x}
        spec["hconcat"][1]["encoding"]["x"] = {**spec["hconcat"][1]["encoding"].get("x", {}), **x}

    color_field = (color or {}).get("field")
    table = ctx.get("table")
    canvas_size = ctx.get("canvasSize")

    try:
        if table and color_field:
            seen = []
            seen_set = set()
            for r in table:
                v = r.get(color_field)
                if v not in seen_set:
                    seen_set.add(v)
                    seen.append(v)
            groups = seen
            left_group = groups[0]
            right_group = groups[1] if len(groups) > 1 else groups[0]
            spec["hconcat"][0]["transform"] = [{"filter": {"field": color_field, "equal": left_group}}]
            spec["hconcat"][1]["transform"] = [{"filter": {"field": color_field, "equal": right_group}}]
            spec["hconcat"][0]["title"] = str(left_group)
            spec["hconcat"][1]["title"] = str(right_group)
            if len(groups) > 2:
                if not spec.get("_warnings"):
                    spec["_warnings"] = []
                quoted = ", ".join(f"'{g}'" for g in groups)
                spec["_warnings"].append({
                    "severity": "warning",
                    "code": "too-many-groups-pyramid",
                    "message": (
                        f"Pyramid chart works best with exactly 2 groups, but found {len(groups)} ({quoted}). "
                        "Only the first two are shown."
                    ),
                    "channel": "color",
                    "field": color_field,
                })

        if table:
            x_field = spec["hconcat"][0]["encoding"].get("x", {}).get("field")
            if x_field:
                all_vals = [r.get(x_field) for r in table if isinstance(r.get(x_field), (int, float)) and not isinstance(r.get(x_field), bool)]
                if all_vals:
                    domain = [min(0, *all_vals), max(all_vals)]
                    cur_scale = spec["hconcat"][0]["encoding"]["x"].get("scale") or {}
                    spec["hconcat"][0]["encoding"]["x"]["scale"] = {**cur_scale, "domain": domain}
                    cur_scale2 = spec["hconcat"][1]["encoding"]["x"].get("scale") or {}
                    spec["hconcat"][1]["encoding"]["x"]["scale"] = {**cur_scale2, "domain": domain}
                if any(v < 0 for v in all_vals):
                    if not spec.get("_warnings"):
                        spec["_warnings"] = []
                    spec["_warnings"].append({
                        "severity": "warning",
                        "code": "negative-values-pyramid",
                        "message": f"Negative values detected in '{x_field}'. Pyramid charts work best with non-negative values.",
                        "channel": "x",
                        "field": x_field,
                    })

            base_width = (canvas_size or {}).get("width", 400)
            base_height = (canvas_size or {}).get("height", 320)

            facet_cols = 2
            facet_stretch = min(1.5, facet_cols ** 0.3)
            panel_width = js_round(max(40, base_width * facet_stretch / facet_cols))

            y_field = spec["hconcat"][0]["encoding"].get("y", {}).get("field")
            panel_height = base_height
            if y_field:
                seen_y = set()
                for r in table:
                    seen_y.add(r.get(y_field))
                y_cardinality = len(seen_y)
                base_ref_size = 300
                size_ratio = max(base_width, base_height) / base_ref_size
                default_step = js_round(20 * max(1, size_ratio))
                if y_cardinality > 0:
                    pressure = (y_cardinality * default_step) / base_height if base_height else 0
                    if pressure > 1:
                        stretch = min(2, pressure ** 0.5)
                        panel_height = js_round(base_height * stretch)

            for panel in spec["hconcat"]:
                panel["width"] = panel_width
                panel["height"] = panel_height
    except Exception:
        pass


pyramid_chart_def = {
    "chart": "Pyramid Chart",
    "template": {
        "spacing": 0,
        "resolve": {"scale": {"y": "shared"}},
        "hconcat": [
            {
                "mark": "bar",
                "encoding": {
                    "y": {},
                    "x": {"scale": {"reverse": True}, "stack": None},
                    "opacity": {"value": 0.9},
                    "color": {"value": "#4e79a7"},
                },
            },
            {
                "mark": "bar",
                "encoding": {
                    "y": {"axis": None},
                    "x": {"stack": None},
                    "opacity": {"value": 0.9},
                    "color": {"value": "#e15759"},
                },
            },
        ],
        "config": {"view": {"stroke": None}, "axis": {"grid": False}},
    },
    "channels": ["x", "y", "color"],
    "markCognitiveChannel": "length",
    "declareLayoutMode": _pyramid_declare,
    "instantiate": _pyramid_instantiate,
}


# ─── Heatmap ────────────────────────────────────────────────────────────────

def _heatmap_declare(cs, table, chart_properties):
    show_text_labels = bool((chart_properties or {}).get("showTextLabels"))
    result = {"axisFlags": {"x": {"banded": True}, "y": {"banded": True}}}
    # Labels need slightly larger cells so the value text isn't crushed,
    # but we keep this close to the unlabeled defaults (minStep 6 /
    # defaultBandSize 20) so a labeled heatmap doesn't balloon.
    if show_text_labels:
        result["paramOverrides"] = {"minStep": 9, "defaultBandSize": 22}
    return result


def _heatmap_instantiate(spec, ctx):
    default_build_encodings(spec, ctx["resolvedEncodings"])
    config = ctx.get("chartProperties") or {}
    show_text_labels = bool(config.get("showTextLabels"))
    encoding = spec.get("encoding") or {}
    color_enc = encoding.get("color") or {}
    color_field = color_enc.get("field")

    color_vals: list[float] = []
    if color_field:
        for r in (ctx.get("table") or []):
            v = r.get(color_field)
            if isinstance(v, bool):
                continue
            if isinstance(v, (int, float)):
                if v != v or v in (float("inf"), float("-inf")):
                    continue
                color_vals.append(float(v))
            else:
                try:
                    fv = float(v)
                except (TypeError, ValueError):
                    continue
                if fv != fv or fv in (float("inf"), float("-inf")):
                    continue
                color_vals.append(fv)

    observed_min = min(color_vals) if color_vals else 0
    observed_max = max(color_vals) if color_vals else 1

    existing_scheme = ((color_enc.get("scale") or {}).get("scheme"))
    # Color scheme is a Category-B encoding override: the compiler already
    # composed chartProperties.colorScheme onto encoding.color.scheme before
    # assembly (see apply_encoding_overrides). This also transparently
    # covers charts saved before the migration whose value lived in
    # chartProperties.colorScheme.
    enc_scheme = ((ctx.get("encodings") or {}).get("color") or {}).get("scheme")
    user_scheme = enc_scheme if (enc_scheme and enc_scheme != "default") else None
    scheme_name = user_scheme or existing_scheme
    is_diverging = scheme_name in ("blueorange", "redblue")
    intrinsic_domain = _get_safe_heatmap_intrinsic_domain(ctx, color_field)

    effective_min = intrinsic_domain[0] if intrinsic_domain else observed_min
    effective_max = intrinsic_domain[1] if intrinsic_domain else observed_max

    if color_enc:
        if not color_enc.get("scale"):
            color_enc["scale"] = {}
        if user_scheme:
            color_enc["scale"]["scheme"] = user_scheme
        if is_diverging and effective_min < 0 and effective_max > 0:
            sym = max(abs(effective_min), abs(effective_max))
            effective_min = -sym
            effective_max = sym
            color_enc["scale"]["domain"] = [-sym, sym]
            color_enc["scale"]["domainMid"] = 0
        elif intrinsic_domain:
            snapped = snap_to_bound_heuristic(intrinsic_domain, color_vals)
            if snapped:
                effective_min = snapped.get("min", observed_min)
                effective_max = snapped.get("max", observed_max)
            else:
                effective_min = observed_min
                effective_max = observed_max
            color_enc["scale"]["domain"] = [effective_min, effective_max]

    adjust_bar_marks(spec, ctx)
    adjust_rect_tiling(spec, ctx)

    if show_text_labels and color_field:
        base_encoding = spec.get("encoding") or {}
        x_encoding = base_encoding.get("x")
        y_encoding = base_encoding.get("y")
        color_encoding = base_encoding.get("color")
        span = effective_max - effective_min

        layout = ctx.get("layout") or {}
        x_step = layout.get("xStep") or 50
        y_step = layout.get("yStep") or 50
        cell_min_dim = min(x_step, y_step)
        # Keep the in-cell value text small so cells can stay compact (close
        # to the unlabeled heatmap). Cap at 9px and step down for tighter
        # cells rather than growing the font/cells to fit it.
        if cell_min_dim >= 40:
            label_font_size = 9
        elif cell_min_dim >= 28:
            label_font_size = 8
        else:
            label_font_size = 7
        label_format = ".2f" if cell_min_dim >= 44 else ".1f"

        sequential_palette = HEATMAP_SCHEME_COLORS.get(scheme_name or "viridis") or HEATMAP_SCHEME_COLORS["viridis"]
        high_is_light = _hex_luma(sequential_palette[1]) >= _hex_luma(sequential_palette[0])
        if span > 0:
            if is_diverging:
                strong_threshold = max(abs(effective_min), abs(effective_max)) * 0.5
            else:
                strong_threshold = effective_min + span * 0.6
        else:
            strong_threshold = None

        rect_encoding: dict = {}
        if x_encoding:
            rect_encoding["x"] = x_encoding
        if y_encoding:
            rect_encoding["y"] = y_encoding
        if color_encoding:
            rect_encoding["color"] = color_encoding

        text_encoding: dict = {}
        if x_encoding:
            text_encoding["x"] = x_encoding
        if y_encoding:
            text_encoding["y"] = y_encoding
        text_encoding["text"] = {
            "field": color_field,
            "type": "quantitative",
            "format": label_format,
        }
        if strong_threshold is None:
            text_encoding["color"] = {"value": "black"}
        else:
            if is_diverging:
                test_expr = (
                    f"datum.{color_field} > {strong_threshold} || "
                    f"datum.{color_field} < {-strong_threshold}"
                )
                cond_value = "white"
                base_value = "black"
            else:
                test_expr = f"datum.{color_field} >= {strong_threshold}"
                cond_value = "black" if high_is_light else "white"
                base_value = "white" if high_is_light else "black"
            text_encoding["color"] = {
                "condition": {"test": test_expr, "value": cond_value},
                "value": base_value,
            }

        spec["layer"] = [
            {"mark": spec.get("mark"), "encoding": rect_encoding},
            {
                "mark": {
                    "type": "text",
                    "align": "center",
                    "baseline": "middle",
                    "fontSize": label_font_size,
                },
                "encoding": text_encoding,
            },
        ]
        if "mark" in spec:
            del spec["mark"]


def _heatmap_color_scheme_set(encodings: dict, value):
    color = encodings.get("color") or {}
    return {**encodings, "color": {**color, "scheme": value}}


def _heatmap_color_scheme_get(encodings: dict):
    return (encodings.get("color") or {}).get("scheme")


heatmap_def = {
    "chart": "Heatmap",
    "template": {"mark": "rect", "encoding": {}},
    "channels": ["x", "y", "color", "column", "row"],
    "markCognitiveChannel": "color",
    "declareLayoutMode": _heatmap_declare,
    "instantiate": _heatmap_instantiate,
    "properties": [
        {"key": "showTextLabels", "label": "Show labels", "type": "binary", "defaultValue": False},
    ],
    # Color scheme is an encoding-level edit (writes encoding.scheme on the
    # color channel), so it is exposed as a Category-B encoding action rather
    # than a chart-native property. The host stores the chosen value as an
    # override in chartProperties.colorScheme; the compiler composes it onto
    # the encoding (see apply_encoding_overrides). `dependencies` tells the
    # host to reset the override when the color channel's binding changes.
    "encodingActions": [
        {
            "key": "colorScheme",
            "label": "Scheme",
            "isApplicable": lambda ctx: bool(((ctx.get("encodings") or {}).get("color") or {}).get("field")),
            "dependencies": ["color"],
            "control": {
                "type": "discrete",
                "options": [
                    {"value": None, "label": "Default"},
                    {"value": "viridis", "label": "Viridis"},
                    {"value": "inferno", "label": "Inferno"},
                    {"value": "magma", "label": "Magma"},
                    {"value": "plasma", "label": "Plasma"},
                    {"value": "turbo", "label": "Turbo"},
                    {"value": "blues", "label": "Blues"},
                    {"value": "reds", "label": "Reds"},
                    {"value": "greens", "label": "Greens"},
                    {"value": "oranges", "label": "Oranges"},
                    {"value": "purples", "label": "Purples"},
                    {"value": "greys", "label": "Greys"},
                    {"value": "blueorange", "label": "Blue-Orange (diverging)"},
                    {"value": "redblue", "label": "Red-Blue (diverging)"},
                ],
            },
            "get": _heatmap_color_scheme_get,
            "set": _heatmap_color_scheme_set,
        },
    ],
}
