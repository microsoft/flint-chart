/** The id the layout pass gives a legend's title, drawn as a graphic: ECharts' legend has no title of its own. */
export const EC_LEGEND_TITLE_ID = 'flint-legend-title';
/** The id the size key's graphic group carries, so the frame can stand it beside the plot. */
export const EC_SIZE_KEY_ID = 'flint-size-key';
/** The id of a continuous visual map a template draws as a ramp beside the plot (`size`, `color`). */
export const rampId = (channel: string) => `flint-ramp:${channel}`;
/** The id of that ramp's title, drawn as a graphic: a visual map has no title of its own. */
export const rampTitleId = (channel: string) => `flint-ramp-title:${channel}`;
