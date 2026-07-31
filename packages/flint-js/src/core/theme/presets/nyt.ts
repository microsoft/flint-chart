// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ThemePreset } from '../types';

/**
 * New York Times.
 *
 * Measured from hand-authored redesigns, not invented — see the Theme Lab.
 */
export const nyt: ThemePreset = {
    id: 'nyt',
    label: "New York Times",
    description: "Newsroom graphics: a headline that states the finding, values printed on the marks, series named at their own ends.",
    guidance: [
        "- `title` is the finding, in a sentence; `subtitle` names the measure, the population and the unit.",
        "- Colour can tell 5 categories apart; past that they share a grey.",
    ].join('\n'),
    spec: {
        "id": "nyt",
        "label": "New York Times",
        "ink": {
            "surface": {
                "source": "host"
            },
            "text": {
                "primary": "#121212",
                "secondary": "#6b6b6b",
                "muted": "#8a8a8a",
                "inverse": "#ffffff"
            },
            "structure": {
                "grid": "#e4e4e4",
                "axis": "#121212",
                "rule": "#121212"
            },
            "series": {
                "single": "#2f6b9a",
                "categorical": [
                    "#2f6b9a",
                    "#c2352b",
                    "#4a8b6f",
                    "#7f6a9e",
                    "#d9a441"
                ],
                "categoricalExtended": [
                    "#2f6b9a",
                    "#c2352b",
                    "#4a8b6f",
                    "#7f6a9e",
                    "#d9a441",
                    "#e27ea6",
                    "#3fae9e",
                    "#9ca13a",
                    "#8c6d31",
                    "#6b8fb3",
                    "#d07b3a",
                    "#b5546a"
                ],
                "diverging": {
                    "stops": [
                        "#2f6b9a",
                        "#8fb4cc",
                        "#efece5",
                        "#dd9a86",
                        "#c2352b"
                    ],
                    "neutral": "#efece5",
                    "space": "lab",
                    "endpointsAgainstSurface": true,
                    "consumption": "interpolate"
                },
                "overflow": "#9e9e9e",
                "status": {
                    "positive": "#2f6b9a",
                    "negative": "#c2352b",
                    "neutral": "#9e9e9e"
                },
                "selection": {
                    "signed": "status",
                    "statusUse": "anySigned"
                }
            },
            "accent": "#c2352b"
        },
        "type": {
            "minSize": 8,
            "headline": {
                "family": "Georgia, serif",
                "size": "text.400",
                "weight": "bold",
                "color": "#121212"
            },
            "deck": {
                "family": "Georgia, serif",
                "size": "text.200",
                "color": "#6b6b6b"
            },
            "axisLabel": {
                "family": "Helvetica, Arial, sans-serif",
                "size": "text.100"
            },
            "valueLabel": {
                "family": "Helvetica, Arial, sans-serif",
                "size": "text.100",
                "weight": "bold"
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
                    "ticks": "omit",
                    "tickDensity": "sparse",
                    "suppressWhenValuesPrinted": true
                }
            },
            "grid": {
                "measure": "quiet",
                "category": "omit",
                "style": "solid",
                "zero": "full"
            },
            "frame": "omit",
            "baseline": "full"
        },
        "marks": {
            "bandFraction": 0.72,
            "strokeWeight": 2.4,
            "strokeCap": "round",
            "strokeJoin": "round",
            "slice": {
                "gap": 1.5
            },
            "tile": {
                "gap": 1
            },
            "zOrder": "summaryOverData",
            "redundantEncoding": "whenNeeded",
            "redundantChannels": [
                "dash"
            ]
        },
        "labels": {
            "truncation": "never",
            "flush": true
        },
        "legend": {
            "show": "always",
            "placement": [
                "seriesEnd",
                "top"
            ],
            "title": "omit",
            "suppressWhenValuesPrinted": false
        },
        "dataLabels": {
            "show": "always",
            "placement": "atMark",
            "inkMode": "contrastWithMark"
        },
        "annotation": {
            "axisTitles": "omit",
            "axisTitlePlacement": "flatAboveAxis",
            "unit": "lastTick",
            "pointEmphasis": "endpoints",
            "numberFormat": {
                "precision": "auto",
                "thousands": "suffix"
            }
        },
        "layout": {
            "density": "normal",
            "titleBlock": {
                "anchor": "start",
                "deckGap": "tight"
            }
        },
        "compileDefaults": {
            "baseSize": { "width": 380, "height": 340 }
        },
        "chartDefaults": {
            "Line Chart": {
                "showPoints": true
            },
            "Bump Chart": {
                "interpolate": "linear"
            }
        }
    },
};
