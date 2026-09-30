import type { AccessibleElementDescription } from '../../../interactive/language/events';
import type { AccessibleNavigationSettings } from '../../../interactive/triggers';
import { clientRectToLayoutRect, type RendererCoordinateSpace } from '../hit-adapter';
import {
    AccessibleNavigator,
    accessibleCommandForKey,
    describeAccessibleNode,
    type AccessibleNode,
} from './model';

export interface AccessibleNavigationControllerOptions {
    container: HTMLElement;
    settings: AccessibleNavigationSettings;
    buildTree(): AccessibleNode;
    coordinateSpace(): RendererCoordinateSpace;
    containerLayoutSize(): { width: number; height: number };
    /** The reader focused an element: emphasise its data and report it. */
    present(node: AccessibleNode, description: AccessibleElementDescription): void;
    /** The reader left the chart, or stepped back to it as a whole. */
    clear(): void;
    /** Space or Enter on a mark, legend entry, or axis label: what a click would do. False when nothing listens. */
    activate(node: AccessibleNode): boolean;
}

export interface AccessibleNavigationController {
    /** The element the reader is on. */
    current(): AccessibleNode;
    /** Rebuild after the chart re-rendered, keeping the reader's place. */
    refresh(): void;
    destroy(): void;
}

const FOCUS_COLOR = '#0b57d0';

const VISUALLY_HIDDEN: Partial<CSSStyleDeclaration> = {
    position: 'absolute', width: '1px', height: '1px', margin: '-1px', padding: '0', border: '0',
    overflow: 'hidden', clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)', whiteSpace: 'nowrap',
};

/**
 * One tab stop into the chart. The focused element is a transparent proxy laid
 * over the rendered element: it carries the announcement as its accessible name,
 * draws the focus ring, and receives the keys. Each move focuses a fresh proxy,
 * so a screen reader speaks the new element as a focus change.
 */
