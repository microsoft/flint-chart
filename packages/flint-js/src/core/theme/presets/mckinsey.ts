// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ThemePreset } from '../types';

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
                "rule": "#d3dce1"
            },
            "series": {
                "single": "#051c2c",
                "categorical": [
                    "#051c2c",
                    "#2251ff",
                    "#00a9f4",
                    "#00cfb4",
                    "#8c9ba5"
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
                "selection": {
                    "partToWhole": "sequentialRamp",
                    "signed": "sequential"
                }
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
            "axisLabel": {
                "size": "text.200"
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
            "bandFraction": 0.6,
            "strokeWeight": 2,
            "connector": {
                "presence": "full",
                "weight": 0.8,
                "spanWeight": 3
            },
            "point": {
                "size": 64
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
                "anchor": "start"
            },
            "bandStep": 80
        }
    },
};
