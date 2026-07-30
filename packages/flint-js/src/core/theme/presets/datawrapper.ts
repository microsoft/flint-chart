// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ThemePreset } from '../types';

/**
 * Datawrapper.
 *
 * Measured from hand-authored redesigns, not invented — see the Theme Lab.
 */
export const datawrapper: ThemePreset = {
    id: 'datawrapper',
    label: "Datawrapper",
    description: "Embedded web chart: narrow column, plain headline and deck, a rule under the footer.",
    guidance: [
        "- `title` and `subtitle` do all the naming; annotate the measure with `unit`.",
        "- Sized for a narrow column, so it reads tall rather than wide.",
        "- Colour can tell 5 categories apart.",
    ].join('\n'),
    spec: {
        "id": "datawrapper",
        "label": "Datawrapper",
        "ink": {
            "surface": {
                "source": "host"
            },
            "text": {
                "primary": "#333333",
                "secondary": "#666666",
                "muted": "#999999"
            },
            "structure": {
                "grid": "#dcdcdc",
                "rule": "#dcdcdc",
                "connector": "#c8c8c8",
                "axis": "#333333"
            },
            "series": {
                "single": "#18a1cd",
                "categorical": [
                    "#18a1cd",
                    "#e2a233",
                    "#c04a4a",
                    "#2d8659",
                    "#7e5aa2"
                ],
                "sequential": {
                    "stops": [
                        "#dceef6",
                        "#a9d3e6",
                        "#6aabcc",
                        "#2f7fa8",
                        "#0b5c82"
                    ],
                    "space": "lab",
                    "consumption": "quantize",
                    "quantizeCount": 5
                },
                "diverging": {
                    "stops": [
                        "#2f7fa8",
                        "#a9d3e6",
                        "#f0ece4",
                        "#e8ac70",
                        "#c04a4a"
                    ],
                    "neutral": "#f0ece4",
                    "space": "lab",
                    "endpointsAgainstSurface": true,
                    "consumption": "quantize",
                    "quantizeCount": 5
                },
                "selection": {}
            },
            "accent": "#18a1cd"
        },
        "type": {
            "minSize": 11,
            "headline": {
                "family": "'Helvetica Neue', Helvetica, Arial, sans-serif",
                "size": "text.300",
                "weight": "bold"
            },
            "axisLabel": {
                "size": "text.200"
            },
            "keyLabel": {
                "size": "text.200"
            }
        },
        "structure": {
            "axis": {
                "categorical": {
                    "line": "full",
                    "ticks": "omit",
                    "tickLabels": "sparse"
                },
                "measure": {
                    "line": "omit",
                    "ticks": "omit"
                }
            },
            "grid": {
                "measure": "quiet",
                "category": "omit",
                "style": "dashed"
            },
            "frame": "omit",
            "baseline": "quiet"
        },
        "marks": {
            "bandFraction": 0.66,
            "separator": {
                "presence": "hairline",
                "source": "surface",
                "width": 1.5
            },
            "connector": {
                "presence": "full",
                "weight": 1
            }
        },
        "labels": {
            "truncation": "never"
        },
        "legend": {
            "show": "always",
            "placement": [
                "top"
            ],
            "direction": "horizontal",
            "title": "omit"
        },
        "dataLabels": {
            "show": "whenTheyFit",
            "placement": "outsideMark"
        },
        "annotation": {
            "axisTitles": "omit",
            "unit": "lastTick",
            "numberFormat": {
                "precision": "auto"
            }
        },
        "furniture": [
            {
                "kind": "footerRule",
                "anchor": "bottomLeft",
                "color": "#dcdcdc",
                "height": 1
            }
        ],
        "interaction": {
            "tooltipFormat": "matchKey"
        },
        "layout": {
            "density": "normal",
            "targetWidth": 300,
            "titleBlock": {
                "anchor": "start"
            }
        }
    },
};
