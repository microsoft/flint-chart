export interface OverlayIconButton {
    element: HTMLButtonElement;
    setVisible(visible: boolean): void;
    destroy(): void;
}

export interface OverlayIconButtonOptions {
    container: HTMLElement;
    label: string;
    icon: string;
    onActivate(): void;
    zIndex?: number;
}

export const RESET_ICON = [
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">',
    '<path d="M3.25 5.25V2.5M3.25 5.25H6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    '<path d="M3.7 5A5 5 0 1 1 3.2 10.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    '</svg>',
].join('');

/** Shared unobtrusive control for chart-local actions. */
export function createOverlayIconButton({
    container,
    label,
    icon,
    onActivate,
    zIndex = 5,
}: OverlayIconButtonOptions): OverlayIconButton {
    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = icon;
    button.title = label;
    button.setAttribute('aria-label', label);
    Object.assign(button.style, {
        position: 'absolute', zIndex: String(zIndex), width: '24px', height: '24px', padding: '5px',
        display: 'none', alignItems: 'center', justifyContent: 'center',
        border: '1px solid rgba(104, 117, 128, 0.2)', borderRadius: '5px',
        background: 'rgba(255, 255, 255, 0.94)', boxShadow: '0 1px 3px rgba(30, 42, 50, 0.14)',
        color: '#66727c', cursor: 'pointer', opacity: '1',
        transition: 'color 120ms ease, background 120ms ease, border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease',
    });
    button.addEventListener('pointerenter', () => {
        button.style.color = '#2f6f62';
        button.style.background = '#ffffff';
        button.style.borderColor = 'rgba(47, 111, 98, 0.32)';
        button.style.boxShadow = '0 2px 5px rgba(30, 42, 50, 0.18)';
    });
    button.addEventListener('pointerleave', () => {
        button.style.color = '#66727c';
        button.style.background = 'rgba(255, 255, 255, 0.94)';
        button.style.borderColor = 'rgba(104, 117, 128, 0.2)';
        button.style.boxShadow = '0 1px 3px rgba(30, 42, 50, 0.14)';
        button.style.transform = '';
    });
    button.addEventListener('pointerdown', () => { button.style.transform = 'scale(0.94)'; });
    button.addEventListener('pointerup', () => { button.style.transform = ''; });
    button.addEventListener('focus', () => {
        button.style.outline = '2px solid rgba(47, 111, 98, 0.45)';
        button.style.outlineOffset = '2px';
    });
    button.addEventListener('blur', () => { button.style.outline = 'none'; });
    button.addEventListener('click', onActivate);
    container.append(button);

    return {
        element: button,
        setVisible(visible): void {
            button.hidden = !visible;
            button.style.display = visible ? 'inline-flex' : 'none';
        },
        destroy(): void {
            button.removeEventListener('click', onActivate);
            button.remove();
        },
    };
}
