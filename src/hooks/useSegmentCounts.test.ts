/* eslint-disable @typescript-eslint/no-explicit-any */
import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSegmentCounts, segmentCountKey } from './useSegmentCounts';

const mockFetch = (responses: Record<string, Record<string, number>>) => {
    return vi.fn(async (input: string) => {
        const url = new URL(input, 'http://localhost');
        const level = url.searchParams.get('level') ?? '';
        return {
            ok: true,
            json: async () => ({ counts: responses[level] ?? {} }),
        } as Response;
    });
};

describe('useSegmentCounts', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('fetches counts for each lineage level that has ids', async () => {
        const fetchSpy = mockFetch({
            project: { 100: 3, 101: 1 },
            task: { 1000: 2 },
        });
        vi.stubGlobal('fetch', fetchSpy);

        const values = [{ id: 1 } as any];
        const goals = [{ id: 10 } as any];
        const projects = [{ id: 100 } as any, { id: 101 } as any];
        const tasks = [{ id: 1000 } as any];

        const { result } = renderHook(() => useSegmentCounts(values, goals, projects, tasks));

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.counts[segmentCountKey('project', 100)]).toBe(3);
        expect(result.current.counts[segmentCountKey('project', 101)]).toBe(1);
        expect(result.current.counts[segmentCountKey('task', 1000)]).toBe(2);
        expect(result.current.counts[segmentCountKey('value', 1)]).toBeUndefined();

        // One request per level (4 total).
        expect(fetchSpy).toHaveBeenCalledTimes(4);
    });

    it('returns empty counts when no ids exist at any level', async () => {
        const fetchSpy = mockFetch({});
        vi.stubGlobal('fetch', fetchSpy);

        const { result } = renderHook(() => useSegmentCounts([], [], [], []));

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(Object.keys(result.current.counts)).toHaveLength(0);
        // No HTTP traffic — every level is empty.
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('refetch triggers a new fetch round', async () => {
        const fetchSpy = mockFetch({ project: { 5: 1 } });
        vi.stubGlobal('fetch', fetchSpy);

        const projects = [{ id: 5 } as any];
        const { result } = renderHook(() => useSegmentCounts([], [], projects, []));
        await waitFor(() => expect(result.current.loading).toBe(false));
        const initialCalls = fetchSpy.mock.calls.length;

        act(() => {
            result.current.refetch();
        });
        await waitFor(() => expect(fetchSpy.mock.calls.length).toBeGreaterThan(initialCalls));
    });
});
