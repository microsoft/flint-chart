// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ThemePreset } from '../types';

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
                "rule": "#c9d3da"
            },
            "series": {
                "single": "#006ba2",
                "categorical": [
                    "#3f5661",
                    "#a1655a",
                    "#006ba2",
                    "#7ba7b8",
                    "#3ebcd2",
                    "#c8b88a"
                ],
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
                    "consumption": "interpolate"
                },
                "status": {
                    "positive": "#006ba2",
                    "negative": "#e3120b",
                    "neutral": "#b8c4cc"
                },
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
                    "placement": "default"
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
                "kind": "mastheadTab",
                "anchor": "topLeft",
                "color": "#e3120b",
                "width": 26,
                "height": 3
            }
        ],
        "layout": {
            "density": "compact",
            "titleBlock": {
                "anchor": "start"
            }
        },
        "compileDefaults": {
            "baseSize": { "width": 460, "height": 300 }
        },
        "variants": [
            {
                "when": {
                    "markChannel": "length"
                },
                "then": {
                    "structure": {
                        "axis": {
                            "measure": {
                                "placement": "opposite"
                            }
                        }
                    }
                },
                "because": "Measured: big-mac, causes-death and state-jobless all carry the measure axis opposite (3 of 3 bar charts). On a banded chart the far edge is where a reader enters."
            },
            {
                "when": {
                    "isPartToWhole": true
                },
                "then": {
                    "structure": {
                        "axis": {
                            "measure": {
                                "placement": "opposite"
                            }
                        }
                    }
                },
                "because": "Measured: electricity-mix-area puts y on the right, seattle-range does not. Both are area marks, so markChannel cannot separate them; isPartToWhole can. On a pie the policy is inert."
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
