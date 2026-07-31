// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ThemePreset } from '../types';

/**
 * Nature.
 *
 * Measured from hand-authored redesigns, not invented — see the Theme Lab.
 */
export const nature: ThemePreset = {
    id: 'nature',
    label: "Nature",
    description: "Journal figure: small panel, axis titles kept with units, statistics printed beside the fit.",
    guidance: [
        "- Annotate every measure with `unit` in `semantic_types`; `subtitle` names the sample, not the unit.",
        "- Colour can tell 6 categories apart; past that they share a grey.",
    ].join('\n'),
    spec: {
        "id": "nature",
        "label": "Nature",
        "ink": {
            "surface": {
                "source": "host"
            },
            "text": {
                "primary": "#000000",
                "secondary": "#000000"
            },
            "structure": {
                "axis": "#000000",
                "grid": "#00000000",
                "frame": "#000000"
            },
            "series": {
                "single": "#0072b2",
                "categorical": [
                    "#0072b2",
                    "#e69f00",
                    "#009e73",
                    "#cc79a7",
                    "#56b4e9",
                    "#d55e00"
                ],
                "diverging": {
                    "stops": [
                        "#0072b2",
                        "#83b9db",
                        "#ffffff",
                        "#eba06a",
                        "#d55e00"
                    ],
                    "neutral": "#ffffff",
                    "space": "lab",
                    "endpointsAgainstSurface": false,
                    "consumption": "interpolate"
                },
                "overflow": "#999999",
                "selection": {
                    "partToWhole": "categorical"
                }
            },
            "accent": "#000000"
        },
        "type": {
            "minSize": 8.5,
            "headline": {
                "family": "Arial, Helvetica, sans-serif",
                "size": "text.200",
                "weight": "bold"
            },
            "deck": {
                "size": "text.100",
                "style": "italic",
                "case": "asIs"
            },
            "axisLabel": {
                "family": "Arial, Helvetica, sans-serif",
                "size": "text.100"
            },
            "axisTitle": {
                "family": "Arial, Helvetica, sans-serif",
                "size": "text.100"
            }
        },
        "structure": {
            "axis": {
                "categorical": {
                    "line": "full",
                    "ticks": "full",
                    "tickLength": "long",
                    "tickDirection": "outward"
                },
                "measure": {
                    "line": "full",
                    "ticks": "full",
                    "tickLength": "long",
                    "tickDirection": "outward"
                }
            },
            "grid": {
                "measure": "omit",
                "category": "omit"
            },
            "frame": "omit",
            "baseline": "quiet"
        },
        "marks": {
            "bandFraction": 0.55,
            "strokeWeight": 1.2,
            "separator": {
                "presence": "hairline",
                "source": "surface",
                "width": 0.5
            },
            "slice": {
                "gap": 1.5
            },
            "point": {
                "presence": "full",
                "size": 45,
                "fill": "solid",
                "halo": {
                    "presence": "hairline",
                    "width": 0.6
                }
            },
            "interval": {
                "fillOpacity": 0.25,
                "edge": "omit",
                "inkSource": "sameAsCentral"
            },
            "summary": {
                "fill": "omit",
                "outline": "full",
                "centralRule": "emphasised",
                "widthFraction": 0.4
            },
            "observations": {
                "expose": "always",
                "maxRows": 400
            },
            "zOrder": "summaryUnderData",
            "redundantEncoding": "always",
            "redundantChannels": [
                "shape"
            ]
        },
        "labels": {
            "truncation": "never"
        },
        "legend": {
            "show": "always",
            "placement": [
                "right",
                "inside"
            ],
            "title": "whenAmbiguous",
            "suppressWhenAxisNames": true
        },
        "dataLabels": {
            "show": "whenTheyFit",
            "placement": "outsideMark"
        },
        "annotation": {
            "axisTitles": "always",
            "axisTitlePlacement": "rotated",
            "unitsInAxisTitle": true,
            "statistics": {
                "show": [
                    "n",
                    "r2",
                    "slope"
                ],
                "placement": "panel"
            }
        },
        "layout": {
            "density": "compact",
            "targetWidth": 252,
            "titleBlock": {
                "anchor": "start",
                "gap": "tight",
                "deckGap": "tight"
            },
            "bandStep": 46
        },
        "compileDefaults": {
            "baseSize": { "width": 300, "height": 250 }
        },
        "chartDefaults": {
            "Boxplot": {
                "showPoints": true
            },
            "Violin Plot": {
                "showPoints": true,
                "showMedian": true,
                "showContour": true
            }
        }
    },
};
