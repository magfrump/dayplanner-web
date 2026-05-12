import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usePlannerAI } from './usePlannerAI';
import * as llmService from '../services/llm';
import type { Message } from '../services/types';

vi.mock('../services/llm', () => ({
    generateContextSummary: vi.fn(),
    sendSmartMessage: vi.fn(),
}));

// Persist toggle into the LLMConfig loaded from localStorage.
beforeEach(() => {
    localStorage.setItem(
        'dayplanner_llm_config',
        JSON.stringify({
            provider: 'mock',
            config: {},
            providerConfigs: {},
            enableRelevantPastContext: true,
        }),
    );
});

interface FetchCall {
    url: string;
    method: string;
    body: unknown;
}

let fetchCalls: FetchCall[];

const injectedSegments = [
    {
        id: 'seg-PHASE3-A',
        thread_id: 'thread-prev',
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
        transcript: [
            { role: 'user', content: 'I bought running shoes from the store on Main Street last week.' },
        ],
        summary: 'Bought running shoes',
        lineage: { valueId: 1, goalId: 10, projectId: 100, taskId: null },
        metadata: { needs_classification: false, open_loop: false, archive_file: 'logs/a.jsonl' },
    },
];

const stubFetch = (overrides: Partial<Record<string, unknown>> = {}) => {
    return vi.fn((url: string, init?: RequestInit) => {
        const call: FetchCall = {
            url,
            method: init?.method ?? 'GET',
            body: init?.body ? JSON.parse(init.body as string) : undefined,
        };
        fetchCalls.push(call);
        if (url.startsWith('/api/segments/search')) {
            const body = overrides[url] ?? { results: injectedSegments };
            return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) } as Response);
    });
};

beforeEach(() => {
    fetchCalls = [];
    vi.stubGlobal('fetch', stubFetch());
    vi.clearAllMocks();
    vi.mocked(llmService.sendSmartMessage).mockResolvedValue({ content: 'OK', toolCalls: [] });
});

afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
});

const data = {
    values: [{ id: 1, name: 'Health', description: '' }],
    goals: [{ id: 10, name: 'Run a marathon', valueId: 1, description: '', timeframe: '', completed: false }],
    projects: [
        { id: 100, name: 'Training plan', goalId: 10, description: '', status: 'in_progress' as const, completed: false },
    ],
    tasks: [],
    capacity: { energy: 3, mood: 3, stress: 3, timeAvailable: 4, physicalState: 3 },
};

const actions = {
    addItem: vi.fn(),
    updateItem: vi.fn(),
    deleteItem: vi.fn(),
    setCapacity: vi.fn(),
    toggleTask: vi.fn(),
};

describe('usePlannerAI Phase 3 retrieval', () => {
    it('queries /api/segments/search with lineage filter when toggle is on', async () => {
        const { result } = renderHook(() =>
            usePlannerAI(data, actions, undefined, 'focusing', { focus: { projectId: 100 } }),
        );

        await act(async () => { await result.current.sendMessage('Tell me about training plan'); });

        const searchCall = fetchCalls.find(c => c.url.startsWith('/api/segments/search'));
        expect(searchCall).toBeDefined();
        expect(searchCall!.url).toContain('projectId=100');
        expect(searchCall!.url).toContain('valueId=1');
        expect(searchCall!.url).toContain('goalId=10');
    });

    it('skips retrieval entirely when enableRelevantPastContext is off', async () => {
        localStorage.setItem(
            'dayplanner_llm_config',
            JSON.stringify({ provider: 'mock', config: {}, providerConfigs: {}, enableRelevantPastContext: false }),
        );

        const { result } = renderHook(() =>
            usePlannerAI(data, actions, undefined, 'focusing', { focus: { projectId: 100 } }),
        );

        await act(async () => { await result.current.sendMessage('Tell me about training plan'); });

        const searchCall = fetchCalls.find(c => c.url.startsWith('/api/segments/search'));
        expect(searchCall).toBeUndefined();
    });

    it('stashes retrievalState on the assistant message after a retrieval-augmented send', async () => {
        const { result } = renderHook(() =>
            usePlannerAI(data, actions, undefined, 'focusing', { focus: { projectId: 100 } }),
        );

        await act(async () => { await result.current.sendMessage('Anything about training plan?'); });

        const assistantMsg = result.current.conversation
            .slice()
            .reverse()
            .find((m: Message) => m.role === 'assistant');
        expect(assistantMsg?.retrievalState).toBeDefined();
        expect(assistantMsg!.retrievalState!.segmentIds).toEqual(['seg-PHASE3-A']);
        expect(assistantMsg!.retrievalState!.lineage.projectId).toBe(100);
        expect(assistantMsg!.retrievalState!.freshness).toBe('2026-05-01T00:00:00.000Z');
    });

    it('does not attach retrievalState when retrieval returns no results', async () => {
        vi.unstubAllGlobals();
        vi.stubGlobal('fetch', vi.fn((url: string) => {
            fetchCalls.push({ url, method: 'GET', body: undefined });
            if (url.startsWith('/api/segments/search')) {
                return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [] }) } as Response);
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) } as Response);
        }));

        const { result } = renderHook(() =>
            usePlannerAI(data, actions, undefined, 'focusing', { focus: { projectId: 100 } }),
        );

        await act(async () => { await result.current.sendMessage('Anything about training plan?'); });

        const assistantMsg = result.current.conversation
            .slice()
            .reverse()
            .find((m: Message) => m.role === 'assistant');
        expect(assistantMsg?.retrievalState).toBeUndefined();
    });

    it('posts cited_ids to /api/retrieval_feedback when assistant quotes a ≥20-char substring of an injected segment', async () => {
        // The transcript on the injected segment contains "running shoes from the store on Main Street"
        // — we make the assistant reply quote a 30-char window from it.
        vi.mocked(llmService.sendSmartMessage).mockResolvedValue({
            content: 'Earlier you said "bought running shoes from the store" so check those.',
            toolCalls: [],
        });

        const { result } = renderHook(() =>
            usePlannerAI(data, actions, undefined, 'focusing', { focus: { projectId: 100 } }),
        );

        await act(async () => { await result.current.sendMessage('Remind me about training plan?'); });

        await waitFor(() => {
            const fbCall = fetchCalls.find(c => c.url === '/api/retrieval_feedback');
            expect(fbCall).toBeDefined();
            const body = fbCall!.body as { cited_ids: string[]; uncited_ids: string[] };
            expect(body.cited_ids).toContain('seg-PHASE3-A');
            expect(body.uncited_ids).toEqual([]);
        });
    });

    it('posts the retrieved segment as uncited when assistant cites nothing — needed for the §6 implicit-negative signal', async () => {
        vi.mocked(llmService.sendSmartMessage).mockResolvedValue({
            content: 'Sure, let me help you plan.',
            toolCalls: [],
        });

        const { result } = renderHook(() =>
            usePlannerAI(data, actions, undefined, 'focusing', { focus: { projectId: 100 } }),
        );

        await act(async () => { await result.current.sendMessage('Anything new on training plan?'); });

        await waitFor(() => {
            const fbCall = fetchCalls.find(c => c.url === '/api/retrieval_feedback');
            expect(fbCall).toBeDefined();
            const body = fbCall!.body as { cited_ids: string[]; uncited_ids: string[] };
            expect(body.cited_ids).toEqual([]);
            expect(body.uncited_ids).toContain('seg-PHASE3-A');
        });
    });
});
