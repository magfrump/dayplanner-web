import { describe, it, expect } from 'vitest';
import { collectAllTags, matchesAllTags, normalizeTag } from './tags';
import type { Value, Goal, Project, Task } from '../types/planner';

const v = (id: number, tags?: string[]): Value => ({ id, name: `v${id}`, tags });
const g = (id: number, tags?: string[]): Goal => ({ id, name: `g${id}`, valueId: 1, timeframe: '', completed: false, tags });
const p = (id: number, tags?: string[]): Project => ({ id, name: `p${id}`, goalId: 1, status: 'in_progress', completed: false, tags });
const t = (id: number, tags?: string[]): Task => ({
    id, name: `t${id}`, projectId: 1, importance: 3, urgency: 3, workType: 'focus', completed: false, tags,
});

describe('normalizeTag', () => {
    it('lowercases', () => {
        expect(normalizeTag('Health')).toBe('health');
    });

    it('collapses internal whitespace to single hyphens', () => {
        expect(normalizeTag('high   priority')).toBe('high-priority');
    });

    it('trims surrounding whitespace', () => {
        expect(normalizeTag('  errand ')).toBe('errand');
    });

    it('is idempotent', () => {
        expect(normalizeTag(normalizeTag('Deep Work'))).toBe('deep-work');
    });
});

describe('collectAllTags', () => {
    it('returns sorted unique tags across all four hierarchy levels', () => {
        const result = collectAllTags(
            [v(1, ['health']), v(2)],
            [g(1, ['work', 'health'])],
            [p(1, ['side-project'])],
            [t(1, ['health'])],
        );
        expect(result).toEqual(['health', 'side-project', 'work']);
    });

    it('returns empty array when nothing is tagged', () => {
        expect(collectAllTags([v(1)], [g(1)], [p(1)], [t(1)])).toEqual([]);
    });
});

describe('matchesAllTags', () => {
    it('matches when item has all required tags (AND semantics)', () => {
        expect(matchesAllTags(t(1, ['a', 'b', 'c']), ['a', 'b'])).toBe(true);
    });

    it('rejects when any required tag is missing', () => {
        expect(matchesAllTags(t(1, ['a']), ['a', 'b'])).toBe(false);
    });

    it('matches everything when required list is empty', () => {
        expect(matchesAllTags(t(1), [])).toBe(true);
        expect(matchesAllTags(t(1, ['a']), [])).toBe(true);
    });

    it('rejects untagged items when a tag is required', () => {
        expect(matchesAllTags(t(1), ['a'])).toBe(false);
    });
});
