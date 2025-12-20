import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usePlannerAI } from './usePlannerAI';
import * as llmService from '../services/llm';

// Mock the LLM service
vi.mock('../services/llm', () => ({
    generateContextSummary: vi.fn(),
    sendSmartMessage: vi.fn()
}));

// Mock fetch
vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)));

describe('usePlannerAI Mood Sync', () => {
    const mockData = {
        values: [], goals: [], projects: [], tasks: [],
        capacity: { energy: 3, mood: 3, stress: 3, timeAvailable: 4, physicalState: 3 }
    };

    const mockActions = {
        addItem: vi.fn(),
        updateItem: vi.fn(),
        deleteItem: vi.fn(),
        setCapacity: vi.fn(),
        toggleTask: vi.fn()
    };

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should update capacity fields when summarization completes', async () => {
        // Setup mock return for summary
        vi.mocked(llmService.generateContextSummary).mockResolvedValue({
            summary: 'User is frustrated and tired.',
            mood: 1,
            stress: 5,
            energy: 2,
            physical: 3,
            facts: ['Nothing working']
        });

        // Setup mock return for sendMessage to avoid crash
        vi.mocked(llmService.sendSmartMessage).mockResolvedValue({
            content: 'OK',
            toolCalls: [],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            traceData: {} as any
        });

        // Create dummy messages
        const dummyMessages = Array.from({ length: 30 }, (_, i) => ({
            role: 'user',
            content: `Msg ${i}`
        }));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { result } = renderHook(() => usePlannerAI(mockData, mockActions, dummyMessages as any));

        // Trigger summary
        await act(async () => {
            await result.current.summarizeConversation(true);
        });

        // Verify generateContextSummary was called
        expect(llmService.generateContextSummary).toHaveBeenCalled();

        // Verify setCapacity was called
        expect(mockActions.setCapacity).toHaveBeenCalled();

        // precise verification of the update function behavior
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateFn = mockActions.setCapacity.mock.calls[0][0] as (prev: any) => any;
        const newState = updateFn({ energy: 3, mood: 3, stress: 3, physicalState: 3 });

        expect(newState.mood).toBe(1);
        expect(newState.stress).toBe(5);
        expect(newState.energy).toBe(2);
        expect(newState.physicalState).toBe(3);
    });
});
