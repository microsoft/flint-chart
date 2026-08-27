export class ScopedSelectionState {
    private legacy = new Set<string>();
    private readonly scopes = new Map<string, Set<string>>();

    combined(): Set<string> {
        return new Set([
            ...this.legacy,
            ...[...this.scopes.values()].flatMap((keys) => [...keys]),
        ]);
    }

    get(updateId?: string): ReadonlySet<string> {
        return updateId ? this.scopes.get(updateId) ?? new Set() : this.legacy;
    }

    set(keys: ReadonlySet<string>, updateId?: string): void {
        const next = new Set(keys);
        if (!updateId) {
            this.legacy = next;
        } else if (next.size > 0) {
            this.scopes.set(updateId, next);
        } else {
            this.scopes.delete(updateId);
        }
    }

    clear(updateId?: string): void {
        if (updateId) this.scopes.delete(updateId);
        else {
            this.legacy.clear();
            this.scopes.clear();
        }
    }
}