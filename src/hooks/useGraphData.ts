import { useMemo } from 'react';
import { MarkerType, Position } from '@xyflow/react';
import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';
import type { Value, Goal, Project, Task } from '../types/planner';

// Layout configuration
const nodeWidth = 180;
const nodeHeight = 50;

/**
 * Transforms flat Planner Data into React Flow Nodes and Edges
 * Uses dagre for automatic hierarchical layout (Left-to-Right)
 */
export const useGraphData = (
    values: Value[],
    goals: Goal[],
    projects: Project[],
    tasks: Task[]
) => {
    return useMemo(() => {
        const nodes: Node[] = [];
        const edges: Edge[] = [];

        // --- 1. Create Nodes ---

        values.forEach(v => {
            nodes.push({
                id: `value-${v.id}`,
                data: { label: v.name, type: 'value', originalId: v.id, color: v.color || '#6b7280' },
                position: { x: 0, y: 0 },
                style: { backgroundColor: '#f3f4f6', border: '1px solid #9ca3af', width: nodeWidth, borderRadius: '8px' },
                type: 'default'
            });
        });

        goals.forEach(g => {
            nodes.push({
                id: `goal-${g.id}`,
                data: { label: g.name, type: 'goal', originalId: g.id },
                position: { x: 0, y: 0 },
                style: { backgroundColor: '#eff6ff', border: '1px solid #60a5fa', width: nodeWidth, borderRadius: '8px' },
                type: 'default'
            });
        });

        projects.forEach(p => {
            nodes.push({
                id: `project-${p.id}`,
                data: { label: p.name, type: 'project', originalId: p.id },
                position: { x: 0, y: 0 },
                style: { backgroundColor: '#f0fdf4', border: '1px solid #4ade80', width: nodeWidth, borderRadius: '8px' },
                type: 'default'
            });
        });

        tasks.forEach(t => {
            nodes.push({
                id: `task-${t.id}`,
                data: { label: t.name, type: 'task', originalId: t.id },
                position: { x: 0, y: 0 },
                style: { backgroundColor: t.completed ? '#f9fafb' : '#fffbeb', border: t.completed ? '1px dashed #d1d5db' : '1px solid #fcd34d', width: nodeWidth, borderRadius: '8px', opacity: t.completed ? 0.7 : 1 },
                type: 'default'
            });
        });

        // --- 2. Create Edges ---

        // Value -> Goal
        goals.forEach(g => {
            if (g.valueId) {
                edges.push({
                    id: `e-v${g.valueId}-g${g.id}`,
                    source: `value-${g.valueId}`,
                    target: `goal-${g.id}`,
                    type: 'smoothstep',
                    markerEnd: { type: MarkerType.ArrowClosed },
                    animated: true,
                    style: { stroke: '#9ca3af' }
                });
            }
        });

        // Goal -> Project
        projects.forEach(p => {
            if (p.goalId) {
                edges.push({
                    id: `e-g${p.goalId}-p${p.id}`,
                    source: `goal-${p.goalId}`,
                    target: `project-${p.id}`,
                    type: 'smoothstep',
                    markerEnd: { type: MarkerType.ArrowClosed },
                    style: { stroke: '#60a5fa' }
                });
            }
        });

        // Project -> Task
        tasks.forEach(t => {
            if (t.projectId) {
                edges.push({
                    id: `e-p${t.projectId}-t${t.id}`,
                    source: `project-${t.projectId}`,
                    target: `task-${t.id}`,
                    type: 'smoothstep',
                    markerEnd: { type: MarkerType.ArrowClosed },
                    style: { stroke: '#4ade80' }
                });
            }
        });

        // --- 3. Compute Layout (Dagre) ---
        const g = new dagre.graphlib.Graph();
        g.setGraph({ rankdir: 'LR', nodesep: 20, ranksep: 80 }); // Left-to-Right layout
        g.setDefaultEdgeLabel(() => ({}));

        nodes.forEach(node => {
            g.setNode(node.id, { width: nodeWidth, height: nodeHeight });
        });

        edges.forEach(edge => {
            g.setEdge(edge.source, edge.target);
        });

        dagre.layout(g);

        const layoutNodes = nodes.map(node => {
            const nodeWithPosition = g.node(node.id);
            return {
                ...node,
                targetPosition: Position.Left,
                sourcePosition: Position.Right,
                position: {
                    x: nodeWithPosition.x - nodeWidth / 2,
                    y: nodeWithPosition.y - nodeHeight / 2,
                },
            };
        });

        return { nodes: layoutNodes, edges };

    }, [values, goals, projects, tasks]);
};
