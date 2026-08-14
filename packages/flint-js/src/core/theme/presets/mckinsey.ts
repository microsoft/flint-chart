// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ThemePreset } from '../types';
import { MCKINSEY_ICON } from './icons';

/**
 * McKinsey.
 *
 * Measured from hand-authored redesigns, not invented — see the Theme Lab.
 */
export const mckinsey: ThemePreset = {
    id: 'mckinsey',
    label: "McKinsey",
    description: "Consulting deck: wide bands, every value printed in a column, a headline that states the takeaway.",
    guidance: [
        "- `title` states the takeaway; `subtitle` names the measure and unit.",
        "- Colour can tell 5 categories apart.",
    ].join('\n'),
    icon: MCKINSEY_ICON,
    spec: {
        "id": "mckinsey",
        "label": "McKinsey",
        "ink": {
            "surface": {
                "source": "host"
            },
            "text": {
                "primary": "#051c2c",
                "secondary": "#5a6872",
                "muted": "#8a969d"
            },
            "structure": {
                "axis": "#051c2c",
                "rule": "#d3dce1",
                // A lollipop stem borrows the rule where no connector ink is
                // named, but McKinsey's rule is a near-white gridline (#d3dce1)
                // — far too faint for a stem that must carry the eye up to the
                // dot. Their exhibits draw the stem a solid medium-light grey,
                // clearly present yet subordinate to the near-black dot. So the
                // connector states its own, more definite ink.
                "connector": "#a7b1bc"
            },
            "series": {
                // McKinsey's 2020 "Deep Blue" (#051c2c) is deliberately
                // *almost black* — the firm's own brand refresh describes it
                // as near-black to project authority against white, and real
                // exhibits/reports use it as the primary data-bar colour.
                // So a lone series reads near-black by design; electric blue
                // (#2251ff) is the house's highlight, not its default. Kept
                // authentic — do not "fix" it to a lighter blue.
                "single": "#051c2c",
                "categorical": [
                    "#051c2c",
                    "#2251ff",
                    "#00a9f4",
                    "#00cfb4",
                    "#8c9ba5"
                ],
                // The house is blue at heart, so the extended set does not
                // reach for a rainbow — it walks the cool wheel the way
                // McKinsey's own decks do: blue → cyan → teal, then a
                // restrained turn into violet before the slate. The core five
                // stay a prefix so a chart's colours don't reshuffle as it
                // grows past the handful the identity is built on.
                "categoricalExtended": [
                    "#051c2c",
                    "#2251ff",
                    "#00a9f4",
                    "#00cfb4",
                    "#8c9ba5",
                    "#7c5cff",
                    "#0e7c8b",
                    "#6fb7e8",
                    "#b39ddb",
                    "#3d4f66"
                ],
                "sequential": {
                    "stops": [
                        "#eef3f8",
                        "#cfdcea",
                        "#9db8d2",
                        "#5b82ab",
                        "#051c2c"
                    ],
                    "space": "lab",
                    "endpointsAgainstSurface": true,
                    // Stated light-to-dark. One ramp, two consumptions: a
                    // part-to-whole pie samples it in reverse, a heat map
                    // interpolates it.
                    "consumption": "interpolate"
                },
                // A signed measure crosses zero, and a single-hue ramp cannot
                // say which side of it a value sits on — dark reads as "more",
                // not "positive". The house is otherwise all blue, so the one
                // place it must reach for a second hue is here: cool blue below
                // zero, a restrained warm above, the light surface tint at the
                // break. Cool-below / warm-above matches the other houses.
                "diverging": {
                    "stops": [
                        "#2251ff",
                        "#9db8d2",
                        "#eef3f8",
                        "#d98f6a",
                        "#b4472e"
                    ],
                    "neutral": "#eef3f8",
                    "space": "lab",
                    "endpointsAgainstSurface": true,
                    "consumption": "interpolate"
                },
                "selection": {
                    "partToWhole": "categorical",
                    "signed": "sequential"
                },
                "overflow": "#b6bfc7"
            },
            "accent": "#2251ff"
        },
        "type": {
            "minSize": 9,
            "headline": {
                "family": "'Helvetica Neue', Helvetica, Arial, sans-serif",
                "size": "text.300",
                "weight": "bold"
            },
            "deck": {
                "size": "text.200"
            },
            "axisLabel": {
                "size": "text.100"
            },
            "axisTitle": {
                "size": "text.100"
            },
            "valueLabel": {
                "size": "text.200",
                "weight": "semibold",
                "color": "#051c2c"
            }
        },
        "structure": {
            "axis": {
                "categorical": {
                    "line": "omit",
                    "ticks": "omit"
                },
                "measure": {
                    "line": "omit",
                    "ticks": "omit",
                    "suppressWhenValuesPrinted": true
                }
            },
            "grid": {
                "measure": "omit",
                "category": "omit"
            },
            "frame": "omit",
            "baseline": "full"
        },
        "marks": {
            "bandFraction": 0.7,
            "strokeWeight": 2,
            "connector": {
                "presence": "full",
                "weight": 0.8,
                "spanWeight": 3
            },
            "point": {
                "size": 72
            },
            "separator": {
                "presence": "hairline",
                "source": "surface",
                "width": 0.6
            },
            "slice": {
                "gap": 1
            }
        },
        "geometry": {
            "cell": {
                "gap": 0.8
            }
        },
        "labels": {
            "truncation": "never",
            "angle": "horizontal"
        },
        "legend": {
            "show": "always",
            "placement": [
                "seriesEnd",
                "inline",
                "top"
            ],
            "direction": "horizontal",
            "title": "omit",
            "suppressWhenValuesPrinted": true
        },
        "dataLabels": {
            "show": "always",
            "placement": "column",
            "inkMode": "contrastWithMark"
        },
        "annotation": {
            "axisTitles": "omit",
            "numberFormat": {
                "precision": "integer",
                "thousands": "separator"
            }
        },
        "layout": {
            "density": "airy",
            "titleBlock": {
                "anchor": "start",
                "gap": "loose",
                "deckGap": "loose"
            },
            // McKinsey exhibits use substantial bars inside an airy page: the
            // whitespace lives around the chart and its annotations, not in
            // unusually narrow marks or compressed category rows.
            "bandStep": 24,
            // Sparse exhibits broaden their category rhythm, but retain more
            // of the house's stable base step than the renderer's full-span fit.
            "bandStepFit": 0.35
        },
        "compileDefaults": {
            "baseSize": { "width": 440, "height": 300 }
        }
    },
};
