import type { ThemeSpec } from './types';

/**
 * What a chart keeps of its house's chrome: the header (rules, tabs, wordmarks and logos above or
 * beside the title), the footer (the closing rule and the house's credit beside the source) and,
 * across both, the logos. Unset follows the theme ({@link chartChrome}: none on a map). `false` turns all of it off.
 */
export type ChartChrome = false | { header?: boolean; footer?: boolean; logos?: boolean };

/** Chart types drawn as maps: they stand without a house's chrome unless they ask for it. */
const MAP_CHART_TYPES = new Set(['Map', 'Choropleth']);

/**
 * The chrome a chart keeps: what it states, else none for a map — a house's header bar, tab, rules,
 * logos and footer credit frame an article's figure, and read as clutter round a map, which is set
 * into dashboards and apps — else the theme's.
 */
export function chartChrome(chartType: string | undefined, chrome: ChartChrome | undefined): ChartChrome | undefined {
    if (chrome !== undefined) return chrome;
    return chartType && MAP_CHART_TYPES.has(chartType) ? false : undefined;
}

/** The theme with the chrome a chart turned off taken out; unchanged where the chart said nothing. */
export function withChrome(theme: ThemeSpec | undefined, chrome: ChartChrome | undefined): ThemeSpec | undefined {
    if (!theme || chrome === undefined) return theme;
    const off = chrome === false ? { header: false, footer: false, logos: false } : chrome;
    if (off.header !== false && off.footer !== false && off.logos !== false) return theme;
    const furniture = (theme.furniture ?? []).filter((item) => {
        const footer = item.kind === 'footerRule';
        if (footer && off.footer === false) return false;
        if (!footer && off.header === false) return false;
        if (item.kind === 'image' && off.logos === false) return false;
        return true;
    });
    let source = theme.source;
    if (source?.credit && off.footer === false) {
        const { credit: _credit, ...rest } = source;
        void _credit;
        source = rest;
    } else if (source?.credit?.image && off.logos === false) {
        // The logo goes; the credit's words stand in its place.
        const { image: _image, ...credit } = source.credit;
        void _image;
        source = { ...source, credit };
    }
    return { ...theme, furniture, ...(source !== undefined ? { source } : {}) };
}
