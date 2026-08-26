import type {
    ChartUpdate,
    ClickAnnotateOptions,
    InteractionContext,
    InteractionDef,
    InteractionInput,
    SemanticTarget,
} from '../interactions';
import { emphasisUpdate, normalizedOpacity } from '../emphasis-update';
import { clickTrigger } from '../triggers';

function displayValue(value: unknown): string {
    if (value === null || value === undefined) return 'None';
    if (value instanceof Date) return value.toLocaleString();
    if (typeof value === 'number') {
        return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(value);
    }
    return String(value);
}

function annotationText(element: SemanticTarget['elements'][number], context: InteractionContext): string {
    const record = element.records?.[0] ?? {};
    const entries = Object.entries(record).filter(([field]) => !field.startsWith('__'));
    const candidates = entries.filter(([field]) => field !== context.categoryField && field !== context.seriesField);
    const numeric = [...candidates].reverse().find(([, value]) => typeof value === 'number' && Number.isFinite(value));
    const selected = numeric ?? candidates[candidates.length - 1] ?? entries[entries.length - 1];
    return displayValue(selected?.[1]);
}

export class ClickAnnotateInteraction implements InteractionDef {
    readonly id: string;
    readonly eventSource = clickTrigger;
    private readonly dimOpacity: number;
    private readonly format: NonNullable<ClickAnnotateOptions['format']>;

    constructor(options: ClickAnnotateOptions = {}) {
        this.id = options.id ?? 'click-annotate';
        this.dimOpacity = normalizedOpacity(options.dimOpacity);
        this.format = options.format ?? annotationText;
    }

    update(event: InteractionInput, context: InteractionContext): ChartUpdate | null {
        if (event.type !== 'semantic' || event.source !== 'element' || event.phase !== 'commit') return null;
        if (!event.target) return { ops: [{ op: 'clear-annotation' }, { op: 'reset' }] };
        const element = event.target.elements[0];
        if (!element) return null;
        const emphasis = emphasisUpdate(event.target, event.modifiers, this.dimOpacity);
        return {
            ops: [{
                op: 'annotate',
                element,
                text: this.format(element, context),
                point: event.point,
            }, ...(emphasis?.ops ?? [])],
        };
    }
}
