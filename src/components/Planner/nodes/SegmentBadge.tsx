import React from 'react';

interface SegmentBadgeProps {
    count: number;
    onClick: (e: React.MouseEvent) => void;
}

// Decision 001 visual-density mitigation: collapse to a dot when the count
// would otherwise overflow the badge's footprint. Revisit at >99 if popover
// pagination doesn't catch the problem first.
export const SegmentBadge: React.FC<SegmentBadgeProps> = ({ count, onClick }) => {
    if (count <= 0) return null;
    const display = count > 99 ? '·' : String(count);
    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                onClick(e);
            }}
            aria-label={`${count} past segments`}
            className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1 rounded-full bg-indigo-600 text-white text-[10px] font-semibold leading-none flex items-center justify-center shadow hover:bg-indigo-700 cursor-pointer"
        >
            {display}
        </button>
    );
};
