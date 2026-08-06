/** True for JSON-style records, but not arrays. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Merge authored policy objects.
 *
 * Objects merge recursively. Arrays and scalar values are complete authored
 * decisions and replace the base. `undefined` means the patch did not state a
 * decision, which matters to TypeScript callers even though JSON cannot carry
 * it.
 */
export function deepMerge<T>(base: T, patch: unknown): T {
    if (!isPlainObject(patch)) return (patch === undefined ? base : patch) as T;
    const out: Record<string, unknown> = isPlainObject(base) ? { ...base } : {};
    for (const [key, value] of Object.entries(patch)) {
        out[key] = isPlainObject(value) ? deepMerge(out[key], value) : (value === undefined ? out[key] : value);
    }
    return out as T;
}
