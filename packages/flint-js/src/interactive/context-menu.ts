import type { SemanticTarget } from '../core/interaction-contracts';
import {
    brushX,
    brushY,
    clickHighlight,
    contextActivate,
    lassoSelect,
    longPress,
    select,
    type CanvasInteractionDef,
    type FlintInteractionEventDetail,
    type InteractionDef,
} from './interactions';
import type { InteractionResetGesture } from './reset';

/** One action the menu lists. The host performs it when the reader picks it. */
export interface ContextMenuItem {
    id: string;
    label: string;
}

/** How the reader picks the marks the menu acts on. */
export type ContextMenuGesture = 'rectangle' | 'lasso' | 'brush-x' | 'brush-y' | 'click' | 'right-click' | 'long-press';

export interface ContextMenuOptions {
    id?: string;
    /** The actions the menu lists. Picking one emits a `menu-select` event whose `item` is the action's id and whose target is the selected marks. */
    items: readonly ContextMenuItem[];
    /**
     * How the reader picks the marks. Defaults to 'rectangle'. A rectangle or brush stays on screen to move or resize;
     * a click or a long press picks one mark; a right-click opens the menu on a mark without highlighting it.
     */
    gesture?: ContextMenuGesture;
    dimOpacity?: number;
    /** Gestures that clear the selection and close the menu. */
    reset?: readonly InteractionResetGesture[];
    /** False draws nothing; the host draws its own menu from the selection events. Defaults to true. */
    render?: boolean;
}

export type ContextMenuDef = CanvasInteractionDef & {
    readonly preset: 'context-menu';
    readonly contextMenu: { readonly options: Readonly<ContextMenuOptions> };
};

export function isContextMenu(interaction: InteractionDef): interaction is ContextMenuDef {
    return 'contextMenu' in interaction && !!(interaction as Partial<ContextMenuDef>).contextMenu;
}

const SELECTION_ACTIONS = new Set([
    'select-region', 'select-lasso', 'brush-x', 'brush-y', 'brush-angle',
    'click-element', 'context-element', 'long-press-element',
]);

/**
 * What one of the menu's own selection events means for it: the marks to act on when
 * a selection commits, null when it clears or holds nothing, undefined otherwise.
 */
export function menuSelection(detail: FlintInteractionEventDetail, menuId: string): SemanticTarget | null | undefined {
    const { action, phase, operation, target } = detail.event;
    if (detail.interactionId !== menuId || !SELECTION_ACTIONS.has(action) || phase !== 'commit') return undefined;
    return operation === 'clear' || !target?.elements.length ? null : target;
}

function selectionFor(id: string, options: ContextMenuOptions): CanvasInteractionDef {
    const { dimOpacity, reset } = options;
    switch (options.gesture ?? 'rectangle') {
        case 'lasso': return lassoSelect({ id, dimOpacity, reset });
        case 'brush-x': return brushX({ id, dimOpacity, reset, mode: 'stateful' });
        case 'brush-y': return brushY({ id, dimOpacity, reset, mode: 'stateful' });
        case 'click': return clickHighlight({ id, dimOpacity, reset, targets: ['mark'] });
        case 'right-click': return contextActivate({ id });
        case 'long-press': return longPress({ id, dimOpacity, reset });
        default: return select({ id, dimOpacity, reset, mode: 'stateful' });
    }
}

/**
 * A menu of host actions that opens beside the marks the reader picks. `gesture` sets
 * how they pick them, a rectangle by default; picking an item emits a `menu-select`
 * event naming the item, with the picked marks as its target. The host performs it.
 */
export function contextMenu(options: ContextMenuOptions): ContextMenuDef {
    const id = options.id ?? 'context-menu';
    if (!Array.isArray(options.items) || options.items.length === 0) {
        throw new Error(`contextMenu "${id}": items must list at least one { id, label }.`);
    }
    const seen = new Set<string>();
    for (const item of options.items) {
        if (!item || typeof item.id !== 'string' || typeof item.label !== 'string') {
            throw new Error(`contextMenu "${id}": each item needs a string id and label.`);
        }
        if (seen.has(item.id)) throw new Error(`contextMenu "${id}": the item id "${item.id}" appears twice.`);
        seen.add(item.id);
    }
    const { id: _id, ...presetOptions } = options;
    return { ...selectionFor(id, options), preset: 'context-menu', presetOptions, contextMenu: { options } };
}

const TEXT = '#1f2937';
const MUTED_TEXT = 'rgba(31, 41, 55, 0.62)';
const BORDER = 'rgba(31, 41, 55, 0.18)';
const HOVER_FILL = 'rgba(31, 41, 55, 0.08)';

function applyStyles(element: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
    Object.assign(element.style, styles);
}

