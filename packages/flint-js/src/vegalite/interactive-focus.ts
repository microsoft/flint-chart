import { DEFAULT_DIM_OPACITY } from '../interactive/emphasis-update';

const FOCUS_PARAM = '__flint_focus';
const FOCUS_KEY = '__flint_focus_key';
const CLEAR_MARK = '__flint_focus_clear';
const FOCUSABLE_MARKS = new Set(['bar', 'arc', 'point', 'circle', 'square', 'rect']);

function markType(mark: unknown): string | undefined {
    return typeof mark === 'string'
        ? mark
        : typeof mark === 'object' && mark !== null
            ? (mark as Record<string, unknown>).type as string | undefined
            : undefined;
}

function selectionField(encoding: Record<string, any> | undefined): string | undefined {
    if (!encoding) return undefined;
    for (const channel of ['x', 'y', 'color']) {
        const definition = encoding[channel];
        if (
            definition
            && typeof definition === 'object'
            && (definition.type === 'nominal' || definition.type === 'ordinal')
            && typeof definition.field === 'string'
        ) {
            return definition.field;
        }
    }
    return undefined;
}

function focusParam(): Record<string, unknown> {
    return {
        name: FOCUS_PARAM,
        select: {
            type: 'point',
            fields: [FOCUS_KEY],
            toggle: 'event.shiftKey || event.ctrlKey || event.metaKey',
            clear: { type: 'click', markname: CLEAR_MARK },
        },
    };
}

function focusTransform(field: string): Record<string, unknown> {
    return { calculate: `datum[${JSON.stringify(field)}]`, as: FOCUS_KEY };
}

function focusOpacity(restOpacity: number): Record<string, unknown> {
    return {
        condition: { param: FOCUS_PARAM, value: restOpacity },
        value: Math.min(DEFAULT_DIM_OPACITY, restOpacity),
    };
}

function withFocusDetail(encoding: Record<string, any>): Record<string, any> {
    const focusDetail = { field: FOCUS_KEY, type: 'nominal' };
    const existing = encoding.detail;
    return {
        ...encoding,
        detail: existing == null
            ? focusDetail
            : [...(Array.isArray(existing) ? existing : [existing]), focusDetail],
    };
}

export function withoutInteractiveFocusField(value: unknown): unknown {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const filtered = { ...(value as Record<string, unknown>) };
    delete filtered[FOCUS_KEY];
    return filtered;
}

function focusableEncoding(encoding: Record<string, any> | undefined): boolean {
    return !!encoding && !encoding.opacity && !encoding.fillOpacity && !encoding.strokeOpacity;
}

function markWithoutOpacity(mark: unknown): { mark: unknown; opacity: number } {
    if (!mark || typeof mark !== 'object' || typeof (mark as Record<string, unknown>).opacity !== 'number') {
        return { mark, opacity: 1 };
    }
    const copy = { ...(mark as Record<string, unknown>) };
    const opacity = copy.opacity as number;
    delete copy.opacity;
    return { mark: copy, opacity };
}

export function addInteractiveFocus(spec: Record<string, any>): boolean {
    if (Array.isArray(spec.params) && spec.params.length > 0) return false;

    const unitType = markType(spec.mark);
    if (unitType && FOCUSABLE_MARKS.has(unitType) && focusableEncoding(spec.encoding)) {
        const field = selectionField(spec.encoding);
        if (!field) return false;
        const resolvedMark = markWithoutOpacity(spec.mark);
        spec.mark = resolvedMark.mark;
        spec.transform = [...(Array.isArray(spec.transform) ? spec.transform : []), focusTransform(field)];
        spec.params = [focusParam()];
        spec.encoding = withFocusDetail({ ...spec.encoding, opacity: focusOpacity(resolvedMark.opacity) });
        return true;
    }

    if (!Array.isArray(spec.layer)) return false;
    const topEncoding = spec.encoding ?? {};
    for (const layer of spec.layer) {
        const layerType = markType(layer?.mark);
        const encoding = { ...topEncoding, ...(layer?.encoding ?? {}) };
        if (!layerType || !FOCUSABLE_MARKS.has(layerType) || !focusableEncoding(encoding)) continue;
        if (Array.isArray(layer.params) && layer.params.length > 0) continue;
        const field = selectionField(encoding);
        if (!field) continue;
        const resolvedMark = markWithoutOpacity(layer.mark);
        layer.mark = resolvedMark.mark;
        layer.params = [focusParam()];
        layer.encoding = withFocusDetail({ ...(layer.encoding ?? {}), opacity: focusOpacity(resolvedMark.opacity) });
        spec.transform = [...(Array.isArray(spec.transform) ? spec.transform : []), focusTransform(field)];
        return true;
    }
    return false;
}

export function injectFocusClearMark(vegaSpec: Record<string, any>): void {
    if (!Array.isArray(vegaSpec.marks)) return;
    vegaSpec.marks.unshift({
        type: 'rect',
        name: CLEAR_MARK,
        encode: {
            enter: {
                x: { value: 0 },
                x2: { signal: 'width' },
                y: { value: 0 },
                y2: { signal: 'height' },
                opacity: { value: 0 },
                tooltip: { value: null },
            },
        },
    });
}