import type {
	ClickGroupHighlightOptions,
	InteractionContext,
	InteractionDef,
	SemanticElement,
	SemanticTarget,
} from '../interactions';
import { emphasisUpdate, normalizedOpacity } from '../updates/emphasis';
import { clickTrigger } from '../triggers';

function groupValue(
	element: SemanticElement,
	context: InteractionContext,
	groupBy: ClickGroupHighlightOptions['groupBy'],
): unknown {
		if (typeof groupBy === 'function') return groupBy(element, context);
		const record = element.records?.[0];
		if (!record) return undefined;
		if (typeof groupBy === 'string') return record[groupBy];

		const field = context.chartType === 'Waterfall Chart'
			? '__wf_color'
			: context.chartType === 'Strip Plot' ? context.categoryField : context.seriesField;
		return field ? record[field] : undefined;
}

function groupElements(
	target: SemanticTarget,
	context: InteractionContext,
	groupBy: ClickGroupHighlightOptions['groupBy'],
): readonly SemanticElement[] {
		if (target.visual.role === 'legend-item') return target.elements;
		const source = target.elements[0];
		if (!source) return target.elements;
		const value = groupValue(source, context, groupBy);
		if (value === undefined) return target.elements;

		const available = context.available ?? [];
		const values = new Set(available.map((element) => groupValue(element, context, groupBy)));
		if (values.size < 2) return target.elements;

		const cohort = available.filter((element) => groupValue(element, context, groupBy) === value);
		return cohort.length > 1 ? cohort : target.elements;
}

export function createClickGroupHighlightInteraction(options: ClickGroupHighlightOptions = {}): InteractionDef {
	const id = options.id ?? 'click-group-highlight';
	const dimOpacity = normalizedOpacity(options.dimOpacity);
	return {
		id,
		eventSource: clickTrigger,
		handle(event, context) {
			if (!event.action.startsWith('click-') || event.phase === 'start' || event.phase === 'cancel') return null;
			const target = event.target
				? { ...event.target, elements: groupElements(event.target, context, options.groupBy) }
				: null;
			return emphasisUpdate(id, event, target, dimOpacity);
		},
	};
}
