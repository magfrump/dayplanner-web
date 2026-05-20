import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { Value, Goal, Project, Task } from '../../types/planner';
import { normalizeTag } from '../../utils/tags';

type ItemType = 'value' | 'goal' | 'project' | 'task';

interface Taggable {
    id: number;
    name: string;
    tags?: string[];
}

interface TagManagerModalProps {
    open: boolean;
    onClose: () => void;
    values: Value[];
    goals: Goal[];
    projects: Project[];
    tasks: Task[];
    allTags: string[];
    onSetItemTags: (type: ItemType, id: number, tags: string[]) => void;
}

export const TagManagerModal: React.FC<TagManagerModalProps> = ({
    open, onClose, values, goals, projects, tasks, allTags, onSetItemTags,
}) => {
    // null = "no explicit choice yet" → auto-pick the first tag. This avoids a
    // setState-in-effect when tags load async; the effective tag is derived below.
    const [selectedTag, setSelectedTag] = useState<string | null>(null);
    const [newTagDraft, setNewTagDraft] = useState('');

    const effectiveTag = selectedTag ?? (allTags[0] ?? '');

    const groups = useMemo(() => ([
        { label: 'Values', type: 'value' as const, items: values as Taggable[] },
        { label: 'Goals', type: 'goal' as const, items: goals as Taggable[] },
        { label: 'Projects', type: 'project' as const, items: projects as Taggable[] },
        { label: 'Tasks', type: 'task' as const, items: tasks as Taggable[] },
    ]), [values, goals, projects, tasks]);

    const memberCount = useMemo(() => {
        if (!effectiveTag) return 0;
        return groups.reduce(
            (n, grp) => n + grp.items.filter(it => (it.tags ?? []).includes(effectiveTag)).length,
            0,
        );
    }, [groups, effectiveTag]);

    if (!open) return null;

    const toggle = (type: ItemType, item: Taggable) => {
        if (!effectiveTag) return;
        const has = (item.tags ?? []).includes(effectiveTag);
        const next = has
            ? (item.tags ?? []).filter(tg => tg !== effectiveTag)
            : [...(item.tags ?? []), effectiveTag];
        onSetItemTags(type, item.id, next);
    };

    const addNewTag = () => {
        const norm = normalizeTag(newTagDraft);
        if (!norm) return;
        setSelectedTag(norm);
        setNewTagDraft('');
    };

    // effectiveTag may be a freshly-created tag not yet present in allTags (no item
    // carries it until one is checked) — include it so the <select> can show it.
    const tagOptions = effectiveTag && !allTags.includes(effectiveTag)
        ? [effectiveTag, ...allTags]
        : allTags;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Manage tags"
                className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center p-4 border-b shrink-0">
                    <h3 className="font-semibold">Manage tags</h3>
                    <button onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-gray-700">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-4 border-b space-y-2 shrink-0">
                    <div className="flex items-center gap-2">
                        <label htmlFor="tag-select" className="text-sm font-medium text-gray-600">Tag:</label>
                        <select
                            id="tag-select"
                            aria-label="Select tag"
                            value={effectiveTag}
                            onChange={(e) => setSelectedTag(e.target.value)}
                            className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        >
                            {tagOptions.length === 0 && <option value="">(no tags yet)</option>}
                            {tagOptions.map(tg => <option key={tg} value={tg}>#{tg}</option>)}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={newTagDraft}
                            onChange={(e) => setNewTagDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNewTag(); } }}
                            placeholder="new tag…"
                            className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                        <button
                            type="button"
                            onClick={addNewTag}
                            disabled={!normalizeTag(newTagDraft)}
                            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:bg-gray-300"
                        >
                            Add tag
                        </button>
                    </div>
                </div>

                <div className="p-4 overflow-y-auto flex-1 min-h-0 space-y-4">
                    {!effectiveTag && (
                        <p className="text-sm text-gray-500">Pick or create a tag to assign it to items.</p>
                    )}
                    {groups.map(grp => (
                        <div key={grp.type}>
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">{grp.label}</h4>
                            {grp.items.length === 0 ? (
                                <p className="text-xs text-gray-300">none</p>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                                    {grp.items.map(item => {
                                        const checked = !!effectiveTag && (item.tags ?? []).includes(effectiveTag);
                                        return (
                                            <label key={item.id} className="flex items-center gap-2 text-sm py-0.5 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    aria-label={item.name}
                                                    checked={checked}
                                                    disabled={!effectiveTag}
                                                    onChange={() => toggle(grp.type, item)}
                                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-40"
                                                />
                                                <span className={`min-w-0 truncate ${checked ? 'text-gray-900' : 'text-gray-600'}`}>{item.name}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className="flex justify-between items-center p-4 border-t shrink-0">
                    <span className="text-xs text-gray-500">
                        {effectiveTag ? `${memberCount} ${memberCount === 1 ? 'item' : 'items'} tagged` : ''}
                    </span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};
