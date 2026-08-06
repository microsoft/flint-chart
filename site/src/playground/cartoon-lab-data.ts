// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Cartoon lab — hand-authored Vega-Lite mockups of a playful, colourful
 * "cartoon" look, in the spirit of xkcd / modern flat illustration.
 *
 * These are NOT theme-pipeline output. They are manual reference specs for the
 * shipped `cartoon` ThemeSpec preset. A first pipeline attempt (font + palette
 * + rounded bars) felt flat, so this lab established the reusable levers the
 * preset now owns AND a few it still intentionally does not: thick dark
 * "sticker" outlines on rounded marks and dots, wobble-free but chunky strokes,
 * emoji markers, and a warm paper canvas with a bright crayon palette.
 *
 * The design tokens the preset is checked against:
 *   - Type:      a rounded comic face (Comic Sans / Comic Neue / Chalkboard).
 *   - Palette:   bright crayon — sky, coral, sunflower, grass, grape, tangerine.
 *   - Furniture: warm cream paper, dashed soft grid, round-capped axes.
 *   - Marks:     fat dark outlines + rounded corners (the "sticker" look), big
 *                dots with a white halo, thick round-cap lines.
 *   - Mood:      friendly, approachable, one clear point per chart.
 *
 * Refs: xkcd.com · "Humor Sans" / xkcd Script · Comic Neue · modern flat-cartoon
 * infographics (rounded bars, thick outlines, sticker shapes).
 */

// The case shape is shared with the other style references.
import type { StyleReferenceCase } from './style-references';

const FONT = "'Comic Sans MS', 'Comic Neue', 'Chalkboard SE', 'Marker Felt', cursive";
const PAPER = '#fffdf5';
const INK = '#2e2b28';
const OUTLINE = '#2e2b28';

/** Bright crayon set: sky, coral, sunflower, grass, grape, tangerine. */
export const CARTOON_PALETTE = ['#3aa9ff', '#ff5d5d', '#ffc23c', '#4cc76a', '#9b6cff', '#ff8a3d'];

/** Shared "system" so the type, grid and axes stay consistent across charts. */
const cartoonConfig: any = {
    background: PAPER,
    font: FONT,
    padding: { left: 18, top: 16, right: 18, bottom: 16 },
    title: {
        anchor: 'start',
        font: FONT,
        fontSize: 19,
        fontWeight: 'bold',
        color: INK,
        subtitleFont: FONT,
        subtitleFontSize: 12.5,
        subtitleColor: '#8a837a',
        subtitlePadding: 6,
        offset: 12,
    },
    view: { stroke: null },
    axis: {
        domain: true,
        domainColor: INK,
        domainWidth: 2.5,
        domainCap: 'round',
        grid: true,
        gridColor: '#ece5d6',
        gridDash: [3, 5],
        gridWidth: 1.5,
        ticks: false,
        labelFont: FONT,
        labelFontSize: 12,
        labelColor: INK,
        labelPadding: 7,
        titleFont: FONT,
        titleFontSize: 12.5,
        titleFontWeight: 'bold',
        titleColor: INK,
    },
    legend: {
        orient: 'top',
        direction: 'horizontal',
        titleFont: FONT,
        titleColor: INK,
        titleFontSize: 12,
        titleFontWeight: 'bold',
        labelFont: FONT,
        labelFontSize: 12,
        labelColor: INK,
        symbolType: 'circle',
        symbolSize: 130,
        symbolStrokeColor: OUTLINE,
        symbolStrokeWidth: 1.5,
        offset: 8,
        padding: 0,
    },
};

const W = 360;
const H = 300;

