// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ThemePreset } from '../types';
import { APPLE_ICON } from './icons';

/**
 * Apple.
 *
 * Translated from the Human Interface Guidelines for charts and the Swift
 * Charts defaults: iOS system colours, SF type, a trailing value axis, light
 * labels, symbols beside colour, and separators between contiguous fills.
 */
export const apple: ThemePreset = {
    id: 'apple',
    label: 'Apple',
    description:
        'Quiet app-interface chart: system colours, value axis on the trailing edge, light labels, symbols beside colour, rounded bars.',
    guidance: [
        '- Write a title and subtitle that state the main message; units belong there, not on the axes.',
        '- Keep category names short so the plot keeps its width.',
        '- Colour can tell 6 categories apart; series also differ by point shape.',
    ].join('\n'),
    icon: APPLE_ICON,
    spec: {
        id: 'apple',
        label: 'Apple',
        ink: {
            surface: { source: 'house', canvas: '#ffffff', plot: '#ffffff', panel: '#f2f2f7' },
            text: { primary: '#000000', secondary: '#8a8a8e', muted: '#aeaeb2', inverse: '#ffffff' },
            structure: {
                axis: '#8a8a8e',
                grid: '#d1d1d6',
                frame: '#e5e5ea',
                rule: '#c6c6c8',
                zero: '#8a8a8e',
                connector: '#aeaeb2',
            },
            series: {
                single: '#007aff',
                categorical: ['#007aff', '#34c759', '#ff9500', '#af52de', '#ff3b30', '#32ade6'],
                categoricalExtended: [
                    '#007aff',
                    '#34c759',
                    '#ff9500',
                    '#af52de',
                    '#ff3b30',
                    '#32ade6',
                    '#5856d6',
                    '#ff2d55',
                    '#00c7be',
                    '#a2845e',
                    '#30b0c7',
                    '#ffcc00',
                ],
                overflow: '#8e8e93',
                sequential: {
                    stops: ['#d6e9ff', '#7ab8ff', '#007aff', '#0055b3', '#003a7a'],
                    space: 'lab',
                    endpointsAgainstSurface: true,
                },
                diverging: {
                    stops: ['#0055b3', '#7ab8ff', '#f2f2f7', '#ff9f97', '#d70015'],
                    neutral: '#f2f2f7',
                    space: 'lab',
                    endpointsAgainstSurface: true,
                },
                status: { positive: '#34c759', negative: '#ff3b30', neutral: '#8e8e93' },
            },
            accent: '#007aff',
        },
        type: {
            minSize: 11,
            headline: {
                family: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif",
                size: 'text.300',
                weight: 'semibold',
            },
            deck: {
                family: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif",
                size: 'text.200',
                color: '#8a8a8e',
            },
            axisLabel: {
                family: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif",
                size: 'text.100',
            },
            axisTitle: {
                family: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif",
                size: 'text.100',
            },
            valueLabel: {
                family: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif",
                size: 'text.100',
                weight: 'medium',
            },
            keyLabel: {
                family: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif",
                size: 'text.100',
            },
            annotation: {
                family: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif",
                size: 'text.100',
            },
            footnote: {
                family: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif",
                size: 'text.100',
            },
            display: {
                family: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif",
                weight: 'semibold',
            },
        },
        structure: {
            axis: {
                categorical: { line: 'omit', ticks: 'omit', labelGap: 6 },
                measure: { line: 'omit', ticks: 'omit', labelGap: 6, placement: 'opposite', tickDensity: 'sparse' },
            },
            grid: { measure: 'quiet', category: 'omit', style: 'solid', weight: 0.5, zero: 'quiet' },
            frame: 'omit',
            baseline: 'quiet',
        },
        marks: {
            bandFraction: 0.6,
            strokeWeight: 2,
            strokeCap: 'round',
            strokeJoin: 'round',
            interpolation: 'linear',
            separator: { presence: 'full', width: 1.5, source: 'surface' },
            point: { presence: 'omit', size: 40, fill: 'solid' },
            connector: { presence: 'full', weight: 1.5 },
            redundantEncoding: 'always',
            redundantChannels: ['shape'],
        },
        geometry: {
            band: { cornerRadius: 4 },
            arc: { cornerRadius: 4, gap: 3, gapStyle: 'rule' },
            cell: { gap: 2, cornerRadius: 3 },
        },
        labels: { truncation: 'ellipsis', angle: 'horizontal' },
        legend: {
            show: 'always',
            placement: ['bottom'],
            direction: 'horizontal',
            title: 'omit',
            suppressWhenAxisNames: true,
        },
        dataLabels: { show: 'never' },
        annotation: {
            axisTitles: 'omit',
            unit: 'never',
            numberFormat: { precision: 'auto', thousands: 'separator' },
        },
        layout: {
            density: 'normal',
            bandStepFit: 1,
            titleBlock: { anchor: 'start', gap: 'normal', deckGap: 'tight' },
        },
        variants: [
            {
                when: { seriesCount: { gte: 2 } },
                then: { geometry: { point: { presence: 'full', size: 30 } } },
                because: 'colour is never the only cue: each series on a line carries its own symbol',
            },
        ],
        compileDefaults: {
            baseSize: { width: 400, height: 260 },
        },
    },
};
