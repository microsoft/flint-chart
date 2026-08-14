// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ThemePreset } from '../types';
import { SWISS_ICON } from './icons';

/**
 * Swiss / International Typographic Style.
 *
 * Modelled on the hand-authored mockups in the Swiss lab (see
 * `site/src/playground/swiss-lab-data.ts`), which were in turn measured against
 * the poster/diagram canon — swissted.com, Poster House "The Swiss Grid",
 * Müller-Brockmann's Tonhalle posters, Vignelli's 1972 NYC subway diagram, and
 * Otl Aicher's 1972 Munich colour system.
 *
 * What makes it a different design *language* rather than a palette reskin of
 * the editorial houses: the modular grid is drawn, not hidden (NYT hides it);
 * the axes are structural black rules; the headline is a bold flush-left
 * Helvetica block; and colour is a single saturated signal red against warm
 * paper, with flat primaries for extra categories. No gradients on the marks,
 * no rounded corners, no ornament.
 */
export const swiss: ThemePreset = {
    id: 'swiss',
    label: 'Swiss',
    description:
        'International Typographic Style: warm paper, a visible modular grid, black structural axes, a bold flush-left Helvetica headline over a rule, and a single signal-red accent.',
    guidance: [
        '- `title` carries the naming in a bold flush-left block; `subtitle` names the measure and period.',
        '- Annotate the measure with `unit` in `semantic_types`.',
        '- Colour is a single signal red; the categorical key tells 5 series apart.',
    ].join('\n'),
    icon: SWISS_ICON,
    spec: {
        id: 'swiss',
        label: 'Swiss',
        ink: {
            surface: {
                source: 'house',
                canvas: '#f4f1ea',
                plot: '#f4f1ea',
            },
            text: {
                primary: '#1a1a1a',
                secondary: '#555555',
                muted: '#8a8a8a',
            },
            structure: {
                grid: '#d9d5cc',
                axis: '#1a1a1a',
                rule: '#1a1a1a',
                connector: '#8a8a8a',
            },
            series: {
                single: '#e2231a',
                categorical: ['#e2231a', '#1a1a1a', '#0067a5', '#f2b705', '#2a7f4f'],
                categoricalExtended: [
                    '#e2231a',
                    '#1a1a1a',
                    '#0067a5',
                    '#f2b705',
                    '#2a7f4f',
                    '#e06d1f',
                    '#5b4b8a',
                    '#1f8a8a',
                    '#b5195f',
                    '#8a8a2a',
                    '#5a6b78',
                    '#8a5a2a',
                ],
                // Sequential: a single-hue red ramp, binned into steps — a scale
                // the reader can name a bin off, not a wash.
                sequential: {
                    stops: ['#fbe3df', '#f4a19a', '#eb6a5f', '#e2231a', '#9e120c'],
                    space: 'lab',
                    endpointsAgainstSurface: true,
                    consumption: 'quantize',
                    quantizeCount: 5,
                },
                // Diverging: cobalt to signal red, through the paper neutral.
                diverging: {
                    stops: ['#0067a5', '#7fb2d6', '#efeae0', '#ef9a90', '#e2231a'],
                    neutral: '#efeae0',
                    space: 'lab',
                    endpointsAgainstSurface: true,
                    consumption: 'quantize',
                    quantizeCount: 5,
                },
                // Signed data reads as the two Swiss primaries: cobalt up,
                // signal red down, a neutral grey for the anchoring total.
                status: {
                    positive: '#0067a5',
                    negative: '#e2231a',
                    neutral: '#9a9a9a',
                },
                overflow: '#9a9a9a',
                selection: {
                    signed: 'status',
                    statusUse: 'anySigned',
                },
            },
            accent: '#e2231a',
        },
        type: {
            minSize: 9,
            headline: {
                family: "'Helvetica Neue', Helvetica, Arial, sans-serif",
                size: 'text.400',
                weight: 'bold',
            },
            deck: {
                size: 'text.200',
                color: '#555555',
            },
            axisLabel: {
                size: 'text.100',
            },
            axisTitle: {
                size: 'text.100',
                weight: 'bold',
                color: '#1a1a1a',
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
                    ticks: 'full',
                    tickLength: 'short',
                    tickDirection: 'outward',
                },
            },
            grid: {
                measure: 'quiet',
                category: 'omit',
                style: 'solid',
                zero: 'full',
            },
            frame: 'omit',
            baseline: 'full',
        },
        marks: {
            bandFraction: 0.7,
            strokeWeight: 3,
            strokeCap: 'butt',
            strokeJoin: 'miter',
            interpolation: 'linear',
            point: {
                presence: 'omit',
                fill: 'solid',
                // Small and exact. The grid does the work of placing a
                // reading here, so the dot only has to mark the spot.
                size: 52,
            },
            separator: {
                presence: 'hairline',
                source: 'surface',
                width: 1.5,
            },
            slice: {
                gap: 2,
                gapStyle: 'rule',
            },
            sizeRange: [12, 400],
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
            bandStepFit: 0.5,
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
