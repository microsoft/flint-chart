// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * The diverging colour schemes Vega names, as stops from the scheme's low end to its high end, so a
 * stepped scale can take a colour at any point along one (Vega's own `scheme: { count, extent }`
 * samples only evenly). Copied from vega-scale's `palettes.js` (BSD-3-Clause, University of
 * Washington Interactive Data Lab), which draws on ColorBrewer (Apache-2.0, Cynthia Brewer).
 */
export const DIVERGING_SCHEME_STOPS: Record<string, string[]> = {
    blueorange: ['#134b85', '#2f78b3', '#5da2cb', '#9dcae1', '#d2e5ef', '#f2f0eb', '#fce0ba', '#fbbf74', '#e8932f', '#c5690d', '#994a07'],
    brownbluegreen: ['#704108', '#a0651a', '#c79548', '#e3c78a', '#f3e6c6', '#eef1ea', '#c9e9e4', '#8ed1c7', '#4da79e', '#187a72', '#025147'],
    purplegreen: ['#5b1667', '#834792', '#a67fb6', '#c9aed3', '#e6d6e8', '#eff0ef', '#d9efd5', '#aedda9', '#71bb75', '#368e49', '#0e5e29'],
    purpleorange: ['#411469', '#664796', '#8f83b7', '#b9b4d6', '#dadbeb', '#f3eeea', '#fce0ba', '#fbbf74', '#e8932f', '#c5690d', '#994a07'],
    redblue: ['#8c0d25', '#bf363a', '#df745e', '#f4ae91', '#fbdbc9', '#f2efee', '#d2e5ef', '#9dcae1', '#5da2cb', '#2f78b3', '#134b85'],
    redgrey: ['#8c0d25', '#bf363a', '#df745e', '#f4ae91', '#fcdccb', '#faf4f1', '#e2e2e2', '#c0c0c0', '#969696', '#646464', '#343434'],
    redyellowblue: ['#a50026', '#d4322c', '#f16e43', '#fcac64', '#fedd90', '#faf8c1', '#dcf1ec', '#abd6e8', '#75abd0', '#4a74b4', '#313695'],
    redyellowgreen: ['#a50026', '#d4322c', '#f16e43', '#fcac63', '#fedd8d', '#f9f7ae', '#d7ee8e', '#a4d86e', '#64bc61', '#22964f', '#006837'],
    pinkyellowgreen: ['#8e0152', '#c0267e', '#dd72ad', '#f0b3d6', '#fadded', '#f5f3ef', '#e1f2ca', '#b6de87', '#80bb47', '#4f9125', '#276419'],
    spectral: ['#9e0142', '#d13c4b', '#f0704a', '#fcac63', '#fedd8d', '#fbf8b0', '#e0f3a1', '#a9dda2', '#69bda9', '#4288b5', '#5e4fa2'],
};
