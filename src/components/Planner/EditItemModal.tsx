
import React from 'react';
import { X, Save } from 'lucide-react';
import { WORK_TYPES } from '../../types/planner';
import type { Value, Goal, Project } from '../../types/planner';
import type { EditModeState, EditItemData } from '../../types/ui';

interface EditItemModalProps {
    editMode: EditModeState;
    setEditMode: (mode: EditModeState) => void;
    onSave: () => void;
    values: Value[];
    goals: Goal[];
    projects: Project[];
}

export const EditItemModal: React.FC<EditItemModalProps> = ({
    editMode, setEditMode, onSave, values, goals, projects
}) => {
    if (!editMode.type || !editMode.data) return null;

    const { type, data } = editMode;

    // Helper to update nested data state
    const updateData = (updates: Partial<EditItemData>) => {
        setEditMode({ ...editMode, data: { ...data, ...updates } });
    };

    return (
        <div className="bg-white/95 backdrop-blur-sm border border-blue-100 rounded-xl shadow-xl ring-1 ring-blue-500/10 p-6 mb-6">
            <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold capitalize">
                    {/* Simplified title logic for now */}
                    Edit {type}
                </h3>
                <button onClick={() => setEditMode({ type: null, id: null, data: null })} className="text-gray-500 hover:text-gray-700">
                    <X size={20} />
                </button>
            </div>

            <div className="space-y-3">
                <div>
                    <label className="block text-sm font-medium mb-1">Name</label>
                    <input
                        type="text"
                        value={data.name || ''}
                        onChange={(e) => updateData({ name: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        placeholder={`${type} name`}
                        autoFocus
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium mb-1">Description</label>
                    <textarea
                        value={data.description || ''}
                        onChange={(e) => updateData({ description: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all h-24 resize-none"
                        placeholder={`Describe this ${type}...`}
                    />
                </div>

                {type === 'value' && (
                    <div>
                        <label className="block text-sm font-medium mb-1">Color</label>
                        <input
                            type="color"
                            value={data.color || '#000000'}
                            onChange={(e) => updateData({ color: e.target.value })}
                            className="w-20 h-10 border rounded"
                        />
                    </div>
                )}

                {type === 'goal' && (
                    <div>
                        <label className="block text-sm font-medium mb-1">Value</label>
                        <select
                            value={data.valueId || ''}
                            onChange={(e) => updateData({ valueId: parseInt(e.target.value) })}
                            className="w-full px-3 py-2 border rounded-lg"
                        >
                            <option value="">Select Value</option>
                            {values.map(v => (
                                <option key={v.id} value={v.id}>{v.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                {type === 'project' && (
                    <>
                        <div>
                            <label className="block text-sm font-medium mb-1">Goal</label>
                            <select
                                value={data.goalId || ''}
                                onChange={(e) => updateData({ goalId: parseInt(e.target.value) })}
                                className="w-full px-3 py-2 border rounded-lg"
                            >
                                <option value="">Select Goal</option>
                                {goals.map(g => (
                                    <option key={g.id} value={g.id}>{g.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Attached Documents (Local Paths)</label>
                            <div className="space-y-2 mb-2">
                                {(data.documents || []).map((doc: string, idx: number) => (
                                    <div key={idx} className="flex gap-2 items-center text-sm bg-gray-50 p-2 rounded">
                                        <span className="flex-1 truncate font-mono">{doc}</span>
                                        <button
                                            onClick={() => {
                                                const docs = [...(data.documents || [])];
                                                docs.splice(idx, 1);
                                                updateData({ documents: docs });
                                            }}
                                            className="text-red-500 hover:text-red-700"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="/absolute/path/to/file.txt"
                                    className="flex-1 px-3 py-2 border rounded-lg text-sm font-mono"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            const val = e.currentTarget.value.trim();
                                            if (val) {
                                                updateData({ documents: [...(data.documents || []), val] });
                                                e.currentTarget.value = '';
                                            }
                                        }
                                    }}
                                />
                                <button
                                    onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                                        const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                                        const val = input.value.trim();
                                        if (val) {
                                            updateData({ documents: [...(data.documents || []), val] });
                                            input.value = '';
                                        }
                                    }}
                                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm"
                                >
                                    Add
                                </button>
                            </div>
                        </div>
                    </>
                )}

                {type === 'task' && (
                    <>
                        <div>
                            <label className="block text-sm font-medium mb-1">Project</label>
                            <select
                                value={data.projectId}
                                onChange={(e) => updateData({ projectId: parseInt(e.target.value) })}
                                className="w-full px-3 py-2 border rounded-lg"
                            >
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-medium mb-1">Importance (1-5)</label>
                                <input
                                    type="number" min="1" max="5"
                                    value={data.importance}
                                    onChange={(e) => updateData({ importance: parseInt(e.target.value) })}
                                    className="w-full px-3 py-2 border rounded-lg"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Urgency (1-5)</label>
                                <input
                                    type="number" min="1" max="5"
                                    value={data.urgency}
                                    onChange={(e) => updateData({ urgency: parseInt(e.target.value) })}
                                    className="w-full px-3 py-2 border rounded-lg"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Work Type</label>
                            <select
                                value={data.workType}
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                onChange={(e) => updateData({ workType: e.target.value as any })}
                                className="w-full px-3 py-2 border rounded-lg"
                            >
                                {Object.entries(WORK_TYPES).map(([key, value]) => (
                                    <option key={key} value={key}>{value.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-medium mb-1">Deadline</label>
                                <input
                                    type="date"
                                    value={data.deadline || ''}
                                    onChange={(e) => updateData({ deadline: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Recurrence</label>
                                <input
                                    type="text"
                                    placeholder="e.g. daily, weekly"
                                    value={data.recurrence || ''}
                                    onChange={(e) => updateData({ recurrence: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg"
                                />
                            </div>
                        </div>
                    </>
                )}

                <button
                    onClick={onSave}
                    className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
                >
                    <Save size={18} />
                    Save
                </button>
            </div>
        </div>
    );
};
