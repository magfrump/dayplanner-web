/* eslint-disable @typescript-eslint/no-explicit-any */
import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useGraphData } from './useGraphData';

describe('useGraphData', () => {
    it('should transform data into nodes and edges', () => {
        const values = [{ id: 1, name: 'V1', color: '#000' } as any];
        const goals = [{ id: 10, name: 'G1', valueId: 1 } as any];
        const projects = [{ id: 100, name: 'P1', goalId: 10 } as any];
        const tasks = [{ id: 1000, name: 'T1', projectId: 100, completed: false } as any];

        const { result } = renderHook(() => useGraphData(values, goals, projects, tasks));

        const { nodes, edges } = result.current;

        // Check Nodes
        expect(nodes).toHaveLength(4);
        expect(nodes.find(n => n.id === 'value-1')).toBeDefined();
        expect(nodes.find(n => n.id === 'goal-10')).toBeDefined();
        expect(nodes.find(n => n.id === 'project-100')).toBeDefined();
        expect(nodes.find(n => n.id === 'task-1000')).toBeDefined();

        // Check Edges
        expect(edges).toHaveLength(3);
        expect(edges.find(e => e.source === 'value-1' && e.target === 'goal-10')).toBeDefined();
        expect(edges.find(e => e.source === 'goal-10' && e.target === 'project-100')).toBeDefined();
        expect(edges.find(e => e.source === 'project-100' && e.target === 'task-1000')).toBeDefined();
    });

    it('should handle disconnected items', () => {
        const values = [{ id: 1, name: 'V1' } as any];
        const goals = [{ id: 10, name: 'G1' } as any]; // No parent
        const { result } = renderHook(() => useGraphData(values, goals, [], []));

        const { nodes, edges } = result.current;
        expect(nodes).toHaveLength(2);
        expect(edges).toHaveLength(0);
    });

    it('threads segmentCount onto each node from the lookup', () => {
        const projects = [{ id: 100, name: 'P1' } as any, { id: 101, name: 'P2' } as any];
        const tasks = [{ id: 1000, name: 'T1', projectId: 100, completed: false } as any];
        const counts = { 'project:100': 4, 'project:101': 0, 'task:1000': 1 };

        const { result } = renderHook(() =>
            useGraphData([], [], projects, tasks, counts),
        );

        const project100 = result.current.nodes.find(n => n.id === 'project-100')!;
        const project101 = result.current.nodes.find(n => n.id === 'project-101')!;
        const task1000 = result.current.nodes.find(n => n.id === 'task-1000')!;
        expect((project100.data as any).segmentCount).toBe(4);
        expect((project101.data as any).segmentCount).toBe(0);
        expect((task1000.data as any).segmentCount).toBe(1);
        expect(project100.type).toBe('project');
        expect(task1000.type).toBe('task');
    });
});
