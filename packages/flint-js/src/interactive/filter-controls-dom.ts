import type { FilterValue } from '../core/interaction-contracts';
import {
    filterNumber,
    sameFilterValue,
    type FilterControlsPayload,
    type FilterControlsRuntime,
    type FilterFieldDescriptor,
    type FilterPlacement,
} from './filter-controls';

export type ResolvedFilterPlacement = Exclude<FilterPlacement, 'auto'>;

export interface MountedFilterStrip {
    readonly element: HTMLElement;
    readonly placement: ResolvedFilterPlacement;
    destroy(): void;
}

export interface FilterStripOptions {
    /** The surface's outer element; a strip outside the plot takes a grid area of it. */
    readonly root: HTMLElement;
    readonly descriptors: readonly FilterFieldDescriptor[];
    readonly runtime: FilterControlsRuntime;
    readonly placement: ResolvedFilterPlacement;
    readonly dispatch: (payload: FilterControlsPayload) => void;
}

/** The plot area in `body` pixels. */
type PlotBox = () => { left: number; top: number; width: number; height: number } | undefined;

const SEARCH_THRESHOLD = 12;

const TEXT = '#1f2937';
const MUTED_TEXT = 'rgba(31, 41, 55, 0.62)';
const BORDER = 'rgba(31, 41, 55, 0.18)';
const ACTIVE_FILL = 'rgba(31, 41, 55, 0.08)';
const HOVER_FILL = 'rgba(31, 41, 55, 0.12)';
const HOVER_BORDER = 'rgba(31, 41, 55, 0.32)';
/** Chosen values and slider fills stay grey: the controls should not compete with the marks. */
const SELECTED_FILL = 'rgba(31, 41, 55, 0.1)';
const ACCENT = 'rgba(31, 41, 55, 0.5)';

/** `auto` puts the controls under the chart; anything but `top` does too. */
export function resolveFilterPlacement(placement: FilterPlacement | undefined): ResolvedFilterPlacement {
    return placement === 'top' ? 'top' : 'bottom';
}

function applyStyles(element: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
    Object.assign(element.style, styles);
}

function plainValue(value: unknown): string {
    // Years are the common small integer, and read wrong with a thousands separator.
    // en-US, the chart's own locale, whatever the browser's.
    if (typeof value === 'number') {
        return value.toLocaleString('en-US', { maximumFractionDigits: 2, useGrouping: Math.abs(value) >= 10000 });
    }
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value);
}

/**
 * Text that always takes the width of its widest possible value: every candidate sits hidden
 * in the same grid cell, so a slider beside it keeps its length while the value changes.
 */
