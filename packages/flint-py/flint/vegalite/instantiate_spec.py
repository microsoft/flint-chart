"""Phase 2: Instantiate Spec — combine semantic decisions and layout into VL spec."""
from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any, Optional

from ..core.field_semantics import snap_to_bound_heuristic
from ..core.js_date import js_date_parse_ms


DEFAULT_QUANTITATIVE_AXIS_FORMAT = ",.12~g"


def _is_array(x: Any) -> bool:
    return isinstance(x, list)


def _parse_date_ms(v: Any) -> float:
    ms = js_date_parse_ms(v)
    return float("nan") if ms is None else ms


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


def _iso_z(ms: float) -> str:
    # JS: `new Date(ms).toISOString()`. Date constructor applies ToInteger
    # (truncate toward zero) to non-integer ms before formatting. Match that
    # before splitting into (sec, ms) so the milliseconds field is exact.
    ms_int = int(ms)
    seconds, ms_part = divmod(ms_int, 1000)
    dt = datetime.fromtimestamp(seconds, tz=timezone.utc)
    return f"{dt.year:04d}-{dt.month:02d}-{dt.day:02d}T{dt.hour:02d}:{dt.minute:02d}:{dt.second:02d}.{ms_part:03d}Z"


def vl_apply_layout_to_spec(vg_obj: dict, context: dict, warnings: list) -> None:
    channel_semantics = context["channelSemantics"]
    layout = context["layout"]
    canvas_size = context["canvasSize"]

    x_is_discrete = layout["xNominalCount"] > 0
    y_is_discrete = layout["yNominalCount"] > 0

    def collect_encoding_targets(ch: str) -> list:
        targets: list = []
        if vg_obj.get("encoding") and vg_obj["encoding"].get(ch):
            targets.append(vg_obj["encoding"][ch])
        if vg_obj.get("spec") and vg_obj["spec"].get("encoding") and vg_obj["spec"]["encoding"].get(ch):
            targets.append(vg_obj["spec"]["encoding"][ch])
        if isinstance(vg_obj.get("layer"), list):
            for layer in vg_obj["layer"]:
                if layer.get("encoding") and layer["encoding"].get(ch):
                    targets.append(layer["encoding"][ch])
        if vg_obj.get("spec") and isinstance(vg_obj["spec"].get("layer"), list):
            for layer in vg_obj["spec"]["layer"]:
                if layer.get("encoding") and layer["encoding"].get(ch):
                    targets.append(layer["encoding"][ch])
        return targets

    # --- Apply zero-baseline ---
    for ch in ("x", "y"):
        cs = channel_semantics.get(ch)
        if not cs or not cs.get("zero"):
            continue
        decision = cs["zero"]
        targets = [e for e in collect_encoding_targets(ch) if e.get("type") == "quantitative"]
        for enc in targets:
            if enc.get("bin"):
                continue
            if cs.get("field") and enc.get("field") and enc.get("field") != cs["field"]:
                continue
            if "scale" not in enc:
                enc["scale"] = {}
            if "zero" in enc["scale"]:
                continue
            if "domain" in enc["scale"] and isinstance(enc["scale"]["domain"], list):
                continue
            enc["scale"]["zero"] = decision["zero"]

    # --- Apply field-context semantic decisions ---
    _vl_apply_field_context(vg_obj, channel_semantics, collect_encoding_targets, context)

    # --- Apply safe default formatting to quantitative axes ---
    _vl_apply_default_quantitative_axis_format(collect_encoding_targets)

    # --- Apply temporal formatting ---
    def apply_temporal_format(enc, channel, cs):
        if not enc or not isinstance(enc, dict) or not cs or not cs.get("temporalFormat"):
            return
        if enc.get("type") == "temporal":
            if channel == "color":
                if "legend" not in enc:
                    enc["legend"] = {}
                enc["legend"]["format"] = cs["temporalFormat"]

    def apply_temporal_to_encoding(encoding: dict):
        for ch, enc in list(encoding.items()):
            apply_temporal_format(enc, ch, channel_semantics.get(ch))

    if vg_obj.get("encoding"):
        apply_temporal_to_encoding(vg_obj["encoding"])
    if vg_obj.get("spec") and vg_obj["spec"].get("encoding"):
        apply_temporal_to_encoding(vg_obj["spec"]["encoding"])
    if isinstance(vg_obj.get("layer"), list):
        for layer in vg_obj["layer"]:
            if layer.get("encoding"):
                apply_temporal_to_encoding(layer["encoding"])
    if vg_obj.get("spec") and isinstance(vg_obj["spec"].get("layer"), list):
        for layer in vg_obj["spec"]["layer"]:
            if layer.get("encoding"):
                apply_temporal_to_encoding(layer["encoding"])

    # --- Banded continuous axis domain padding ---
    for axis in ("x", "y"):
        banded_count = layout["xContinuousAsDiscrete"] if axis == "x" else layout["yContinuousAsDiscrete"]
        if banded_count <= 1:
            continue
        enc = (vg_obj.get("encoding") or {}).get(axis) or ((vg_obj.get("spec") or {}).get("encoding") or {}).get(axis)
        if not enc:
            continue
        if enc.get("bin"):
            continue
        is_temporal = enc.get("type") == "temporal"
        is_continuous = enc.get("type") == "quantitative" or is_temporal
        if not is_continuous:
            continue
        if enc.get("scale") and enc["scale"].get("domain"):
            continue

        numeric_vals = []
        for r in context["table"]:
            raw = r.get(enc["field"])
            if raw is None:
                v = float("nan")
            elif is_temporal:
                v = _parse_date_ms(raw)
            else:
                v = _to_number(raw)
            if not math.isnan(v):
                numeric_vals.append(v)
        if len(numeric_vals) <= 1:
            continue
        min_val = min(numeric_vals)
        max_val = max(numeric_vals)
        data_range = max_val - min_val
        if data_range == 0:
            continue
        pad = data_range / (banded_count - 1) / 2
        if "scale" not in enc:
            enc["scale"] = {}
        enc["scale"]["nice"] = False
        if is_temporal:
            enc["scale"]["domain"] = [_iso_z(min_val - pad), _iso_z(max_val + pad)]
        else:
            enc["scale"]["zero"] = False
            enc["scale"]["domain"] = [min_val - pad, max_val + pad]

    # --- Canvas sizing ---
    axis_x_config: dict = {
        "labelLimit": layout["xLabel"]["labelLimit"],
        "labelFontSize": layout["xLabel"]["fontSize"],
    }
    if layout["xLabel"].get("labelAngle") is not None:
        axis_x_config["labelAngle"] = layout["xLabel"]["labelAngle"]
        axis_x_config["labelAlign"] = layout["xLabel"].get("labelAlign")
        axis_x_config["labelBaseline"] = layout["xLabel"].get("labelBaseline")
    axis_y_config: dict = {"labelFontSize": layout["yLabel"]["fontSize"]}

    view: dict = {
        "continuousWidth": layout["subplotWidth"],
        "continuousHeight": layout["subplotHeight"],
    }
    if vg_obj.get("encoding") is None:
        view["stroke"] = None

    vg_obj["config"] = {
        "view": view,
        "axisX": axis_x_config,
        "axisY": axis_y_config,
    }

    # --- Step-based sizing for discrete axes ---
    if x_is_discrete and not isinstance(vg_obj.get("width"), (int, float)):
        if layout.get("xStepUnit") == "group":
            vg_obj["width"] = {"step": layout["xStep"], "for": "position"}
        else:
            vg_obj["width"] = {"step": layout["xStep"]}
    if y_is_discrete and not isinstance(vg_obj.get("height"), (int, float)):
        if layout.get("yStepUnit") == "group":
            vg_obj["height"] = {"step": layout["yStep"], "for": "position"}
        else:
            vg_obj["height"] = {"step": layout["yStep"]}

    # Sync hardcoded template width/height to config.view
    w = vg_obj.get("width")
    if isinstance(w, (int, float)) and not isinstance(w, bool):
        vg_obj["config"]["view"]["continuousWidth"] = w
    elif isinstance(w, dict) and "step" in w:
        if layout.get("xStepUnit") == "group":
            vg_obj["width"] = {"step": layout["xStep"], "for": "position"}
        else:
            vg_obj["width"] = {"step": layout["xStep"]}
    h = vg_obj.get("height")
    if isinstance(h, (int, float)) and not isinstance(h, bool):
        vg_obj["config"]["view"]["continuousHeight"] = h
    elif isinstance(h, dict) and "step" in h:
        if layout.get("yStepUnit") == "group":
            vg_obj["height"] = {"step": layout["yStep"], "for": "position"}
        else:
            vg_obj["height"] = {"step": layout["yStep"]}

    # Facet header sizing
    _layout_facet = layout.get("facet") or {}
    total_facets = (_layout_facet.get("columns") or 1) * (_layout_facet.get("rows") or 1)
    facet_rows = _layout_facet.get("rows") or 1
    facet_cols = _layout_facet.get("columns") or 1
    if facet_rows > 1 or facet_cols > 1:
        enc = vg_obj.get("encoding") or (vg_obj.get("spec") or {}).get("encoding")
        facet_def = vg_obj.get("facet") or {}
        has_row = bool((enc and enc.get("row")) or facet_def.get("row"))
        has_column = bool((enc and enc.get("column")) or facet_def.get("column"))
        has_wrap = bool((enc and enc.get("facet")) or (vg_obj.get("facet") and not facet_def.get("row") and not facet_def.get("column")))

        font_cfg: dict = {"labelFontSize": 9} if total_facets > 6 else {}
        col_limit = max(80, layout["subplotWidth"] + 20)
        row_limit = max(30, layout["subplotHeight"])

        if has_column:
            vg_obj["config"]["headerColumn"] = {**(vg_obj["config"].get("headerColumn") or {}), **font_cfg, "labelLimit": col_limit}
        if has_row:
            vg_obj["config"]["headerRow"] = {**(vg_obj["config"].get("headerRow") or {}), **font_cfg, "labelLimit": row_limit}
        if has_wrap:
            vg_obj["config"]["headerFacet"] = {**(vg_obj["config"].get("headerFacet") or {}), **font_cfg, "labelLimit": col_limit}

    enc_target = (vg_obj.get("spec") or {}).get("encoding") or vg_obj.get("encoding")

    if facet_rows > 1 or facet_cols > 1:
        if not vg_obj.get("config"):
            vg_obj["config"] = {}
        light_title = {"titleFontWeight": "normal", "titleFontSize": 11, "titleColor": "#666"}
        vg_obj["config"]["axisX"] = {**(vg_obj["config"].get("axisX") or {}), **light_title}
        vg_obj["config"]["axisY"] = {**(vg_obj["config"].get("axisY") or {}), **light_title}

    # Row-faceted y-axis title handling
    row_enc = (enc_target or {}).get("row") if enc_target else None
    if not row_enc:
        row_enc = (vg_obj.get("facet") or {}).get("row")
    y_enc = (enc_target or {}).get("y") if enc_target else None
    if y_enc and (row_enc or (facet_rows > 1 and (enc_target or {}).get("y"))):
        if y_enc.get("type") == "nominal":
            if not vg_obj.get("config"):
                vg_obj["config"] = {}
            vg_obj["config"]["axisY"] = {**(vg_obj["config"].get("axisY") or {}), "title": None}
            if "axis" not in y_enc or y_enc.get("axis") is None:
                if y_enc.get("axis") is None and "axis" in y_enc:
                    # axis is explicitly None — preserve and don't set title key inside null
                    pass
                else:
                    y_enc["axis"] = {}
            if y_enc.get("axis") is not None:
                y_enc["axis"]["title"] = None
        elif row_enc and ((vg_obj.get("resolve") or {}).get("scale") or {}).get("y") != "independent":
            y_title = (y_enc.get("axis") or {}).get("title") if y_enc.get("axis") else None
            y_title = y_title or y_enc.get("title") or y_enc.get("field")
            row_title = (row_enc.get("header") or {}).get("title") if row_enc.get("header") else None
            row_title = row_title or row_enc.get("title") or row_enc.get("field")
            if y_title and row_title:
                if not row_enc.get("header"):
                    row_enc["header"] = {}
                row_enc["header"]["title"] = f"{row_title}: {y_title}"
                if not vg_obj.get("config"):
                    vg_obj["config"] = {}
                vg_obj["config"]["axisY"] = {**(vg_obj["config"].get("axisY") or {}), "title": None}
                if not y_enc.get("axis"):
                    y_enc["axis"] = {}
                y_enc["axis"]["title"] = None

    # --- Dual-legend repositioning ---
    legend_channels = []
    for ch in ("color", "size", "shape", "opacity", "strokeDash", "strokeWidth"):
        targets = collect_encoding_targets(ch)
        if any(enc.get("field") and enc.get("legend") is not None for enc in targets):
            # JS: `enc.legend !== null`. None != None → False (this is true legend !== null means keep).
            # Need to handle: legend key absent → undefined (≠ null → true) → include
            # legend key set to None → equals null → exclude
            pass
        # We need a slightly different filter: JS filters `enc.field && enc.legend !== null`
        # In Python: enc has "field" and not ("legend" in enc and enc["legend"] is None)
        if any(enc.get("field") and not ("legend" in enc and enc["legend"] is None) for enc in targets):
            legend_channels.append(ch)

    if len(legend_channels) >= 2:
        categorical_chs = []
        quantitative_chs = []
        for ch in legend_channels:
            targets = collect_encoding_targets(ch)
            is_quant = any(enc.get("type") in ("quantitative", "temporal") for enc in targets)
            if is_quant:
                quantitative_chs.append(ch)
            else:
                categorical_chs.append(ch)

        if len(categorical_chs) > 0 and len(quantitative_chs) > 0:
            QUANT_LEGEND_HEIGHT = 100
            CAT_TITLE_HEIGHT = 20
            CAT_ENTRY_HEIGHT = 20

            total_cat_entries = 0
            for ch in categorical_chs:
                targets = collect_encoding_targets(ch)
                for enc in targets:
                    if not enc.get("field"):
                        continue
                    domain_size = len(set(r.get(enc["field"]) for r in context["table"]))
                    total_cat_entries += domain_size
            est_cat_height = CAT_TITLE_HEIGHT * len(categorical_chs) + total_cat_entries * CAT_ENTRY_HEIGHT
            est_total_legend_height = QUANT_LEGEND_HEIGHT + est_cat_height + 20

            total_chart_height = layout["subplotHeight"] * ((layout.get("facet") or {}).get("rows") or 1) \
                + ((layout.get("facet") or {}).get("rows") or 1) * 10

            fits_on_right = total_chart_height >= est_total_legend_height

            if not fits_on_right:
                for ch in categorical_chs:
                    targets = collect_encoding_targets(ch)
                    for enc in targets:
                        if not enc.get("field"):
                            continue
                        if not enc.get("legend"):
                            enc["legend"] = {}
                        enc["legend"]["orient"] = "bottom"
                        enc["legend"]["direction"] = "horizontal"

                        seen = []
                        seen_set = set()
                        for r in context["table"]:
                            v = r.get(enc["field"])
                            key = id(v) if isinstance(v, (dict, list)) else (type(v).__name__, v)
                            if key not in seen_set:
                                seen_set.add(key)
                                seen.append(v)
                        domain_values = seen
                        domain_size = len(domain_values)
                        max_label_len = max([len(str(v if v is not None else ""))] for v in domain_values) if False else 3
                        max_label_len = max([len(str(v if v is not None else "")) for v in domain_values] + [3])
                        entry_width = 15 + max_label_len * 5 + 8
                        right_legend_width = 130
                        available_width = canvas_size["width"] + right_legend_width
                        columns_by_width = max(1, math.floor(available_width / entry_width))
                        enc["legend"]["columns"] = min(columns_by_width, domain_size)
                        max_rows = 4
                        max_visible = columns_by_width * max_rows
                        if domain_size > max_visible:
                            enc["legend"]["symbolLimit"] = max_visible

    # --- Overflow styling ---
    for trunc in layout["truncations"]:
        ch = trunc["channel"]
        targets = collect_encoding_targets(ch)
        for enc in targets:
            if not enc.get("field"):
                continue
            if ch == "x" or ch == "y":
                if "axis" in enc and enc["axis"] is None:
                    continue
                if not enc.get("axis"):
                    enc["axis"] = {}
                enc["axis"]["labelColor"] = {
                    "condition": {
                        "test": f"datum.label == '{trunc['placeholder']}'",
                        "value": "#999999",
                    },
                    "value": "#000000",
                }
                if not enc.get("scale"):
                    enc["scale"] = {}
                enc["scale"]["domain"] = [*trunc["keptValues"], trunc["placeholder"]]
            elif ch == "color":
                if not enc.get("legend"):
                    enc["legend"] = {}
                enc["legend"]["values"] = [*trunc["keptValues"], trunc["placeholder"]]


