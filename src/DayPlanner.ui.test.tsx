
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DayPlanner from './DayPlanner';

// Mock dependencies
vi.mock('./services/llm', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./services/llm')>();
    return {
        ...actual,
        getProvider: vi.fn(),
        sendSmartMessage: vi.fn(),
        getAvailableProviders: vi.fn(() => [{ id: 'mock', name: 'Mock', requiredFields: [] }]),
        generateContextSummary: vi.fn()
    };
});

vi.mock('./components/SettingsModal', () => ({
    SettingsModal: () => <div>SettingsModal</div>
}));

vi.mock('./utils/storagePolyfill', () => ({
    initializeStorage: vi.fn(),
    storage: {
        get: vi.fn(() => Promise.resolve(null)),
        set: vi.fn(() => Promise.resolve()),
        patch: vi.fn(() => Promise.resolve())
    }
}));

describe('DayPlanner UI Modes', () => {
    beforeEach(() => {
        window.HTMLElement.prototype.scrollIntoView = vi.fn();
        vi.clearAllMocks();
    });

    it('should render mode switcher with all three modes', async () => {
        await act(async () => {
            render(<DayPlanner />);
        });

        expect(screen.getByText('Mapping')).toBeInTheDocument();
        expect(screen.getByText('Focusing')).toBeInTheDocument();
        expect(screen.getByText('Execution')).toBeInTheDocument();
    });

    it('should default to Focusing mode', async () => {
        await act(async () => {
            render(<DayPlanner />);
        });

        // focusing button should have blue text/white bg style (checking via class string is brittle but quick)
        // Better: check the placeholder text which depends on mode
        const input = screen.getByPlaceholderText(/How are you feeling\? What would you like to do\?/i);
        expect(input).toBeInTheDocument();
    });

    it('should switch content when Mapping mode is clicked', async () => {
        await act(async () => {
            render(<DayPlanner />);
        });

        const mappingBtn = screen.getByText('Mapping');

        await act(async () => {
            fireEvent.click(mappingBtn);
        });

        const input = screen.getByPlaceholderText(/What's on your mind\? Let's get it all down.../i);
        expect(input).toBeInTheDocument();
    });

    it('should switch content when Execution mode is clicked', async () => {
        await act(async () => {
            render(<DayPlanner />);
        });

        const execBtn = screen.getByText('Execution');

        await act(async () => {
            fireEvent.click(execBtn);
        });

        const input = screen.getByPlaceholderText(/What step are you on\? Need any help\?/i);
        expect(input).toBeInTheDocument();
    });
});
