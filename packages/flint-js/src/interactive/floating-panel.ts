import { autoUpdate, computePosition, flip, hide as hideReference, offset, shift, size } from '@floating-ui/dom';

export function createFloatingPanel(options: {
    element: HTMLElement;
    container: HTMLElement;
    anchor(): DOMRect;
    gap?: number;
    maxWidth?: number;
}) {
    const { element, container } = options;
    const document = container.ownerDocument;
    const reference = { contextElement: container, getBoundingClientRect: options.anchor };
    const overflow = { boundary: [] as Element[], rootBoundary: 'viewport' as const, padding: 8 };
    const topLayer = typeof element.showPopover === 'function';
    let cleanup: (() => void) | undefined;
    let revision = 0;
    let visible = false;
    Object.assign(element.style, {
        position: 'absolute', inset: 'auto', margin: '0', boxSizing: 'border-box',
        width: 'max-content', minWidth: '0', minHeight: '0', overflow: 'auto',
        overflowWrap: 'anywhere', overscrollBehavior: 'contain', zIndex: '2147483647',
        display: 'none',
    });
    element.tabIndex = -1;
    if (topLayer) element.setAttribute('popover', 'manual');

    const hide = (): void => {
        visible = false;
        revision += 1;
        cleanup?.();
        cleanup = undefined;
        if (topLayer && element.matches(':popover-open')) element.hidePopover();
        element.style.display = 'none';
        element.remove();
    };
    const update = async (): Promise<void> => {
        if (!visible) return;
        if (!container.isConnected || !element.isConnected) {
            hide();
            return;
        }
        const ticket = ++revision;
        const position = await computePosition(reference, element, {
            strategy: 'absolute',
            placement: 'bottom-start',
            middleware: [
                offset(options.gap ?? 8),
                flip(overflow),
                shift({ ...overflow, crossAxis: true }),
                size({
                    ...overflow,
                    apply({ availableWidth, availableHeight }) {
                        if (!visible || ticket !== revision) return;
                        element.style.maxWidth = `${Math.max(0, Math.min(options.maxWidth ?? 360, availableWidth))}px`;
                        element.style.maxHeight = `${Math.max(0, availableHeight)}px`;
                    },
                }),
                hideReference({ strategy: 'referenceHidden' }),
                { ...hideReference({ strategy: 'referenceHidden', boundary: container }), name: 'containerVisibility' },
            ],
        });
        if (!visible || ticket !== revision) return;
        element.style.left = `${position.x}px`;
        element.style.top = `${position.y}px`;
        const anchorHidden = position.middlewareData.hide?.referenceHidden
            || position.middlewareData.containerVisibility?.referenceHidden;
        element.style.visibility = anchorHidden ? 'hidden' : 'visible';
    };
    return {
        show(): void {
            if (visible && element.isConnected) {
                void update();
                return;
            }
            visible = true;
            document.body.append(element);
            element.style.display = 'block';
            element.style.visibility = 'hidden';
            if (topLayer) element.showPopover();
            cleanup?.();
            cleanup = autoUpdate(reference, element, () => { void update(); }, { animationFrame: true });
        },
        hide,
        destroy: hide,
    };
}