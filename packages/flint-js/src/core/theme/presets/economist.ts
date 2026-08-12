// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ThemePreset } from '../types';
import { ECONOMIST_ICON } from './icons';

/**
 * The Economist.
 *
 * Measured from hand-authored redesigns, not invented — see the Theme Lab.
 */
export const economist: ThemePreset = {
    id: 'economist',
    label: "The Economist",
    description: "Print weekly: compact, flat headline over a deck that names the measure, units repeated down the ruler.",
    guidance: [
        "- `subtitle` names the measure, the place and the period — \"% of GDP, 2023\".",
        "- Annotate each measure with `unit` in `semantic_types`.",
        "- The key holds 3 colours.",
    ].join('\n'),
    icon: ECONOMIST_ICON,
    spec: {
        "id": "economist",
        "label": "The Economist",
        "ink": {
            "surface": {
                "source": "host"
            },
            "text": {
                "primary": "#121317",
                "secondary": "#54585a",
                "muted": "#8b9196"
            },
            "structure": {
                "grid": "#c9d3da",
                "axis": "#121317",
                "rule": "#c9d3da",
                "zero": "#121317"
            },
            "series": {
                "single": "#006ba2",
                "categorical": [
                    "#006ba2",
                    "#3ebcd2",
                    "#ebb434",
                    "#379a8b",
                    "#9a3d5b",
                    "#a17ba5"
                ],
                // Continuous measure: the Economist blue, light to deep.
                "sequential": {
                    "stops": [
                        "#dcebf2",
                        "#a7ccdd",
                        "#6ba7c6",
                        "#2f88ae",
                        "#006ba2",
                        "#003f5c"
                    ],
                    "space": "lab",
                    "endpointsAgainstSurface": true,
                    "consumption": "interpolate"
                },
                "diverging": {
                    "stops": [
                        "#006ba2",
                        "#7ba7b8",
                        "#e9e5dc",
                        "#c8967a",
                        "#a1655a"
                    ],
                    "neutral": "#e9e5dc",
                    "space": "lab",
                    "endpointsAgainstSurface": true,
                    "consumption": "quantize",
                    "quantizeCount": 5
                },
                "status": {
                    "positive": "#006ba2",
                    "negative": "#e3120b",
                    "neutral": "#b8c4cc"
                },
                "overflow": "#b0aca1",
                "selection": {
                    "signed": "status",
                    "statusUse": "anySigned"
                }
            },
            "accent": "#e3120b"
        },
        "type": {
            "minSize": 8,
            "headline": {
                "family": "'Helvetica Neue', Helvetica, Arial, sans-serif",
                "size": "text.300",
                "weight": "bold"
            },
            "deck": {
                "size": "text.200",
                "color": "#54585a"
            },
            "axisLabel": {
                "size": "text.100"
            }
        },
        "structure": {
            "axis": {
                "categorical": {
                    "line": "full",
                    "ticks": "omit"
                },
                "measure": {
                    "line": "omit",
                    "ticks": "omit",
                    "placement": "opposite"
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
            "bandFraction": 0.68,
            "strokeWeight": 1.6,
            "slice": {
                "gap": 1.5
            },
            "interval": {
                "fillOpacity": 0.22,
                "edge": "quiet",
                "inkSource": "sameAsCentral"
            },
            "point": {
                "size": 66
            },
            "sizeRange": [
                10,
                450
            ]
        },
        "labels": {
            "truncation": "never",
            "angle": "auto"
        },
        "legend": {
            "show": "always",
            "placement": [
                "seriesEnd",
                "top"
            ],
            "direction": "horizontal",
            "title": "omit",
            "maxSwatches": 3
        },
        "dataLabels": {
            "show": "whenTheyFit",
            "placement": "atMark"
        },
        "annotation": {
            "axisTitles": "omit",
            "unit": "everyTick"
        },
        "furniture": [
            {
                // The Economist "red tab" is a chunky rectangle, not a thin
                // rule: the style guide draws it ~15pt wide × 5pt tall (≈3:1)
                // on a 160pt chart — about 1/10 of the width. On this ~460px
                // plot that is ≈44px wide; a ~12px height keeps the 3–4:1 block
                // proportion so it reads as the masthead tag, not a hairline.
                "kind": "mastheadTab",
                "anchor": "topLeft",
                "color": "#e3120b",
                "width": 44,
                "height": 12
            }
        ],
        "layout": {
            "density": "compact",
            "bandStepFit": 0.55,
            "titleBlock": {
                "anchor": "start",
                "gap": "tight"
            }
        },
        "compileDefaults": {
            "baseSize": { "width": 460, "height": 300 }
        },
        "variants": [
            {
                "when": {
                    "markChannel": "area",
                    "isPartToWhole": false
                },
                "then": {
                    "structure": {
                        "axis": {
                            "measure": {
                                "placement": "default"
                            }
                        }
                    }
                },
                "because": "Right-hand measure axis is the house default (ggthemes theme_economist; measured opposite on 3/3 bar charts and the electricity-mix part-to-whole area). The one measured exception is a non-part-to-whole range/area band (seattle-range), which keeps y on the left."
            }
        ],
        "chartDefaults": {
            "Slope Chart": {
                "showText": true,
                "showSeriesInLabel": true
            }
        }
    },
};
