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
    method: string;
    body: unknown;
}

let fetchCalls: FetchCall[];

beforeEach(() => {
    fetchCalls = [];
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
        fetchCalls.push({
            url,
            method: init?.method ?? 'GET',
            body: init?.body ? JSON.parse(init.body as string) : undefined,
        });
        return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, segment: { id: 'returned-id' } }),
        } as Response);
    }));
    vi.clearAllMocks();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

const mockData = {
    values: [{ id: 1, name: 'Health', description: '' }],
    goals: [{ id: 10, name: 'Run a marathon', valueId: 1, description: '', timeframe: '' }],
    projects: [{ id: 100, name: 'Training plan', goalId: 10, description: '', status: 'in_progress' as const }],
    tasks: [{ id: 1000, name: 'Long run Saturday', projectId: 100, urgency: 3, importance: 3, workType: 'focus' as const, completed: false }],
    capacity: { energy: 3, mood: 3, stress: 3, timeAvailable: 4, physicalState: 3 },
};

const mockActions = {
    addItem: vi.fn(),
    updateItem: vi.fn(),
    deleteItem: vi.fn(),
    setCapacity: vi.fn(),
    toggleTask: vi.fn(),
};

const summaryResult = {
    summary: 'User discussed training plan.',
    mood: 3,
    stress: 2,
    energy: 4,
    physical: 3,
    facts: ['Long run on Saturday'],
};

describe('useChatSummarizer segment write integration', () => {
    it('writes segment to /api/segments after /api/log/archive (order invariant)', async () => {
        vi.mocked(llmService.generateContextSummary).mockResolvedValue(summaryResult);
        vi.mocked(llmService.sendSmartMessage).mockResolvedValue({ content: 'OK', toolCalls: [] });

        const messages: Message[] = Array.from({ length: 30 }, (_, i) => ({
            role: i % 2 === 0 ? 'user' : 'assistant',
            content: `Message ${i} about Training plan`,
        }));

        const { result } = renderHook(() => usePlannerAI(mockData, mockActions, messages));

        await act(async () => {
            await result.current.summarizeConversation(true);
        });

        const archiveIdx = fetchCalls.findIndex(c => c.url === '/api/log/archive');
        const segmentIdx = fetchCalls.findIndex(c => c.url === '/api/segments');

        expect(archiveIdx).toBeGreaterThanOrEqual(0);
        expect(segmentIdx).toBeGreaterThanOrEqual(0);
        expect(archiveIdx).toBeLessThan(segmentIdx);
    });

    it('segment payload carries lineage derived from active focus state', async () => {
        vi.mocked(llmService.generateContextSummary).mockResolvedValue(summaryResult);
        vi.mocked(llmService.sendSmartMessage).mockResolvedValue({ content: 'OK', toolCalls: [] });

        const messages: Message[] = Array.from({ length: 30 }, (_, i) => ({
            role: i % 2 === 0 ? 'user' : 'assistant',
            content: `Message ${i} about Training plan`,
        }));

        const { result } = renderHook(() =>
            usePlannerAI(mockData, mockActions, messages, 'focusing', { focus: { projectId: 100 } })
        );

        await act(async () => {
            await result.current.summarizeConversation(true);
        });

        const segmentCall = fetchCalls.find(c => c.url === '/api/segments');
        expect(segmentCall).toBeDefined();
        const body = segmentCall!.body as {
            id: string;
            thread_id: string;
            transcript: Message[];
            summary: string;
            lineage: { valueId: number | null; goalId: number | null; projectId: number | null; taskId: number | null };
            metadata: { archive_file: string };
        };
        // Project 100 → ancestors are goal 10 and value 1 via resolveExplicitFocus.
        expect(body.lineage.projectId).toBe(100);
        expect(body.lineage.goalId).toBe(10);
        expect(body.lineage.valueId).toBe(1);
        expect(body.lineage.taskId).toBeNull();
        expect(body.summary).toBe(summaryResult.summary);
        expect(body.thread_id).toMatch(/^thread-/);
        expect(body.metadata.archive_file).toMatch(/^logs\/chat_archive_\d{4}-\d{2}-\d{2}\.jsonl$/);
        expect(body.transcript.length).toBeGreaterThan(0);
    });

    it('segment write failure does not block summarization', async () => {
        vi.mocked(llmService.generateContextSummary).mockResolvedValue(summaryResult);
        vi.mocked(llmService.sendSmartMessage).mockResolvedValue({ content: 'OK', toolCalls: [] });

        vi.unstubAllGlobals();
        vi.stubGlobal('fetch', vi.fn((url: string) => {
            if (url === '/api/segments') {
                return Promise.reject(new Error('boom'));
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
        }));

        const messages: Message[] = Array.from({ length: 30 }, (_, i) => ({
            role: i % 2 === 0 ? 'user' : 'assistant',
            content: `Message ${i}`,
        }));

        const { result } = renderHook(() => usePlannerAI(mockData, mockActions, messages));

        await act(async () => {
            await result.current.summarizeConversation(true);
        });

        // Capacity is updated by the summary flow — proves the function reached past the failed segment write.
        expect(mockActions.setCapacity).toHaveBeenCalled();
    });
});
