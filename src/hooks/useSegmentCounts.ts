import { useEffect, useState, useCallback } from 'react';
import type { Value, Goal, Project, Task } from '../types/planner';

export type SegmentCountLevel = 'value' | 'goal' | 'project' | 'task';

export type SegmentCounts = {
    counts: Record<string, number>; // key: `${level}:${id}` → count
    loading: boolean;
    refetch: () => void;
};

const countKey = (level: SegmentCountLevel, id: number) => `${level}:${id}`;

const fetchLevel = async (
    level: SegmentCountLevel,
    ids: number[],
): Promise<Record<number, number>> => {
    if (ids.length === 0) return {};
    const url = `/api/segments/counts?level=${level}&ids=${ids.join(',')}`;
    const resp = await fetch(url);
    if (!resp.ok) return {};
    const body = await resp.json();
    return body?.counts ?? {};
};

// Aggregates segment counts for every Value/Goal/Project/Task in the planner.
// Fires one HTTP request per non-empty level. Returns a flat object keyed by
// `${level}:${id}` so callers can do `counts[`project:${p.id}`] ?? 0` without
// caring which level the lookup targets.
export const useSegmentCounts = (
    values: Value[],
    goals: Goal[],
    projects: Project[],
    tasks: Task[],
): SegmentCounts => {
    const [counts, setCounts] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(false);
    const [tick, setTick] = useState(0);

    // Stable per-level id strings — re-fetch only when the membership changes.
    const valueIds = values.map(v => v.id).join(',');
    const goalIds = goals.map(g => g.id).join(',');
    const projectIds = projects.map(p => p.id).join(',');
    const taskIds = tasks.map(t => t.id).join(',');

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        const work = async () => {
            const [vc, gc, pc, tc] = await Promise.all([
                fetchLevel('value', values.map(v => v.id)),
                fetchLevel('goal', goals.map(g => g.id)),
                fetchLevel('project', projects.map(p => p.id)),
                fetchLevel('task', tasks.map(t => t.id)),
            ]);
            if (cancelled) return;
            const next: Record<string, number> = {};
            for (const [id, c] of Object.entries(vc)) next[countKey('value', Number(id))] = c as number;
            for (const [id, c] of Object.entries(gc)) next[countKey('goal', Number(id))] = c as number;
            for (const [id, c] of Object.entries(pc)) next[countKey('project', Number(id))] = c as number;
            for (const [id, c] of Object.entries(tc)) next[countKey('task', Number(id))] = c as number;
            // Preserve identity when nothing actually changed — useGraphData / dagre
            // rebuild keys on this object, so a same-content replacement would still
            // re-run the layout.
            setCounts(prev => {
                const prevKeys = Object.keys(prev);
                const nextKeys = Object.keys(next);
                if (prevKeys.length === nextKeys.length && nextKeys.every(k => prev[k] === next[k])) {
                    return prev;
                }
                return next;
            });
            setLoading(false);
        };
        work().catch(e => {
            console.error('useSegmentCounts fetch failed:', e);
            if (!cancelled) setLoading(false);
        });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [valueIds, goalIds, projectIds, taskIds, tick]);

    const refetch = useCallback(() => setTick(t => t + 1), []);

    return { counts, loading, refetch };
};

export const segmentCountKey = countKey;
