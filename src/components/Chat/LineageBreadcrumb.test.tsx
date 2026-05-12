/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LineageBreadcrumb } from './LineageBreadcrumb';

const values = [{ id: 1, name: 'Health' } as any];
const goals = [{ id: 10, name: 'Run a 5K', valueId: 1 } as any];
const projects = [{ id: 100, name: 'Training plan', goalId: 10 } as any];
const tasks = [{ id: 1000, name: 'Morning run', projectId: 100, completed: false } as any];

describe('LineageBreadcrumb', () => {
    it('renders names from current planner state and segment count', () => {
        render(
            <LineageBreadcrumb
                retrievalState={{
                    segmentIds: ['seg-1', 'seg-2', 'seg-3'],
                    lineage: { valueId: 1, goalId: 10, projectId: 100, taskId: 1000 },
                    freshness: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
                }}
                values={values}
                goals={goals}
                projects={projects}
                tasks={tasks}
            />,
        );

        expect(screen.getByText(/Loading:/)).toBeInTheDocument();
        const path = screen.getByText(/Health.*Run a 5K.*Training plan.*Morning run/);
        expect(path).toBeInTheDocument();
        expect(screen.getByText(/3 segments/)).toBeInTheDocument();
        expect(screen.getByText(/4 days ago/)).toBeInTheDocument();
    });

    it('renders nothing when segmentIds is empty', () => {
        const { container } = render(
            <LineageBreadcrumb
                retrievalState={{ segmentIds: [], lineage: {}, freshness: '' }}
                values={values}
                goals={goals}
                projects={projects}
                tasks={tasks}
            />,
        );
        expect(container.firstChild).toBeNull();
    });

    it('handles partial lineage (e.g. project but no task)', () => {
        render(
            <LineageBreadcrumb
                retrievalState={{
                    segmentIds: ['seg-1'],
                    lineage: { projectId: 100 },
                    freshness: new Date().toISOString(),
                }}
                values={values}
                goals={goals}
                projects={projects}
                tasks={tasks}
            />,
        );
        expect(screen.getByText('Training plan')).toBeInTheDocument();
        expect(screen.getByText(/1 segment\b/)).toBeInTheDocument();
    });
});
