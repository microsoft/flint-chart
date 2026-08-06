"""Candlestick Chart template."""
from __future__ import annotations

from ...core import js_round
from .utils import adjust_bar_marks


def _candlestick_declare(cs, table, chart_properties):
    return {"axisFlags": {"x": {"banded": True}}}


def _candlestick_instantiate(spec, ctx):
    encs = ctx["resolvedEncodings"]
    x = encs.get("x")
    open_ = encs.get("open")
    high = encs.get("high")
    low = encs.get("low")
    close = encs.get("close")
    column = encs.get("column")
    row = encs.get("row")

    if "encoding" not in spec:
        spec["encoding"] = {}
    if x:
        spec["encoding"]["x"] = x
        if x.get("type") in ("nominal", "ordinal"):
            spec["encoding"]["x"]["sort"] = None
    if column:
        spec["encoding"]["column"] = column
    if row:
        spec["encoding"]["row"] = row

    spec["encoding"]["y"] = {
        "type": "quantitative",
        "scale": {"zero": False},
        "axis": {"title": None},
    }

    spec["title"] = {
        "text": "Price", "anchor": "start", "fontSize": 11,
        "fontWeight": "normal", "color": "#666",
    }

    if low:
        spec["layer"][0]["encoding"]["y"] = {"field": low["field"]}
    if high:
        spec["layer"][0]["encoding"]["y2"] = {"field": high["field"]}
    if open_:
        spec["layer"][1]["encoding"]["y"] = {"field": open_["field"]}
    if close:
        spec["layer"][1]["encoding"]["y2"] = {"field": close["field"]}

    if open_ and open_.get("field") and close and close.get("field"):
        # `<=`, not `<`: a session that closes exactly where it opened has not
        # fallen, and colouring it as a decline is a false statement.
        spec["encoding"]["color"] = {
            "condition": {
                "test": f"datum['{open_['field']}'] <= datum['{close['field']}']",
                "value": "#06982d",
            },
            "value": "#ae1325",
        }

    # Body width.
    #
    # On a banded *continuous* x -- the usual case, dates -- the slot width is
    # set by the smallest gap between observations, not by the row count: nine
    # trading days spanning eleven calendar days occupy eleven slots, two of
    # which are the weekend. Sizing on cardinality makes every body wider than
    # its own slot and adjacent candles fuse into a single polygon.
    # adjust_bar_marks() already performs that min-gap analysis for bar marks,
    # so use it rather than keep a second, wrong copy of the arithmetic here.
    #
    # It returns the largest *non-overlapping* size, and bodies that merely
    # touch still read as one shape when consecutive sessions move the same
    # way. A candlestick needs a visible gutter, so take a fraction of it.
    body_fill = 0.8
    layout = ctx.get("layout") or {}
    if (layout.get("xContinuousAsDiscrete") or 0) > 0:
        adjust_bar_marks(spec, ctx)
        fitted = (spec["layer"][1].get("mark") or {}).get("size", 14)
        bar_size = max(2, int(fitted * body_fill))
    else:
        step = layout.get("xStep") or 20
        bar_size = max(2, js_round(step * body_fill))

    layer1_mark = spec["layer"][1].get("mark") or {}
    if isinstance(layer1_mark, str):
        layer1_mark = {"type": layer1_mark}
    spec["layer"][1]["mark"] = {**layer1_mark, "size": bar_size}

    # Doji sessions.
    #
    # When open == close the open->close bar has zero height and vanishes, so a
    # flat session renders as a bare wick with no candle on it. Draw it as a
    # horizontal tick at the shared price, which is the convention and is
    # exactly what the bar degenerates to.
    if open_ and open_.get("field") and close and close.get("field"):
        spec["layer"].append({
            "transform": [
                {"filter": f"datum['{open_['field']}'] === datum['{close['field']}']"},
            ],
            "mark": {"type": "tick", "size": bar_size, "thickness": 2},
            "encoding": {"y": {"field": close["field"]}},
        })


candlestick_chart_def = {
    "chart": "Candlestick Chart",
    "template": {
        "encoding": {},
        "layer": [
            {"mark": "rule", "encoding": {}},
            {"mark": {"type": "bar", "size": 14}, "encoding": {}},
        ],
    },
    "channels": ["x", "open", "high", "low", "close", "column", "row"],
    "markCognitiveChannel": "position",
    "declareLayoutMode": _candlestick_declare,
    "instantiate": _candlestick_instantiate,
}
