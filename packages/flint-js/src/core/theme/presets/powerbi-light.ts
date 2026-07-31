// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ThemePreset } from '../types';

/**
 * Power BI — light.
 *
 * The default polished Power BI report look: a white tile, Segoe UI, the
 * standard #118dff-led data palette, hairline light-grey gridlines, legend to
 * the right, the latest point emphasised. The dark `powerbi` house flipped to
 * a light surface — same furniture, same proportions, different ink — so a
 * reader recognises the same product in either mode.
 */
export const powerbiLight: ThemePreset = {
    id: 'powerbi-light',
    label: "Power BI (light)",
    description: "Light dashboard tile: white canvas, Segoe UI, hairline grid, legend to the right.",
    guidance: [
        "- Leave `title` out where the tile sits under its own caption — the axis titles come back to name the measure.",
        "- Colour can tell 6 categories apart.",
    ].join('\n'),
    spec: {
        "id": "powerbi-light",
        "label": "Power BI (light)",
        "ink": {
            "surface": {
                "source": "house",
                "canvas": "#ffffff",
                "plot": "#ffffff",
                "panel": "#faf9f8"
            },
            "text": {
                "primary": "#252423",
                "secondary": "#605e5c",
                "muted": "#a19f9d",
                "inverse": "#ffffff"
            },
            "structure": {
                "grid": "#ededed",
                "axis": "#d2d0ce",
                "rule": "#d2d0ce"
            },
            "series": {
                "single": "#118dff",
                "categorical": [
                    "#118dff",
                    "#12239e",
                    "#e66c37",
                    "#6b007b",
                    "#e044a7",
                    "#744ec2"
                ],
                "categoricalExtended": [
                    "#118dff",
                    "#12239e",
                    "#e66c37",
                    "#6b007b",
                    "#e044a7",
                    "#744ec2",
                    "#d9b300",
                    "#d64550",
                    "#197278",
                    "#5c2e91",
                    "#ff9d3b",
                    "#4a9c2d"
                ],
                "diverging": {
                    "stops": [
                        "#118dff",
                        "#7bb8f5",
                        "#e1dfdd",
                        "#e59866",
                        "#d64550"
                    ],
                    "neutral": "#e1dfdd",
                    "space": "lab",
                    "endpointsAgainstSurface": true,
                    "consumption": "interpolate"
                },
                "status": {
                    "positive": "#107c10",
                    "negative": "#d13438",
                    "neutral": "#a19f9d"
                },
                "selection": {
                    "signed": "diverging",
                    "statusUse": "thresholdOnly",
                    "redundantWithFacet": "single"
                },
                "overflow": "#bcbcbc"
            },
            "accent": "#118dff"
        },
        "type": {
            "minSize": 8,
            "headline": {
                "family": "'Segoe UI', system-ui, sans-serif",
                "size": "text.200",
                "weight": "semibold",
                "color": "#252423"
            },
            "display": {
                "family": "'Segoe UI', system-ui, sans-serif",
                "size": "text.hero900",
                "weight": "semibold"
            },
            "axisLabel": {
                "family": "'Segoe UI', system-ui, sans-serif",
                "size": "text.100",
                "color": "#605e5c"
            },
            "keyLabel": {
                "size": "text.100",
                "color": "#605e5c"
            }
        },
        "structure": {
            "axis": {
                "categorical": {
                    "line": "omit",
                    "ticks": "omit",
                    "tickLabels": "sparse"
                },
                "measure": {
                    "line": "omit",
                    "ticks": "omit",
                    "tickDensity": "sparse"
                }
            },
            "grid": {
                "measure": "quiet",
                "category": "omit",
                "style": "solid"
            },
            "frame": "omit",
            "baseline": "quiet"
        },
        "marks": {
            "strokeWeight": 2.2,
            "strokeCap": "square",
            "minSize": 1.5,
            "separator": {
                "presence": "hairline",
                "source": "surface",
                "width": 1
            },
            "slice": {
                "gap": 1.5
            },
            "trailingFill": {
                "presence": "quiet",
                "opacity": 0.18
            },
            "reference": {
                "presence": "full",
                "style": "tick",
                "label": true,
                "weight": 2
            }
        },
        "labels": {
            "truncation": "never"
        },
        "legend": {
            "show": "always",
            "placement": [
                "right",
                "bottom"
            ],
            "title": "omit",
            "gradientLength": 90,
            "suppressWhenValuesPrinted": false
        },
        "dataLabels": {
            "show": "whenTheyFit",
            "placement": "atMark",
            "inkMode": "contrastWithMark"
        },
        "annotation": {
            "axisTitles": "omit",
            "unit": "everyTick",
            "pointEmphasis": "latest",
            "numberFormat": {
                "precision": "auto"
            }
        },
        "facets": {
            "header": {
                "presence": "full",
                "style": "flushLabel",
                "fieldTitle": "omit"
            },
            "panelFrame": "omit",
            "axisRepetition": "edgeOnly",
            "preferredColumns": 4,
            "sharedScale": "whenComparable"
        },
        "layout": {
            "density": "compact",
            "titleBlock": {
                "anchor": "start",
                "gap": "tight",
                "deckGap": "tight"
            }
        },
        "compileDefaults": {
            "baseSize": { "width": 480, "height": 280 }
        }
    },
};