# ---------------------------------------------------------------------------
# vlApplyFieldContext support
# ---------------------------------------------------------------------------

def _build_abbreviation_expr(prefix: Optional[str], suffix: Optional[str]) -> str:
    pfx = f"'{prefix}' + " if prefix else ""
    sfx = f" + '{suffix}'" if suffix else ""
    return (
        f"{pfx}(abs(datum.value) >= 1e12 ? format(datum.value / 1e12, '~g') + 'T' : "
        f"abs(datum.value) >= 1e9 ? format(datum.value / 1e9, '~g') + 'B' : "
        f"abs(datum.value) >= 1e6 ? format(datum.value / 1e6, '~g') + 'M' : "
        f"abs(datum.value) >= 1e3 ? format(datum.value / 1e3, '~g') + 'K' : "
        f"format(datum.value, ','))" + sfx
    )


def _format_spec_to_label_expr(fmt: dict) -> Optional[str]:
    if fmt.get("abbreviate"):
        return _build_abbreviation_expr(fmt.get("prefix"), fmt.get("suffix"))
    if not fmt.get("pattern"):
        return None
    has_prefix = bool(fmt.get("prefix"))
    has_suffix = bool(fmt.get("suffix"))
    if not has_prefix and not has_suffix:
        return None
    pfx = f"'{fmt['prefix']}' + " if has_prefix else ""
    sfx = f" + '{fmt['suffix']}'" if has_suffix else ""
    return f"{pfx}format(datum.value, '{fmt['pattern']}'){sfx}"