function steadyText(candidates: readonly string[], align: 'start' | 'end' = 'start'): { element: HTMLElement; set(text: string): void } {
    const element = document.createElement('span');
    applyStyles(element, { display: 'inline-grid', justifyItems: align, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' });
    for (const text of new Set(candidates)) {
        const sizer = document.createElement('span');
        sizer.textContent = text;
        sizer.setAttribute('aria-hidden', 'true');
        applyStyles(sizer, { gridArea: '1 / 1', visibility: 'hidden' });
        element.append(sizer);
    }
    const shown = document.createElement('span');
    applyStyles(shown, { gridArea: '1 / 1' });
    element.append(shown);
    return { element, set: (text) => { shown.textContent = text; } };
}

/** A chip has little room, so a large number reads as 266K or 7.48M. */
function compactValue(value: unknown): string {
    if (typeof value === 'number' && Math.abs(value) >= 10000) {
        return value.toLocaleString('en-US', { notation: 'compact', maximumSignificantDigits: 3 });
    }
    return plainValue(value);
}

/** The field's own formatting when its semantic type gives one, else the plain fallback. */
function formatters(descriptor: FilterFieldDescriptor): { formatValue(value: unknown): string; formatCompact(value: unknown): string } {
    return {
        formatValue: descriptor.format ?? plainValue,
        formatCompact: descriptor.formatCompact ?? descriptor.format ?? compactValue,
    };
}

/** The chip's words for a field's state: `All`, the kept values, or the range. */
export function summarizeFilter(descriptor: FilterFieldDescriptor, filter: FilterValue | undefined): string {
    const { formatValue, formatCompact } = formatters(descriptor);
    if (!filter) return 'All';
    if ('range' in filter) return `${formatCompact(filter.range[0])}–${formatCompact(filter.range[1])}`;
    if (filter.in.length === 0) return 'None';
    if (descriptor.widget === 'toggle') return filter.in.map(formatValue).join(', ');
    if (filter.in.length <= 2) return filter.in.map(formatValue).join(', ');
    return `${filter.in.length} of ${descriptor.values.length}`;
}

function button(text: string): HTMLButtonElement {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = text;
    applyStyles(element, {
        font: 'inherit', fontSize: '12px', lineHeight: '18px', color: TEXT,
        background: 'transparent', border: 'none', padding: '0', cursor: 'pointer',
    });
    return element;
}

function chipStyles(element: HTMLElement, active: boolean): void {
    applyStyles(element, {
        display: 'inline-flex', alignItems: 'center', gap: '4px', maxWidth: '100%',
        font: 'inherit', fontSize: '12px', lineHeight: '18px', color: TEXT,
        padding: '2px 10px', borderRadius: '999px', cursor: 'pointer', whiteSpace: 'nowrap',
        border: `1px solid ${BORDER}`,
        background: active ? ACTIVE_FILL : '#fff',
        fontWeight: active ? '600' : '400',
    });
}

/** The list for a field with too many values for a row, drawn into the popover its chip opens. */
function renderWidget(
    container: HTMLElement,
    descriptor: FilterFieldDescriptor,
    current: FilterValue | undefined,
    set: (value: FilterValue | null) => void,
    /** Closes the popover after a single-choice pick. */
    done?: () => void,
): void {
    const { field, widget, values } = descriptor;
    const { formatValue } = formatters(descriptor);
    if (widget === 'select') {
        // The chip already is the dropdown, so its panel is the list itself: one click picks and closes.
        const list = document.createElement('div');
        list.setAttribute('role', 'listbox');
        list.setAttribute('aria-label', descriptor.label);
        applyStyles(list, { display: 'flex', flexDirection: 'column', gap: '1px', minWidth: '120px' });
        const chosen = current && 'in' in current && current.in.length === 1 ? current.in[0] : undefined;
        const choices: { text: string; value: FilterValue | null; selected: boolean }[] = [
            // A required field always holds one value, so it offers no All.
            ...(descriptor.required ? [] : [{ text: 'All', value: null, selected: !current }]),
            ...values.map((value) => ({
                text: formatValue(value),
                value: { in: [value] } as FilterValue,
                selected: current !== undefined && sameFilterValue(chosen, value),
            })),
        ];
        for (const choice of choices) {
            const option = button(choice.text);
            option.setAttribute('role', 'option');
            option.className = 'flint-filter-item';
            option.setAttribute('aria-selected', String(choice.selected));
            option.dataset.flintFilterOption = choice.text;
            applyStyles(option, {
                textAlign: 'left', padding: '3px 6px', borderRadius: '4px',
                fontWeight: choice.selected ? '600' : '400',
                background: choice.selected ? ACTIVE_FILL : 'transparent',
            });
            option.addEventListener('click', () => {
                set(choice.value);
                done?.();
            });
            list.append(option);
        }
        if (values.length > SEARCH_THRESHOLD) {
            const search = document.createElement('input');
            search.type = 'search';
            search.placeholder = `Find ${descriptor.label}`;
            search.setAttribute('aria-label', `Find ${descriptor.label}`);
            applyStyles(search, { font: 'inherit', fontSize: '12px', width: '100%', boxSizing: 'border-box', marginBottom: '4px' });
            search.addEventListener('input', () => {
                const query = search.value.trim().toLowerCase();
                for (const option of list.children as HTMLCollectionOf<HTMLElement>) {
                    option.style.display = (option.textContent ?? '').toLowerCase().includes(query) ? '' : 'none';
                }
            });
            container.append(search);
        }
        container.append(list);
        container.dataset.flintFilterField = field;
        return;
    }
    if (widget === 'range') {
        renderRange(container, descriptor, current, set);
        return;
    }
    if (widget === 'toggle') {
        const label = document.createElement('label');
        label.className = 'flint-filter-toggle';
        applyStyles(label, { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' });
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.setAttribute('role', 'switch');
        input.className = 'flint-filter-switch';
        ensureFilterStyles();
        input.checked = !!current && 'in' in current && current.in.some((value) => value === true);
        input.addEventListener('change', () => set(input.checked ? { in: [true] } : null));
        label.title = `On: only rows where ${descriptor.label} is true`;
        label.append(input, document.createTextNode(`Only ${descriptor.label}`));
        container.append(label);
        return;
    }
    const kept = (value: unknown): boolean => !current || !('in' in current)
        || current.in.some((candidate) => sameFilterValue(candidate, value));
    const boxes: { value: unknown; input: HTMLInputElement; row: HTMLElement }[] = [];
    // The last checked box cannot be cleared: an empty selection would only draw an empty chart.
    const lockLast = (): void => {
        const checked = boxes.filter((box) => box.input.checked);
        for (const box of boxes) {
            const locked = checked.length === 1 && box.input.checked;
            box.input.disabled = locked;
            box.row.title = locked ? 'At least one value stays selected' : '';
        }
    };
    const commit = (): void => {
        lockLast();
        const selected = boxes.filter((box) => box.input.checked).map((box) => box.value);
        set(selected.length === values.length ? null : { in: selected });
    };
    const actions = document.createElement('div');
    applyStyles(actions, { display: 'flex', gap: '10px', marginBottom: '4px' });
    const all = button('All');
    all.className = 'flint-filter-link';
    all.style.color = MUTED_TEXT;
    all.addEventListener('click', () => { for (const box of boxes) box.input.checked = true; commit(); });
    actions.append(all);
    container.append(actions);
    if (values.length > SEARCH_THRESHOLD) {
        const search = document.createElement('input');
        search.type = 'search';
        search.placeholder = `Find ${descriptor.label}`;
        search.setAttribute('aria-label', `Find ${descriptor.label}`);
        applyStyles(search, { font: 'inherit', fontSize: '12px', width: '100%', boxSizing: 'border-box', marginBottom: '4px' });
        search.addEventListener('input', () => {
            const query = search.value.trim().toLowerCase();
            for (const box of boxes) box.row.style.display = formatValue(box.value).toLowerCase().includes(query) ? '' : 'none';
        });
        container.append(search);
    }
    const list = document.createElement('div');
    list.setAttribute('role', 'group');
    list.setAttribute('aria-label', descriptor.label);
    applyStyles(list, { display: 'flex', flexDirection: 'column', gap: '2px' });
    for (const value of values) {
        const row = document.createElement('div');
        row.className = 'flint-filter-item';
        applyStyles(row, { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '1px 4px', margin: '0 -4px', borderRadius: '4px' });
        const label = document.createElement('label');
        applyStyles(label, { display: 'flex', alignItems: 'center', gap: '6px', flex: '1', cursor: 'pointer' });
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = kept(value);
        input.dataset.flintFilterValue = formatValue(value);
        input.addEventListener('change', commit);
        label.append(input, document.createTextNode(formatValue(value)));
        // "only" isolates one value in a click, the usual reason to clear the others.
        const only = button('only');
        only.className = 'flint-filter-only flint-filter-link';
        only.dataset.flintFilterOnly = formatValue(value);
        only.setAttribute('aria-label', `Only ${formatValue(value)}`);
        applyStyles(only, { color: MUTED_TEXT, fontSize: '11px', textDecoration: 'underline', opacity: '0' });
        only.addEventListener('click', () => {
            for (const box of boxes) box.input.checked = box.value === value;
            commit();
        });
        const reveal = (shown: boolean) => (): void => { only.style.opacity = shown ? '1' : '0'; };
        row.addEventListener('pointerenter', reveal(true));
        row.addEventListener('pointerleave', reveal(false));
        row.addEventListener('focusin', reveal(true));
        row.addEventListener('focusout', reveal(false));
        row.append(label, only);
        list.append(row);
        boxes.push({ value, input, row });
    }
    lockLast();
    container.append(list);
    container.dataset.flintFilterField = field;
}

function renderRange(
    container: HTMLElement,
    descriptor: FilterFieldDescriptor,
    current: FilterValue | undefined,
    set: (value: FilterValue | null) => void,
    inline = false,
): void {
    const { values, extent } = descriptor;
    // In a row the readout sits beside the track and abbreviates, so both fit the chart's width.
    const { formatValue, formatCompact } = formatters(descriptor);
    const show = (value: unknown): string => inline ? formatCompact(value) : formatValue(value);
    // A numeric range slides through numbers; any other range steps through its sorted values.
    const continuous = !!extent;
    const min = continuous ? extent[0] : 0;
    const max = continuous ? extent[1] : values.length - 1;
    const integral = continuous && values.every((value) => Number.isInteger(value));
    const step = continuous ? (integral ? 1 : (max - min) / 100 || 1) : 1;
    const toPosition = (value: unknown): number => {
        if (continuous) return filterNumber(value);
        const number = filterNumber(value);
        const index = values.findIndex((candidate) => filterNumber(candidate) >= number);
        return index < 0 ? values.length - 1 : index;
    };
    const fromPosition = (position: number): unknown => continuous
        ? (integral ? Math.round(position) : position)
        : values[Math.round(position)];
    const range = current && 'range' in current ? current.range : undefined;
    const readout = document.createElement('div');
    applyStyles(readout, inline
        ? { fontSize: '12px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', flex: 'none', order: '1' }
        : { fontSize: '12px', fontVariantNumeric: 'tabular-nums', marginBottom: '4px' });
    let write = (from: unknown, to: unknown): void => { readout.textContent = `${show(from)} – ${show(to)}`; };
    if (inline) {
        // Beside the track each end holds its widest label from the start, so a drag never resizes the track.
        const labels = continuous
            ? Array.from({ length: 101 }, (_, i) => show(fromPosition(min + (max - min) * i / 100)))
            : values.map(show);
        const from = steadyText(labels, 'end');
        const to = steadyText(labels);
        readout.append(from.element, ' – ', to.element);
        write = (start, end) => { from.set(show(start)); to.set(show(end)); };
    }
    const low = document.createElement('input');
    const high = document.createElement('input');
    for (const [input, name, initial] of [
        [low, 'from', range ? toPosition(range[0]) : min],
        [high, 'to', range ? toPosition(range[1]) : max],
    ] as const) {
        input.type = 'range';
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        input.value = String(initial);
        input.setAttribute('aria-label', `${descriptor.label} ${name}`);
        input.className = 'flint-filter-thumb';
        applyStyles(input, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', margin: '0' });
    }
    ensureFilterStyles();
    // One track, two thumbs: the inputs overlap and only their thumbs take the pointer.
    const slider = document.createElement('div');
    slider.className = 'flint-filter-range';
    applyStyles(slider, { position: 'relative', height: '20px', margin: '2px 7px' });
    if (inline) applyStyles(slider, { flex: '1 1 80px', minWidth: '60px' });
    const track = document.createElement('div');
    applyStyles(track, { position: 'absolute', left: '0', right: '0', top: '8px', height: '4px', borderRadius: '2px', background: BORDER });
    const fill = document.createElement('div');
    applyStyles(fill, { position: 'absolute', top: '8px', height: '4px', borderRadius: '2px', background: ACCENT });
    slider.append(track, fill, low, high);
    const paint = (): void => {
        const span = max - min || 1;
        const from = (Number(low.value) - min) / span;
        const to = (Number(high.value) - min) / span;
        fill.style.left = `${from * 100}%`;
        fill.style.width = `${Math.max(0, to - from) * 100}%`;
        // Thumbs stacked at the top end: the low one must stay reachable.
        low.style.zIndex = from >= 0.5 && to - from <= step / span ? '2' : '1';
        high.style.zIndex = low.style.zIndex === '2' ? '1' : '2';
    };
    let frame: number | undefined;
    const sync = (moved: HTMLInputElement): void => {
        // The thumbs stop a step apart: one value left leaves a line with nothing to draw.
        const gap = max - min >= step ? step : 0;
        if (Number(high.value) - Number(low.value) < gap) {
            if (moved === low) low.value = String(Number(high.value) - gap);
            else high.value = String(Number(low.value) + gap);
        }
        const from = fromPosition(Number(low.value));
        const to = fromPosition(Number(high.value));
        write(from, to);
        paint();
        if (frame !== undefined) return;
        // A drag fires many inputs; one update per frame keeps the chart in step without a backlog.
        frame = requestAnimationFrame(() => {
            frame = undefined;
            const full = Number(low.value) <= min && Number(high.value) >= max;
            set(full ? null : { range: [fromPosition(Number(low.value)), fromPosition(Number(high.value))] });
        });
    };
    low.addEventListener('input', () => sync(low));
    high.addEventListener('input', () => sync(high));
    write(fromPosition(Number(low.value)), fromPosition(Number(high.value)));
    paint();
    container.append(readout, slider);
}

const FILTER_STYLE_ID = 'flint-filter-styles';

/**
 * Pseudo-elements (slider thumbs, the switch knob) cannot be styled inline, so the shared rules go in the head once.
 * Slider rules name the input type too, so a host page's `input[type=range]` rules do not override them.
 */
function ensureFilterStyles(): void {
    if (document.getElementById(FILTER_STYLE_ID)) return;
    const thumb = `width: 14px; height: 14px; border-radius: 50%; background: #fff; border: 2px solid ${ACCENT};`
        + ' box-sizing: border-box; cursor: pointer; pointer-events: auto;';
    const style = document.createElement('style');
    style.id = FILTER_STYLE_ID;
    style.textContent = [
        'input[type=range].flint-filter-thumb { -webkit-appearance: none; appearance: none; background: transparent; pointer-events: none; outline: none; }',
        'input[type=range].flint-filter-thumb::-webkit-slider-runnable-track { background: transparent; height: 20px; }',
        'input[type=range].flint-filter-thumb::-moz-range-track { background: transparent; }',
        `input[type=range].flint-filter-thumb::-webkit-slider-thumb { -webkit-appearance: none; margin-top: 3px; ${thumb} }`,
        `input[type=range].flint-filter-thumb::-moz-range-thumb { ${thumb} }`,
        `input[type=range].flint-filter-thumb:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 3px ${BORDER}; }`,
        `input[type=range].flint-filter-thumb:focus-visible::-moz-range-thumb { box-shadow: 0 0 0 3px ${BORDER}; }`,
        `.flint-filter-switch { -webkit-appearance: none; appearance: none; position: relative; flex: none; width: 26px; height: 14px; margin: 0; border-radius: 7px; background: ${BORDER}; cursor: pointer; transition: background 120ms; }`,
        '.flint-filter-switch::before { content: ""; position: absolute; top: 2px; left: 2px; width: 10px; height: 10px; border-radius: 50%; background: #fff; transition: transform 120ms; }',
        `.flint-filter-switch:checked { background: ${ACCENT}; }`,
        '.flint-filter-switch:checked::before { transform: translateX(12px); }',
        `.flint-filter-switch:focus-visible { outline: none; box-shadow: 0 0 0 3px ${BORDER}; }`,
        // Inline styles carry each control's resting look, so hover has to win with !important.
        `.flint-filter-chip:hover { background-color: ${HOVER_FILL} !important; border-color: ${HOVER_BORDER} !important; }`,
        `.flint-filter-pill:not(.flint-filter-segment):hover:not(:disabled) { border-color: ${HOVER_BORDER} !important; }`,
        `.flint-filter-pill[aria-pressed="false"]:hover:not(:disabled), .flint-filter-segment[aria-checked="false"]:hover { background-color: ${ACTIVE_FILL} !important; color: ${TEXT} !important; }`,
        '.flint-filter-pill:disabled { opacity: 0.35; cursor: default !important; }',
        `input[type=range].flint-filter-step { -webkit-appearance: none; appearance: none; height: 14px; background: transparent; cursor: pointer; outline: none; }`,
        `input[type=range].flint-filter-step::-webkit-slider-runnable-track { height: 4px; border-radius: 2px; background: ${BORDER}; }`,
        `input[type=range].flint-filter-step::-moz-range-track { height: 4px; border-radius: 2px; background: ${BORDER}; }`,
        `input[type=range].flint-filter-step::-webkit-slider-thumb { -webkit-appearance: none; margin-top: -5px; ${thumb} }`,
        `input[type=range].flint-filter-step::-moz-range-thumb { ${thumb} }`,
        `input[type=range].flint-filter-step:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 3px ${BORDER}; }`,
        `.flint-filter-item:hover { background-color: ${ACTIVE_FILL} !important; }`,
        `.flint-filter-link:hover { color: ${TEXT} !important; }`,
        `.flint-filter-toggle:hover .flint-filter-switch:not(:checked) { background: ${HOVER_BORDER}; }`,
        '.flint-filter-chip, .flint-filter-pill, .flint-filter-item, .flint-filter-switch { transition: background-color 100ms, border-color 100ms; }',
    ].join('\n');
    document.head.append(style);
}

/** Up to this many values sit inline as buttons; more fall back to a dropdown or a slider. */
const INLINE_LIMIT = 8;
/** A strip narrower than this puts each label above its control. */
const STACKED_WIDTH = 280;

/** A value button: separate pills choose several, segments of one rounded bar choose one. */
function pill(text: string, selected: boolean, segment = false): HTMLButtonElement {
    const element = button(text);
    element.className = segment ? 'flint-filter-pill flint-filter-segment' : 'flint-filter-pill';
    element.setAttribute(segment ? 'aria-checked' : 'aria-pressed', String(selected));
    if (segment) element.setAttribute('role', 'radio');
    element.dataset.flintFilterOption = text;
    applyStyles(element, {
        padding: segment ? '0 9px' : '1px 9px', borderRadius: '999px', whiteSpace: 'nowrap',
        border: segment ? 'none' : `1px solid ${selected ? HOVER_BORDER : BORDER}`,
        background: selected ? SELECTED_FILL : 'transparent',
        color: selected ? TEXT : MUTED_TEXT,
        fontWeight: selected ? '500' : '400',
    });
    return element;
}

function isOrdered(values: readonly unknown[]): boolean {
    return values.every((value) => typeof value === 'number')
        || values.every((value) => value instanceof Date || (typeof value === 'string' && /^\d{4}(-\d\d){0,2}/.test(value)));
}

/**
 * One field's control, drawn in place so a single click or drag filters:
 * buttons for a few values, a slider for many ordered ones, the range slider, the switch.
 * Returns false when the field needs a dropdown instead (many values without an order, or several at once).
 */
function renderInline(
    container: HTMLElement,
    descriptor: FilterFieldDescriptor,
    current: FilterValue | undefined,
    set: (value: FilterValue | null) => void,
): boolean {
    const { widget, values, label } = descriptor;
    const { formatValue } = formatters(descriptor);
    const group = (role: string): HTMLElement => {
        const element = document.createElement('div');
        element.setAttribute('role', role);
        element.setAttribute('aria-label', label);
        applyStyles(element, { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px', minWidth: '0' });
        container.append(element);
        return element;
    };
    const chosen = current && 'in' in current ? current.in : undefined;
    const has = (value: unknown): boolean => !!chosen?.some((candidate) => sameFilterValue(candidate, value));
    if (widget === 'toggle') {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.setAttribute('role', 'switch');
        input.setAttribute('aria-label', `Only ${label}`);
        input.className = 'flint-filter-switch';
        input.checked = has(true);
        input.title = `On: only rows where ${label} is true`;
        input.addEventListener('change', () => set(input.checked ? { in: [true] } : null));
        container.append(input);
        return true;
    }
    if (widget === 'range') {
        renderRange(container, descriptor, current, set, true);
        return true;
    }
    if (values.length <= INLINE_LIMIT) {
        // Several at once: each click adds or removes a value, and none chosen means all.
        const multiple = widget === 'checkboxes';
        const row = group(multiple ? 'group' : 'radiogroup');
        if (!multiple) applyStyles(row, { flexWrap: 'nowrap', gap: '2px', padding: '1px', border: `1px solid ${BORDER}`, borderRadius: '999px', overflowX: 'auto' });
        if (!descriptor.required) {
            const all = pill('All', !chosen, !multiple);
            all.addEventListener('click', () => set(null));
            row.append(all);
        }
        for (const value of values) {
            const option = pill(formatValue(value), has(value), !multiple);
            option.addEventListener('click', () => {
                if (!multiple) {
                    if (!has(value)) set({ in: [value] });
                    return;
                }
                const next = has(value)
                    ? chosen!.filter((candidate) => !sameFilterValue(candidate, value))
                    : [...(chosen ?? []), value];
                set(next.length === 0 || next.length === values.length ? null : { in: next });
            });
            row.append(option);
        }
        return true;
    }
    if (widget === 'checkboxes') return false;
    if (isOrdered(values)) {
        // Many ordered values, one at a time: a slider with the value beside it. A field that may
        // show everything keeps All as the slider's first stop, so one control covers both.
        const offset = descriptor.required ? 0 : 1;
        const index = chosen?.length === 1 ? values.findIndex((value) => sameFilterValue(chosen[0], value)) : -1;
        const text = (position: number): string => position < offset ? 'All' : formatValue(values[position - offset]);
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = String(values.length - 1 + offset);
        slider.step = '1';
        slider.value = String(index >= 0 ? index + offset : descriptor.required ? values.length - 1 : 0);
        slider.className = 'flint-filter-step';
        slider.setAttribute('aria-label', label);
        const readout = steadyText(Array.from({ length: values.length + offset }, (_, position) => text(position)));
        readout.element.style.flex = 'none';
        const show = (): void => {
            const current = text(Number(slider.value));
            readout.set(current);
            slider.setAttribute('aria-valuetext', current);
        };
        show();
        applyStyles(slider, { flex: '1 1 80px', minWidth: '60px', margin: '0' });
        slider.addEventListener('input', () => {
            show();
            const position = Number(slider.value);
            set(position < offset ? null : { in: [values[position - offset]] });
        });
        const row = group('group');
        row.style.flexWrap = 'nowrap';
        row.style.gap = '8px';
        row.append(slider, readout.element);
        return true;
    }
    // Many values without an order, one at a time: the chip opens a searchable list.
    return false;
}
/**
 * Draws one filter-controls definition's controls. Above or below the chart, each field is
 * a row of its own whose control works in one click or drag; in a narrow host one button
 * holds every widget. The controls sit outside the plot, so the chart keeps its size.
 */
export function mountFilterStrip(options: FilterStripOptions): MountedFilterStrip {
    const { root, descriptors, runtime, placement, dispatch } = options;
    ensureFilterStyles();
    const strip = document.createElement('div');
    strip.className = 'flint-filter-controls';
    strip.dataset.flintFilterPlacement = placement;
    strip.setAttribute('role', 'group');
    strip.setAttribute('aria-label', 'Filters');
    applyStyles(strip, {
        position: 'relative', fontSize: '12px', lineHeight: '18px', color: TEXT, boxSizing: 'border-box',
        // Zero width with a full minimum fills the chart's column without widening it.
        gridColumn: '1 / -1', gridRow: placement === 'top' ? '1' : '3', width: '0', minWidth: '100%',
    });
    applyStyles(strip, {
        display: 'grid', gridTemplateColumns: 'max-content minmax(0, 1fr)',
        alignItems: 'center', columnGap: '10px', rowGap: '6px',
    });

    let popover: HTMLElement | undefined;
    let openChip: HTMLButtonElement | undefined;
    const filters = (): Readonly<Record<string, FilterValue>> => runtime.getFilters();
    // A required field at its default value is the chart as authored, not a filter the reader set.
    const changed = (field: string): boolean => {
        const filter = filters()[field];
        const fallback = runtime.getDefaults()[field];
        return !!filter && (!fallback || JSON.stringify(filter) !== JSON.stringify(fallback));
    };
    // The control that set a value already shows it; drawing it again would end a drag.
    let origin: string | undefined;
    // Each filter lays the chart out again, wider or narrower. From the first change the rows
    // keep the width they had, so the control under the pointer does not move or resize mid-drag.
    let held = false;
    const setField = (field: string) => (value: FilterValue | null): void => {
        origin = field;
        if (!held && strip.offsetWidth > 0) {
            held = true;
            applyStyles(strip, { width: `${strip.offsetWidth}px`, minWidth: '0' });
        }
        dispatch({ field, value });
    };

    const closePopover = (restoreFocus = false): void => {
        popover?.remove();
        popover = undefined;
        openChip?.setAttribute('aria-expanded', 'false');
        if (restoreFocus) openChip?.focus();
        openChip = undefined;
    };
    const openPopover = (chip: HTMLButtonElement, title: string, fill: (panel: HTMLElement) => void): void => {
        const reopening = openChip === chip;
        closePopover();
        if (reopening) return;
        const panel = document.createElement('div');
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', title);
        panel.className = 'flint-filter-popover';
        applyStyles(panel, {
            position: 'absolute', zIndex: '20',
            minWidth: '180px', maxWidth: '260px', maxHeight: '280px', overflow: 'auto',
            padding: '8px 10px', boxSizing: 'border-box', background: '#fff', color: TEXT,
            border: `1px solid ${BORDER}`, borderRadius: '8px', boxShadow: '0 6px 18px rgba(31, 41, 55, 0.16)',
            fontSize: '12px', textAlign: 'left',
        });
        const stripRect = strip.getBoundingClientRect();
        const chipRect = chip.getBoundingClientRect();
        const scale = strip.offsetWidth > 0 ? stripRect.width / strip.offsetWidth : 1;
        // Under the chart the panel opens upward, over the plot rather than past the host.
        if (placement === 'bottom') panel.style.bottom = `${(stripRect.bottom - chipRect.top) / scale + 4}px`;
        else panel.style.top = `${(chipRect.bottom - stripRect.top) / scale + 4}px`;
        panel.style.left = `${(chipRect.left - stripRect.left) / scale}px`;
        fill(panel);
        strip.append(panel);
        popover = panel;
        openChip = chip;
        chip.setAttribute('aria-expanded', 'true');
        (panel.querySelector<HTMLElement>('[aria-selected="true"]') ?? panel.querySelector<HTMLElement>('input, select, button'))?.focus();
    };

    const refreshers: (() => void)[] = [];
    for (const descriptor of descriptors) {
        const name = document.createElement('div');
        name.textContent = descriptor.label;
        name.dataset.flintFilterLabel = descriptor.field;
        applyStyles(name, { color: MUTED_TEXT, whiteSpace: 'nowrap', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' });
        const control = document.createElement('div');
        control.dataset.flintFilterField = descriptor.field;
        applyStyles(control, { display: 'flex', alignItems: 'center', gap: '6px', minWidth: '0' });
        strip.append(name, control);
        let drawn = false;
        refreshers.push(() => {
            const active = document.activeElement;
            // Redrawing a slider mid-drag would drop the thumb, and it already shows its value.
            if (drawn && origin === descriptor.field && active instanceof HTMLInputElement
                && active.type === 'range' && control.contains(active)) return;
            drawn = true;
            const focused = control.contains(document.activeElement)
                ? (document.activeElement as HTMLElement).dataset.flintFilterOption ?? (document.activeElement as HTMLElement).getAttribute('aria-label')
                : undefined;
            control.replaceChildren();
            const filter = filters()[descriptor.field];
            if (renderInline(control, descriptor, filter, setField(descriptor.field))) {
                if (focused) {
                    [...control.querySelectorAll<HTMLElement>('button, input, select')]
                        .find((element) => (element.dataset.flintFilterOption ?? element.getAttribute('aria-label')) === focused)
                        ?.focus();
                }
                return;
            }
            // Many values: a dropdown chip opens the searchable list.
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'flint-filter-chip';
            chip.setAttribute('aria-haspopup', 'dialog');
            chip.setAttribute('aria-expanded', String(openChip !== undefined && popover?.dataset.flintFilterFor === descriptor.field));
            const words = document.createElement('span');
            applyStyles(words, { overflow: 'hidden', textOverflow: 'ellipsis', minWidth: '0' });
            words.textContent = summarizeFilter(descriptor, filter);
            const caret = document.createElement('span');
            caret.textContent = '▾';
            caret.setAttribute('aria-hidden', 'true');
            chip.append(words, caret);
            chip.title = `${descriptor.label}: ${words.textContent}`;
            chipStyles(chip, changed(descriptor.field));
            chip.addEventListener('click', () => openPopover(chip, `Filter ${descriptor.label}`, (panel) => {
                panel.dataset.flintFilterFor = descriptor.field;
                renderWidget(panel, descriptor, filters()[descriptor.field], setField(descriptor.field),
                    descriptor.widget === 'select' ? () => closePopover(true) : undefined);
            }));
            control.append(chip);
        });
    }
    // Each row returns to all on its own (All, the switch, the range's ends), so the rows need no Clear.
    const render = (): void => {
        for (const refresh of refreshers) refresh();
        origin = undefined;
    };

    const onPointerDown = (event: PointerEvent): void => {
        if (popover && !strip.contains(event.target as Node)) closePopover();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape' && popover) {
            event.stopPropagation();
            closePopover(true);
        }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    strip.addEventListener('keydown', onKeyDown);
    const unsubscribe = runtime.subscribe(render);
    render();
    root.append(strip);
    // Beside a narrow chart a label column would squeeze the controls, so each label goes above its own.
    if (strip.clientWidth > 0 && strip.clientWidth < STACKED_WIDTH) {
        applyStyles(strip, { gridTemplateColumns: 'minmax(0, 1fr)', rowGap: '2px' });
        for (const label of strip.querySelectorAll<HTMLElement>('[data-flint-filter-label]')) label.style.maxWidth = '';
        for (const control of strip.querySelectorAll<HTMLElement>('[data-flint-filter-field]')) control.style.marginBottom = '6px';
    }
    return {
        element: strip,
        placement,
        destroy() {
            unsubscribe();
            document.removeEventListener('pointerdown', onPointerDown, true);
            strip.remove();
        },
    };
}

export interface FilterEmptyNoticeOptions {
    /** The chart and its rails; the notice covers it. */
    readonly body: HTMLElement;
    readonly runtimes: readonly FilterControlsRuntime[];
    readonly onClear: () => void;
    readonly plotBox?: PlotBox;
}

/**
 * When the filters leave no row, the chart keeps its last frame with data and this
 * notice dims it, says so, and offers to clear the filters, so the chart never collapses.
 */
export function mountFilterEmptyNotice(options: FilterEmptyNoticeOptions): { destroy(): void } {
    const { body, runtimes, onClear, plotBox } = options;
    const veil = document.createElement('div');
    veil.className = 'flint-filter-empty';
    veil.setAttribute('role', 'status');
    applyStyles(veil, {
        position: 'absolute', inset: '0', zIndex: '2', display: 'none',
        alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255, 255, 255, 0.72)', color: TEXT, fontSize: '13px',
    });
    const card = document.createElement('div');
    applyStyles(card, {
        display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px',
        background: '#fff', border: `1px solid ${BORDER}`, borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(31, 41, 55, 0.12)',
    });
    const message = document.createElement('span');
    message.textContent = 'No rows match these filters';
    const clear = button('Clear filters');
    clear.className = 'flint-filter-clear flint-filter-link';
    applyStyles(clear, { textDecoration: 'underline', fontWeight: '600' });
    clear.addEventListener('click', onClear);
    card.append(message, clear);
    veil.append(card);
    if (getComputedStyle(body).position === 'static') body.style.position = 'relative';
    body.append(veil);

    const render = (): void => {
        const empty = runtimes.some((runtime) => runtime.isEmpty());
        veil.style.display = empty ? 'flex' : 'none';
        if (!empty) return;
        // Centre the card on the plot rather than on the chart with its legend.
        const plot = plotBox?.();
        if (plot && plot.width > 0) {
            const half = card.offsetWidth / 2;
            const centre = Math.min(Math.max(plot.left + plot.width / 2, half + 4), Math.max(half + 4, body.clientWidth - half - 4));
            applyStyles(card, { position: 'absolute', left: `${centre}px`, top: `${plot.top + plot.height / 2}px`, transform: 'translate(-50%, -50%)' });
        }
    };
    const unsubscribes = runtimes.map((runtime) => runtime.subscribe(render));
    render();
    return {
        destroy() {
            for (const unsubscribe of unsubscribes) unsubscribe();
            veil.remove();
        },
    };
}
