import React, { useCallback, useEffect, useState } from 'react';
import { buildSearchUrl, type Segment } from '../../services/multisemanticRetrieval';
import type { LineageKey } from '../../services/lineageKeys';
import type { SegmentCountLevel } from '../../hooks/useSegmentCounts';

const PAGE_SIZE = 20;
const FETCH_LIMIT = 25;

interface SegmentPopoverProps {
    level: SegmentCountLevel;
    id: number;
    anchor: { x: number; y: number };
    onClose: () => void;
    onChange?: () => void;
}

const formatTimestamp = (iso: string) => {
    try {
        return new Date(iso).toLocaleString();
    } catch {
        return iso;
    }
};

export const SegmentPopover: React.FC<SegmentPopoverProps> = ({ level, id, anchor, onClose, onChange }) => {
    const [segments, setSegments] = useState<Segment[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const lineageKey: LineageKey = `${level}Id`;

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const resp = await fetch(buildSearchUrl('', { [lineageKey]: id }, FETCH_LIMIT));
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const body = await resp.json();
            setSegments(Array.isArray(body?.results) ? body.results : []);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setSegments([]);
        } finally {
            setLoading(false);
        }
    }, [lineageKey, id]);

    useEffect(() => { void load(); }, [load]);

    const toggleSelected = (segmentId: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(segmentId)) next.delete(segmentId);
            else next.add(segmentId);
            return next;
        });
    };

    const refresh = async () => {
        setSelected(new Set());
        await load();
        onChange?.();
    };

    const handleMerge = async () => {
        if (selected.size < 2) return;
        setBusy(true);
        setError(null);
        try {
            const resp = await fetch('/api/segments/merge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ segmentIds: Array.from(selected) }),
            });
            if (!resp.ok) throw new Error((await resp.json())?.error || `HTTP ${resp.status}`);
            await refresh();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const handleSplit = async () => {
        if (selected.size !== 1) return;
        const [segmentId] = Array.from(selected);
        const target = segments.find(s => s.id === segmentId);
        if (!target) return;
        const max = (target.transcript?.length ?? 0) - 1;
        if (max < 1) {
            setError('Segment is too short to split');
            return;
        }
        const raw = window.prompt(`Split at message index (1..${max}):`, '1');
        if (raw == null) return;
        const boundaryIndex = Number(raw);
        if (!Number.isInteger(boundaryIndex) || boundaryIndex < 1 || boundaryIndex > max) {
            setError(`Invalid boundary index — must be integer in [1, ${max}]`);
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const resp = await fetch('/api/segments/split', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ segmentId, boundaryIndex }),
            });
            if (!resp.ok) throw new Error((await resp.json())?.error || `HTTP ${resp.status}`);
            await refresh();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const pageSegments = segments.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const totalPages = Math.max(1, Math.ceil(segments.length / PAGE_SIZE));

    return (
        <div
            className="fixed z-50 w-96 bg-white border border-gray-200 rounded-lg shadow-xl"
            style={{ top: anchor.y, left: anchor.x }}
            role="dialog"
            aria-label={`Segments for ${level} ${id}`}
        >
            <div className="flex items-center justify-between p-2 border-b">
                <span className="text-xs font-medium text-gray-700">
                    {segments.length} segment{segments.length === 1 ? '' : 's'} · {level}#{id}
                </span>
                <button
                    type="button"
                    onClick={onClose}
                    className="text-gray-500 hover:text-gray-900 text-sm px-1"
                    aria-label="Close popover"
                >
                    ×
                </button>
            </div>

            <div className="max-h-72 overflow-y-auto p-2 space-y-2">
                {loading && <div className="text-xs text-gray-500">Loading…</div>}
                {!loading && segments.length === 0 && (
                    <div className="text-xs text-gray-500">No segments at this lineage.</div>
                )}
                {pageSegments.map(seg => (
                    <div
                        key={seg.id}
                        className={`text-xs border rounded p-2 cursor-pointer ${selected.has(seg.id) ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'}`}
                        onClick={() => toggleSelected(seg.id)}
                    >
                        <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                            <span>{seg.id}</span>
                            <span>{formatTimestamp(seg.updated_at || seg.created_at)}</span>
                        </div>
                        <div className="text-gray-800 line-clamp-3">
                            {seg.summary?.trim() || '(no summary)'}
                        </div>
                    </div>
                ))}
            </div>

            {totalPages > 1 && (
                <div className="flex items-center justify-between px-2 py-1 border-t text-[11px] text-gray-600">
                    <button
                        type="button"
                        disabled={page === 0}
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        className="disabled:opacity-40 hover:underline"
                    >
                        Prev
                    </button>
                    <span>Page {page + 1} of {totalPages}</span>
                    <button
                        type="button"
                        disabled={page >= totalPages - 1}
                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                        className="disabled:opacity-40 hover:underline"
                    >
                        Next
                    </button>
                </div>
            )}

            {error && (
                <div className="px-2 py-1 text-[11px] text-red-600 border-t border-red-100 bg-red-50">{error}</div>
            )}

            <div className="flex justify-between items-center p-2 border-t bg-gray-50 rounded-b-lg">
                <span className="text-[10px] text-gray-500">
                    {selected.size} selected
                </span>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={handleSplit}
                        disabled={busy || selected.size !== 1}
                        className="text-xs px-2 py-1 rounded bg-amber-500 text-white disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                        Split
                    </button>
                    <button
                        type="button"
                        onClick={handleMerge}
                        disabled={busy || selected.size < 2}
                        className="text-xs px-2 py-1 rounded bg-indigo-600 text-white disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                        Merge ({selected.size})
                    </button>
                </div>
            </div>
        </div>
    );
};
