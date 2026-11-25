"""Bar Table template — ranked horizontal data-bar table."""
from __future__ import annotations

import math
import re

from ...core import js_round
from ...core.field_semantics import resolve_display_aggregate
from ...core.type_registry import get_registry_entry


_CJK_RE = re.compile(r"[\u4E00-\u9FFF\u3000-\u303F]")


def _unique_preserve(items):
    seen = set()
    out = []
    for x in items:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def _bar_table_declare(cs, table, chart_properties):
    y_field = (cs.get("y") or {}).get("field")
    facet_fields = [f for f in [(cs.get("column") or {}).get("field"), (cs.get("row") or {}).get("field")] if f]

    raw_row_count = 0
    if y_field:
        if not facet_fields:
            raw_row_count = len({(r.get(y_field) if isinstance(r, dict) else None) for r in (table or [])})
        else:
            per_facet_rows = {}
            for r in (table or []):
                key = "\x00".join(str(r.get(f) if r.get(f) is not None else "") for f in facet_fields)
                rs = per_facet_rows.setdefault(key, set())
                rs.add(r.get(y_field))
            if per_facet_rows:
                raw_row_count = max(len(s) for s in per_facet_rows.values())

    max_rows_raw = (chart_properties or {}).get("maxRows")
    if max_rows_raw is None:
        max_rows_raw = 20
    max_rows = max(0, int(max_rows_raw))
    displayed_rows = min(raw_row_count, max_rows) if max_rows > 0 else raw_row_count
    min_subplot_size = 360 if displayed_rows >= 30 else 280

    return {
        "axisFlags": {"y": {"banded": True}},
        "paramOverrides": {
            "defaultBandSize": 24,
            "minSubplotSize": min_subplot_size,
            "targetBandAR": 280,
        },
    }


def _to_fixed(v, dec):
    """Match JS Number.prototype.toFixed: round-half-away-from-zero output."""
    if v != v:  # NaN
        return "NaN"
    return f"{v:.{dec}f}"


def _to_locale_string_us(v, min_dec=0, max_dec=2):
    """Approximate JS Number.toLocaleString('en-US', {minimumFractionDigits, maximumFractionDigits})."""
    if v != v:  # NaN
        return "NaN"
    sign = "-" if v < 0 else ""
    av = abs(v)
    if max_dec < min_dec:
        max_dec = min_dec
    # Round to max_dec
    s = f"{av:.{max_dec}f}"
    int_part, _, frac_part = s.partition(".")
    # Trim trailing zeros down to min_dec
    while len(frac_part) > min_dec and frac_part.endswith("0"):
        frac_part = frac_part[:-1]
    grouped = "{:,}".format(int(int_part))
    if frac_part:
        return f"{sign}{grouped}.{frac_part}"
    return f"{sign}{grouped}"


def _approx_format(v, value_fmt):
    if not isinstance(v, (int, float)) or isinstance(v, bool) or not math.isfinite(v):
        return ""
    if not value_fmt:
        return _js_string(v)
    p = value_fmt.get("pattern") or ""
    prefix = value_fmt.get("prefix") or ""
    suffix = value_fmt.get("suffix") or ""
    if "%" in p:
        m = re.search(r"\.(\d+)", p)
        dec = int(m.group(1)) if m else 1
        body = _to_fixed(v * 100, dec) + "%"
    elif "d" in p:
        body = "{:,}".format(int(round(v)))
    elif re.search(r"~s|s$", p):
        if abs(v) >= 1e6:
            body = _to_fixed(v / 1e6, 1) + "M"
        elif abs(v) >= 1e3:
            body = _to_fixed(v / 1e3, 1) + "K"
        else:
            body = _to_fixed(v, 0)
    elif p:
        m = re.search(r"\.(\d+)", p)
        dec = int(m.group(1)) if m else None
        body = _to_locale_string_us(
            v,
            min_dec=dec if dec is not None else 0,
            max_dec=dec if dec is not None else 2,
        )
    else:
        body = _js_string(v)
    return prefix + body + suffix


def _js_string(v):
    """JS String(value) for finite numbers. Match JS Number.toString behavior closely enough."""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        if v.is_integer() and abs(v) < 1e21:
            return str(int(v))
        # Python's repr is close to JS — fall back
        return repr(v)
    return str(v)


