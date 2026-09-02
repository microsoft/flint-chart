import type {
	ClickGroupHighlightOptions,
	InteractionContext,
	CanvasInteractionDef,
	SemanticElement,
	SemanticTarget,
	GroupBy,
} from '../interactions';
import type { InteractionAffordance } from '../affordances';
import { emphasisUpdate, isActivationAction, normalizedOpacity } from './utils';
import { clickTrigger } from '../triggers';
import { expandElementsByFields } from './semantic-cohort';

function groupValue(
	element: SemanticElement,
	context: InteractionContext,
	groupBy: GroupBy | undefined,
): unknown {
		if (typeof groupBy === 'function') return groupBy(element, context);
		const record = element.records?.[0];
		if (!record) return undefined;
		if (typeof groupBy === 'string') return record[groupBy];
		if (context.resolveGroupValue) return context.resolveGroupValue(element);

		const field = context.chartType === 'Strip Plot' ? context.categoryField : context.seriesField;
		return field ? record[field] : undefined;
}

function groupElements(
	target: SemanticTarget,
	context: InteractionContext,
	groupBy: GroupBy | undefined,
): readonly SemanticElement[] {
		if (target.visual.role === 'legend-item') return target.elements;
	if (typeof groupBy === 'string' || Array.isArray(groupBy)) {
		return expandElementsByFields(target.elements, context.available, groupBy);
	}
		const source = target.elements[0];
		if (!source) return target.elements;
		const value = groupValue(source, context, groupBy);
		if (value === undefined) return target.elements;

		const available = context.available ?? [];
		const values = new Set(available.map((element) => groupValue(element, context, groupBy)));
		if (values.size < 2) return target.elements;

		const cohort = available.filter((element) => Object.is(
			groupValue(element, context, groupBy), value,
		));
		return cohort.length > 1 ? cohort : target.elements;
}

export function createClickGroupHighlightInteraction(options: ClickGroupHighlightOptions = {}): CanvasInteractionDef {
	const id = options.id ?? 'click-group-highlight';
	const dimOpacity = normalizedOpacity(options.dimOpacity);
	const affordances: InteractionAffordance[] = [
		{ target: 'mark', cursor: 'activate', hover: 'cohort' },
	];
	if (options.legend !== false) {
		affordances.push({ target: 'legend-item', cursor: 'activate', hover: 'cohort' });
	}
	return {
		id,
		eventSource: clickTrigger,
		affordances,
		handle(event, context) {
			if (!isActivationAction(event.action) || event.phase === 'start' || event.phase === 'cancel') return null;
			if (event.target?.visual.role === 'legend-item' && options.legend === false) return null;
			const target = event.target
				? { ...event.target, elements: groupElements(
					event.target, context, options.groupBy,
				) }
				: null;
			return emphasisUpdate(id, event, target, dimOpacity, context);
		},
	};
}
