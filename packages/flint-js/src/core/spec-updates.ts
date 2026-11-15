import type { ChartAssemblyInput, ChartWarning } from './types';

/**
 * Say, on a static output, that the spec's `updates` are not in it: a spec's updates (notes,
 * overlays, emphasis, a viewport) are applied by the interactive runtime once the chart is drawn,
 * and a compiled spec, an SVG or another backend's figure draws the chart without them.
 */
export function noteSpecUpdates<T>(output: T, input: Pick<ChartAssemblyInput, 'updates'>): T {
    const count = input.updates?.length ?? 0;
    if (!count || !output || typeof output !== 'object') return output;
    const warning: ChartWarning = {
        severity: 'info',
        code: 'updates-not-compiled',
        message: `The spec's ${count} update${count === 1 ? '' : 's'} (${input.updates!.map((update) => `"${update.id}"`).join(', ')}) `
            + 'are applied by the interactive runtime (mountChart, <FlintChart>) once the chart is drawn; this output draws the chart without them.',
    };
    const notes = output as { _warnings?: ChartWarning[] };
    notes._warnings = [...(notes._warnings ?? []), warning];
    return output;
}
