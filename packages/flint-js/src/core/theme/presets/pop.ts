// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ThemePreset } from '../types';
import { POP_ICON } from './icons';

/** A loud pop-art remix that demonstrates how little a derived house needs to say. */
export const pop: ThemePreset = {
    id: 'pop',
    label: 'Pop',
    description:
        'A pop-art remix of Swiss: electric process colours, heavy black structure, oversized marks, and punchy display type.',
    guidance: [
        '- Use a short title that can carry the poster-like display treatment.',
        '- Strong categorical or binned quantitative data makes best use of the 6-colour process key.',
        '- Keep annotations concise; the heavy structure and high-contrast marks already speak loudly.',
    ].join('\n'),
    icon: POP_ICON,
    spec: {
        extends: 'swiss',
        id: 'pop',
        label: 'Pop',
        ink: {
            surface: { source: 'house', canvas: '#fff200', plot: '#fff200' },
            text: { primary: '#111111', secondary: '#5f0047', muted: '#8c0068', inverse: '#fff200' },
            structure: { axis: '#111111', grid: '#111111', rule: '#111111', connector: '#111111' },
            series: {
                single: '#ff1493',
                categorical: ['#ff1493', '#00d9ff', '#ff5a1f', '#7a3cff', '#00c853', '#111111'],
                sequential: {
                    stops: ['#00d9ff', '#7a3cff', '#ff1493', '#ff5a1f', '#fff200'],
                    space: 'rgb',
                    endpointsAgainstSurface: true,
                    consumption: 'quantize',
                    quantizeCount: 5,
                },
                diverging: {
                    stops: ['#00d9ff', '#7a3cff', '#fff200', '#ff5a1f', '#ff1493'],
                    neutral: '#fff200',
                    space: 'rgb',
                    endpointsAgainstSurface: true,
                    consumption: 'quantize',
                    quantizeCount: 5,
                },
                status: { positive: '#00c853', negative: '#ff1493', neutral: '#111111' },
                overflow: '#111111',
            },
            accent: '#ff1493',
        },
        type: {
            minSize: 10,
            headline: {
                family: "'Arial Black', 'Helvetica Neue', Arial, sans-serif",
                size: 'text.500',
                weight: 'bold',
                case: 'upper',
            },
            deck: { size: 'text.200', weight: 'bold', color: '#5f0047' },
            axisLabel: { family: "'Arial Black', Arial, sans-serif", size: 'text.100' },
            axisTitle: { family: "'Arial Black', Arial, sans-serif", size: 'text.100', weight: 'bold' },
            valueLabel: { family: "'Arial Black', Arial, sans-serif", weight: 'bold' },
        },
        structure: {
            axis: {
                categorical: { line: 'emphasised', lineWeight: 3, ticks: 'omit' },
                measure: { line: 'emphasised', lineWeight: 3, ticks: 'full', tickLength: 'long' },
            },
            grid: { measure: 'quiet', category: 'hairline', style: 'solid', weight: 1, zero: 'emphasised' },
            baseline: 'emphasised',
        },
        marks: {
            bandFraction: 0.84,
            strokeWeight: 6,
            strokeCap: 'square',
            strokeJoin: 'miter',
            fillOpacity: 1,
            outline: { presence: 'emphasised', weight: 3, source: 'ink' },
            tile: { gap: 1, source: 'structure' },
            point: { presence: 'full', size: 180, fill: 'solid', halo: { presence: 'omit' } },
            separator: { presence: 'emphasised', width: 3, source: 'structure' },
        },
        dataLabels: { show: 'whenTheyFit', placement: 'atMark', inkMode: 'contrastWithMark' },
        layout: { density: 'normal', titleBlock: { anchor: 'start', gap: 'tight' } },
    },
};