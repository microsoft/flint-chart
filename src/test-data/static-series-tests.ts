// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Static Series Gallery Examples
 *
 * Demonstrates the static series feature (array-valued encodings) across
 * multiple chart types and data scenarios. These examples use wide-format
 * data where multiple columns represent different measures.
 */

import type { ChartAssemblyInput } from '../core/types';

// ---------------------------------------------------------------------------
// Datasets (wide-format)
// ---------------------------------------------------------------------------

/** Monthly sales performance — two measure columns */
const MONTHLY_SALES_DATA = [
    { Month: '2024-01-01', Revenue: 125000, Expenses: 89000 },
    { Month: '2024-02-01', Revenue: 138000, Expenses: 92000 },
    { Month: '2024-03-01', Revenue: 155000, Expenses: 95000 },
    { Month: '2024-04-01', Revenue: 142000, Expenses: 88000 },
    { Month: '2024-05-01', Revenue: 168000, Expenses: 97000 },
    { Month: '2024-06-01', Revenue: 175000, Expenses: 101000 },
    { Month: '2024-07-01', Revenue: 162000, Expenses: 98000 },
    { Month: '2024-08-01', Revenue: 189000, Expenses: 105000 },
    { Month: '2024-09-01', Revenue: 195000, Expenses: 108000 },
    { Month: '2024-10-01', Revenue: 210000, Expenses: 112000 },
    { Month: '2024-11-01', Revenue: 225000, Expenses: 118000 },
    { Month: '2024-12-01', Revenue: 248000, Expenses: 125000 },
];

/** Quarterly KPIs — three measure columns */
const QUARTERLY_KPIS_DATA = [
    { Quarter: 'Q1 2023', NPS: 72, CSAT: 85, CES: 68 },
    { Quarter: 'Q2 2023', NPS: 75, CSAT: 87, CES: 71 },
    { Quarter: 'Q3 2023', NPS: 68, CSAT: 82, CES: 65 },
    { Quarter: 'Q4 2023', NPS: 79, CSAT: 89, CES: 74 },
    { Quarter: 'Q1 2024', NPS: 81, CSAT: 91, CES: 77 },
    { Quarter: 'Q2 2024', NPS: 84, CSAT: 90, CES: 79 },
    { Quarter: 'Q3 2024', NPS: 82, CSAT: 92, CES: 80 },
    { Quarter: 'Q4 2024', NPS: 88, CSAT: 94, CES: 83 },
];

/** Weather comparison — temperatures from multiple cities */
const WEATHER_DATA = [
    { Date: '2024-06-01', Seattle: 18, Portland: 20, SanFrancisco: 16, LosAngeles: 24 },
    { Date: '2024-06-15', Seattle: 21, Portland: 23, SanFrancisco: 17, LosAngeles: 26 },
    { Date: '2024-07-01', Seattle: 24, Portland: 27, SanFrancisco: 18, LosAngeles: 28 },
    { Date: '2024-07-15', Seattle: 27, Portland: 30, SanFrancisco: 19, LosAngeles: 30 },
    { Date: '2024-08-01', Seattle: 26, Portland: 29, SanFrancisco: 18, LosAngeles: 29 },
    { Date: '2024-08-15', Seattle: 25, Portland: 28, SanFrancisco: 18, LosAngeles: 28 },
    { Date: '2024-09-01', Seattle: 22, Portland: 25, SanFrancisco: 19, LosAngeles: 27 },
    { Date: '2024-09-15', Seattle: 19, Portland: 21, SanFrancisco: 18, LosAngeles: 25 },
];

/** Stock comparison — closing prices for tech companies */
const STOCK_DATA = [
    { Day: '2024-11-01', MSFT: 375, GOOG: 140, AMZN: 185 },
    { Day: '2024-11-04', MSFT: 378, GOOG: 142, AMZN: 188 },
    { Day: '2024-11-05', MSFT: 382, GOOG: 138, AMZN: 190 },
    { Day: '2024-11-06', MSFT: 380, GOOG: 141, AMZN: 187 },
    { Day: '2024-11-07', MSFT: 385, GOOG: 145, AMZN: 192 },
    { Day: '2024-11-08', MSFT: 390, GOOG: 148, AMZN: 195 },
    { Day: '2024-11-11', MSFT: 388, GOOG: 146, AMZN: 193 },
    { Day: '2024-11-12', MSFT: 392, GOOG: 150, AMZN: 198 },
    { Day: '2024-11-13', MSFT: 395, GOOG: 152, AMZN: 200 },
    { Day: '2024-11-14', MSFT: 398, GOOG: 149, AMZN: 197 },
    { Day: '2024-11-15', MSFT: 402, GOOG: 155, AMZN: 205 },
];

/** Annual metrics — area chart use case */
const ANNUAL_METRICS_DATA = [
    { Year: '2019', OnlineRevenue: 45000, InStoreRevenue: 120000, WholesaleRevenue: 78000 },
    { Year: '2020', OnlineRevenue: 85000, InStoreRevenue: 72000, WholesaleRevenue: 65000 },
    { Year: '2021', OnlineRevenue: 110000, InStoreRevenue: 95000, WholesaleRevenue: 82000 },
    { Year: '2022', OnlineRevenue: 135000, InStoreRevenue: 108000, WholesaleRevenue: 90000 },
    { Year: '2023', OnlineRevenue: 160000, InStoreRevenue: 115000, WholesaleRevenue: 95000 },
    { Year: '2024', OnlineRevenue: 190000, InStoreRevenue: 120000, WholesaleRevenue: 100000 },
];

