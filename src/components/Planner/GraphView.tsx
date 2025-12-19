/* eslint-disable @typescript-eslint/no-explicit-any */
import { ReactFlow, Controls, MiniMap, Background, useNodesState, useEdgesState } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useEffect } from 'react';
import { useGraphData } from '../../hooks/useGraphData';
import type { Value, Goal, Project, Task } from '../../types/planner';

interface GraphViewProps {
    values: Value[];
    goals: Goal[];
    projects: Project[];
    tasks: Task[];
    onEdit: (type: 'value' | 'goal' | 'project' | 'task', item: any) => void;
}

const GraphView = ({ values, goals, projects, tasks, onEdit }: GraphViewProps) => {
    // Generate initial layout
    const { nodes: initialNodes, edges: initialEdges } = useGraphData(values, goals, projects, tasks);

    // React Flow state
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    // Sync layout updates when data changes
    useEffect(() => {
        setNodes(initialNodes);
        setEdges(initialEdges);
    }, [initialNodes, initialEdges, setNodes, setEdges]);

    const onNodeClick = (_event: React.MouseEvent, node: any) => {
        // Find the full item object from the relevant list to pass to edit
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
        <div className="w-full h-full bg-slate-50 border rounded-xl overflow-hidden shadow-inner">
            <ReactFlow
                nodes={nodes}
                edges={edges}
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
        </div>
    );
};

export default GraphView;