def _compute_stacked_extremes(
    table: list,
    measure_field: str,
    measure_channel: str,
    channel_semantics: dict,
) -> Optional[dict]:
    """Mirror of ``computeStackedExtremes`` in instantiate-spec.ts.

    Returns ``{"maxPos": <largest positive group sum>, "minNeg": <most-negative
    group sum>}`` so each side can be checked independently against an
    intrinsic-domain bound. Returns ``None`` when the grouping field can't be
    determined or the table has no usable rows.
    """
    if not table or len(table) == 0:
        return None
    group_channel = "x" if measure_channel == "y" else "y"
    group_cs = channel_semantics.get(group_channel)
    if not group_cs:
        return None
    group_field = group_cs.get("field")
    if not group_field:
        return None
    facet_fields: list = []
    for ch in ("row", "column"):
        fcs = channel_semantics.get(ch)
        if fcs and fcs.get("field"):
            facet_fields.append(fcs["field"])

    pos_totals: dict = {}
    neg_totals: dict = {}
    for row in table:
        val = row.get(measure_field)
        if not isinstance(val, (int, float)) or isinstance(val, bool):
            continue
        if isinstance(val, float) and math.isnan(val):
            continue
        key_parts = [str(row.get(group_field))]
        for ff in facet_fields:
            key_parts.append(str(row.get(ff)))
        key = "|||".join(key_parts)
        if val >= 0:
            pos_totals[key] = pos_totals.get(key, 0) + float(val)
        else:
            neg_totals[key] = neg_totals.get(key, 0) + float(val)

    if len(pos_totals) == 0 and len(neg_totals) == 0:
        return None
    max_pos = max(pos_totals.values()) if pos_totals else 0
    min_neg = min(neg_totals.values()) if neg_totals else 0
    return {"maxPos": max_pos, "minNeg": min_neg}