def _approx_pct(v):
    if not isinstance(v, (int, float)) or isinstance(v, bool) or not math.isfinite(v):
        return ""
    return f"{_to_fixed(v * 100, 1)}%"


def _bar_table_instantiate(spec, ctx):
    encs = ctx["resolvedEncodings"]
    x = encs.get("x")
    y = encs.get("y")
    color = encs.get("color")
    column = encs.get("column")
    row = encs.get("row")
    config = ctx.get("chartProperties") or {}
    table = ctx.get("fullTable") or ctx.get("table") or []
    canvas_size = ctx.get("canvasSize") or {}

    x_field = (x or {}).get("field") or "Value"
    y_field = (y or {}).get("field") or "Category"
    color_field = (color or {}).get("field")
    facet_fields = [f for f in [(column or {}).get("field"), (row or {}).get("field")] if f]
    has_facet = bool(facet_fields)

    def scope_key_of(r):
        return "\x00".join(str(r.get(f) if r.get(f) is not None else "") for f in facet_fields)

    def scope_values_of(r):
        return {f: r.get(f) for f in facet_fields}

    channel_semantics = ctx.get("channelSemantics") or {}
    x_cs = channel_semantics.get("x")
    y_cs = channel_semantics.get("y")
    x_entry = get_registry_entry((x_cs or {}).get("semanticAnnotation", {}).get("semanticType") or "Unknown")

    has_negative = False
    has_positive = False
    for r in table:
        v = r.get(x_field)
        if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v):
            if v < 0:
                has_negative = True
            elif v > 0:
                has_positive = True

    show_percent = config.get("showPercent") is True

    x_aggregate = ((ctx.get("encodings") or {}).get("x") or {}).get("aggregate")
    use_mean_for_display = resolve_display_aggregate(x_cs, x_aggregate) == "average"

    def agg_value(g):
        return g["sum"] / max(1, g["n"]) if use_mean_for_display else g["sum"]

    scoped_category_agg = {}
    scope_insertion_order = []
    for r in table:
        v = r.get(x_field)
        if not isinstance(v, (int, float)) or isinstance(v, bool) or not math.isfinite(v):
            continue
        sk = scope_key_of(r) if has_facet else ""
        if sk not in scoped_category_agg:
            scoped_category_agg[sk] = {
                "facetValues": scope_values_of(r) if has_facet else {},
                "categories": {},
                "category_order": [],
            }
            scope_insertion_order.append(sk)
        scope = scoped_category_agg[sk]
        cat_val = r.get(y_field)
        # Use repr trick so unhashable values still work — but values should already be hashable
        if cat_val not in scope["categories"]:
            scope["categories"][cat_val] = {"sum": 0, "n": 0}
            scope["category_order"].append(cat_val)
        g = scope["categories"][cat_val]
        g["sum"] += v
        g["n"] += 1

    scopes = [(sk, scoped_category_agg[sk]) for sk in scope_insertion_order]
    global_category_agg = {}
    global_cat_order = []
    for _, scope in scopes:
        for cat in scope["category_order"]:
            g = scope["categories"][cat]
            if cat not in global_category_agg:
                global_category_agg[cat] = {"sum": 0, "n": 0}
                global_cat_order.append(cat)
            total = global_category_agg[cat]
            total["sum"] += g["sum"]
            total["n"] += g["n"]
    unique_cats = list(global_cat_order)

    max_rows_raw = config.get("maxRows")
    if max_rows_raw is None:
        max_rows_raw = 20
    max_rows = max(0, int(max_rows_raw))
    y_sort_order_for_trim = (y_cs or {}).get("ordinalSortOrder")
    max_scoped_count = max((len(s["categories"]) for _, s in scopes), default=0)
    can_trim = (
        max_rows > 0
        and not (y_sort_order_for_trim and len(y_sort_order_for_trim) > 0)
        and max_scoped_count > max_rows
    )

    def sort_rows_by_value(items):
        return sorted(
            items,
            key=lambda a: a["value"],
            reverse=not bool((y_cs or {}).get("reversed")),
        )

    display_table = []
    others_cat_label = None
    kept_cat_order = None
    per_cat_agg_values = []
    per_scope_agg_values = []
    max_display_rows_per_scope = 0

    if can_trim:
        keep_n = max(1, max_rows - 1)
        display_rows = []
        for scope_key, scope in scopes:
            sorted_items = sort_rows_by_value(
                [{"cat": cat, "value": agg_value(scope["categories"][cat])} for cat in scope["category_order"]]
            )
            kept_items = sorted_items[:keep_n]
            rest = sorted_items[keep_n:]
            if not has_facet:
                kept_cat_order = [a["cat"] for a in kept_items]
            kept_cats = {a["cat"] for a in kept_items}

            if color_field:
                kept_ranks = {a["cat"]: idx for idx, a in enumerate(kept_items)}
                for r in table:
                    if (scope_key_of(r) if has_facet else "") == scope_key and r.get(y_field) in kept_cats:
                        display_rows.append({
                            **r,
                            "__bt_sort": kept_ranks.get(r.get(y_field), 0),
                            "__bt_others": False,
                            "__bt_others_num": 0,
                        })
            else:
                for idx, a in enumerate(kept_items):
                    display_rows.append({
                        **scope["facetValues"],
                        y_field: a["cat"],
                        x_field: a["value"],
                        "__bt_sort": idx,
                        "__bt_others": False,
                        "__bt_others_num": 0,
                    })

            rest_sum = sum(a["value"] for a in rest)
            others_value = (rest_sum / len(rest)) if use_mean_for_display and rest else rest_sum
            scope_others_label = f"Others (+{len(rest)})"
            if others_cat_label is None:
                others_cat_label = scope_others_label
            display_rows.append({
                **scope["facetValues"],
                y_field: scope_others_label,
                x_field: others_value,
                "__bt_sort": len(kept_items),
                "__bt_others": True,
                "__bt_others_num": 1,
            })
            scope_agg_values = [a["value"] for a in kept_items] + [others_value]
            per_cat_agg_values.extend(scope_agg_values)
            per_scope_agg_values.append(scope_agg_values)
            max_display_rows_per_scope = max(max_display_rows_per_scope, len(kept_items) + 1)
        display_table = display_rows
    else:
        sort_ranks_by_scope = {}
        for scope_key, scope in scopes:
            sorted_items = sort_rows_by_value(
                [{"cat": cat, "value": agg_value(scope["categories"][cat])} for cat in scope["category_order"]]
            )
            sort_ranks_by_scope[scope_key] = {a["cat"]: idx for idx, a in enumerate(sorted_items)}
            scope_agg_values = [a["value"] for a in sorted_items]
            per_cat_agg_values.extend(scope_agg_values)
            per_scope_agg_values.append(scope_agg_values)
            max_display_rows_per_scope = max(max_display_rows_per_scope, len(sorted_items))
        for r in table:
            sk = scope_key_of(r) if has_facet else ""
            ranks = sort_ranks_by_scope.get(sk, {})
            display_table.append({
                **r,
                "__bt_sort": ranks.get(r.get(y_field), 0),
                "__bt_others": False,
                "__bt_others_num": 0,
            })

    category_header = y_field
    percent_header = "%"
    value_header = x_field

    value_fmt = (x_cs or {}).get("format")
    pct_pattern = ".1%"

    sort_op = "mean" if use_mean_for_display else "sum"

    def unique_groupby(fields):
        return _unique_preserve(fields)

    text_groupby = unique_groupby(facet_fields + [y_field]) if has_facet else [y_field]
    text_panel_transform = [
        {
            "aggregate": [
                {"op": sort_op, "field": x_field, "as": "__bt_val"},
                {"op": "min", "field": "__bt_sort", "as": "__bt_sort"},
                {"op": "max", "field": "__bt_others_num", "as": "__bt_others_num"},
            ],
            "groupby": text_groupby,
        },
    ]
    if show_percent:
        total_transform = {"joinaggregate": [{"op": "sum", "field": "__bt_val", "as": "__bt_total"}]}
        if has_facet:
            total_transform["groupby"] = facet_fields
        text_panel_transform.append(total_transform)
        text_panel_transform.append({
            "calculate": "datum.__bt_total === 0 ? null : datum.__bt_val / datum.__bt_total",
            "as": "__bt_pct",
        })

    def unique_facet_value_count(field):
        if not field:
            return 0
        s = set()
        for r in display_table:
            s.add(r.get(field))
        return len(s)

    column_facet_count = unique_facet_value_count((column or {}).get("field"))
    row_facet_count = unique_facet_value_count((row or {}).get("field"))
    layout = ctx.get("layout") or {}
    layout_facet_columns = (layout.get("facet") or {}).get("columns") if layout.get("facet") else None
    if layout_facet_columns is None:
        layout_facet_columns = column_facet_count or 1
    facet_cols_for_sizing = (
        max(1, min(layout_facet_columns, column_facet_count or 1)) if has_facet else 1
    )
    facet_rows_for_sizing = (
        max(1, row_facet_count or math.ceil(max(1, column_facet_count) / facet_cols_for_sizing))
        if has_facet else 1
    )
    subplot_width = (
        (layout.get("subplotWidth") if layout.get("subplotWidth") is not None else canvas_size.get("width"))
        if has_facet else canvas_size.get("width")
    )
    layout_subplot_height = (
        (layout.get("subplotHeight") if layout.get("subplotHeight") is not None else canvas_size.get("height"))
        if has_facet else canvas_size.get("height")
    )
    if has_facet and facet_rows_for_sizing > 1:
        assemble_opts = ctx.get("assembleOptions") or {}
        max_stretch = assemble_opts.get("maxStretchY")
        if max_stretch is None:
            max_stretch = assemble_opts.get("maxStretch", 2)
        facet_elasticity = assemble_opts.get("facetElasticity", 0.3)
        fix_h = ((assemble_opts.get("facetFixedPadding") or {}).get("height")) or 0
        gap = layout.get("effectiveFacetGap")
        if gap is None:
            gap = assemble_opts.get("facetGap", 0)
        stretch = min(max_stretch, facet_rows_for_sizing ** facet_elasticity)
        facet_height_budget = max(
            0, js_round((canvas_size["height"] * stretch - fix_h) / facet_rows_for_sizing - gap)
        )
    else:
        facet_height_budget = layout_subplot_height

    display_count = max_display_rows_per_scope or len(unique_cats)
    density = min(1, max(0, (display_count - 12) / 40))

    def lerp(a, b):
        return js_round(a + (b - a) * density)

    if has_facet and canvas_size.get("width"):
        sub_w = subplot_width if subplot_width is not None else canvas_size["width"]
        subplot_width_ratio = min(1, max(0, sub_w / canvas_size["width"]))
    else:
        subplot_width_ratio = 1
    if has_facet and canvas_size.get("height"):
        sub_h = facet_height_budget if facet_height_budget is not None else canvas_size["height"]
        subplot_height_ratio = min(1, max(0, sub_h / canvas_size["height"]))
    else:
        subplot_height_ratio = 1
    facet_font_drop = js_round((1 - min(subplot_width_ratio, subplot_height_ratio)) * 3) if has_facet else 0

    font_size = max(9, lerp(12, 10) - facet_font_drop)
    label_font_size = max(9, lerp(13, 10) - facet_font_drop)

    bar_cap, bar_min = 16, 8
    gap_min, gap_ratio = 2, 0.2
    compress_start, compress_end = 30, 80
    compress_t = min(1, max(0, (display_count - compress_start) / (compress_end - compress_start)))
    bar_px = js_round(bar_cap - (bar_cap - bar_min) * compress_t)
    gap_px = max(gap_min, js_round(bar_px * gap_ratio))
    row_step = bar_px + gap_px

    char_px = font_size * 0.6
    text_pad = 12
    min_text_panel = 36
    max_text_panel = 140

    header_style = {"fontSize": font_size, "fontWeight": "normal", "color": "#999"}

    # Match JS `+(bar_px / row_step).toFixed(3)`. JS toFixed rounds half
    # away from zero, while Python's `round` uses banker's rounding.
    if row_step:
        raw = bar_px / row_step
        bar_band_ratio = math.copysign(math.floor(abs(raw) * 1000 + 0.5) / 1000.0, raw)
    else:
        bar_band_ratio = 0

    y_sort_order = (y_cs or {}).get("ordinalSortOrder")
    if can_trim and kept_cat_order is not None and others_cat_label is not None:
        ranked_cat_order = [*kept_cat_order, others_cat_label]
    else:
        ranked_cat_order = [
            a["cat"] for a in sort_rows_by_value(
                [{"cat": c, "value": agg_value(global_category_agg[c])} for c in unique_cats]
            )
        ]

    if y_sort_order and len(y_sort_order) > 0:
        y_sort = list(y_sort_order)
    elif has_facet:
        y_sort = {"field": "__bt_sort", "op": "min", "order": "ascending"}
    else:
        y_sort = ranked_cat_order

    max_chars = 0
    for r in display_table:
        s = str(r.get(y_field) if r.get(y_field) is not None else "")
        w = 0
        for ch in s:
            w += 2 if _CJK_RE.search(ch) else 1
        if w > max_chars:
            max_chars = w
    category_label_width = min(220, max(60, js_round(max_chars * label_font_size * 0.55 + 12)))

    y_enc_with_labels = {
        "field": y_field,
        "type": "nominal",
        "sort": y_sort,
        "axis": {
            "title": None,
            "domain": False,
            "ticks": False,
            "labelFontSize": label_font_size,
            "labelAlign": "left",
            "labelPadding": category_label_width,
            "labelLimit": category_label_width,
        },
    }
    y_enc_no_labels = {**y_enc_with_labels, "axis": None}

    is_diverging = not color_field and (
        x_entry.get("diverging") == "inherent"
        or (x_entry.get("diverging") == "conditional" and has_negative and has_positive)
    )

    if color_field:
        base = dict(color)
        if can_trim:
            vals = []
            seen = set()
            for r in display_table:
                if r.get("__bt_others"):
                    continue
                v = r.get(color_field)
                if v is None or v in seen:
                    continue
                seen.add(v)
                vals.append(v)
            base["scale"] = {**(base.get("scale") or {}), "domain": vals}
        color_enc = base
    elif is_diverging:
        color_enc = {
            "field": x_field, "type": "quantitative", "legend": None,
            "scale": {"scheme": "redyellowgreen", "domainMid": 0},
        }
    else:
        color_enc = {
            "field": x_field, "type": "quantitative", "legend": None,
            "scale": {"range": ["#cdebd3", "#41a25f"]},
        }

    def measure(strs):
        mx = 0
        for s in strs:
            if len(s) > mx:
                mx = len(s)
        return min(max_text_panel, max(min_text_panel, js_round(mx * char_px + text_pad)))

    header_pad = 4

    def header_width_of(s):
        return js_round(len(s) * char_px) + header_pad

    def wrap_header(label, max_px):
        single = header_width_of(label)
        if single <= max_px:
            return {"text": label, "widthPx": single}
        tokens = [t for t in re.split(r"[_\s]+", label) if t]
        if len(tokens) < 2:
            return {"text": label, "widthPx": single}
        total_len = sum(len(t) for t in tokens)
        acc = 0
        split_at = 1
        for i in range(len(tokens) - 1):
            acc += len(tokens[i])
            if acc >= total_len / 2:
                split_at = i + 1
                break
        line1 = "_".join(tokens[:split_at])
        line2 = "_".join(tokens[split_at:])
        return {"text": [line1, line2], "widthPx": max(header_width_of(line1), header_width_of(line2))}

    value_header_wrap = wrap_header(value_header, max_text_panel - header_pad)
    percent_header_wrap = wrap_header(percent_header, max_text_panel - header_pad)

    value_panel_data_width = measure([_approx_format(v, value_fmt) for v in per_cat_agg_values])
    value_panel_width = min(
        max_text_panel,
        max(value_panel_data_width, value_header_wrap["widthPx"] + header_pad, min_text_panel),
    )
    pct_values_for_sizing = []
    for values in per_scope_agg_values:
        scope_total = sum(values)
        if abs(scope_total) > 1e-9:
            pct_values_for_sizing.extend(v / scope_total for v in values)
    if show_percent and pct_values_for_sizing:
        percent_panel_width = min(
            max_text_panel,
            max(
                measure([_approx_pct(v) for v in pct_values_for_sizing]),
                percent_header_wrap["widthPx"] + header_pad,
                min_text_panel,
            ),
        )
    else:
        percent_panel_width = 0

    total_width = subplot_width if subplot_width is not None else 480
    inter_panel_gap = 8
    reserved_for_text = value_panel_width + inter_panel_gap + (
        percent_panel_width + inter_panel_gap if show_percent else 0
    )
    if has_facet:
        min_bar_panel_width = max(80, js_round(total_width * 0.45))
    else:
        min_bar_panel_width = max(180, js_round(total_width * 0.45))
    bar_panel_width = max(min_bar_panel_width, total_width - reserved_for_text - category_label_width)

    distinct_y = set()
    for r in display_table:
        distinct_y.add(r.get(y_field))
    y_card = max(1, max_display_rows_per_scope or len(distinct_y))
    panel_height = max(facet_height_budget or 0, y_card * row_step)

    def build_text_encoding(source_field, fmt, transforms_out, out_field_hint):
        if not fmt or (not fmt.get("pattern") and not fmt.get("prefix") and not fmt.get("suffix")):
            return {"field": source_field, "type": "quantitative"}
        has_affix = bool(fmt.get("prefix") or fmt.get("suffix"))
        if not has_affix:
            return {"field": source_field, "type": "quantitative", "format": fmt["pattern"]}
        esc_pfx = (fmt.get("prefix") or "").replace("\\", "\\\\").replace("'", "\\'")
        esc_sfx = (fmt.get("suffix") or "").replace("\\", "\\\\").replace("'", "\\'")
        if fmt.get("pattern"):
            format_expr = f"format(datum['{source_field}'], '{fmt['pattern']}')"
        else:
            format_expr = f"datum['{source_field}']"
        transforms_out.append({
            "calculate": f"'{esc_pfx}' + {format_expr} + '{esc_sfx}'",
            "as": out_field_hint,
        })
        return {"field": out_field_hint, "type": "nominal"}

    bar_x_scale = {"nice": False}
    if is_diverging:
        bar_x_scale["domainMid"] = 0

    dataset_name = "__bt_displayTable"
    spec["datasets"] = {**(spec.get("datasets") or {}), dataset_name: display_table}
    if has_facet:
        spec["data"] = {"name": dataset_name}

    def with_data(panel):
        if has_facet:
            return panel
        return {"data": {"name": dataset_name}, **panel}

    others_gray = "#bdbdbd"
    others_text_test = (
        "datum.__bt_others_num === 1 || datum.__bt_others === true" if can_trim else None
    )

    bar_aggregate = use_mean_for_display
    if bar_aggregate:
        bar_groupby = unique_groupby(facet_fields + [y_field] + ([color_field] if color_field else []))
        bar_transform = [{
            "aggregate": [
                {"op": sort_op, "field": x_field, "as": "__bt_val"},
                {"op": "min", "field": "__bt_sort", "as": "__bt_sort"},
                {"op": "max", "field": "__bt_others_num", "as": "__bt_others_num"},
            ],
            "groupby": bar_groupby,
        }]
    else:
        bar_transform = None

    bar_x_field = "__bt_val" if bar_aggregate else x_field

    if not color_field and bar_aggregate:
        if is_diverging:
            bar_color_base = {
                "field": "__bt_val", "type": "quantitative", "legend": None,
                "scale": {"scheme": "redyellowgreen", "domainMid": 0},
            }
        else:
            bar_color_base = {
                "field": "__bt_val", "type": "quantitative", "legend": None,
                "scale": {"range": ["#cdebd3", "#41a25f"]},
            }
    else:
        bar_color_base = color_enc

    bar_others_test = others_text_test if bar_aggregate else "datum.__bt_others"
    if can_trim and bar_others_test:
        bar_color_enc = {
            "condition": {"test": bar_others_test, "value": others_gray},
            **bar_color_base,
        }
    else:
        bar_color_enc = bar_color_base

    bar_panel = with_data({
        "width": bar_panel_width,
        "height": panel_height,
        "title": {"text": category_header, "anchor": "start", "offset": 6, **header_style},
        **({"transform": bar_transform} if bar_transform else {}),
        "mark": {"type": "bar", "height": {"band": bar_band_ratio}},
        "encoding": {
            "y": y_enc_with_labels,
            "x": {
                "field": bar_x_field, "type": "quantitative",
                "axis": None, "scale": bar_x_scale,
            },
            "color": bar_color_enc,
        },
    })

    panels = [bar_panel]

    if show_percent:
        pct_color = (
            {"condition": {"test": others_text_test, "value": others_gray}, "value": "#41a25f"}
            if others_text_test else {"value": "#41a25f"}
        )
        panels.append(with_data({
            "width": percent_panel_width,
            "height": panel_height,
            "transform": text_panel_transform,
            "title": {
                "text": percent_header_wrap["text"], "anchor": "end", "offset": 6,
                "limit": max(20, percent_panel_width - header_pad), **header_style,
            },
            "mark": {"type": "text", "align": "right", "baseline": "middle", "fontSize": font_size},
            "encoding": {
                "y": y_enc_no_labels,
                "x": {"datum": 1, "axis": None, "scale": {"type": "linear", "domain": [0, 1]}},
                "text": {"field": "__bt_pct", "type": "quantitative", "format": pct_pattern},
                "color": pct_color,
            },
        }))

    value_transforms = list(text_panel_transform)
    text_enc = build_text_encoding("__bt_val", value_fmt, value_transforms, "__bt_val_str")
    val_color = (
        {"condition": {"test": others_text_test, "value": others_gray}, "value": "#666"}
        if others_text_test else {"value": "#666"}
    )
    panels.append(with_data({
        "width": value_panel_width,
        "height": panel_height,
        "transform": value_transforms,
        "title": {
            "text": value_header_wrap["text"], "anchor": "end", "offset": 6,
            "limit": max(20, value_panel_width - header_pad), **header_style,
        },
        "mark": {"type": "text", "align": "right", "baseline": "middle", "fontSize": font_size},
        "encoding": {
            "y": y_enc_no_labels,
            "x": {"datum": 1, "axis": None, "scale": {"type": "linear", "domain": [0, 1]}},
            "text": text_enc,
            "color": val_color,
        },
    }))

    spec["spacing"] = inter_panel_gap
    spec["hconcat"] = panels

    if column or row:
        if "encoding" not in spec:
            spec["encoding"] = {}
        if column:
            spec["encoding"]["column"] = column
        if row:
            spec["encoding"]["row"] = row


