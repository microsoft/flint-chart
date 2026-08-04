// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ThemePreset } from '../types';
import { CARTOON_ICON } from './icons';

/**
 * Cartoon — a playful, friendly house in the spirit of xkcd and modern
 * flat-cartoon illustration.
 *
 * Modelled on the hand-authored mockups in the Cartoon lab (see
 * `site/src/playground/cartoon-lab-data.ts`). Flint cannot draw the
 * hand-wobbled "last mile" of a true xkcd plot — that is a per-pixel filter on
 * the rendered SVG, not a chart decision — so the character is carried by the
 * parts a theme owns and by three levers that read as *fun*:
 *
 *   - a rounded comic typeface (Comic Sans / Comic Neue / Chalkboard fallbacks);
 *   - `marks.cornerRadius` — rounded bar tops and wedge corners (balloon/sticker
 *     shapes, not spreadsheet rectangles);
 *   - `marks.outline` — a fat dark border around every filled shape, including
 *     dots (the sticker edge that makes a mark look drawn, not printed);
 *
 * over a warm cream-paper canvas, a soft dashed grid, round-capped chunky
 * strokes, and a bright six-crayon palette.
 */
export const cartoon: ThemePreset = {
    id: 'cartoon',
    label: 'Cartoon',
    description:
        'A playful comic house: warm cream paper, a rounded comic typeface, fat dark "sticker" outlines around bright crayon-coloured bars, wedges and dots, rounded corners, chunky round-capped lines, and a soft dashed grid.',
    guidance: [
        '- `title` carries the naming in a bold rounded comic block; `subtitle` names the measure in a friendly aside.',
        '- Annotate the measure with `unit` in `semantic_types`.',
        '- Colour is a bright crayon set; the key tells 6 series apart.',
    ].join('\n'),
    icon: CARTOON_ICON,
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
                primary: '#2e2b28',
                secondary: '#8a837a',
                muted: '#b3aa9c',
            },
            structure: {
                grid: '#ece5d6',
                axis: '#2e2b28',
                rule: '#2e2b28',
                // The lollipop stem / dumbbell bridge in a soft pencil grey so
                // the emoji-ish chunky marks stay the loud part.
                connector: '#c9c1b2',
            },
            series: {
                // Sky blue reads as the friendly default single.
                single: '#3aa9ff',
                // Bright crayon: sky, coral, sunflower, grass, grape, tangerine.
                categorical: ['#3aa9ff', '#ff5d5d', '#ffc23c', '#4cc76a', '#9b6cff', '#ff8a3d'],
                categoricalExtended: [
                    '#3aa9ff',
                    '#ff5d5d',
                    '#ffc23c',
                    '#4cc76a',
                    '#9b6cff',
                    '#ff8a3d',
                    '#2ec4c4',
                    '#ff77b7',
                    '#7bd23a',
                    '#ffd84a',
                    '#6c8cff',
                    '#c96a2a',
                ],
                // Sequential: a warm cream-to-coral crayon ramp, binned so the
                // reader can name a bin, not read a wash.
                sequential: {
                    stops: ['#fff2cc', '#ffd98a', '#ffb14a', '#ff8a3d', '#ff5d5d'],
                    space: 'lab',
                    endpointsAgainstSurface: true,
                    consumption: 'quantize',
                    quantizeCount: 5,
                },
                // Diverging: sky to coral, through the warm paper neutral. The
                // warm end is the high end — a ramp that runs the other way
                // paints a hot July blue and a cold January red, and no reader
                // checks the key before believing that.
                diverging: {
                    stops: ['#3aa9ff', '#8fc9ff', '#f2ead8', '#ffb0a0', '#ff5d5d'],
                    neutral: '#f2ead8',
                    space: 'lab',
                    endpointsAgainstSurface: true,
                    consumption: 'quantize',
                    quantizeCount: 5,
                },
                // Signed data: grass up, coral down, a soft pencil grey total.
                status: {
                    positive: '#4cc76a',
                    negative: '#ff5d5d',
                    neutral: '#b3aa9c',
                },
                overflow: '#b3aa9c',
                selection: {
                    signed: 'status',
                    statusUse: 'anySigned',
                },
            },
            accent: '#ff5d5d',
        },
        type: {
            minSize: 9,
            // One rounded comic face carries every role: `bodyFamily` falls back
            // to the headline family, so axis and value labels inherit it.
            headline: {
                family: "'Comic Sans MS', 'Comic Neue', 'Chalkboard SE', 'Marker Felt', cursive",
                size: 'text.400',
                weight: 'bold',
            },
            deck: {
                size: 'text.200',
                color: '#8a837a',
            },
            axisLabel: {
                size: 'text.100',
            },
            axisTitle: {
                size: 'text.100',
                weight: 'bold',
                color: '#2e2b28',
            },
        },
        structure: {
            axis: {
                categorical: {
                    line: 'full',
                    lineWeight: 2.5,
                    ticks: 'omit',
                    labelGap: 7,
                },
                measure: {
                    line: 'full',
                    lineWeight: 2.5,
                    ticks: 'omit',
                    labelGap: 7,
                },
            },
            // A soft dashed grid the reader reads values off, only across the
            // value axis — the category side stays clean.
            grid: {
                measure: 'quiet',
                category: 'omit',
                style: 'dashed',
                weight: 1.5,
            },
            frame: 'omit',
            baseline: 'full',
        },
        marks: {
            // Chunky bars with a friendly gap between them.
            bandFraction: 0.62,
            // Fat round-capped, round-joined strokes and bouncy curves.
            strokeWeight: 5,
            strokeCap: 'round',
            strokeJoin: 'round',
            interpolation: 'monotone',
            // Rounded bar tops and wedge corners — the balloon/gumball tell.
            cornerRadius: 10,
            // The sticker edge: a fat dark outline around every filled shape.
            outline: { presence: 'full', weight: 2.5, source: 'ink' },
            point: {
                presence: 'full',
                fill: 'solid',
                size: 170,
                // The dark sticker edge is the identity here; a pale halo would
                // replace it because Vega-Lite gives a point only one stroke.
                halo: { presence: 'omit' },
            },
            // Wedges swing apart (keeping their dark ring) rather than being cut
            // by a rule that would paint over the outline.
            slice: {
                gap: 5,
                gapStyle: 'pad',
            },
            sizeRange: [120, 2600],
        },
        labels: {
            truncation: 'never',
            flush: true,
            angle: 'auto',
        },
        legend: {
            show: 'always',
            placement: ['top'],
            direction: 'horizontal',
            title: 'omit',
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
            targetWidth: 300,
            titleBlock: {
                anchor: 'start',
                gap: 'normal',
            },
        },
        compileDefaults: {
            baseSize: { width: 380, height: 320 },
        },
    },
};
