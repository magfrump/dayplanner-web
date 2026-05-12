import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { SegmentBadge } from './SegmentBadge';
import type { SegmentCountLevel } from '../../../hooks/useSegmentCounts';

export interface BaseNodeData {
    label: string;
    type: SegmentCountLevel;
    originalId: number;
    segmentCount?: number;
    onBadgeClick?: (level: SegmentCountLevel, id: number, event: React.MouseEvent) => void;
}

interface BaseNodeProps {
    data: BaseNodeData;
    showBadge: boolean;
}

// Shared visual shell for every lineage level. xyflow applies the per-level
// background/border via the node `style` set in useGraphData — this component
// only handles handles, label, and badge.
export const BaseNode: React.FC<BaseNodeProps> = ({ data, showBadge }) => {
    const count = data.segmentCount ?? 0;
    return (
        <div className="relative px-3 py-2 text-xs text-center">
            <Handle type="target" position={Position.Left} />
            <span className="block truncate">{data.label}</span>
            <Handle type="source" position={Position.Right} />
            {showBadge && count > 0 && data.onBadgeClick && (
                <SegmentBadge
                    count={count}
                    onClick={(e) => data.onBadgeClick!(data.type, data.originalId, e)}
                />
            )}
        </div>
    );
};