/** Draws the menu inside the surface's root and opens it where a selection is committed. */
export function mountContextMenu(root: HTMLElement, definition: ContextMenuDef): { destroy(): void } {
    const { options } = definition.contextMenu;
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Selection actions');
    menu.dataset.flintContextMenu = '';
    applyStyles(menu, {
        // Above the selection guide and every overlay the chart draws.
        position: 'absolute', zIndex: '20', display: 'none', minWidth: '150px', padding: '4px',
        border: `1px solid ${BORDER}`, borderRadius: '6px', background: '#fff', color: TEXT,
        boxShadow: '0 4px 14px rgba(31, 41, 55, 0.16)', font: '12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif',
    });
    const caption = document.createElement('div');
    applyStyles(caption, { padding: '4px 8px 6px', color: MUTED_TEXT, fontSize: '11px' });
    const buttons = options.items.map((item) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('role', 'menuitem');
        button.textContent = item.label;
        applyStyles(button, {
            display: 'block', width: '100%', padding: '6px 8px', border: '0', borderRadius: '4px',
            background: 'transparent', color: TEXT, font: 'inherit', textAlign: 'left', cursor: 'pointer',
        });
        const highlight = (on: boolean) => { button.style.background = on ? HOVER_FILL : 'transparent'; };
        button.addEventListener('pointerenter', () => highlight(true));
        button.addEventListener('pointerleave', () => highlight(false));
        button.addEventListener('focus', () => highlight(true));
        button.addEventListener('blur', () => highlight(false));
        button.addEventListener('click', () => choose(item.id));
        return button;
    });
    menu.append(caption, ...buttons);
    if (getComputedStyle(root).position === 'static') root.style.position = 'relative';
    root.append(menu);

    let selection: SemanticTarget | null = null;
    let pointer: { x: number; y: number } | null = null;

    const close = (): void => {
        menu.style.display = 'none';
        selection = null;
    };
    const open = (target: SemanticTarget): void => {
        selection = target;
        const count = target.elements.length;
        caption.textContent = `${count} selected`;
        menu.style.display = 'block';
        const rect = root.getBoundingClientRect();
        // A host that scales the chart scales the root; offsets are in its own pixels.
        const scale = root.offsetWidth > 0 ? rect.width / root.offsetWidth : 1;
        const width = menu.offsetWidth;
        const height = menu.offsetHeight;
        const x = pointer ? (pointer.x - rect.left) / scale + 8 : root.offsetWidth - width;
        const y = pointer ? (pointer.y - rect.top) / scale + 8 : 0;
        menu.style.left = `${Math.max(0, Math.min(x, root.offsetWidth - width))}px`;
        menu.style.top = `${Math.max(0, Math.min(y, root.offsetHeight - height))}px`;
    };
    function choose(item: string): void {
        if (!selection) return;
        const detail: FlintInteractionEventDetail = {
            chartId: root.dataset.flintChartId ?? '',
            interactionId: definition.id,
            timestamp: Date.now(),
            event: { action: 'menu-select', phase: 'commit', geometry: {}, target: selection, item },
        };
        close();
        root.dispatchEvent(new CustomEvent<FlintInteractionEventDetail>('flint-interaction', {
            detail, bubbles: true, composed: true,
        }));
    }

    const onPointer = (event: PointerEvent): void => { pointer = { x: event.clientX, y: event.clientY }; };
    const onInteraction = (event: Event): void => {
        const detail = (event as CustomEvent<FlintInteractionEventDetail>).detail;
        const target = menuSelection(detail, definition.id);
        if (target === undefined) return;
        if (target) open(target);
        else close();
    };
    const onPointerDown = (event: PointerEvent): void => {
        if (menu.style.display !== 'none' && !menu.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
        if (menu.style.display === 'none') return;
        if (event.key === 'Escape') {
            close();
            return;
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        // The arrows enter the menu from the chart, then cycle its items.
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const next = index < 0 ? (step > 0 ? 0 : buttons.length - 1) : (index + step + buttons.length) % buttons.length;
        buttons[next]?.focus({ preventScroll: true });
    };
    // A long press commits before the release, so the press point counts too.
    root.addEventListener('pointerdown', onPointer, true);
    root.addEventListener('pointerup', onPointer, true);
    root.addEventListener('flint-interaction', onInteraction);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return {
        destroy() {
            root.removeEventListener('pointerdown', onPointer, true);
            root.removeEventListener('pointerup', onPointer, true);
            root.removeEventListener('flint-interaction', onInteraction);
            document.removeEventListener('pointerdown', onPointerDown, true);
            document.removeEventListener('keydown', onKeyDown);
            menu.remove();
        },
    };
}
