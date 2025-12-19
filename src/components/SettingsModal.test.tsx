
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { SettingsModal } from './SettingsModal';
import * as llmService from '../services/llm';

// Mock the LLM service module
vi.mock('../services/llm', () => ({
    getProvider: vi.fn(),
    getAvailableProviders: vi.fn(),
}));

// Mock Lucide icons component to avoid issues with SVG rendering in jsdom if any
vi.mock('lucide-react', () => ({
    X: () => <span data-testid="icon-close">X</span>,
    Save: () => <span data-testid="icon-save">Save</span>,
}));

const mockProviders = [
    {
        id: 'mock-provider-1',
        name: 'Mock Provider 1',
        requiredFields: [{ key: 'apiKey', label: 'API Key', type: 'password' }],
        sendMessage: vi.fn(),
    },
    {
        id: 'mock-provider-2',
        name: 'Mock Provider 2',
        requiredFields: [{ key: 'url', label: 'Endpoint URL', type: 'text' }],
        sendMessage: vi.fn(),
    }
];

describe('SettingsModal', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        // Setup default mock returns
        (llmService.getAvailableProviders as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockProviders);
        (llmService.getProvider as unknown as ReturnType<typeof vi.fn>).mockImplementation((id: string) =>
            mockProviders.find(p => p.id === id) || mockProviders[0]
        );
    });

    it('renders nothing when closed', () => {
        const { container } = render(
            <SettingsModal
                isOpen={false}
                onClose={() => { }}
                onSave={() => { }}
                currentConfig={{ provider: 'mock-provider-1', config: {} }}
            />
        );
        expect(container).toBeEmptyDOMElement();
    });

    it('renders correctly when open', () => {
        render(
            <SettingsModal
                isOpen={true}
                onClose={() => { }}
                onSave={() => { }}
                currentConfig={{ provider: 'mock-provider-1', config: {} }}
            />
        );
        expect(screen.getByText('Settings')).toBeInTheDocument();
        // The select value check
        const select = screen.getByRole('combobox');
        expect(select).toHaveValue('mock-provider-1');

        expect(screen.getByPlaceholderText('Enter API Key')).toBeInTheDocument();
    });

    it('updates config when inputs change', () => {
        const onSave = vi.fn();
        render(
            <SettingsModal
                isOpen={true}
                onClose={() => { }}
                onSave={onSave}
                currentConfig={{ provider: 'mock-provider-1', config: {} }}
            />
        );

        const input = screen.getByPlaceholderText('Enter API Key');
        fireEvent.change(input, { target: { value: 'secret-key' } });

        // Find save button by text content
        const saveBtn = screen.getByRole('button', { name: /save/i });
        fireEvent.click(saveBtn);

        expect(onSave).toHaveBeenCalledWith({
            provider: 'mock-provider-1',
            config: { apiKey: 'secret-key' },
            providerConfigs: {
                'mock-provider-1': { apiKey: 'secret-key' }
            }
        });
    });

    it('switches providers and updates fields', () => {
        const onSave = vi.fn();
        render(
            <SettingsModal
                isOpen={true}
                onClose={() => { }}
                onSave={onSave}
                currentConfig={{ provider: 'mock-provider-1', config: {} }}
            />
        );

        // Switch to Provider 2
        const select = screen.getByRole('combobox');
        fireEvent.change(select, { target: { value: 'mock-provider-2' } });

        // Check if field changed (React rerender)
        expect(screen.getByPlaceholderText('Enter Endpoint URL')).toBeInTheDocument();
        expect(screen.queryByPlaceholderText('Enter API Key')).not.toBeInTheDocument();

        // Fill new field
        const input = screen.getByPlaceholderText('Enter Endpoint URL');
        fireEvent.change(input, { target: { value: 'http://localhost' } });

        const saveBtn = screen.getByRole('button', { name: /save/i });
        fireEvent.click(saveBtn);

        expect(onSave).toHaveBeenCalledWith({
            provider: 'mock-provider-2',
            config: { url: 'http://localhost' },
            providerConfigs: {
                'mock-provider-1': {},
                'mock-provider-2': { url: 'http://localhost' }
            }
        });
    });

    it('closes when cancel is clicked', () => {
        const onClose = vi.fn();
        render(
            <SettingsModal
                isOpen={true}
                onClose={onClose}
                onSave={() => { }}
                currentConfig={{ provider: 'mock-provider-1', config: {} }}
            />
        );

        const cancelBtn = screen.getByText('Cancel');
        fireEvent.click(cancelBtn);
        expect(onClose).toHaveBeenCalled();
    });
});