// ---------------------------------------------------------------------------
// Gallery examples — each is a ready-to-use ChartAssemblyInput
// ---------------------------------------------------------------------------

/** Simple two-series line chart — Revenue vs Expenses */
export const STATIC_SERIES_LINE_BASIC: ChartAssemblyInput = {
    data: { values: MONTHLY_SALES_DATA },
    semantic_types: {
        Month: 'Date',
        Revenue: 'Quantity',
        Expenses: 'Quantity',
    },
    chart_spec: {
        chartType: 'Line Chart',
        encodings: {
            x: { field: 'Month' },
            y: [{ field: 'Revenue' }, { field: 'Expenses' }],
        },
        canvasSize: { width: 600, height: 380 },
    },
    field_display_names: {
        Revenue: 'Revenue ($)',
        Expenses: 'Expenses ($)',
    },
};

/** Three-metric KPI dashboard line chart */
export const STATIC_SERIES_LINE_THREE_KPIS: ChartAssemblyInput = {
    data: { values: QUARTERLY_KPIS_DATA },
    semantic_types: {
        Quarter: 'Category',
        NPS: 'Quantity',
        CSAT: 'Quantity',
        CES: 'Quantity',
    },
    chart_spec: {
        chartType: 'Line Chart',
        encodings: {
            x: { field: 'Quarter' },
            y: [{ field: 'NPS' }, { field: 'CSAT' }, { field: 'CES' }],
        },
        canvasSize: { width: 600, height: 380 },
    },
    field_display_names: {
        NPS: 'Net Promoter Score',
        CSAT: 'Customer Satisfaction',
        CES: 'Customer Effort Score',
    },
};

/** Four-city temperature comparison (many series) */
export const STATIC_SERIES_LINE_MANY_SERIES: ChartAssemblyInput = {
    data: { values: WEATHER_DATA },
    semantic_types: {
        Date: 'Date',
        Seattle: 'Quantity',
        Portland: 'Quantity',
        SanFrancisco: 'Quantity',
        LosAngeles: 'Quantity',
    },
    chart_spec: {
        chartType: 'Line Chart',
        encodings: {
            x: { field: 'Date' },
            y: [
                { field: 'Seattle' },
                { field: 'Portland' },
                { field: 'SanFrancisco' },
                { field: 'LosAngeles' },
            ],
        },
        canvasSize: { width: 650, height: 400 },
    },
    field_display_names: {
        SanFrancisco: 'San Francisco',
        LosAngeles: 'Los Angeles',
    },
};

/** Stock price comparison — dotted line variant */
export const STATIC_SERIES_DOTTED_LINE_STOCKS: ChartAssemblyInput = {
    data: { values: STOCK_DATA },
    semantic_types: {
        Day: 'Date',
        MSFT: 'Quantity',
        GOOG: 'Quantity',
        AMZN: 'Quantity',
    },
    chart_spec: {
        chartType: 'Dotted Line Chart',
        encodings: {
            x: { field: 'Day' },
            y: [{ field: 'MSFT' }, { field: 'GOOG' }, { field: 'AMZN' }],
        },
        canvasSize: { width: 600, height: 380 },
    },
    field_display_names: {
        MSFT: 'Microsoft',
        GOOG: 'Alphabet',
        AMZN: 'Amazon',
    },
};

/** Stacked area chart — revenue channels over time */
export const STATIC_SERIES_AREA_STACKED: ChartAssemblyInput = {
    data: { values: ANNUAL_METRICS_DATA },
    semantic_types: {
        Year: 'Year',
        OnlineRevenue: 'Quantity',
        InStoreRevenue: 'Quantity',
        WholesaleRevenue: 'Quantity',
    },
    chart_spec: {
        chartType: 'Area Chart',
        encodings: {
            x: { field: 'Year' },
            y: [
                { field: 'OnlineRevenue' },
                { field: 'InStoreRevenue' },
                { field: 'WholesaleRevenue' },
            ],
        },
        canvasSize: { width: 600, height: 380 },
    },
    field_display_names: {
        OnlineRevenue: 'Online',
        InStoreRevenue: 'In-Store',
        WholesaleRevenue: 'Wholesale',
    },
};

/** Scatter plot with static series — Revenue vs Expenses with labeled points */
export const STATIC_SERIES_SCATTER: ChartAssemblyInput = {
    data: { values: MONTHLY_SALES_DATA },
    semantic_types: {
        Month: 'Date',
        Revenue: 'Quantity',
        Expenses: 'Quantity',
    },
    chart_spec: {
        chartType: 'Scatter Plot',
        encodings: {
            x: { field: 'Month' },
            y: [{ field: 'Revenue' }, { field: 'Expenses' }],
        },
        canvasSize: { width: 600, height: 380 },
    },
};

// ---------------------------------------------------------------------------
// Collected gallery examples list
// ---------------------------------------------------------------------------

export const STATIC_SERIES_GALLERY_EXAMPLES = [
    { label: 'Revenue vs Expenses (Line)', input: STATIC_SERIES_LINE_BASIC },
    { label: 'KPI Dashboard (3 metrics)', input: STATIC_SERIES_LINE_THREE_KPIS },
    { label: 'City Temperatures (4 series)', input: STATIC_SERIES_LINE_MANY_SERIES },
    { label: 'Stock Comparison (Dotted Line)', input: STATIC_SERIES_DOTTED_LINE_STOCKS },
    { label: 'Revenue Channels (Stacked Area)', input: STATIC_SERIES_AREA_STACKED },
    { label: 'Measures as Scatter', input: STATIC_SERIES_SCATTER },
];
