import React from 'react';
import type { RetrievalState } from '../../services/types';
import type { Value, Goal, Project, Task } from '../../types/planner';

interface LineageBreadcrumbProps {
    retrievalState: RetrievalState;
    values: Value[];
    goals: Goal[];
    projects: Project[];
    tasks: Task[];
}

const findName = <T extends { id: number; name: string }>(
    items: T[],
    id: number | null | undefined,
): string | null => (id == null ? null : items.find(i => i.id === id)?.name ?? null);

const formatRelative = (iso: string): string => {
    if (!iso) return '';
    const now = Date.now();
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return iso;
    const diff = Math.max(0, now - then);
    const day = 24 * 60 * 60 * 1000;
    const hour = 60 * 60 * 1000;
    const minute = 60 * 1000;
    if (diff >= day) {
        const d = Math.round(diff / day);
        return `${d} day${d === 1 ? '' : 's'} ago`;
    }
    if (diff >= hour) {
        const h = Math.round(diff / hour);
        return `${h} hour${h === 1 ? '' : 's'} ago`;
    }
    const m = Math.max(1, Math.round(diff / minute));
    return `${m} minute${m === 1 ? '' : 's'} ago`;
};

export const LineageBreadcrumb: React.FC<LineageBreadcrumbProps> = ({
    retrievalState,
    values,
    goals,
    projects,
    tasks,
}) => {
    const { lineage, segmentIds, freshness } = retrievalState;
    if (!segmentIds || segmentIds.length === 0) return null;

    const parts = [
        findName(values, lineage.valueId),
        findName(goals, lineage.goalId),
        findName(projects, lineage.projectId),
        findName(tasks, lineage.taskId),
    ].filter(Boolean) as string[];

    const path = parts.length ? parts.join(' › ') : '(no lineage)';
    const fresh = freshness ? formatRelative(freshness) : null;
    const segCount = `${segmentIds.length} segment${segmentIds.length === 1 ? '' : 's'}`;

    const suffix = [fresh, segCount].filter(Boolean).join(' · ');

    return (
        <div className="flex items-center text-[11px] text-gray-500 px-2 py-1" role="note" aria-label="Retrieved context lineage">
            <span className="font-medium mr-1">Loading:</span>
            <span>{path}</span>
            {suffix && <span className="ml-2">· {suffix}</span>}
        </div>
    );
};
