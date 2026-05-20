import type { Value, Goal, Project, Task } from '../types/planner';

export interface Tagged {
    tags?: string[];
}

// Canonical tag form: trimmed, lowercased, internal whitespace collapsed to
// hyphens. Shared by every surface that creates tags (TagInput, TagManagerModal)
// so normalization can't diverge between them.
export const normalizeTag = (raw: string): string =>
    raw.trim().toLowerCase().replace(/\s+/g, '-');

export const collectAllTags = (
    values: Value[],
    goals: Goal[],
    projects: Project[],
    tasks: Task[],
): string[] => {
    const set = new Set<string>();
    for (const collection of [values, goals, projects, tasks]) {
        for (const item of collection) {
            if (Array.isArray(item.tags)) {
                for (const tag of item.tags) set.add(tag);
            }
        }
    }
    return Array.from(set).sort();
};

// AND semantics — item matches only when every required tag is present.
export const matchesAllTags = (item: Tagged, required: string[]): boolean => {
    if (required.length === 0) return true;
    const present = new Set(item.tags ?? []);
    return required.every(t => present.has(t));
};
