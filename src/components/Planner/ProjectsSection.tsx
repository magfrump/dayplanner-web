
import React, { useState } from 'react';
import { Plus, Edit2, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import type { Project, Goal, Value } from '../../types/planner';
import { TagChips } from './TagChips';

interface ProjectsSectionProps {
    projects: Project[];
    goals: Goal[];
    values: Value[];
    onAdd: () => void;
    onEdit: (project: Project) => void;
    onDelete: (id: number) => void;
    activeTags?: string[];
    onTagClick?: (tag: string) => void;
}

export const ProjectsSection: React.FC<ProjectsSectionProps> = ({ projects, goals, values, onAdd, onEdit, onDelete, activeTags, onTagClick }) => {
    const [isExpanded, setIsExpanded] = useState(true);

    return (
        <div className="bg-white rounded-lg border p-4">
            <div className="flex justify-between items-center mb-3">
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center gap-2 font-semibold"
                >
                    {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    Projects
                </button>
                <button onClick={onAdd} className="text-blue-600 hover:text-blue-800">
                    <Plus size={20} />
                </button>
            </div>
            {isExpanded && (
                <div className="space-y-2">
                    {projects.map(project => {
                        const goal = goals.find(g => g.id === project.goalId);
                        const value = values.find(v => v.id === goal?.valueId);
                        return (
                            <div key={project.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded">
                                <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: value?.color }} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="break-words">{project.name}</span>
                                        <TagChips tags={project.tags} activeTags={activeTags} onTagClick={onTagClick} />
                                    </div>
                                    <div className="text-xs text-gray-500 truncate">{goal?.name}</div>
                                </div>
                                <button onClick={() => onEdit(project)} className="text-gray-500 hover:text-gray-700">
                                    <Edit2 size={16} />
                                </button>
                                <button onClick={() => onDelete(project.id)} className="text-red-500 hover:text-red-700">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
