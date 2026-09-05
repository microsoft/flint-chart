"""Core chart assembly logic — Two-Stage Pipeline Coordinator (port of assemble.ts)."""
from __future__ import annotations

import copy
import json
import math
import re
from typing import Any, Optional

from ..core.semantic_types import infer_vis_category, compute_zero_decision
from ..core.resolve_semantics import resolve_channel_semantics, convert_temporal_data
from ..core.field_semantics import to_type_string
from ..core.filter_overflow import filter_overflow
from ..core.encoding_overrides import apply_encoding_overrides
from ..core.compute_layout import (
    compute_layout,
    compute_channel_budgets,
    compute_min_subplot_dimensions,
    derive_stretch_caps,
    resolve_base_size,
)
from .templates import vl_get_template_def
from .instantiate_spec import vl_apply_layout_to_spec, vl_apply_tooltips
from ..core import js_round


_ESCAPE_RE = re.compile(r"[.\[\]]")


def _escape_vl_field_name(name: str) -> str:
    return _ESCAPE_RE.sub(lambda m: "\\" + m.group(0), name)


def _js_number_str(n: float) -> str:
    """Match JS String(n)."""
    if isinstance(n, bool):
        return "true" if n else "false"
    if isinstance(n, int):
        return str(n)
    if isinstance(n, float):
        if n.is_integer():
            return str(int(n))
        return repr(n)
    return str(n)


def _normalize_numbers(obj: Any) -> Any:
    """Convert integer-valued floats to ints in-place (mirrors JS Number serialization).

    JavaScript has no int/float distinction: ``JSON.stringify(200)`` and
    ``JSON.stringify(200.0)`` both emit ``"200"``. Python's ``json.dumps`` keeps
    the trailing ``.0`` for floats, which produces spurious byte-level differences
    against the JS reference. Normalizing once at the API boundary keeps the
    library's internal arithmetic free to use ``/`` without sprinkling ``int()``
    casts everywhere.
    """
    if isinstance(obj, dict):
        for k, v in obj.items():
            obj[k] = _normalize_numbers(v)
        return obj
    if isinstance(obj, list):
        for i, v in enumerate(obj):
            obj[i] = _normalize_numbers(v)
        return obj
    if isinstance(obj, float) and not isinstance(obj, bool):
        if math.isfinite(obj) and obj.is_integer():
            return int(obj)
    return obj


def _strip_undef_in_options(node: Any) -> Any:
    """Drop keys whose value is ``None`` from every dict reachable from
    ``node``. Mirrors JS ``JSON.stringify`` which omits ``undefined``
    properties — a ``ChartOption`` whose resolved ``value`` is undefined must
    serialize without the ``value`` key at all so the byte output matches the
    JS reference. Applied to every entry in ``_options`` (and recursively to
    nested control options like ``{value: undefined, label: "Default"}`` which
    become ``{"label": "Default"}``)."""
    if isinstance(node, dict):
        keys_to_drop = [k for k, v in node.items() if v is None]
        for k in keys_to_drop:
            del node[k]
        for v in node.values():
            _strip_undef_in_options(v)
    elif isinstance(node, list):
        for item in node:
            _strip_undef_in_options(item)
    return node


def _coerce_encoding_value(value):
    """Expand the bare-string channel shorthand into a full encoding object.

    ``"weight"`` -> ``{"field": "weight"}``. Strings inside a list (static
    series) are expanded element-by-element. Other values pass through.
    """
    if isinstance(value, str):
        return {"field": value}
    if isinstance(value, list):
        return [{"field": v} if isinstance(v, str) else v for v in value]
    return value


def normalize_encoding_shorthand(encodings: dict) -> dict:
    """Normalize a raw channel->value map, expanding bare-string shorthands."""
    return {ch: _coerce_encoding_value(v) for ch, v in encodings.items()}


