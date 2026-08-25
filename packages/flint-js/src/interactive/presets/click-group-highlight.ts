import type {
	ChartUpdate,
	ClickGroupHighlightOptions,
	InteractionContext,
	InteractionDef,
	InteractionInput,
	SemanticElement,
	SemanticTarget,
} from '../interactions';
import { emphasisUpdate, normalizedOpacity } from '../emphasis-update';
import { clickTrigger } from '../triggers';

export class ClickGroupHighlightInteraction implements InteractionDef {
	readonly id: string;
	readonly eventSource = clickTrigger;
	private readonly dimOpacity: number;
	private readonly groupBy?: ClickGroupHighlightOptions['groupBy'];

	constructor(options: ClickGroupHighlightOptions = {}) {
		this.id = options.id ?? 'click-group-highlight';
		this.dimOpacity = normalizedOpacity(options.dimOpacity);
		this.groupBy = options.groupBy;
	}

	update(event: InteractionInput, context: InteractionContext): ChartUpdate | null {
		if (event.type !== 'semantic' || event.source !== 'element' || event.phase !== 'commit') return null;
		return emphasisUpdate(
			event.target,
			event.modifiers,
			this.dimOpacity,
			event.target ? this.propagate(event.target, context) : [],
		);
	}

	private groupValue(element: SemanticElement, context: InteractionContext): unknown {
		if (typeof this.groupBy === 'function') return this.groupBy(element, context);
		const record = element.records?.[0];
		if (!record) return undefined;
		if (typeof this.groupBy === 'string') return record[this.groupBy];

		const field = this.defaultGroupField(context);
		return field ? record[field] : undefined;
	}

	private defaultGroupField(context: InteractionContext): string | undefined {
		switch (context.chartType) {
			case 'Waterfall Chart':
				return '__wf_color';
			case 'Strip Plot':
				return context.categoryField;
			default:
				return context.seriesField;
		}
	}

	private propagate(
		target: SemanticTarget,
		context: InteractionContext,
	): readonly SemanticElement[] {
		if (target.visual.role === 'legend-item') return target.elements;
		const source = target.elements[0];
		if (!source) return target.elements;
		const value = this.groupValue(source, context);
		if (value === undefined) return target.elements;

		const available = context.available ?? [];
		const values = new Set(available.map((element) => this.groupValue(element, context)));
		if (values.size < 2) return target.elements;

		const cohort = available.filter((element) => this.groupValue(element, context) === value);
		return cohort.length > 1 ? cohort : target.elements;
	}
}
