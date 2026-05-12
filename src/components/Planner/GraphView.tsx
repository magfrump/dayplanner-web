/* eslint-disable @typescript-eslint/no-explicit-any */
import { ReactFlow, Controls, MiniMap, Background, useNodesState, useEdgesState } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useState } from 'react';
import { useGraphData } from '../../hooks/useGraphData';
import { useSegmentCounts, type SegmentCountLevel } from '../../hooks/useSegmentCounts';
import type { Value, Goal, Project, Task } from '../../types/planner';
import { BaseNode, type BaseNodeData } from './nodes/BaseNode';
import { SegmentPopover } from './SegmentPopover';

interface GraphViewProps {
    values: Value[];
    goals: Goal[];
    projects: Project[];
    tasks: Task[];
    onEdit: (type: 'value' | 'goal' | 'project' | 'task', item: any) => void;
}

// Defined outside the component so xyflow's identity check doesn't tear down
// every node on each render.
const nodeTypes = {
    value: (p: { data: BaseNodeData }) => <BaseNode data={p.data} showBadge={false} />,
    goal: (p: { data: BaseNodeData }) => <BaseNode data={p.data} showBadge={false} />,
    project: (p: { data: BaseNodeData }) => <BaseNode data={p.data} showBadge />,
    task: (p: { data: BaseNodeData }) => <BaseNode data={p.data} showBadge />,
};

const GraphView = ({ values, goals, projects, tasks, onEdit }: GraphViewProps) => {
    const { counts, refetch: refetchCounts } = useSegmentCounts(values, goals, projects, tasks);
    const [popover, setPopover] = useState<{ level: SegmentCountLevel; id: number; x: number; y: number } | null>(null);

    const handleBadgeClick = useCallback((level: SegmentCountLevel, id: number, event: React.MouseEvent) => {
        setPopover({ level, id, x: event.clientX, y: event.clientY });
    }, []);

    const { nodes: initialNodes, edges: initialEdges } = useGraphData(
        values, goals, projects, tasks, counts, handleBadgeClick,
    );

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    useEffect(() => {
        setNodes(initialNodes);
        setEdges(initialEdges);
    }, [initialNodes, initialEdges, setNodes, setEdges]);

    const onNodeClick = (_event: React.MouseEvent, node: any) => {
        const { type, originalId } = node.data;
        let item: any = null;
        if (type === 'value') item = values.find(v => v.id === originalId);
        if (type === 'goal') item = goals.find(g => g.id === originalId);
        if (type === 'project') item = projects.find(p => p.id === originalId);
        if (type === 'task') item = tasks.find(t => t.id === originalId);

        if (item) {
            onEdit(type, item);
        }
    };

    return (
        <div className="w-full h-full bg-slate-50 border rounded-xl overflow-hidden shadow-inner relative">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={onNodeClick}
                fitView
                attributionPosition="bottom-right"
            >
                <Background color="#ccc" gap={20} />
                <Controls />
                <MiniMap nodeStrokeWidth={3} zoomable pannable />
            </ReactFlow>
            {popover && (
                <SegmentPopover
                    level={popover.level}
                    id={popover.id}
                    anchor={{ x: popover.x, y: popover.y }}
                    onClose={() => setPopover(null)}
                    onChange={refetchCounts}
                />
            )}
        </div>
    );
};

export default GraphView;
