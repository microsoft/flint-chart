// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ThemePreset } from '../types';
import { POWERBI_ICON } from './icons';

/**
 * Power BI.
 *
 * Measured from hand-authored redesigns, not invented — see the Theme Lab.
 */
export const powerbi: ThemePreset = {
    id: 'powerbi',
    label: "Power BI",
    description: "Dashboard tile: compact, legend to the right, the latest point emphasised.",
    guidance: [
        "- Leave `title` out where the tile sits under its own caption — the axis titles come back to name the measure.",
        "- Colour can tell 6 categories apart.",
    ].join('\n'),
    icon: POWERBI_ICON,
    spec: {
        "id": "powerbi",
        "label": "Power BI",
        "ink": {
            "surface": {
                "source": "house",
                "canvas": "#1b1a19",
                "plot": "#1b1a19",
                "panel": "#252423"
            },
            "text": {
                "primary": "#f3f2f1",
                "secondary": "#c8c6c4",
                "muted": "#a19f9d",
                "inverse": "#1b1a19"
            },
            "structure": {
                "grid": "#3b3a39",
                "axis": "#3b3a39",
                "rule": "#3b3a39",
                "connector": "#797775"
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
                // Continuous measure on a dark canvas: dim blue at the low end
                // (never the background) rising to bright azure, so "more"
                // reads as brighter — a light-to-dark ramp would sink the high
                // values into the near-black plot.
                "sequential": {
                    "stops": [
                        "#123049",
                        "#0f4c86",
                        "#1170c9",
                        "#3f9dff",
                        "#7bbcff",
                        "#c9e3ff"
                    ],
                    "space": "lab",
                    "endpointsAgainstSurface": true,
                    "consumption": "interpolate"
                },
                "diverging": {
                    "stops": [
                        "#118dff",
                        "#5aa9f0",
                        "#4a4948",
                        "#e08a4a",
                        "#d64550"
                    ],
                    "neutral": "#4a4948",
                    "space": "lab",
                    "endpointsAgainstSurface": true,
                    "consumption": "interpolate"
                },
                "status": {
                    "positive": "#22b14c",
                    "negative": "#e66c37",
                    "neutral": "#a19f9d"
                },
                "selection": {
                    "signed": "diverging",
                    "statusUse": "thresholdOnly",
                    "redundantWithFacet": "single"
                },
                "overflow": "#8a8886"
            },
            "accent": "#118dff"
        },
        "type": {
            "minSize": 8,
            "headline": {
                "family": "'Segoe UI', system-ui, sans-serif",
                "size": "text.200",
                "weight": "semibold",
                "color": "#f3f2f1"
            },
            "display": {
                "family": "'Segoe UI', system-ui, sans-serif",
                "size": "text.hero900",
                "weight": "semibold"
            },
            "axisLabel": {
                "family": "'Segoe UI', system-ui, sans-serif",
                "size": "text.100",
                "color": "#c8c6c4"
            },
            "keyLabel": {
                "size": "text.100",
                "color": "#c8c6c4"
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
            "point": {
                "size": 62
            },
            "separator": {
                "presence": "hairline",
                "source": "surface",
                "width": 1
            },
            "slice": {
                "gap": 1.5
            },
            "connector": {
                "presence": "full",
                "weight": 1.5,
                "spanWeight": 2
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
