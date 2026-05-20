import React, { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { normalizeTag as normalize } from '../../utils/tags';

interface TagInputProps {
    tags: string[];
    onChange: (tags: string[]) => void;
    suggestions?: string[];
    placeholder?: string;
}

export const TagInput: React.FC<TagInputProps> = ({ tags, onChange, suggestions = [], placeholder }) => {
    const [draft, setDraft] = useState('');

    const filteredSuggestions = useMemo(() => {
        if (!draft.trim()) return [];
        const needle = normalize(draft);
        return suggestions
            .filter(s => s.includes(needle) && !tags.includes(s))
            .slice(0, 6);
    }, [draft, suggestions, tags]);

    const addTag = (raw: string) => {
        const tag = normalize(raw);
        if (!tag || tags.includes(tag)) return;
        onChange([...tags, tag]);
        setDraft('');
    };

    const removeTag = (tag: string) => {
        onChange(tags.filter(t => t !== tag));
    };

    return (
        <div>
            <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.map(tag => (
                    <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs border border-blue-200"
                    >
                        {tag}
                        <button
                            type="button"
                            onClick={() => removeTag(tag)}
                            aria-label={`Remove tag ${tag}`}
                            className="hover:text-blue-900"
                        >
                            <X size={12} />
                        </button>
                    </span>
                ))}
            </div>
            <div className="relative">
                <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') {
                            e.preventDefault();
                            addTag(draft);
                        } else if (e.key === 'Backspace' && !draft && tags.length > 0) {
                            removeTag(tags[tags.length - 1]);
                        }
                    }}
                    onBlur={() => { if (draft.trim()) addTag(draft); }}
                    placeholder={placeholder ?? 'Add tag (Enter to confirm)'}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                />
                {filteredSuggestions.length > 0 && (
                    <div className="absolute z-10 mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                        {filteredSuggestions.map(s => (
                            <button
                                key={s}
                                type="button"
                                onMouseDown={(e) => { e.preventDefault(); addTag(s); }}
                                className="w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50"
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
