/* eslint-disable @typescript-eslint/no-explicit-any */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePlannerAI } from './usePlannerAI';
import * as llm from '../services/llm';

// Mock the LLM service
vi.mock('../services/llm', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../services/llm')>();
    return {
        ...actual,
        sendSmartMessage: vi.fn(),
    };
});

describe('usePlannerAI Hook', () => {
    let mockActions: any;
    let mockData: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockActions = {
            addItem: vi.fn(),
            updateItem: vi.fn(),
            deleteItem: vi.fn(),
            setCapacity: vi.fn(),
            toggleTask: vi.fn()
        };

        mockData = {
            values: [],
            goals: [],
            projects: [],
            tasks: [],
            capacity: { energy: 3, mood: 3, stress: 3, timeAvailable: 4, physicalState: 3 }
        };

        // Default mock response
        (llm.sendSmartMessage as any).mockResolvedValue({
            content: 'Thinking...',
            toolCalls: []
        });
    });

    it('should execute add_goal tool', async () => {
        const { result } = renderHook(() => usePlannerAI(mockData, mockActions));

        // Mock LLM response with tool call
        (llm.sendSmartMessage as any)
            .mockResolvedValueOnce({
                content: 'Adding goal',
                toolCalls: [{
                    id: 'call_1',
                    name: 'add_goal',
                    input: { name: 'Learn Rust', description: 'Read book', value_id: 123, timeframe: 'Q1' }
                }]
            })
            .mockResolvedValueOnce({ content: 'Goal added.' }); // Follow-up

        await act(async () => {
            await result.current.sendMessage('Add a goal');
        });

        // Verify action was called with correct params
        expect(mockActions.addItem).toHaveBeenCalledWith('goal', {
            name: 'Learn Rust',
            description: 'Read book',
            value_id: 123,
            timeframe: 'Q1'
        });
    });

    it('should execute add_project tool', async () => {
        const { result } = renderHook(() => usePlannerAI(mockData, mockActions));

        (llm.sendSmartMessage as any)
            .mockResolvedValueOnce({
                content: 'Adding project',
                toolCalls: [{
                    id: 'call_p1',
                    name: 'add_project',
                    input: { name: 'Build Web App', description: 'React app', goal_id: 10, status: 'not_started' }
                }]
            })
            .mockResolvedValueOnce({ content: 'Done.' });

        await act(async () => {
            await result.current.sendMessage('Add project');
        });

        expect(mockActions.addItem).toHaveBeenCalledWith('project', {
            name: 'Build Web App',
            description: 'React app',
            goal_id: 10,
            status: 'not_started'
        });
    });

    it('should execute add_task tool with deadline and recurrence', async () => {
        const { result } = renderHook(() => usePlannerAI(mockData, mockActions));

        (llm.sendSmartMessage as any)
            .mockResolvedValueOnce({
                content: 'Adding task',
                toolCalls: [{
                    id: 'call_t1',
                    name: 'add_task',
                    input: {
                        name: 'Pay Bills',
                        project_id: 50,
                        importance: 5,
                        urgency: 5,
                        work_type: 'admin',
                        deadline: '2025-12-31',
                        recurrence: 'monthly'
                    }
                }]
            })
            .mockResolvedValueOnce({ content: 'Task added.' });

        await act(async () => {
            await result.current.sendMessage('Add task');
        });

        expect(mockActions.addItem).toHaveBeenCalledWith('task', expect.objectContaining({
            name: 'Pay Bills',
            projectId: 50,
            deadline: '2025-12-31',
            recurrence: 'monthly'
        }));
    });
});