def assemble_vegalite(input_doc: dict) -> dict:
    chart_spec = input_doc["chart_spec"]
    chart_type = chart_spec["chartType"]
    raw_encodings = normalize_encoding_shorthand(chart_spec.get("encodings") or {})
    data = (input_doc.get("data") or {}).get("values") or []
    semantic_types = input_doc.get("semantic_types") or {}
    # Internal layout targets the base (target) size; the optional canvasSize
    # acts as a hard ceiling that caps per-dimension stretch (see
    # derive_stretch_caps below). When canvasSize is omitted, stretch falls
    # back to options.maxStretch (default 2x). The base is clamped to the
    # ceiling so a smaller canvasSize shrinks the chart to fit rather than
    # overflowing it.
    size_ceiling = chart_spec.get("canvasSize")
    base_size = resolve_base_size(chart_spec.get("baseSize"), size_ceiling)
    canvas_size = base_size
    chart_properties = chart_spec.get("chartProperties")
    options = input_doc.get("options") or {}
    chart_template = vl_get_template_def(chart_type)
    if not chart_template:
        raise ValueError(f"Unknown chart type: {chart_type}")

    # Compose Category-B encoding-action overrides (stored by the host in
    # chartProperties, keyed by action key) onto the base encodings before any
    # pipeline phase runs. Flint owns the transform; the host only stores the
    # override value. See apply_encoding_overrides / EncodingActionDef.
    #
    # Some actions (e.g. Sort) must know each channel's resolved encoding TYPE
    # to decide which position axis is the discrete category and which is the
    # measure. The host leaves `type` unset ("auto") for most encodings, so we
    # run a preliminary semantics pass to fill in the inferred types, compose
    # the overrides onto the type-enriched encodings, then re-resolve semantics
    # on the result below (so that, e.g., a value-sort correctly suppresses the
    # field's canonical ordinal ordering).
    converted_data = convert_temporal_data(data, semantic_types)
    prelim_semantics = resolve_channel_semantics(
        raw_encodings, data, semantic_types, converted_data,
    )
    typed_raw_encodings: dict = {}
    for ch, enc in raw_encodings.items():
        if enc.get("type"):
            typed_raw_encodings[ch] = enc
        else:
            typed_raw_encodings[ch] = {**enc, "type": (prelim_semantics.get(ch) or {}).get("type")}

    # Axis dtype override (`xAxisType` / `yAxisType` properties): the user can
    # force a position channel's interpretation between a continuous time scale
    # ('temporal') and discrete bands ('nominal') for date-like fields that
    # carry a dual interpretation. Applies to either axis — x on a vertical
    # bar/line, y on a horizontal (transposed) bar/lollipop. Applied at the
    # encoding level so the whole pipeline (sorting, layout, formatting) honors
    # it — resolve_channel_semantics treats an explicit encoding.type as
    # authoritative.
    for axis in ("x", "y"):
        choice = (chart_properties or {}).get(f"{axis}AxisType")
        if choice in ("temporal", "nominal") and (typed_raw_encodings.get(axis) or {}).get("field"):
            typed_raw_encodings[axis] = {**typed_raw_encodings[axis], "type": choice}

    encodings = apply_encoding_overrides(chart_template, typed_raw_encodings, chart_properties)

    warnings: list = []

    # ═══════════════════════════════════════════════════════════════════════
    # PHASE 0: Resolve Semantics (VL-free)
    # ═══════════════════════════════════════════════════════════════════════
    tpl_mark = (chart_template.get("template") or {}).get("mark")
    template_mark_type = tpl_mark if isinstance(tpl_mark, str) else (tpl_mark.get("type") if isinstance(tpl_mark, dict) else None)

    channel_semantics = resolve_channel_semantics(
        encodings, data, semantic_types, converted_data,
    )

    effective_mark_type = template_mark_type or "point"
    for channel, cs in channel_semantics.items():
        if channel in ("x", "y") and cs.get("type") == "quantitative":
            numeric_values = []
            for r in data:
                v = r.get(cs["field"])
                if v is not None and isinstance(v, (int, float)) and not isinstance(v, bool) and not (isinstance(v, float) and math.isnan(v)):
                    numeric_values.append(v)
            cs["zero"] = compute_zero_decision(
                (cs.get("semanticAnnotation") or {}).get("semanticType"),
                channel,
                effective_mark_type,
                numeric_values,
            )

    # ── Zero-baseline override (position-cognitive axes) ──
    # compute_zero_decision (above) is the single authority on whether an axis
    # includes zero. For axes where that call is a genuine toss-up worth
    # surfacing (zero.uncertain), the host may override it via the stored
    # config `includeZero_x`/`includeZero_y`. We honor it by overwriting
    # `cs.zero.zero` so every downstream consumer renders the user's choice
    # consistently. Placed before the log-scale override and the layout phase
    # so banking is zero-aware of the override.
    if chart_template.get("markCognitiveChannel") == "position":
        for axis in ("x", "y"):
            cs = channel_semantics.get(axis)
            if not cs or not cs.get("field") or cs.get("type") != "quantitative" or not cs.get("zero"):
                continue
            choice = (chart_properties or {}).get(f"includeZero_{axis}")
            if choice is None:
                continue
            cs["zero"] = {**cs["zero"], "zero": choice}

    # ── Log-scale override (position-cognitive axes) ──
    # A log/symlog scale only makes sense on a continuous quantitative POSITION
    # axis (scatter/line/strip) — never on length/area marks. The engine
    # recommends log conservatively (cs["scaleType"]); here we apply the
    # user's per-axis override via chartProperties.logScale_x/_y (a boolean
    # on/off toggle). On non-position marks we strip any recommended
    # log/symlog so length/area encodings always render linearly from their
    # baseline.
    if chart_template.get("markCognitiveChannel") == "position":
        for axis in ("x", "y"):
            cs = channel_semantics.get(axis)
            if not cs or not cs.get("field") or cs.get("type") != "quantitative":
                continue
            tpl_enc = ((chart_template.get("template") or {}).get("encoding") or {}).get(axis)
            if tpl_enc and tpl_enc.get("bin"):
                continue
            choice = (chart_properties or {}).get(f"logScale_{axis}")
            if choice is None:
                continue
            field = cs["field"]
            has_zero = any(
                row.get(field) == 0 and not isinstance(row.get(field), bool) for row in data
            )
            if choice is False:
                cs["scaleType"] = None
            else:
                cs["scaleType"] = "symlog" if has_zero else "log"
    else:
        for axis in ("x", "y"):
            cs = channel_semantics.get(axis)
            if cs and cs.get("scaleType") in ("log", "symlog"):
                cs["scaleType"] = None

    # ═══════════════════════════════════════════════════════════════════════
    # STEP 0a: declareLayoutMode
    # ═══════════════════════════════════════════════════════════════════════
    declare_fn = chart_template.get("declareLayoutMode")
    if declare_fn:
        declaration = declare_fn(channel_semantics, data, chart_properties) or {}
    else:
        declaration = {}

    # Auto-detect binnedAxes from template encoding
    if not declaration.get("binnedAxes"):
        template_enc = (chart_template.get("template") or {}).get("encoding")
        if template_enc:
            binned_axes: dict = {}
            for axis in ("x", "y"):
                ax_enc = template_enc.get(axis)
                if ax_enc and ax_enc.get("bin"):
                    prop_bins = (chart_properties or {}).get("binCount") if chart_properties else None
                    if prop_bins:
                        binned_axes[axis] = {"maxbins": prop_bins}
                    elif isinstance(ax_enc["bin"], dict) and ax_enc["bin"].get("maxbins"):
                        binned_axes[axis] = ax_enc["bin"]
                    else:
                        binned_axes[axis] = {"maxbins": 10}
            if binned_axes:
                declaration["binnedAxes"] = binned_axes

    # Merge paramOverrides
    effective_options = {**options, **((declaration.get("paramOverrides") or {}))}

    add_tooltips_opt = effective_options.get("addTooltips", False)
    min_subplot_val = effective_options.get("minSubplotSize", 60)

    if effective_options.get("facetFixedPadding") is None:
        effective_options["facetFixedPadding"] = {"width": 50, "height": 40}
    if effective_options.get("facetGap") is None:
        effective_options["facetGap"] = 10
    if effective_options.get("targetBandAR") is None:
        effective_options["targetBandAR"] = 10
    # Resolve the optional canvasSize ceiling into per-dimension stretch caps
    # (betaX, betaY) so single plots AND facet grids honor the same budget.
    # Falls back to maxStretch when no ceiling is set.
    caps = derive_stretch_caps(base_size, size_ceiling, effective_options)
    effective_options["maxStretchX"] = caps["maxStretchX"]
    effective_options["maxStretchY"] = caps["maxStretchY"]
    facet_fix_w = effective_options["facetFixedPadding"]["width"]
    facet_fix_h = effective_options["facetFixedPadding"]["height"]

    # ═══════════════════════════════════════════════════════════════════════
    # STEP 0b: filterOverflow
    # ═══════════════════════════════════════════════════════════════════════
    all_mark_types: set = set()
    if template_mark_type:
        all_mark_types.add(template_mark_type)
    if isinstance((chart_template.get("template") or {}).get("layer"), list):
        for layer in chart_template["template"]["layer"]:
            lm = layer.get("mark")
            lm_type = lm if isinstance(lm, str) else (lm.get("type") if isinstance(lm, dict) else None)
            if lm_type:
                all_mark_types.add(lm_type)

    budgets = compute_channel_budgets(
        channel_semantics, declaration, converted_data, canvas_size, effective_options,
    )
    facet_grid_result = budgets.get("facetGrid")

    overflow_result = filter_overflow(
        channel_semantics, declaration, encodings, converted_data,
        budgets, all_mark_types,
    )

    values = overflow_result["filteredData"]
    nominal_counts = overflow_result["nominalCounts"]
    warnings.extend(overflow_result["warnings"])

    # ═══════════════════════════════════════════════════════════════════════
    # PHASE 1: Compute Layout
    # ═══════════════════════════════════════════════════════════════════════
    layout_result = compute_layout(
        channel_semantics,
        declaration,
        values,
        canvas_size,
        effective_options,
        facet_grid_result,
    )

    layout_result["truncations"] = overflow_result["truncations"]

    # ═══════════════════════════════════════════════════════════════════════
    # PHASE 2: Instantiate VL Spec
    # ═══════════════════════════════════════════════════════════════════════

    field_display_names = input_doc.get("field_display_names")

    resolved_encodings = _build_vl_encodings(
        encodings, channel_semantics, declaration, data,
        canvas_size, semantic_types, template_mark_type, chart_template,
        field_display_names,
    )

    # Align sort/domain arrays to converted data types
    for enc in resolved_encodings.values():
        field = enc.get("field") if enc else None
        if not field:
            continue
        val_map: dict = {}
        for r in values:
            v = r.get(field)
            if v is not None and str(v) not in val_map:
                val_map[str(v)] = v
        if len(val_map) == 0:
            continue

        def _remap(arr):
            out = []
            for v in arr:
                key = str(v)
                out.append(val_map[key] if key in val_map else v)
            return out

        if isinstance(enc.get("sort"), list):
            enc["sort"] = _remap(enc["sort"])
        if enc.get("scale") and isinstance(enc["scale"].get("domain"), list):
            enc["scale"]["domain"] = _remap(enc["scale"]["domain"])

    # Detect x/y discrete counts in layered specs
    def _is_discrete_t(t):
        return t in ("nominal", "ordinal")

    template_layer = (chart_template.get("template") or {}).get("layer")
    if isinstance(template_layer, list):
        for axis in ("x", "y"):
            if nominal_counts.get(axis, 0) == 0:
                for layer in template_layer:
                    layer_enc = (layer.get("encoding") or {}).get(axis)
                    if layer_enc and layer_enc.get("field") and _is_discrete_t(layer_enc.get("type")):
                        nominal_counts[axis] = len(set(r.get(layer_enc["field"]) for r in values))
                        break
                if nominal_counts.get(axis, 0) == 0 and resolved_encodings.get(axis, {}).get("field"):
                    enc = resolved_encodings[axis]
                    if _is_discrete_t(enc.get("type")):
                        nominal_counts[axis] = len(set(r.get(enc["field"]) for r in values))

    # template.instantiate
    vg_obj = copy.deepcopy(chart_template["template"])

    instantiate_context = {
        "channelSemantics": channel_semantics,
        "layout": layout_result,
        "table": values,
        "fullTable": converted_data,
        "resolvedEncodings": resolved_encodings,
        "encodings": encodings,
        "chartProperties": chart_properties,
        "canvasSize": canvas_size,
        "semanticTypes": semantic_types,
        "chartType": chart_type,
        "assembleOptions": effective_options,
    }

    chart_template["instantiate"](vg_obj, instantiate_context)

    if vg_obj.get("_warnings") and isinstance(vg_obj["_warnings"], list):
        warnings.extend(vg_obj["_warnings"])
        del vg_obj["_warnings"]

    # restructureFacets
    _restructure_facets(vg_obj, nominal_counts, facet_grid_result)

    # vlApplyLayoutToSpec
    vl_apply_layout_to_spec(vg_obj, instantiate_context, warnings)

    # Post-layout adjustments
    default_chart_width = canvas_size["width"]
    default_chart_height = canvas_size["height"]

    min_dims = compute_min_subplot_dimensions(
        channel_semantics, declaration, values, effective_options,
    )
    min_subplot_width = min_dims["minSubplotWidth"]
    min_subplot_height = min_dims["minSubplotHeight"]

    ref_gap = effective_options.get("facetGap") or 0
    subplot_dim = min(layout_result["subplotWidth"], layout_result["subplotHeight"])
    REF_SUBPLOT = 100
    facet_gap_val = max(6, js_round(ref_gap * subplot_dim / REF_SUBPLOT))

    if "config" not in vg_obj or vg_obj["config"] is None:
        vg_obj["config"] = {}
    vg_obj["config"]["facet"] = {"spacing": facet_gap_val}

    max_facet_columns = max(2, math.floor((default_chart_width * caps["maxStretchX"] - facet_fix_w) / (min_subplot_width + facet_gap_val)))
    max_facet_rows = max(2, math.floor((default_chart_height * caps["maxStretchY"] - facet_fix_h) / (min_subplot_height + facet_gap_val)))
    max_facet_nominal_values = max_facet_columns * max_facet_rows

    # Bin quantitative facets
    for channel in ("facet", "column", "row"):
        enc = (vg_obj.get("encoding") or {}).get(channel)
        if enc and enc.get("type") == "quantitative":
            field_name = enc["field"]
            unique_values = list({r.get(field_name) for r in values})
            if len(unique_values) > max_facet_nominal_values:
                enc["bin"] = True

    # Independent y-axis
    effective_encoding = (vg_obj.get("spec") or {}).get("encoding") or vg_obj.get("encoding")
    layer_encodings = []
    for l in ((vg_obj.get("spec") or {}).get("layer") or vg_obj.get("layer") or []):
        e = l.get("encoding")
        if e:
            layer_encodings.append(e)
    y_enc = (effective_encoding or {}).get("y") if effective_encoding else None
    if not y_enc:
        for e in layer_encodings:
            if e.get("y"):
                y_enc = e["y"]
                break
    effective_facet = vg_obj.get("facet") or (vg_obj.get("encoding") or {}).get("facet")
    has_faceted_quant = effective_facet is not None and y_enc and y_enc.get("type") == "quantitative"
    computed_independent_y_axis = False
    if has_faceted_quant:
        user_choice = (chart_properties or {}).get("independentYAxis") if chart_properties else None
        if user_choice is None:
            y_field = y_enc.get("field")
            column_field = effective_facet.get("field")
            if y_field and column_field:
                column_groups: dict = {}
                for row in data:
                    column_value = row.get(column_field)
                    y_value = row.get(y_field)
                    if y_value is not None and isinstance(y_value, (int, float)) and not isinstance(y_value, bool) and not (isinstance(y_value, float) and math.isnan(y_value)):
                        current_max = column_groups.get(column_value, 0)
                        column_groups[column_value] = max(current_max, abs(y_value))
                max_values = [v for v in column_groups.values() if v > 0]
                if len(max_values) >= 2:
                    max_value = max(max_values)
                    min_value = min(max_values)
                    ratio = max_value / min_value if min_value > 0 else float("inf")
                    total_facets = ((layout_result.get("facet") or {}).get("columns") or 1) * ((layout_result.get("facet") or {}).get("rows") or 1)
                    if ratio >= 100 and total_facets < 6:
                        computed_independent_y_axis = True
        else:
            computed_independent_y_axis = bool(user_choice)

        if computed_independent_y_axis:
            if "resolve" not in vg_obj:
                vg_obj["resolve"] = {}
            if "scale" not in vg_obj["resolve"]:
                vg_obj["resolve"]["scale"] = {}
            vg_obj["resolve"]["scale"]["y"] = "independent"

    if add_tooltips_opt:
        vl_apply_tooltips(vg_obj)

    # ═══════════════════════════════════════════════════════════════════════
    # RESULT
    # ═══════════════════════════════════════════════════════════════════════
    result: dict = {}
    for k, v in vg_obj.items():
        result[k] = v
    if "data" not in vg_obj or vg_obj.get("data") is None:
        result["data"] = {"values": values}

    if len(warnings) > 0:
        result["_warnings"] = warnings
    if len(overflow_result["viewports"]) > 0:
        result["_viewports"] = overflow_result["viewports"]
    result["_width"] = layout_result["subplotWidth"]
    result["_height"] = layout_result["subplotHeight"]

    # Annotated option catalog: every configurable property this template
    # exposes, tagged with whether it is *applicable* for this spec + data and
    # the *value* the compiler will use (host choice if set, else the engine's
    # recommended default). This is the single contract a host (DF, an AI
    # agent, another renderer) reads to know which controls to surface and how
    # to seed them — see ChartOption / get_chart_options. Passing a
    # non-applicable property back to the compiler is accepted but silently
    # ignored.
    #
    # Each property decides its own applicability through its pure `check(ctx)`
    # (the single source of truth, co-located with the property). The one
    # piece that can't live there is `independentYAxis`'s *recommended
    # default* — whether to turn it on automatically — which is layout-coupled
    # (it needs the resolved facet grid and the assembled spec's facet/y
    # structure, differing for 1-D vs 2-D facets); that value is computed
    # above and threaded in here.
    eval_ctx = {
        "encodings": encodings,
        "channelSemantics": channel_semantics,
        "data": data,
        "chartProperties": chart_properties,
    }
    layout_coupled_recommendation = {
        "independentYAxis": computed_independent_y_axis,
    }

    options_out: list = []
    for def_ in (chart_template.get("properties") or []):
        check_fn = def_.get("check")
        ev = check_fn(eval_ctx) if check_fn else None
        applicable = ev["applicable"] if ev else True
        # ev?.recommendedValue can be None to mean "no recommendation". In JS
        # `?? recommended ?? defaultValue` only short-circuits on null/
        # undefined. Mirror that: only fall through when recommended is None.
        layout_rec = layout_coupled_recommendation.get(def_["key"])
        recommended = layout_rec if layout_rec is not None else (ev.get("recommendedValue") if ev else None)
        host_val = (chart_properties or {}).get(def_["key"]) if chart_properties else None
        if host_val is not None:
            value = host_val
        elif recommended is not None:
            value = recommended
        else:
            value = def_.get("defaultValue")
        # Strip the `check` rule — a ChartOption is the resolved, serializable
        # answer, not the predicate that produced it.
        option_entry = {k: v for k, v in def_.items() if k != "check"}
        option_entry["applicable"] = applicable
        option_entry["value"] = value
        options_out.append(option_entry)
    # Drop keys whose value is None to match JS JSON.stringify (which omits
    # undefined). This also tidies up nested control option entries that
    # carry `{value: None, label: "Default"}`.
    _strip_undef_in_options(options_out)
    result["_options"] = options_out

    _normalize_numbers(result)
    return result


