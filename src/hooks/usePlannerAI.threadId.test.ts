import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usePlannerAI } from './usePlannerAI';
import * as llmService from '../services/llm';
import type { Message } from '../services/types';

vi.mock('../services/llm', () => ({
    generateContextSummary: vi.fn(),
    sendSmartMessage: vi.fn(),
}));

interface FetchCall {
    url: string;
    body: unknown;
}

let fetchCalls: FetchCall[];

beforeEach(() => {
    fetchCalls = [];
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
        fetchCalls.push({
            url,
            body: init?.body ? JSON.parse(init.body as string) : undefined,
        });
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    }));
    vi.clearAllMocks();
    vi.mocked(llmService.generateContextSummary).mockResolvedValue({
        summary: 's', mood: 3, stress: 3, energy: 3, physical: 3, facts: [],
    });
    vi.mocked(llmService.sendSmartMessage).mockResolvedValue({ content: 'ok', toolCalls: [] });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

const data = {
    values: [{ id: 1, name: 'Health', description: '' }],
    goals: [{ id: 10, name: 'Run a marathon', valueId: 1, description: '', timeframe: '', completed: false }],
    projects: [
        { id: 100, name: 'Training plan', goalId: 10, description: '', status: 'in_progress' as const, completed: false },
        { id: 200, name: 'Other project', goalId: 10, description: '', status: 'in_progress' as const, completed: false },
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

const buildSummarizableConversation = (focusName: string): Message[] =>
    Array.from({ length: 30 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `discussion of ${focusName}`,
    }));

describe('usePlannerAI thread_id focus-change rotation', () => {
    const captureThreadId = () =>
        (fetchCalls.find(c => c.url === '/api/segments')?.body as { thread_id?: string })?.thread_id;

    it('keeps thread_id stable when focus does not change', async () => {
        // Seed a long conversation entirely about "Training plan" so inferred focus is project 100 throughout.
        const long = buildSummarizableConversation('Training plan');
        const { result } = renderHook(() => usePlannerAI(data, actions, long));

        await act(async () => { await result.current.summarizeConversation(true); });
        const t1 = captureThreadId();
        expect(t1).toMatch(/^thread-/);
        fetchCalls = [];

        await act(async () => { await result.current.sendMessage('Still on Training plan today'); });
        await act(async () => { await result.current.summarizeConversation(true); });
        const t2 = captureThreadId();
        expect(t2).toBe(t1);
    });

    it('rotates thread_id only after focus persists for FOCUS_DEBOUNCE_TURNS (=2) turns', async () => {
        // Seed the hook so the initial inferred focus is project 100 (via "Training plan" mentions).
        const longTraining = buildSummarizableConversation('Training plan');
        const { result } = renderHook(() => usePlannerAI(data, actions, longTraining));

        // Initial summarize captures thread T0 (lineage rooted at project 100).
        await act(async () => { await result.current.summarizeConversation(true); });
        const t0 = captureThreadId();
        expect(t0).toBeDefined();
        fetchCalls = [];

        // Explicitly switch to project 200. Turn 1 with new focus: pending count = 1, no rotation.
        await act(async () => { result.current.setFocus({ projectId: 200 }); });
        await act(async () => { await result.current.sendMessage('turn 1 with new focus'); });
        await act(async () => { await result.current.summarizeConversation(true); });
        const tAfter1 = captureThreadId();
        expect(tAfter1).toBe(t0);
        fetchCalls = [];

        // Turn 2 with the same focus: pending count reaches 2 → rotate.
        await act(async () => { await result.current.sendMessage('turn 2 with new focus'); });
        await act(async () => { await result.current.summarizeConversation(true); });
        const tAfter2 = captureThreadId();
        expect(tAfter2).toBeDefined();
        expect(tAfter2).not.toBe(t0);
    });
});