export function mountAccessibleNavigation(options: AccessibleNavigationControllerOptions): AccessibleNavigationController {
    const { container, settings } = options;
    const navigator = new AccessibleNavigator(options.buildTree);
    const layer = document.createElement('div');
    const caption = document.createElement('div');
    const live = document.createElement('div');
    layer.dataset.flintAccessibleNavigation = '';
    layer.setAttribute('role', 'application');
    layer.setAttribute('aria-roledescription', 'interactive chart');
    Object.assign(layer.style, {
        position: 'absolute', inset: '0', zIndex: '6', pointerEvents: 'none', overflow: 'visible',
    });
    caption.dataset.flintAccessibleCaption = '';
    caption.setAttribute('aria-hidden', 'true');
    Object.assign(caption.style, {
        position: 'absolute', display: 'none', maxWidth: '280px', padding: '6px 8px',
        border: '1px solid #c7ccd1', borderRadius: '4px', background: 'rgba(255,255,255,0.97)', color: '#1f2328',
        font: '12px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif', boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
        pointerEvents: 'none', zIndex: '7', boxSizing: 'border-box',
    });
    live.dataset.flintAccessibleLive = '';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    Object.assign(live.style, VISUALLY_HIDDEN);
    layer.append(caption, live);
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.append(layer);

    let proxy: HTMLElement | undefined;
    let active = false;

    const layoutRect = (node: AccessibleNode): { left: number; top: number; width: number; height: number } | undefined => {
        const bounds = node.bounds;
        if (!bounds) return undefined;
        const space = options.coordinateSpace();
        const renderer = container.querySelector('svg, canvas') as HTMLElement | null;
        if (!renderer || space.logicalWidth <= 0 || space.logicalHeight <= 0) return undefined;
        const containerRect = container.getBoundingClientRect();
        const rendererLayout = clientRectToLayoutRect(renderer.getBoundingClientRect(), containerRect, options.containerLayoutSize());
        const scaleX = rendererLayout.width / space.logicalWidth;
        const scaleY = rendererLayout.height / space.logicalHeight;
        const pad = node.kind === 'chart' ? 0 : 3;
        const left = rendererLayout.left + (bounds.x1 + space.originX) * scaleX - pad;
        const top = rendererLayout.top + (bounds.y1 + space.originY) * scaleY - pad;
        const width = Math.max(8, (bounds.x2 - bounds.x1) * scaleX + pad * 2);
        const height = Math.max(8, (bounds.y2 - bounds.y1) * scaleY + pad * 2);
        if (node.kind !== 'chart') return { left, top, width, height };
        // The chart itself is framed by its renderer.
        return { left: rendererLayout.left, top: rendererLayout.top, width: rendererLayout.width, height: rendererLayout.height };
    };

    const styleProxy = (element: HTMLElement, node: AccessibleNode): void => {
        const rect = layoutRect(node);
        const round = node.shape === 'point';
        Object.assign(element.style, {
            position: 'absolute', boxSizing: 'border-box', pointerEvents: 'none', outline: 'none',
            left: `${rect?.left ?? 0}px`, top: `${rect?.top ?? 0}px`,
            width: `${round && rect ? Math.max(rect.width, 14) : rect?.width ?? 0}px`,
            height: `${round && rect ? Math.max(rect.height, 14) : rect?.height ?? 0}px`,
            borderRadius: round ? '50%' : '4px',
            border: active && node.kind !== 'chart' ? `2px solid ${FOCUS_COLOR}` : '2px solid transparent',
            boxShadow: active
                ? node.kind === 'chart'
                    ? `inset 0 0 0 2px ${FOCUS_COLOR}`
                    : '0 0 0 2px rgba(255,255,255,0.95), 0 0 0 4px rgba(11,87,208,0.35)'
                : 'none',
        });
        if (round && rect) {
            // Keep a point's ring centred when it grows to its minimum size.
            const width = Math.max(rect.width, 14);
            const height = Math.max(rect.height, 14);
            element.style.left = `${rect.left + rect.width / 2 - width / 2}px`;
            element.style.top = `${rect.top + rect.height / 2 - height / 2}px`;
        }
    };

    const renderCaption = (node: AccessibleNode, description: AccessibleElementDescription): void => {
        if (!settings.caption || !active) {
            caption.style.display = 'none';
            return;
        }
        const heading = document.createElement('div');
        const body = document.createElement('div');
        heading.style.fontWeight = '600';
        heading.textContent = node.kind === 'chart'
            ? 'Chart'
            : `${description.type}${description.position && description.position.count > 1
                ? ` ${description.position.index} of ${description.position.count}` : ''}`;
        body.textContent = node.kind === 'chart' ? description.text : description.content;
        const hint = document.createElement('div');
        Object.assign(hint.style, { color: '#59636e', marginTop: '2px', fontSize: '11px' });
        hint.textContent = node.children.length > 0
            ? `Enter: ${node.children.length} inside · Esc: back · H: help`
            : 'Arrows: move · Esc: back · H: help';
        caption.replaceChildren(heading, body, hint);
        caption.style.display = 'block';
        const rect = layoutRect(node);
        const size = options.containerLayoutSize();
        const captionWidth = caption.offsetWidth || 240;
        const captionHeight = caption.offsetHeight || 48;
        const gap = 8;
        let left = rect ? rect.left : 0;
        let top = rect ? rect.top + rect.height + gap : 0;
        if (node.kind === 'chart' || (rect && top + captionHeight > size.height && rect.top - gap - captionHeight >= 0)) {
            top = node.kind === 'chart' ? size.height + gap : rect!.top - gap - captionHeight;
        }
        left = Math.max(0, Math.min(left, Math.max(0, size.width - captionWidth)));
        caption.style.left = `${left}px`;
        caption.style.top = `${top}px`;
    };

    const announce = (message: string): void => {
        // A repeated message must still change the region's text to be spoken again.
        live.textContent = live.textContent === message ? `${message}\u00a0` : message;
    };

    const show = (node: AccessibleNode, focusElement: boolean): void => {
        const description = describeAccessibleNode(node);
        layer.setAttribute('aria-label', describeAccessibleNode(navigator.root).text);
        const next = document.createElement('div');
        next.tabIndex = 0;
        next.dataset.flintAccessibleFocus = node.kind;
        next.setAttribute('role', 'img');
        next.setAttribute('aria-label', description.text);
        styleProxy(next, node);
        const previous = proxy;
        layer.insertBefore(next, caption);
        proxy = next;
        if (focusElement) next.focus({ preventScroll: true });
        previous?.remove();
        if (active) {
            renderCaption(node, description);
            if (node.kind === 'chart') options.clear();
            else options.present(node, description);
        }
    };

    const setActive = (value: boolean): void => {
        if (active === value) return;
        active = value;
        if (proxy) styleProxy(proxy, navigator.current);
        if (!active) {
            caption.style.display = 'none';
            options.clear();
        }
    };

    const onFocusIn = (event: FocusEvent): void => {
        if (event.target !== proxy) return;
        if (!active) {
            navigator.refresh();
            setActive(true);
            show(navigator.current, true);
        }
    };
    const onFocusOut = (event: FocusEvent): void => {
        if (event.relatedTarget instanceof Node && layer.contains(event.relatedTarget)) return;
        setActive(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
        const command = accessibleCommandForKey(event);
        if (!command) return;
        navigator.refresh();
        const move = navigator.run(command);
        if (move.exited) {
            // Escape on the chart itself leaves the walk; other presets may still reset on it.
            setActive(false);
            announce('Left chart navigation. Press Tab to move on, or an arrow key to resume.');
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const wasActive = active;
        if (!active) setActive(true);
        if (move.moved) {
            live.textContent = '';
            show(move.node, true);
        } else if (move.activate) {
            // With no click preset to run, activation reads the element again.
            announce(options.activate(move.node)
                ? `Activated ${describeAccessibleNode(move.node).type.toLowerCase()}.`
                : describeAccessibleNode(move.node).text);
        } else {
            // A key that moves nowhere still restores the ring and caption after an exit.
            if (!wasActive) show(move.node, true);
            if (move.message) announce(move.message);
        }
    };
    layer.addEventListener('focusin', onFocusIn);
    layer.addEventListener('focusout', onFocusOut);
    layer.addEventListener('keydown', onKeyDown);
    show(navigator.current, false);

    return {
        current: () => navigator.current,
        refresh() {
            navigator.refresh();
            if (!proxy) return;
            const node = navigator.current;
            styleProxy(proxy, node);
            const description = describeAccessibleNode(node);
            proxy.setAttribute('aria-label', description.text);
            layer.setAttribute('aria-label', describeAccessibleNode(navigator.root).text);
            if (active) renderCaption(node, description);
        },
        destroy() {
            layer.removeEventListener('focusin', onFocusIn);
            layer.removeEventListener('focusout', onFocusOut);
            layer.removeEventListener('keydown', onKeyDown);
            layer.remove();
        },
    };
}