def get_chart_options(input_doc: dict) -> list:
    """Inspect a chart spec + dataset and report the configurable options
    Flint exposes for it, each annotated with whether it is *applicable* and
    the *value* the compiler will use (see ChartOption).

    This is the "ask Flint what knobs are available" entry point. A host
    calls it with the same input it would pass to ``assemble_vegalite``,
    renders a control for each applicable option seeded from ``value``, and
    feeds the user's choices back via ``chart_spec.chartProperties``.
    """
    spec = assemble_vegalite(input_doc)
    opts = spec.get("_options") if isinstance(spec, dict) else None
    return opts if isinstance(opts, list) else []


# ===========================================================================
# buildVLEncodings
# ===========================================================================

def _build_vl_encodings(
    encodings: dict,
    channel_semantics: dict,
    declaration: dict,
    data: list,
    canvas_size: dict,
    semantic_types: dict,
    template_mark_type: Optional[str],
    chart_template: dict,
    field_display_names: Optional[dict] = None,
) -> dict:
    resolved_encodings: dict = {}

    template_channels = set((chart_template.get("channels") or []) + ["column", "row"])

    for channel, encoding in encodings.items():
        if channel not in template_channels:
            continue

        encoding_obj: dict = {}
        field_name = encoding.get("field")
        cs = channel_semantics.get(channel)

        if channel == "radius":
            encoding_obj["scale"] = {"type": "sqrt", "zero": True}

        if not field_name and encoding.get("aggregate") == "count":
            encoding_obj["field"] = "_count"
            encoding_obj["title"] = "Count"
            encoding_obj["type"] = "quantitative"

        if field_name:
            escaped_field_name = _escape_vl_field_name(field_name)
            encoding_obj["field"] = escaped_field_name
            if escaped_field_name != field_name:
                encoding_obj["title"] = field_name

            encoding_obj["type"] = (cs or {}).get("type") or "nominal"

            if encoding.get("type"):
                encoding_obj["type"] = encoding["type"]
            elif channel in ("column", "row"):
                if encoding_obj["type"] not in ("nominal", "ordinal"):
                    encoding_obj["type"] = "nominal"

            if encoding.get("aggregate"):
                if encoding["aggregate"] == "count":
                    encoding_obj["field"] = "_count"
                    encoding_obj["title"] = "Count"
                    encoding_obj["type"] = "quantitative"
                else:
                    encoding_obj["field"] = _escape_vl_field_name(f"{field_name}_{encoding['aggregate']}")
                    encoding_obj["type"] = "quantitative"

            if encoding_obj["type"] == "quantitative" and channel == "x":
                if template_mark_type in ("line", "area", "trail", "point"):
                    encoding_obj["scale"] = {"nice": False}

            if encoding_obj["type"] == "nominal" and channel in ("color", "group"):
                actual_domain = list({r.get(field_name) for r in data})
                if len(actual_domain) >= 16:
                    if "legend" not in encoding_obj:
                        encoding_obj["legend"] = {}
                    encoding_obj["legend"]["symbolSize"] = 12
                    encoding_obj["legend"]["labelFontSize"] = 8

        if channel == "size":
            vl_default_max = 361
            plot_area = canvas_size["width"] * canvas_size["height"]
            n = max(len(data), 1)
            fair_share = plot_area / n
            target_pct = 0.6
            absolute_min = 16

            is_quantitative = encoding_obj.get("type") in ("quantitative", "temporal")
            if is_quantitative:
                max_size = js_round(max(absolute_min, min(vl_default_max, fair_share * target_pct)))
                min_size = 9
                encoding_obj["scale"] = {"type": "sqrt", "zero": True, "range": [min_size, max_size]}
            else:
                max_size = js_round(max(absolute_min, min(vl_default_max, fair_share * target_pct)))
                min_size = js_round(max_size / 4)
                encoding_obj["scale"] = {"range": [min_size, max_size]}

        # --- Sorting ---
        field_is_numeric = False
        if field_name:
            for r in data:
                v = r.get(field_name)
                if isinstance(v, (int, float)) and not isinstance(v, bool):
                    field_is_numeric = True
                    break

        def preserve_domain_types(arr):
            if not field_is_numeric:
                return arr
            out = []
            for v in arr:
                if isinstance(v, str):
                    try:
                        n = float(v)
                        # Match JS: String(n) === v.trim()
                        if _js_number_str(n) == v.strip() and not math.isnan(n):
                            # Convert to int if whole
                            if n.is_integer() and "." not in v and "e" not in v.lower():
                                out.append(int(n))
                            else:
                                out.append(n)
                            continue
                    except (TypeError, ValueError):
                        pass
                out.append(v)
            return out

        if encoding.get("sortBy") or encoding.get("sortOrder"):
            sort_by = encoding.get("sortBy")
            sort_order = encoding.get("sortOrder")
            if not sort_by:
                if sort_order:
                    encoding_obj["sort"] = sort_order
            elif sort_by in ("x", "y"):
                if sort_by == channel:
                    prefix = "-" if sort_order == "descending" else ""
                    encoding_obj["sort"] = f"{prefix}{sort_by}"
                else:
                    prefix = "" if sort_order == "ascending" else "-"
                    encoding_obj["sort"] = f"{prefix}{sort_by}"
            elif sort_by == "color":
                if (encodings.get("color") or {}).get("field"):
                    prefix = "" if sort_order == "ascending" else "-"
                    encoding_obj["sort"] = f"{prefix}{sort_by}"
            else:
                if encoding_obj.get("type") != "temporal":
                    try:
                        if field_name:
                            field_sem_type = to_type_string(semantic_types.get(field_name))
                            field_vis_cat = infer_vis_category([r.get(field_name) for r in data])
                            sorted_values = json.loads(sort_by)

                            if field_vis_cat == "temporal" or field_sem_type == "Year" or field_sem_type == "Decade":
                                sorted_values = [_js_number_str(v) if isinstance(v, (int, float)) else str(v) for v in sorted_values]

                            sorted_values = preserve_domain_types(sorted_values)

                            if sort_order == "ascending" or not sort_order:
                                encoding_obj["sort"] = sorted_values
                            else:
                                encoding_obj["sort"] = list(reversed(sorted_values))
                    except Exception:
                        pass
        else:
            is_discrete_type = encoding_obj.get("type") in ("nominal", "ordinal")
            if is_discrete_type:
                if cs and cs.get("ordinalSortOrder") and len(cs["ordinalSortOrder"]) > 0:
                    encoding_obj["sort"] = preserve_domain_types(cs["ordinalSortOrder"])
                elif field_is_numeric and field_name:
                    encoding_obj["sort"] = "ascending"
                else:
                    encoding_obj["sort"] = None

        # Color scheme
        if channel == "color" or channel == "group":
            if encoding.get("scheme") and encoding.get("scheme") != "default":
                if "scale" in encoding_obj:
                    encoding_obj["scale"]["scheme"] = encoding["scheme"]
                else:
                    encoding_obj["scale"] = {"scheme": encoding["scheme"]}
            elif field_name and cs and cs.get("colorScheme"):
                if "scale" not in encoding_obj:
                    encoding_obj["scale"] = {}
                encoding_obj["scale"]["scheme"] = cs["colorScheme"]["scheme"]
                if cs["colorScheme"].get("type") == "diverging" and cs["colorScheme"].get("domainMid") is not None:
                    encoding_obj["scale"]["domainMid"] = cs["colorScheme"]["domainMid"]

        # Display name as title
        if field_display_names and field_name and field_display_names.get(field_name) and not encoding_obj.get("title"):
            encoding_obj["title"] = field_display_names[field_name]

        if len(encoding_obj) != 0:
            resolved_encodings[channel] = encoding_obj

    # --- Apply declaration overrides ---
    if declaration.get("resolvedTypes"):
        for ch, type_ in declaration["resolvedTypes"].items():
            if resolved_encodings.get(ch):
                resolved_encodings[ch]["type"] = type_

    # Translate group → color + xOffset/yOffset
    group_cs = channel_semantics.get("group")
    if group_cs and group_cs.get("field") and resolved_encodings.get("group"):
        x_type = (resolved_encodings.get("x") or {}).get("type")
        y_type = (resolved_encodings.get("y") or {}).get("type")
        def _disc(t):
            return t in ("nominal", "ordinal")
        if _disc(x_type):
            group_axis = "x"
        elif _disc(y_type):
            group_axis = "y"
        else:
            group_axis = "x"
        offset_channel = "xOffset" if group_axis == "x" else "yOffset"

        if "color" not in resolved_encodings:
            resolved_encodings["color"] = {**resolved_encodings["group"]}
        del resolved_encodings["group"]

        if offset_channel not in resolved_encodings:
            offset_enc: dict = {"field": group_cs["field"], "type": "nominal"}
            if resolved_encodings.get("color", {}).get("sort") is not None or (resolved_encodings.get("color") and "sort" in resolved_encodings["color"]):
                # match JS: `resolvedEncodings.color?.sort !== undefined`
                if resolved_encodings.get("color") and "sort" in resolved_encodings["color"]:
                    offset_enc["sort"] = resolved_encodings["color"]["sort"]
            resolved_encodings[offset_channel] = offset_enc

    # Merge template encoding defaults
    template_encoding = (chart_template.get("template") or {}).get("encoding")
    if template_encoding:
        for ch, enc in template_encoding.items():
            if enc and isinstance(enc, dict) and len(enc) > 0:
                if resolved_encodings.get(ch):
                    resolved_encodings[ch] = {**enc, **resolved_encodings[ch]}

    return resolved_encodings


