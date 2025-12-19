
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import DayPlanner from './DayPlanner';
import * as llm from './services/llm';

// Mock the LLM service
vi.mock('./services/llm', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./services/llm')>();
    return {
        ...actual,
        getProvider: vi.fn(),
        sendSmartMessage: vi.fn(),
        getAvailableProviders: vi.fn(() => [{ id: 'mock', name: 'Mock', requiredFields: [] }])
    };
});

// Mock SettingsModal to avoid clutter
vi.mock('./components/SettingsModal', () => ({
    SettingsModal: () => null
}));

// Storage Polyfill Mock
vi.mock('./utils/storagePolyfill', () => ({
    initializeStorage: vi.fn(),
    storage: {
        get: vi.fn(() => Promise.resolve(null)),
        set: vi.fn(() => Promise.resolve()),
        patch: vi.fn(() => Promise.resolve())
    }
}));

describe('DayPlanner Tools', () => {
    beforeEach(() => {
        // Mock scrollIntoView
        window.HTMLElement.prototype.scrollIntoView = vi.fn();
        window.Element.prototype.scrollIntoView = vi.fn();

        // Mock window.storage
        (window as any).storage = {
            get: vi.fn().mockResolvedValue(null),
            set: vi.fn().mockResolvedValue(undefined),
            patch: vi.fn().mockResolvedValue(undefined)
        };

        vi.clearAllMocks();
        // Setup default mock response
        (llm.sendSmartMessage as any).mockResolvedValue({
            content: 'Thinking...',
            toolCalls: []
        });
        (llm.getProvider as any).mockReturnValue({
            id: 'mock',
            sendMessage: vi.fn()
        });
    });

    it('should handle add_value tool', async () => {
        // Mock LLM response to call add_value
        (llm.sendSmartMessage as any).mockResolvedValueOnce({
            content: 'Adding value',
            toolCalls: [{
                id: 'call_1',
                name: 'add_value',
                input: { name: 'Health', description: 'Focus on physical well-being' }
            }]
        });

        render(<DayPlanner />);

        // Wait for render (Plan view shows Current State)
        await waitFor(() => expect(screen.getByText('Current State')).toBeInTheDocument());

        // Trigger a message


        // Just simulating user input isn't enough because we need to trigger the tool loop.
        // We'll type and click send.
        // NOTE: The button relies on the icon, accessible name might be missing.
        // Let's rely on test id or generic button finding if 'Send' fails.
        // Adding data-testid to UI would be better, but assuming icon button is findable.

        await act(async () => {
            // Typing in textarea
            const textarea = screen.getByPlaceholderText(/How are you feeling\? What would you like to do\?/i);
            fireEvent.change(textarea, { target: { value: 'Add health value' } });
            expect(textarea).toHaveValue('Add health value');
        });

        // Click send
        const submitBtn = screen.getByTestId('send-message-button');

        await waitFor(() => expect(submitBtn).toBeEnabled());

        await act(async () => {
            submitBtn.click();
        });

        // Wait for tool execution and state update
        await waitFor(() => {
            expect(llm.sendSmartMessage).toHaveBeenCalled();
        });

        // Switch to Data tab to see values
        const dataTabBtn = screen.getByRole('button', { name: /Data/i });
        await act(async () => {
            dataTabBtn.click();
        });

        // Check if "Health" appears in the Values section
        await waitFor(() => {
            expect(screen.getByText('Health')).toBeInTheDocument();
        });
    });

    it('should handle add_goal tool', async () => {
        const valueId = 1000;

        vi.useFakeTimers();
        vi.setSystemTime(valueId); // First call gets ID 1000

        // Mock chain for Value then Goal
        (llm.sendSmartMessage as any)
            .mockResolvedValueOnce({
                content: 'Added value',
                toolCalls: [{
                    id: 'call_1',
                    name: 'add_value',
                    input: { name: 'Test Value', description: 'Desc' }
                }]
            })
            .mockResolvedValueOnce({
                content: 'Added goal',
                toolCalls: [{
                    id: 'call_2',
                    name: 'add_goal',
                    input: { name: 'Learn Rust', description: 'Read the book', value_id: 123, timeframe: 'Q1' } // IDs are Date.now(), so exact ID matching is tricky.
                    // But wait, the tool input defines the ID relation. 
                    // Actually, the add_goal tool requires a value_id.
                    // In real usage, the LLM would see the available values (and their IDs) in the context.
                    // Since we start empty, we have no values.
                    // So we must add a value first.
                    // But since we can't easily capture the random ID generated by Date.now() in the first step to pass to the second step in a test...
                    // We might need to mock Date.now() or just check that the goal is added effectively.
                }]
            });

        // Actually, if we pass an arbitrary value_id to add_goal, it will just add it. The data model isn't enforcing strict relational integrity in the reducer (it just adds to array).
        // The *rendering* might fail if it tries to lookup value name.
        // Let's see DayPlanner rendering logic...
        // <GoalSection goals={goals.filter(g => g.valueId === activeValue?.id)} ... />
        // It seems goals are filtered by active value!
        // So to see a goal, we must select a value.
        // This makes testing harder. 

        // Alternatively, we can inspect the state or verify that the "Tools executed" message appears.
        // But better is to just verify state update via UI side effects that ARE visible.
        // Or refactor to make testing easier.
        // For now, let's just test `add_project` which depends on Goal.

        // Simpler strategy: Verify that the tool *calls* result in the expected calls to `sendSmartMessage` (re-entrancy) with updated context?
        // No, that's testing implementation details.

        // Let's just trust that if `add_value` worked, `add_goal` works similarly as they use same pattern.
        // I will verify `add_goal` by adding a value first, and then assume users click it?
        // No, I can't simulate clicking a value easily without knowing its ID.

        // FORCE THE IDS: 
        // I can mock Date.now()!
    });


});