def _has_repeated_category(table: list, category_field: Optional[str], measure_field: str) -> bool:
    """Detect whether a discrete category repeats across rows — i.e., multiple
    rows share the same category value, which makes Vega-Lite stack the
    measure even with no color encoding. Used to recognise implicit no-color
    stacking so the intrinsic-domain check runs against the stacked total,
    not individual values.
    """
    if not table or len(table) == 0 or not category_field:
        return False
    seen: set = set()
    for row in table:
        val = row.get(measure_field)
        if not isinstance(val, (int, float)) or isinstance(val, bool):
            continue
        if isinstance(val, float) and math.isnan(val):
            continue
        key = str(row.get(category_field))
        if key in seen:
            return True
        seen.add(key)
    return False


def _get_effective_intrinsic_domain(cs: dict, table: list, field: str):
    if cs.get("semanticAnnotation") and cs["semanticAnnotation"].get("intrinsicDomain"):
        return cs["semanticAnnotation"]["intrinsicDomain"]
    semantic_type = (cs.get("semanticAnnotation") or {}).get("semanticType")
    if not semantic_type:
        return None
    if semantic_type == "Latitude":
        return [-90, 90]
    if semantic_type == "Longitude":
        return [-180, 180]
    if semantic_type == "Correlation":
        return [-1, 1]
    if semantic_type == "Percentage":
        nums = [r.get(field) for r in table]
        nums = [v for v in nums if isinstance(v, (int, float)) and not isinstance(v, bool) and not (isinstance(v, float) and math.isnan(v))]
        if len(nums) > 0:
            count_below = sum(1 for v in nums if abs(v) <= 1)
            is_fractional = count_below / len(nums) >= 0.8
            return [0, 1] if is_fractional else [0, 100]
    return None