# ===========================================================================
# restructureFacets
# ===========================================================================

def _restructure_facets(vg_obj: dict, nominal_counts: dict, facet_grid: Optional[dict]) -> None:

    def is_concat_spec():
        return (
            isinstance(vg_obj.get("hconcat"), list)
            or isinstance(vg_obj.get("vconcat"), list)
            or isinstance(vg_obj.get("concat"), list)
        )

    def hoist_concat_into_facet(facet_def, wrap_columns=None):
        child_spec: dict = {}
        for key in ("hconcat", "vconcat", "concat", "resolve", "spacing", "align", "bounds", "center"):
            if key in vg_obj and vg_obj[key] is not None:
                child_spec[key] = vg_obj[key]
                del vg_obj[key]
        if vg_obj.get("encoding") and len(vg_obj["encoding"]) > 0:
            child_spec["encoding"] = vg_obj["encoding"]
            del vg_obj["encoding"]

        vg_obj["facet"] = facet_def
        if wrap_columns is not None:
            vg_obj["columns"] = wrap_columns
        vg_obj["spec"] = child_spec
        existing_resolve = vg_obj.get("resolve") or {}
        existing_scale = existing_resolve.get("scale") or {}
        vg_obj["resolve"] = {
            **existing_resolve,
            "scale": {**existing_scale, "y": "independent"},
        }

    enc = vg_obj.get("encoding") or {}
    has_col = "column" in enc and enc["column"] is not None
    has_row = "row" in enc and enc["row"] is not None
    if has_col and not has_row:
        enc["facet"] = enc["column"]
        num_cols = (facet_grid or {}).get("columns") if facet_grid else nominal_counts.get("column", 1) or 1
        num_rows = (facet_grid or {}).get("rows", 1) if facet_grid else 1

        enc["facet"]["columns"] = num_cols

        del enc["column"]

        if is_concat_spec():
            facet_def = {**enc["facet"]}
            if "columns" in facet_def:
                del facet_def["columns"]
            del enc["facet"]
            if len(enc) == 0:
                del vg_obj["encoding"]
            hoist_concat_into_facet(facet_def, num_cols)
            return

        if isinstance(vg_obj.get("layer"), list):
            facet_def = {**enc["facet"]}
            wrap_columns = facet_def.get("columns")
            if "columns" in facet_def:
                del facet_def["columns"]
            del enc["facet"]

            vg_obj["facet"] = facet_def
            if wrap_columns is not None:
                vg_obj["columns"] = wrap_columns
            vg_obj["spec"] = {
                "layer": vg_obj["layer"],
                "encoding": enc,
            }
            del vg_obj["layer"]
            if "encoding" in vg_obj:
                del vg_obj["encoding"]
        return

    if is_concat_spec() and (enc.get("column") or enc.get("row")):
        facet_def: dict = {}
        if enc.get("column"):
            facet_def["column"] = enc["column"]
            del enc["column"]
        if enc.get("row"):
            facet_def["row"] = enc["row"]
            del enc["row"]
        if len(enc) == 0:
            if "encoding" in vg_obj:
                del vg_obj["encoding"]
        hoist_concat_into_facet(facet_def)
        return

    if isinstance(vg_obj.get("layer"), list) and (enc.get("column") or enc.get("row")):
        facet_def = {}
        if enc.get("column"):
            facet_def["column"] = enc["column"]
            del enc["column"]
        if enc.get("row"):
            facet_def["row"] = enc["row"]
            del enc["row"]
        vg_obj["facet"] = facet_def
        vg_obj["spec"] = {
            "layer": vg_obj["layer"],
            "encoding": enc,
        }
        del vg_obj["layer"]
        if "encoding" in vg_obj:
            del vg_obj["encoding"]
