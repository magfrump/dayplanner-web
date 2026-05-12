import type { FocusState, Value, Goal, Project, Task } from '../types/planner';
import type { Message, SegmentLineage } from './types';
import { resolveEffectiveFocus, lineageFromResolved } from '../utils/focus';
import { LINEAGE_KEYS } from './lineageKeys';

export type Segment = {
    id: string;
    thread_id: string;
    created_at: string;
    updated_at: string;
    transcript: Message[];
    summary: string | null;
    lineage: SegmentLineage;
    metadata: {
        needs_classification: boolean;
        open_loop: boolean;
        archive_file: string;
    };
};

const TOP_K = 3;

const hasAnyLineage = (l: SegmentLineage) =>
    LINEAGE_KEYS.some(k => l[k] != null);

export const buildSearchUrl = (query: string, lineage: SegmentLineage, limit: number) => {
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query);
    for (const k of LINEAGE_KEYS) {
        const v = lineage[k];
        if (v != null) params.set(k, String(v));
    }
    params.set('limit', String(limit));
    return `/api/segments/search?${params.toString()}`;
};

export const lastUserText = (messages: Message[]): string => {
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.role === 'user' && typeof m.content === 'string' && m.content.trim()) {
            return m.content;
        }
    }
    return '';
};

export type RetrievalResult = {
    segments: Segment[];
    lineage: SegmentLineage;
    freshness: string;
};

interface RetrievalInputs {
    messages: Message[];
    focus: FocusState | undefined;
    data: { values: Value[]; goals: Goal[]; projects: Project[]; tasks: Task[] };
}

// Best-effort: returns null on no focus, no query, no results, or any error —
// retrieval must never block the user-visible send path.
export const recallRelevantSegments = async ({
    messages,
    focus,
    data,
}: RetrievalInputs): Promise<RetrievalResult | null> => {
    const lineage = lineageFromResolved(resolveEffectiveFocus(focus, messages, data));
    if (!hasAnyLineage(lineage)) return null;

    const query = lastUserText(messages);
    if (!query) return null;

    try {
        const resp = await fetch(buildSearchUrl(query, lineage, TOP_K));
        if (!resp.ok) return null;
        const body = await resp.json();
        const segments: Segment[] = Array.isArray(body?.results) ? body.results : [];
        if (segments.length === 0) return null;

        let freshness = '';
        for (const s of segments) {
            const t = s.updated_at || s.created_at;
            if (t > freshness) freshness = t;
        }

        return { segments, lineage, freshness };
    } catch (e) {
        console.error('recallRelevantSegments failed:', e);
        return null;
    }
};

export const formatRelevantPastContext = (
    result: RetrievalResult | null,
): string => {
    if (!result || result.segments.length === 0) return '';
    const lines = result.segments.map(s => {
        const summary = s.summary?.trim() || '(no summary)';
        return `- [${s.id} · ${s.updated_at}] ${summary}`;
    });
    return `\nRELEVANT PAST CONTEXT:\n${lines.join('\n')}\n`;
};

const MIN_CITE_SUBSTRING = 20;

// Returns ids of injected segments whose transcript appears to be quoted in the
// assistant text (literal id mention OR ≥20 contiguous chars in common). Iterates
// 20-char windows of the (typically shorter) assistant text against the larger
// transcript so cost is O(M_assistant + L_transcript) per segment via String.includes.
export const detectCitedSegments = (
    assistantContent: string,
    injected: Segment[],
): string[] => {
    const cited: string[] = [];
    const text = assistantContent;
    if (!text) return cited;

    for (const seg of injected) {
        if (text.includes(seg.id)) {
            cited.push(seg.id);
            continue;
        }
        const transcriptText = (seg.transcript || [])
            .map(m => (typeof m?.content === 'string' ? m.content : ''))
            .join('\n');
        if (transcriptText.length < MIN_CITE_SUBSTRING) continue;

        for (let start = 0; start + MIN_CITE_SUBSTRING <= text.length; start++) {
            if (transcriptText.includes(text.slice(start, start + MIN_CITE_SUBSTRING))) {
                cited.push(seg.id);
                break;
            }
        }
    }
    return cited;
};

export const recordRetrievalFeedback = (
    query: string,
    segmentIds: string[],
): void => {
    if (segmentIds.length === 0) return;
    fetch('/api/retrieval_feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, segment_ids: segmentIds, helpful: 1 }),
    }).catch(e => console.error('retrieval_feedback POST failed:', e));
};