export const CARTOON_CASES: StyleReferenceCase[] = [
    // ── 1. Sticker bars — rounded tops + fat dark outline = the cartoon tell. ──
    {
        id: 'cartoon-sticker-bars',
        title: 'Sticker bars',
        note: 'Rounded tops + a fat dark outline give bars a sticker / balloon feel. Bright fills, bold value labels.',
        spec: {
            width: W,
            height: H,
            background: PAPER,
            title: { text: 'Favourite ice cream 🍦', subtitle: 'Votes in Ms. Rivera’s class' },
            data: {
                values: [
                    { flavour: 'Choc', votes: 12, c: '#8a5a2a' },
                    { flavour: 'Vanilla', votes: 9, c: '#ffc23c' },
                    { flavour: 'Strawberry', votes: 15, c: '#ff5d5d' },
                    { flavour: 'Mint', votes: 7, c: '#4cc76a' },
                    { flavour: 'Berry', votes: 11, c: '#9b6cff' },
                ],
            },
            layer: [
                {
                    mark: {
                        type: 'bar',
                        cornerRadiusEnd: 14,
                        stroke: OUTLINE,
                        strokeWidth: 2.5,
                    },
                    encoding: {
                        color: { field: 'c', type: 'nominal', scale: null, legend: null },
                    },
                },
                {
                    mark: { type: 'text', dy: -10, font: FONT, fontSize: 14, fontWeight: 'bold', color: INK },
                    encoding: { text: { field: 'votes', type: 'quantitative' } },
                },
            ],
            encoding: {
                x: {
                    field: 'flavour',
                    type: 'nominal',
                    sort: null,
                    axis: { labelAngle: 0, grid: false, title: null },
                    scale: { paddingInner: 0.35, paddingOuter: 0.2 },
                },
                y: {
                    field: 'votes',
                    type: 'quantitative',
                    axis: { title: null, tickCount: 4, grid: true },
                    scale: { domain: [0, 18] },
                },
            },
            config: cartoonConfig,
        },
    },

    // ── 2. Bouncy line — thick round-cap monotone line, big haloed dots. ──
    {
        id: 'cartoon-bouncy-line',
        title: 'Bouncy line',
        note: 'Fat round-capped smoothed line with big white-haloed dots — reads like a friendly path, not a data trace.',
        spec: {
            width: W,
            height: H,
            background: PAPER,
            title: { text: 'My mood this week 😄', subtitle: 'How fun each day felt (0–10)' },
            data: {
                values: [
                    { day: 'Mon', mood: 4 },
                    { day: 'Tue', mood: 6 },
                    { day: 'Wed', mood: 3 },
                    { day: 'Thu', mood: 7 },
                    { day: 'Fri', mood: 9 },
                    { day: 'Sat', mood: 10 },
                    { day: 'Sun', mood: 8 },
                ],
            },
            encoding: {
                x: { field: 'day', type: 'nominal', sort: null, axis: { labelAngle: 0, grid: false, title: null } },
                y: {
                    field: 'mood',
                    type: 'quantitative',
                    axis: { title: null, tickCount: 5 },
                    scale: { domain: [0, 11] },
                },
            },
            layer: [
                {
                    mark: {
                        type: 'line',
                        color: '#3aa9ff',
                        strokeWidth: 6,
                        strokeCap: 'round',
                        strokeJoin: 'round',
                        interpolate: 'monotone',
                    },
                },
                {
                    mark: {
                        type: 'point',
                        filled: true,
                        color: '#3aa9ff',
                        size: 260,
                        stroke: '#ffffff',
                        strokeWidth: 4,
                    },
                },
                {
                    mark: {
                        type: 'point',
                        filled: false,
                        stroke: OUTLINE,
                        strokeWidth: 2,
                        size: 260,
                    },
                },
            ],
            config: cartoonConfig,
        },
    },

    // ── 3. Bubble buddies — outlined circles, size = the reading, playful. ──
    {
        id: 'cartoon-bubbles',
        title: 'Bubble buddies',
        note: 'Big outlined bubbles, size carries the value, white halo pops them off the paper. Colour just for fun.',
        spec: {
            width: W,
            height: H,
            background: PAPER,
            title: { text: 'Pets in our street 🐾', subtitle: 'How many of each (bubble = count)' },
            data: {
                values: [
                    { pet: 'Dogs', x: 1, y: 3, n: 14, c: '#ff8a3d' },
                    { pet: 'Cats', x: 2, y: 2, n: 11, c: '#9b6cff' },
                    { pet: 'Fish', x: 3, y: 3.2, n: 20, c: '#3aa9ff' },
                    { pet: 'Birds', x: 4, y: 1.8, n: 6, c: '#4cc76a' },
                    { pet: 'Bunnies', x: 5, y: 2.6, n: 8, c: '#ff5d5d' },
                ],
            },
            layer: [
                {
                    mark: { type: 'circle', stroke: OUTLINE, strokeWidth: 2.5, opacity: 1 },
                    encoding: {
                        size: {
                            field: 'n',
                            type: 'quantitative',
                            scale: { range: [400, 4200] },
                            legend: null,
                        },
                        color: { field: 'c', type: 'nominal', scale: null, legend: null },
                    },
                },
                {
                    mark: { type: 'text', font: FONT, fontSize: 12, fontWeight: 'bold', color: INK, dy: 0 },
                    encoding: { text: { field: 'pet' } },
                },
            ],
            encoding: {
                x: { field: 'x', type: 'quantitative', axis: null, scale: { domain: [0.3, 5.7] } },
                y: { field: 'y', type: 'quantitative', axis: null, scale: { domain: [0.8, 4] } },
            },
            config: cartoonConfig,
        },
    },

    // ── 4. Gumball pie — bright wedges, fat white gaps, thick outline ring. ──
    {
        id: 'cartoon-gumball-pie',
        title: 'Gumball pie',
        note: 'Bright wedges cut apart by fat white gaps and wrapped in a dark outline — a gumball look, not a spreadsheet pie.',
        spec: {
            width: W,
            height: H,
            background: PAPER,
            title: { text: 'Where my day goes ⏰', subtitle: 'Hours, roughly' },
            data: {
                values: [
                    { thing: 'Sleep', hrs: 9 },
                    { thing: 'School', hrs: 6 },
                    { thing: 'Play', hrs: 4 },
                    { thing: 'Food', hrs: 2 },
                    { thing: 'Screens', hrs: 3 },
                ],
            },
            mark: {
                type: 'arc',
                stroke: OUTLINE,
                strokeWidth: 2.5,
                padAngle: 0.05,
                cornerRadius: 6,
                innerRadius: 0,
            },
            encoding: {
                theta: { field: 'hrs', type: 'quantitative', stack: true },
                color: {
                    field: 'thing',
                    type: 'nominal',
                    sort: null,
                    scale: { range: CARTOON_PALETTE },
                    legend: { title: null },
                },
                order: { field: 'hrs', sort: 'descending' },
            },
            config: cartoonConfig,
        },
    },

    // ── 5. Emoji markers — the mark *is* the picture. A lever a theme lacks. ──
    {
        id: 'cartoon-emoji-lollipop',
        title: 'Emoji lollipops',
        note: 'Emoji markers on stems: the mark itself is the picture. This is a fun lever the current theme spec has no way to express.',
        spec: {
            width: W,
            height: H,
            background: PAPER,
            title: { text: 'Snack scores 🍩', subtitle: 'Average yum rating (out of 10)' },
            data: {
                values: [
                    { snack: 'Donut', score: 9, emoji: '🍩' },
                    { snack: 'Apple', score: 5, emoji: '🍎' },
                    { snack: 'Pizza', score: 8, emoji: '🍕' },
                    { snack: 'Grapes', score: 6, emoji: '🍇' },
                    { snack: 'Cookie', score: 7, emoji: '🍪' },
                ],
            },
            encoding: {
                x: { field: 'snack', type: 'nominal', sort: null, axis: { labelAngle: 0, grid: false, title: null } },
                y: {
                    field: 'score',
                    type: 'quantitative',
                    axis: { title: null, tickCount: 5, grid: true },
                    scale: { domain: [0, 10.5] },
                },
            },
            layer: [
                {
                    mark: { type: 'rule', color: '#c9c1b2', strokeWidth: 4, strokeCap: 'round' },
                    encoding: { y2: { datum: 0 } },
                },
                {
                    mark: { type: 'text', fontSize: 30, baseline: 'middle' },
                    encoding: { text: { field: 'emoji' } },
                },
            ],
            config: cartoonConfig,
        },
    },

    // ── 6. Outlined stacked bars — rounded top, dark outline, white dividers. ──
    {
        id: 'cartoon-stacked',
        title: 'Layer-cake stacks',
        note: 'Stacks with a rounded outlined top and thick white dividers — the pieces read as sweets stacked in a jar.',
        spec: {
            width: W,
            height: H,
            background: PAPER,
            title: { text: 'Marbles in each jar 🫙', subtitle: 'By colour' },
            data: {
                values: (() => {
                    const rows: any[] = [];
                    const jars: Record<string, Record<string, number>> = {
                        'Jar A': { Red: 6, Blue: 4, Yellow: 3 },
                        'Jar B': { Red: 3, Blue: 7, Yellow: 5 },
                        'Jar C': { Red: 5, Blue: 2, Yellow: 8 },
                        'Jar D': { Red: 2, Blue: 6, Yellow: 4 },
                    };
                    for (const [jar, byC] of Object.entries(jars))
                        for (const [colour, n] of Object.entries(byC)) rows.push({ jar, colour, n });
                    return rows;
                })(),
            },
            mark: {
                type: 'bar',
                stroke: '#ffffff',
                strokeWidth: 2.5,
                cornerRadius: 4,
            },
            encoding: {
                x: { field: 'jar', type: 'nominal', sort: null, axis: { labelAngle: 0, grid: false, title: null }, scale: { paddingInner: 0.4 } },
                y: { field: 'n', type: 'quantitative', stack: 'zero', axis: { title: null, tickCount: 4 } },
                color: {
                    field: 'colour',
                    type: 'nominal',
                    sort: null,
                    scale: { domain: ['Red', 'Blue', 'Yellow'], range: ['#ff5d5d', '#3aa9ff', '#ffc23c'] },
                    legend: { title: null },
                },
                order: { field: 'colour' },
            },
            config: cartoonConfig,
        },
    },
];
