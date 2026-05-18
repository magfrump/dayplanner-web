import React, { useState } from 'react';
import { Bookmark, Save, X } from 'lucide-react';
import type { SavedFilter } from '../../types/planner';
import { makeFilterId } from '../../utils/ids';

interface TagFilterBarProps {
    allTags: string[];
    activeTags: string[];
    onToggleTag: (tag: string) => void;
    onClear: () => void;
    savedFilters: SavedFilter[];
    onApplyFilter: (filter: SavedFilter) => void;
    onSaveFilter: (filter: SavedFilter) => void;
    onDeleteFilter: (id: string) => void;
}

export const TagFilterBar: React.FC<TagFilterBarProps> = ({
    allTags, activeTags, onToggleTag, onClear,
    savedFilters, onApplyFilter, onSaveFilter, onDeleteFilter,
}) => {
    const [savingName, setSavingName] = useState<string | null>(null);
    const [draftName, setDraftName] = useState('');

    if (allTags.length === 0 && savedFilters.length === 0) return null;

    const active = new Set(activeTags);

    const handleSave = () => {
        const name = draftName.trim();
        if (!name || activeTags.length === 0) return;
        onSaveFilter({ id: makeFilterId(), name, tags: [...activeTags].sort() });
        setSavingName(null);
        setDraftName('');
    };

    return (
        <div className="bg-white rounded-lg border p-3 space-y-3">
            {allTags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-gray-500 mr-1">Filter:</span>
                    {allTags.map(tag => {
                        const isActive = active.has(tag);
                        return (
                            <button
                                key={tag}
                                type="button"
                                onClick={() => onToggleTag(tag)}
                                aria-pressed={isActive}
                                className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                                    isActive
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                                }`}
                            >
                                #{tag}
                            </button>
                        );
                    })}
                    {activeTags.length > 0 && (
                        <button
                            type="button"
                            onClick={onClear}
                            className="ml-2 text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                        >
                            <X size={12} /> Clear
                        </button>
                    )}
                    {activeTags.length > 0 && savingName === null && (
                        <button
                            type="button"
                            onClick={() => setSavingName('')}
                            className="ml-1 text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                        >
                            <Save size={12} /> Save as…
                        </button>
                    )}
                </div>
            )}

            {savingName !== null && (
                <div className="flex gap-2 items-center">
                    <input
                        type="text"
                        autoFocus
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSave();
                            if (e.key === 'Escape') { setSavingName(null); setDraftName(''); }
                        }}
                        placeholder="Filter name"
                        className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                    />
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={!draftName.trim()}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:bg-gray-300"
                    >
                        Save
                    </button>
                    <button
                        type="button"
                        onClick={() => { setSavingName(null); setDraftName(''); }}
                        className="px-2 py-1.5 text-gray-500 hover:text-gray-700"
                    >
                        Cancel
                    </button>
                </div>
            )}

            {savedFilters.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 border-t pt-2">
                    <span className="text-xs font-medium text-gray-500 mr-1 flex items-center gap-1">
                        <Bookmark size={12} /> Saved:
                    </span>
                    {savedFilters.map(f => (
                        <span
                            key={f.id}
                            className="inline-flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-full text-xs"
                        >
                            <button
                                type="button"
                                onClick={() => onApplyFilter(f)}
                                className="px-2 py-0.5 hover:text-blue-700"
                                title={f.tags.map(t => `#${t}`).join(' ')}
                            >
                                {f.name}
                            </button>
                            <button
                                type="button"
                                onClick={() => onDeleteFilter(f.id)}
                                aria-label={`Delete saved filter ${f.name}`}
                                className="pr-1.5 text-gray-400 hover:text-red-600"
                            >
                                <X size={10} />
                            </button>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
};
