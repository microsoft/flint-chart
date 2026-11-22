// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Layout for native Excel charts.
 *
 * Flint's shared layout (`computeLayout`) decides the plot: how wide a band
 * is, how far a continuous axis stretches with its data, and how much a
 * canvas ceiling allows. Excel then draws its own furniture (axis labels,
 * titles, legend) around a plot area it places itself, so the chart object is
 * sized to Flint's plot plus an estimate of that furniture, measured in the
 * fonts this backend sets. Fonts follow the canvas: a small chart takes
 * smaller text so its plot is not crowded out.
 */

import type { ChannelSemantics, LayoutDeclaration } from '../core/types';
import { detectBandedAxisForceDiscrete, detectBandedAxisFromSemantics } from '../core/axis-detection';
import { planBandDodge, resolveDodge } from '../core/band-dodge';
import { excelTextWidth } from './date-axis';
import {
    EXCEL_AXIS_TITLE_FONT_SIZE,
    EXCEL_CHART_TITLE_FONT_SIZE,
    EXCEL_DATA_LABEL_FONT_SIZE,
    EXCEL_LABEL_FONT_SIZE,
    EXCEL_LEGEND_FONT_SIZE,
} from './typography';
import type { ExcelFontSizes } from './types';

/** The canvas the backend's default fonts are designed for. */
const DESIGN_SIZE = { width: 400, height: 300 };

/** Fonts for a chart drawn at `base`: the defaults, eased down on a smaller canvas. */
export function excelFontSizes(base: { width: number; height: number }): ExcelFontSizes {
    const ratio = Math.min(base.width / DESIGN_SIZE.width, base.height / DESIGN_SIZE.height, 1);
    const scale = Math.max(0.62, ratio);
    const size = (value: number, minimum: number) => Math.max(minimum, Math.round(value * scale * 2) / 2);
    return {
        title: size(EXCEL_CHART_TITLE_FONT_SIZE, 10),
        axisTitle: size(EXCEL_AXIS_TITLE_FONT_SIZE, 9),
        label: size(EXCEL_LABEL_FONT_SIZE, 8),
        legend: size(EXCEL_LEGEND_FONT_SIZE, 8),
        dataLabel: size(EXCEL_DATA_LABEL_FONT_SIZE, 8),
    };
}

/** The layout intent of a native Excel chart family (mirrors the shared templates). */
export function excelLayoutDeclaration(
    flintType: string,
    semantics: Record<string, ChannelSemantics>,
    table: any[],
    chartProperties: Record<string, any> | undefined,
): LayoutDeclaration {
    if (flintType === 'Bar Chart' || flintType === 'Stacked Bar Chart') {
        const detected = detectBandedAxisFromSemantics(semantics, table, { preferAxis: 'x' });
        return {
            axisFlags: detected ? { [detected.axis]: { banded: true } } : { x: { banded: true } },
            resolvedTypes: detected?.resolvedTypes,
            ...(flintType === 'Stacked Bar Chart'
                ? { paramOverrides: { continuousMarkCrossSection: { x: 20, y: 20, seriesCountAxis: 'auto' } } }
                : {}),
        };
    }
    if (flintType === 'Grouped Bar Chart') {
        const detected = detectBandedAxisForceDiscrete(semantics, table, { preferAxis: 'x' });
        const declaration: LayoutDeclaration = {
            axisFlags: detected ? { [detected.axis]: { banded: true } } : { x: { banded: true } },
            resolvedTypes: detected?.resolvedTypes,
            paramOverrides: { continuousMarkCrossSection: { x: 20, y: 20, seriesCountAxis: 'auto' } },
        };
        const groupField = semantics.group?.field ?? semantics.color?.field;
        const axisField = detected ? semantics[detected.axis]?.field : semantics.x?.field;
        if (groupField && axisField) {
            const plan = planBandDodge(table, axisField, groupField);
            if (resolveDodge(plan, chartProperties?.dodge).mode === 'local') {
                declaration.groupLaneCount = Math.max(1, plan.maxPerBand);
            }
        }
        return declaration;
    }
    if (flintType === 'Line Chart' || flintType === 'Area Chart') {
        return {
            paramOverrides: { continuousMarkCrossSection: { x: 100, y: 20, seriesCountAxis: 'auto' }, facetAspectRatioResistance: 0.5 },
        };
    }
    return {};
}

