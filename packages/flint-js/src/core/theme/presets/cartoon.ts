// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ThemePreset } from '../types';

/**
 * Cartoon.
 *
 * A playful, colourful house in the spirit of xkcd and modern flat-cartoon
 * illustration. Flint cannot draw the hand-wobbled "last mile" of a true xkcd
 * plot — the jitter is a per-pixel filter, not a chart decision — so the fun
 * is carried by the parts a theme *does* own: a rounded comic typeface, fat
 * round-capped strokes, rounded bar tops, bouncy monotone curves, and a bright
 * crayon palette on warm sketch-paper. The result reads as friendly and
 * approachable rather than clinical — a fresh, engaging variant beside the
 * editorial and dashboard houses.
 */
export const cartoon: ThemePreset = {
    id: 'cartoon',
    label: 'Cartoon',
    description:
        'Playful flat-cartoon look: warm sketch-paper, a rounded comic typeface, fat round-capped strokes, rounded bar tops and bouncy curves, in a bright crayon palette.',
    guidance: [
        '- `title` sets the scene in the big comic hand; `subtitle` names the measure.',
        '- Keep it light — a cartoon chart is for one clear point, not a dense table.',
        '- Colour tells 6 categories apart with a bright crayon set.',
    ].join('\n'),
    spec: {
        id: 'cartoon',
        label: 'Cartoon',
        ink: {
            surface: {
                source: 'house',
                canvas: '#fffdf5',
                plot: '#fffdf5',
            },
            text: {
                primary: '#3a352f',
                secondary: '#6b655c',
                muted: '#9a9488',
            },
            structure: {
                grid: '#e9e3d6',
                axis: '#3a352f',
                rule: '#3a352f',
                connector: '#9a9488',
            },
            series: {
                single: '#ff5d5d',
                categorical: ['#2f9ee6', '#ff5d5d', '#ffc23c', '#4cc76a', '#9b6cff', '#ff8a3d'],
                categoricalExtended: [
                    '#2f9ee6',
                    '#ff5d5d',
                    '#ffc23c',
                    '#4cc76a',
                    '#9b6cff',
                    '#ff8a3d',
                    '#26c6b8',
                    '#ff6fb5',
                    '#a8d84a',
                    '#5b6cff',
                    '#b5794e',
                    '#d94fc9',
                ],
                // A single-hue sky-blue ramp, binned so a reader can name a bin
                // off the key rather than squint at a wash.
                sequential: {
                    stops: ['#e4f3fc', '#a7d8f5', '#5cb7ee', '#2f9ee6', '#1668a8'],
                    space: 'lab',
                    endpointsAgainstSurface: true,
                    consumption: 'quantize',
                    quantizeCount: 5,
                },
                // Coral to sky-blue through the warm paper neutral.
                diverging: {
                    stops: ['#ff5d5d', '#ffb0a3', '#efe9dc', '#9ecbef', '#2f9ee6'],
                    neutral: '#efe9dc',
                    space: 'lab',
                    endpointsAgainstSurface: true,
                    consumption: 'quantize',
                    quantizeCount: 5,
                },
                // Signed data reads as thumbs-up green and uh-oh coral, with a
                // soft grey for the anchoring total.
                status: {
                    positive: '#4cc76a',
                    negative: '#ff5d5d',
                    neutral: '#b7b2a6',
                },
                overflow: '#b7b2a6',
                selection: {
                    signed: 'status',
                    statusUse: 'anySigned',
                },
            },
            accent: '#ff5d5d',
        },
        type: {
            minSize: 9,
            headline: {
                family: "'Comic Sans MS', 'Comic Neue', 'Chalkboard SE', 'Marker Felt', cursive",
                size: 'text.400',
                weight: 'bold',
                color: '#3a352f',
            },
            deck: {
                family: "'Comic Sans MS', 'Comic Neue', 'Chalkboard SE', 'Marker Felt', cursive",
                size: 'text.200',
                color: '#6b655c',
            },
            axisLabel: {
                family: "'Comic Sans MS', 'Comic Neue', 'Chalkboard SE', 'Marker Felt', cursive",
                size: 'text.100',
            },
            axisTitle: {
                family: "'Comic Sans MS', 'Comic Neue', 'Chalkboard SE', 'Marker Felt', cursive",
                size: 'text.100',
                weight: 'bold',
                color: '#3a352f',
            },
            keyLabel: {
                family: "'Comic Sans MS', 'Comic Neue', 'Chalkboard SE', 'Marker Felt', cursive",
                size: 'text.100',
            },
        },
        structure: {
            axis: {
                categorical: {
                    line: 'full',
                    ticks: 'omit',
                },
                measure: {
                    line: 'full',
                    ticks: 'omit',
                    tickLabels: 'sparse',
                },
            },
            grid: {
                measure: 'quiet',
                category: 'omit',
                style: 'dashed',
                zero: 'full',
            },
            frame: 'omit',
            baseline: 'full',
        },
        marks: {
            bandFraction: 0.66,
            strokeWeight: 3.5,
            strokeCap: 'round',
            strokeJoin: 'round',
            interpolation: 'monotone',
            cornerRadius: 6,
            point: {
                presence: 'full',
                fill: 'solid',
                size: 60,
            },
            separator: {
                presence: 'hairline',
                source: 'surface',
                width: 2,
            },
            slice: {
                gap: 3,
                gapStyle: 'rule',
            },
            sizeRange: [24, 500],
        },
        labels: {
            truncation: 'never',
            angle: 'auto',
        },
        legend: {
            show: 'always',
            placement: ['top', 'right'],
            direction: 'horizontal',
            title: 'whenAmbiguous',
            suppressWhenAxisNames: true,
        },
        dataLabels: {
            show: 'whenTheyFit',
            placement: 'outsideMark',
            inkMode: 'fixed',
        },
        annotation: {
            axisTitles: 'whenAmbiguous',
            unit: 'lastTick',
            numberFormat: {
                precision: 'auto',
            },
        },
        layout: {
            density: 'normal',
            titleBlock: {
                anchor: 'start',
                gap: 'normal',
            },
        },
        compileDefaults: {
            baseSize: { width: 420, height: 320 },
        },
    },
};
