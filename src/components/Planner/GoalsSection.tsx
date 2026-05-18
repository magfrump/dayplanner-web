
import React, { useState } from 'react';
import { Plus, Edit2, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import type { Goal, Value } from '../../types/planner';
import { TagChips } from './TagChips';

interface GoalsSectionProps {
    goals: Goal[];
    values: Value[];
    onAdd: () => void;
    onEdit: (goal: Goal) => void;
    onDelete: (id: number) => void;
    activeTags?: string[];
    onTagClick?: (tag: string) => void;
}

export const GoalsSection: React.FC<GoalsSectionProps> = ({ goals, values, onAdd, onEdit, onDelete, activeTags, onTagClick }) => {
    const [isExpanded, setIsExpanded] = useState(true);

    return (
        <div className="bg-white rounded-lg border p-4">
            <div className="flex justify-between items-center mb-3">
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center gap-2 font-semibold"
                >
                    {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    Goals
                </button>
                <button onClick={onAdd} className="text-blue-600 hover:text-blue-800">
                    <Plus size={20} />
                </button>
            </div>
            {isExpanded && (
                <div className="space-y-2">
                    {goals.map(goal => {
                        const value = values.find(v => v.id === goal.valueId);
                        return (
                            <div key={goal.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded">
                                <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: value?.color }} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="break-words">{goal.name}</span>
                                        <TagChips tags={goal.tags} activeTags={activeTags} onTagClick={onTagClick} />
                                    </div>
                                    <div className="text-xs text-gray-500 truncate">{value?.name}</div>
                                </div>
                                <button onClick={() => onEdit(goal)} className="text-gray-500 hover:text-gray-700">
                                    <Edit2 size={16} />
                                </button>
                                <button onClick={() => onDelete(goal.id)} className="text-red-500 hover:text-red-700">
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