def _bar_table_show_percent_check(ctx: dict) -> dict:
    cs = (ctx.get("channelSemantics") or {}).get("x")
    if (not cs
        or not cs.get("field")
        or cs.get("type") != "quantitative"
        or resolve_display_aggregate(cs, ((ctx.get("encodings") or {}).get("x") or {}).get("aggregate")) != "sum"
    ):
        return {"applicable": False}
    total = 0.0
    has_neg = False
    has_pos = False
    count = 0
    field = cs["field"]
    for row in (ctx.get("data") or []):
        v = row.get(field)
        if not isinstance(v, (int, float)) or isinstance(v, bool):
            continue
        if v != v or v == float("inf") or v == float("-inf"):  # NaN/Inf guard
            continue
        count += 1
        if v < 0:
            has_neg = True
        elif v > 0:
            has_pos = True
        total += v
    return {"applicable": count > 0 and not (has_neg and has_pos) and abs(total) > 0}


bar_table_def = {
    "chart": "Bar Table",
    "template": {
        "spacing": 4,
        "resolve": {"scale": {"y": "shared"}},
        "hconcat": [],
        "config": {"view": {"stroke": None}, "axis": {"grid": False, "domain": False, "ticks": False}},
    },
    "channels": ["y", "x", "color", "column", "row"],
    "markCognitiveChannel": "length",
    "declareLayoutMode": _bar_table_declare,
    "instantiate": _bar_table_instantiate,
    "properties": [
        {"key": "maxRows", "label": "Max Rows", "type": "continuous",
         "min": 5, "max": 100, "step": 1, "defaultValue": 20},
        # Off by default — safer for arbitrary measures. Its `check` reports
        # applicability per render from the measure's data: a "% of total"
        # share only reads sensibly for an additive, single-sign measure with
        # a non-zero total — a share of a mixed-sign or intensive
        # (mean-aggregated) measure is misleading.
        {
            "key": "showPercent", "label": "Show % of Total", "type": "binary",
            "defaultValue": False,
            "check": _bar_table_show_percent_check,
        },
    ],
}
