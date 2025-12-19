
import React, { useState } from 'react';
import { Plus, Edit2, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import type { Value } from '../../types/planner';

interface ValuesSectionProps {
    values: Value[];
    onAdd: () => void;
    onEdit: (value: Value) => void;
    onDelete: (id: number) => void;
}

export const ValuesSection: React.FC<ValuesSectionProps> = ({ values, onAdd, onEdit, onDelete }) => {
    const [isExpanded, setIsExpanded] = useState(true);

    return (
        <div className="bg-white rounded-lg border p-4">
            <div className="flex justify-between items-center mb-3">
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center gap-2 font-semibold"
                >
                    {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    Values
                </button>
                <button onClick={onAdd} className="text-blue-600 hover:text-blue-800">
                    <Plus size={20} />
                </button>
            </div>
            {isExpanded && (
                <div className="space-y-2">
                    {values.map(value => (
                        <div key={value.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded">
                            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: value.color }} />
                            <span className="flex-1">{value.name}</span>
                            <button onClick={() => onEdit(value)} className="text-gray-500 hover:text-gray-700">
                                <Edit2 size={16} />
                            </button>
                            <button onClick={() => onDelete(value.id)} className="text-red-500 hover:text-red-700">
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
