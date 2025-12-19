
import React from 'react';
import { Plus, Edit2, Trash2, Calendar, Repeat } from 'lucide-react';
import type { Task, Project, Goal, Value } from '../../types/planner';
import { WORK_TYPES } from '../../types/planner';

interface TasksSectionProps {
    tasks: Task[];
    projects: Project[];
    goals: Goal[];
    values: Value[];
    onAdd: () => void;
    onEdit: (task: Task) => void;
    onDelete: (id: number) => void;
    onToggle: (id: number) => void;
}

export const TasksSection: React.FC<TasksSectionProps> = ({
    tasks, projects, goals, values,
    onAdd, onEdit, onDelete, onToggle
}) => {
    return (
        <div className="bg-white rounded-lg border p-4">
            <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold">All Tasks</h3>
                <button onClick={onAdd} className="text-blue-600 hover:text-blue-800">
                    <Plus size={20} />
                </button>
            </div>
            <div className="space-y-2">
                {tasks.map(task => {
                    const project = projects.find(p => p.id === task.projectId);
                    const goal = goals.find(g => g.id === project?.goalId);
                    const value = values.find(v => v.id === goal?.valueId);
                    // Safe lookup with fallback to prevent crash if data is malformed
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const workTypeKey = task.workType || (task as any).work_type || 'focus';
                    const workType = WORK_TYPES[workTypeKey] || { name: workTypeKey || 'Unknown' };

                    return (
                        <div key={task.id} className={`flex items-center gap-3 p-2 hover:bg-gray-50 rounded ${task.completed ? 'opacity-50' : ''}`}>
                            <input
                                type="checkbox"
                                checked={task.completed}
                                onChange={() => onToggle(task.id)}
                            />
                            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: value?.color }} />
                            <div className="flex-1">
                                <div className={task.completed ? 'line-through' : ''}>{task.name}</div>
                                <div className="text-xs text-gray-500 flex flex-wrap gap-2 items-center mt-0.5">
                                    <span>{project?.name} • I:{task.importance} U:{task.urgency} • {workType.name}</span>
                                    {task.deadline && (
                                        <span className="flex items-center gap-1 text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
                                            <Calendar size={10} />
                                            {task.deadline}
                                        </span>
                                    )}
                                    {task.recurrence && (
                                        <span className="flex items-center gap-1 text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                                            <Repeat size={10} />
                                            {task.recurrence}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <button onClick={() => onEdit(task)} className="text-gray-500 hover:text-gray-700">
                                <Edit2 size={16} />
                            </button>
                            <button onClick={() => onDelete(task.id)} className="text-red-500 hover:text-red-700">
                                <Trash2 size={16} />
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