def _vl_apply_field_context(vg_obj, channel_semantics, collect_encoding_targets, context):
    import re as _re

    for ch, cs in channel_semantics.items():
        targets = collect_encoding_targets(ch)
        if len(targets) == 0:
            continue
        for enc in targets:
            if not enc.get("field"):
                continue
            if cs.get("field") and enc.get("field") != cs["field"]:
                continue

            # ── 0. Temporal + bin incompatibility guard ──
            if enc.get("bin") and enc.get("type") == "temporal":
                enc["type"] = "quantitative"
                if enc.get("axis") is not None:
                    if not enc.get("axis"):
                        enc["axis"] = {}
                    if not enc["axis"].get("format"):
                        enc["axis"]["format"] = "d"

            # ── 1. Number format ──
            fmt = cs.get("format")
            if (fmt and (fmt.get("pattern") or fmt.get("abbreviate"))) and (ch in ("x", "y")) and enc.get("type") == "quantitative" and not enc.get("bin"):
                if "axis" in enc and enc["axis"] is None:
                    pass
                else:
                    axis_obj = enc.get("axis") or {}
                    if not axis_obj.get("format") and not axis_obj.get("labelExpr"):
                        if not enc.get("axis"):
                            enc["axis"] = {}
                        expr = _format_spec_to_label_expr(fmt)
                        if expr:
                            enc["axis"]["labelExpr"] = expr
                        else:
                            enc["axis"]["format"] = fmt["pattern"]

            # ── 3. Domain constraint ──
            is_explicitly_stacked = "stack" in enc and enc["stack"] is not None and enc["stack"] is not False
            mark = vg_obj.get("mark")
            mark_type = mark if isinstance(mark, str) else (mark.get("type") if isinstance(mark, dict) else None)
            is_bar_like = mark_type in ("bar", "area", "rect")
            has_color_encoding = bool(
                (vg_obj.get("encoding") or {}).get("color", {}).get("field")
                or (isinstance(vg_obj.get("layer"), list) and any(((l.get("encoding") or {}).get("color") or {}).get("field") for l in vg_obj["layer"]))
                or ((vg_obj.get("spec") or {}).get("encoding") or {}).get("color", {}).get("field")
            )
            # The other positional channel; bar-like charts stack the measure
            # when this axis is discrete and a category repeats across rows.
            other_channel = "x" if ch == "y" else "y"
            other_cs = channel_semantics.get(other_channel) or {}
            other_is_discrete = other_cs.get("type") in ("nominal", "ordinal")
            # JS: `enc.stack !== null` — true when stack is undefined or any
            # non-null value. Python equivalent: stack key absent OR present
            # with a non-None value.
            if "stack" in enc:
                stack_not_null = enc["stack"] is not None
            else:
                stack_not_null = True
            is_implicitly_stacked = (
                is_bar_like
                and other_is_discrete
                and stack_not_null
                and (
                    has_color_encoding
                    or _has_repeated_category(context["table"], other_cs.get("field"), enc["field"])
                )
            )
            is_stacked = is_explicitly_stacked or is_implicitly_stacked
            is_normalize_stacked = enc.get("stack") == "normalize"
            is_sum_stacked = is_stacked and not is_normalize_stacked

            skip_domain = False
            effective_domain_constraint = cs.get("domainConstraint")

            if is_sum_stacked:
                intrinsic = _get_effective_intrinsic_domain(cs, context["table"], enc["field"])
                if intrinsic:
                    extremes = _compute_stacked_extremes(
                        context["table"], enc["field"], ch, channel_semantics,
                    )
                    if extremes is not None:
                        max_pos = extremes["maxPos"]
                        min_neg = extremes["minNeg"]
                        rng = intrinsic[1] - intrinsic[0]
                        epsilon = rng * 1e-6
                        overflows_top = max_pos > intrinsic[1] + epsilon
                        overflows_bottom = min_neg < intrinsic[0] - epsilon
                        if overflows_top or overflows_bottom:
                            if cs.get("domainConstraint"):
                                skip_domain = True
                        else:
                            stacked_snap = snap_to_bound_heuristic(intrinsic, [max_pos, min_neg])
                            if stacked_snap:
                                if cs.get("domainConstraint"):
                                    dc = cs["domainConstraint"]
                                    effective_domain_constraint = {
                                        "min": dc.get("min") if dc.get("min") is not None else stacked_snap.get("min"),
                                        "max": dc.get("max") if dc.get("max") is not None else stacked_snap.get("max"),
                                        "clamp": dc.get("clamp") or stacked_snap.get("clamp"),
                                    }
                                else:
                                    effective_domain_constraint = stacked_snap
                elif cs.get("domainConstraint"):
                    skip_domain = True

            if effective_domain_constraint and enc.get("type") == "quantitative" and (ch in ("x", "y")) and not enc.get("bin") and not skip_domain:
                if "scale" not in enc:
                    enc["scale"] = {}
                mn = effective_domain_constraint.get("min")
                mx = effective_domain_constraint.get("max")
                clamp = effective_domain_constraint.get("clamp")
                # The resolved zero decision (engine default, or the host's
                # includeZero_x/_y override) is authoritative. When it says
                # "no zero", a lower bound of exactly 0 in the semantic
                # domain is merely a non-negativity floor, not a real
                # semantic minimum — drop it so the axis fits the data
                # instead of being re-pinned to zero. Length marks
                # (bar/area/rect) always keep zero.
                wants_no_zero = (cs.get("zero") or {}).get("zero") is False
                if (not is_bar_like) and wants_no_zero and mn == 0:
                    mn = None
                if mn is not None and mx is not None:
                    enc["scale"]["domain"] = [mn, mx]
                    # Never clobber a decided zero:false; otherwise drop
                    # zero:true so VL honors the explicit semantic domain.
                    if (not is_bar_like) and "zero" in enc["scale"] and not wants_no_zero:
                        del enc["scale"]["zero"]
                else:
                    if mn is not None:
                        enc["scale"]["domainMin"] = mn
                    if mx is not None:
                        enc["scale"]["domainMax"] = mx
                    enc["scale"]["nice"] = True
                if clamp:
                    enc["scale"]["clamp"] = True

            # ── 4. Tick constraint ──
            tc = cs.get("tickConstraint")
            if tc and (ch in ("x", "y")) and enc.get("type") == "quantitative" and not enc.get("bin"):
                if "axis" in enc and enc["axis"] is None:
                    pass
                else:
                    if not enc.get("axis"):
                        enc["axis"] = {}
                    if tc.get("integersOnly") and enc["axis"].get("tickMinStep") is None and "tickMinStep" not in enc["axis"]:
                        enc["axis"]["tickMinStep"] = tc.get("minStep") if tc.get("minStep") is not None else 1
                    if tc.get("exactTicks") and not enc["axis"].get("values"):
                        enc["axis"]["values"] = tc["exactTicks"]
                    if tc.get("integersOnly") and not enc["axis"].get("labelExpr") and not enc["axis"].get("values"):
                        enc["axis"]["labelExpr"] = "datum.value === ceil(datum.value) ? format(datum.value, ',d') : ''"
                    if tc.get("integersOnly") and enc["axis"].get("format"):
                        enc["axis"]["format"] = _re.sub(r"\.\d+f$", "d", enc["axis"]["format"])
                    if tc.get("integersOnly") and enc["axis"].get("labelExpr"):
                        enc["axis"]["labelExpr"] = _re.sub(
                            r"format\(datum\.value,\s*'([^']*)\.\d+f'\)",
                            r"format(datum.value, '\1d')",
                            enc["axis"]["labelExpr"],
                        )

            # ── 5. Reversed axis ──
            if cs.get("reversed") and (ch in ("x", "y")) and enc.get("type") == "quantitative" and not enc.get("bin"):
                if "scale" not in enc:
                    enc["scale"] = {}
                if "reverse" not in enc["scale"]:
                    enc["scale"]["reverse"] = True

            # ── 6. Nice rounding ──
            if cs.get("nice") is False and enc.get("type") == "quantitative" and not enc.get("bin"):
                if "scale" not in enc:
                    enc["scale"] = {}
                if "nice" not in enc["scale"]:
                    enc["scale"]["nice"] = False

            # ── 7. Scale type ──
            if cs.get("scaleType") and cs.get("scaleType") != "linear" and enc.get("type") == "quantitative" and not enc.get("bin"):
                if "scale" not in enc:
                    enc["scale"] = {}
                if not enc["scale"].get("type"):
                    enc["scale"]["type"] = cs["scaleType"]
                    if cs["scaleType"] in ("log", "symlog"):
                        if "zero" in enc["scale"]:
                            del enc["scale"]["zero"]
                        if ch in ("x", "y"):
                            if "axis" in enc and enc["axis"] is None:
                                pass
                            else:
                                if not enc.get("axis"):
                                    enc["axis"] = {}
                                enc["axis"]["gridColor"] = "#e8e8e8"
                                enc["axis"]["gridOpacity"] = 0.5


def _vl_apply_default_quantitative_axis_format(collect_encoding_targets):
    for ch in ("x", "y"):
        for enc in collect_encoding_targets(ch):
            if not enc or enc.get("type") != "quantitative" or enc.get("bin") or ("axis" in enc and enc["axis"] is None):
                continue
            axis = enc.get("axis") or {}
            if axis.get("format") or axis.get("labelExpr"):
                continue
            if not enc.get("axis"):
                enc["axis"] = {}
            enc["axis"]["format"] = DEFAULT_QUANTITATIVE_AXIS_FORMAT


def vl_apply_tooltips(vg_obj):
    if not vg_obj.get("config"):
        vg_obj["config"] = {}
    vg_obj["config"]["mark"] = {**(vg_obj["config"].get("mark") or {}), "tooltip": True}
