import { baselineOn, type InteractionDefaults, type InteractionCapability } from '../../core/interaction-spec';
import type { CanvasInteractionDef } from '../../interactive/interactions';
import { createLegendDimInteraction } from '../../interactive/presets/legend-dim';

/** What the baseline reads from the compiled chart. */
export interface BaselineChart {
    capabilities: readonly InteractionCapability[];
}

/**
 * The behaviour every mounted chart has without asking: a legend click that dims a group. It is
 * tagged `origin: 'baseline'`, so admission drops it, silently, wherever the spec or the code asks
 * for the same gesture. The nearest-mark tooltip is not an interaction: the runtime draws it. Pan
 * and zoom are never baseline: an agent asks for them.
 */
export function baselineInteractions(chart: BaselineChart, defaults: InteractionDefaults | undefined): CanvasInteractionDef[] {
    if (!baselineOn(defaults, 'legend') || !chart.capabilities.includes('legend')) return [];
    return [{ ...createLegendDimInteraction({ id: 'flint-legend-dim' }), origin: 'baseline' }];
}
