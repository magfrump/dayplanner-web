import React from 'react';

interface TagChipsProps {
    tags?: string[];
    activeTags?: string[];
    onTagClick?: (tag: string) => void;
}

export const TagChips: React.FC<TagChipsProps> = ({ tags, activeTags, onTagClick }) => {
    if (!tags || tags.length === 0) return null;
    const active = new Set(activeTags ?? []);
    return (
        <span className="inline-flex flex-wrap gap-1 align-middle">
            {tags.map(tag => {
                const isActive = active.has(tag);
                const cls = isActive
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100';
                const content = (
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] border ${cls}`}>#{tag}</span>
                );
                if (!onTagClick) return <React.Fragment key={tag}>{content}</React.Fragment>;
                return (
                    <button
                        key={tag}
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onTagClick(tag); }}
                        className="leading-none"
                        aria-pressed={isActive}
                    >
                        {content}
                    </button>
                );
            })}
        </span>
    );
};
