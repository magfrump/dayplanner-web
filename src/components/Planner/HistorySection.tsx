
import React from 'react';
import type { Task, Project, Goal, Value } from '../../types/planner';

interface HistorySectionProps {
    tasks: Task[];
    projects: Project[];
    goals: Goal[];
    values: Value[];
}

export const HistorySection: React.FC<HistorySectionProps> = ({ tasks, projects, goals, values }) => {
    const completedTasks = tasks.filter(t => t.completed);
    const tasksByValue: Record<number, Task[]> = {};

    completedTasks.forEach(t => {
        const project = projects.find(p => p.id === t.projectId);
        const goal = goals.find(g => g.id === project?.goalId);
        const valueId = goal?.valueId || 0;
        if (!tasksByValue[valueId]) tasksByValue[valueId] = [];
        tasksByValue[valueId].push(t);
    });

    return (
        <div className="space-y-6">
            <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-sm border border-gray-200/50 p-6">
                <h3 className="font-semibold mb-4 text-lg">Accomplished Tasks Log</h3>
                <div className="mb-6 text-sm text-gray-600">
                    Review your accomplishments grouped by the values they support. This helps ensure you are maintaining balance across your life's priorities.
                </div>
                {completedTasks.length === 0 ? (
                    <p className="text-gray-500 italic text-center py-8">No completed tasks yet. Start checking things off!</p>
                ) : (
                    <div className="space-y-6">
                        {values.map(value => {
                            const valueTasks = tasksByValue[value.id] || [];
                            if (valueTasks.length === 0) return null;

                            return (
                                <div key={value.id} className="border-b border-gray-100 last:border-0 pb-6 last:pb-0">
                                    <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2 text-lg">
                                        <div className="w-4 h-4 rounded-full shadow-sm" style={{ backgroundColor: value.color }} />
                                        {value.name}
                                        <span className="text-xs font-normal text-gray-500 ml-2 bg-gray-100 px-2 py-0.5 rounded-full">
                                            {valueTasks.length} {valueTasks.length === 1 ? 'task' : 'tasks'}
                                        </span>
                                    </h4>
                                    <div className="space-y-2 pl-6">
                                        {valueTasks.map(task => {
                                            const project = projects.find(p => p.id === task.projectId);
                                            const goal = goals.find(g => g.id === project?.goalId);
                                            return (
                                                <div key={task.id} className="text-sm bg-white p-3 rounded-xl border border-gray-100 shadow-sm transition-all hover:shadow-md">
                                                    <div className="font-medium text-gray-900 line-through decoration-gray-400 opacity-75">{task.name}</div>
                                                    <div className="text-xs text-gray-500 mt-1 flex gap-2 items-center">
                                                        <span className="bg-gray-100 px-1.5 py-0.5 rounded">{project?.name}</span>
                                                        <span>→</span>
                                                        <span className="italic">{goal?.name}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
