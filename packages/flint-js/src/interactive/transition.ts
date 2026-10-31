import type { ChartUpdateTransition, TransitionEasing } from './types';

/** How long a committed change animates when nothing names a duration. */
export const DEFAULT_TRANSITION_MS = 300;

export const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export const nextFrame = (callback: () => void): void => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => callback());
    else setTimeout(callback, 16);
};

export const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);
const EASINGS: Record<TransitionEasing, (t: number) => number> = { 'ease-in-out': easeInOut, linear: (t) => t };

/** The curve a named easing follows over a change's progress. */
export const easingCurve = (easing: TransitionEasing | undefined): ((t: number) => number) => EASINGS[easing ?? 'ease-in-out'];

/** Validates a transition option; throws on a negative or non-finite duration or an unknown easing. */
export function validateTransition(owner: string, transition: ChartUpdateTransition | undefined): ChartUpdateTransition | undefined {
    if (transition === undefined) return undefined;
    if (!(transition && Number.isFinite(transition.duration) && transition.duration >= 0)) {
        throw new Error(`${owner} requires a finite, non-negative transition duration.`);
    }
    if (transition.easing !== undefined && !(transition.easing in EASINGS)) {
        throw new Error(`${owner}: transition easing must be one of ${Object.keys(EASINGS).join(', ')}.`);
    }
    return transition.easing ? { duration: transition.duration, easing: transition.easing } : { duration: transition.duration };
}

/** The easing of the first transition named, from the most specific source to the least. */
export function transitionEasing(...sources: (ChartUpdateTransition | undefined)[]): TransitionEasing {
    return sources.find((source) => source !== undefined)?.easing ?? 'ease-in-out';
}

function prefersReducedMotion(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The duration a committed change animates over: the first transition named, from the most
 * specific source to the least, else the default. Reduced motion, and a page that draws no
 * animation frames, turn the default off; reduced motion turns every duration off.
 */
export function transitionDuration(...sources: (ChartUpdateTransition | undefined)[]): number {
    if (prefersReducedMotion()) return 0;
    const named = sources.find((source) => source !== undefined);
    if (named) return named.duration;
    return typeof requestAnimationFrame === 'function' ? DEFAULT_TRANSITION_MS : 0;
}

export interface Motion {
    readonly done: Promise<void>;
    cancel(): void;
}

/**
 * Runs `frame` once per animation frame with progress from 0 to 1, eased by `ease`, over `duration` ms,
 * waiting for each frame's work before the next. `frame(1)` always runs last, unless cancelled. A frame
 * that throws ends the motion where it stands, and `done` rejects with the error.
 */
export function runMotion(
    duration: number,
    frame: (t: number) => void | Promise<void>,
    ease: (t: number) => number = easeInOut,
): Motion {
    let cancelled = false;
    let finish!: () => void;
    let fail!: (error: unknown) => void;
    const done = new Promise<void>((resolve, reject) => { finish = resolve; fail = reject; });
    const stop = (error: unknown): void => { cancelled = true; fail(error); };
    // The clock starts at the first frame, so a render that delays it never eats into the motion.
    let startedAt: number | undefined;
    const step = (): void => {
        if (cancelled) return;
        startedAt ??= now();
        const t = duration > 0 ? Math.min(1, (now() - startedAt) / duration) : 1;
        let drawn: void | Promise<void>;
        try {
            drawn = frame(t >= 1 ? 1 : ease(t));
        } catch (error) {
            stop(error);
            return;
        }
        void Promise.resolve(drawn).then(() => {
            if (cancelled) return;
            if (t >= 1) finish();
            else nextFrame(step);
        }, stop);
    };
    nextFrame(step);
    return { done, cancel: () => { cancelled = true; finish(); } };
}