export interface ExcelFrameInput {
    plot: { width: number; height: number };
    fonts: ExcelFontSizes;
    title?: string;
    orientation: 'vertical' | 'horizontal';
    categoryTitle?: string;
    valueTitle?: string;
    /** Labels along the category (or x) axis. */
    categoryLabels: string[];
    /** Representative labels along the value (or y) axis. */
    valueLabels: string[];
    /** Whether category labels are spread across bands (bars) rather than ticks. */
    banded: boolean;
    legend?: { position: 'Bottom' | 'Right'; labels: string[] };
}

const widest = (labels: string[], fontSize: number) =>
    labels.reduce((maximum, label) => Math.max(maximum, excelTextWidth(label, fontSize)), 0);

/** Lines a title needs at `width`. */
function titleLines(title: string, fontSize: number, width: number): number {
    return Math.max(1, Math.min(3, Math.ceil(excelTextWidth(title, fontSize) / Math.max(80, width))));
}

/**
 * The chart object's size: Flint's plot plus Excel's furniture around it.
 */
export function excelChartSize(input: ExcelFrameInput): { width: number; height: number } {
    const { plot, fonts } = input;
    const pad = 10;
    const axisTitle = (text?: string) => (text ? fonts.axisTitle * 1.3 + 6 : 0);
    const lineHeight = fonts.label * 1.35;

    let left: number;
    let bottom: number;
    if (input.orientation === 'horizontal') {
        left = Math.min(widest(input.categoryLabels, fonts.label), plot.width * 0.6) + 8 + axisTitle(input.categoryTitle);
        bottom = lineHeight + 6 + axisTitle(input.valueTitle);
    } else {
        left = widest(input.valueLabels, fonts.label) + 8 + axisTitle(input.valueTitle);
        const count = Math.max(1, input.categoryLabels.length);
        const slot = input.banded ? plot.width / count : plot.width / Math.min(count, 8);
        const longest = widest(input.categoryLabels, fonts.label);
        // Excel wraps a band's name onto up to three lines, then turns the names.
        const wrapped = Math.ceil(longest / Math.max(1, slot - 4));
        const labelBlock = wrapped <= 1
            ? lineHeight
            : wrapped <= 3 && slot >= fonts.label * 4
                ? wrapped * lineHeight
                : Math.min(longest, plot.height * 0.45) * 0.75 + lineHeight * 0.5;
        bottom = labelBlock + 6 + axisTitle(input.categoryTitle);
    }

    let right = pad;
    let width = plot.width + left + pad + right;
    if (input.legend?.position === 'Right') {
        right += widest(input.legend.labels, fonts.legend) + fonts.legend * 2.4;
        width = plot.width + left + pad + right;
    }
    let legendHeight = 0;
    if (input.legend?.position === 'Bottom') {
        const entries = input.legend.labels.map((label) => excelTextWidth(label, fonts.legend) + fonts.legend * 2.6);
        let rows = 1;
        let run = 0;
        for (const entry of entries) {
            if (run > 0 && run + entry > width - 2 * pad) { rows += 1; run = 0; }
            run += entry;
        }
        legendHeight = rows * fonts.legend * 1.45 + 6;
    }
    const top = input.title
        ? titleLines(input.title, fonts.title, width - 2 * pad) * fonts.title * 1.3 + pad
        : pad;
    const height = plot.height + top + bottom + legendHeight + pad;
    return { width: Math.round(width), height: Math.round(height) };
}
