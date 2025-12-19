import type { LLMProvider } from '../types';

export const AnthropicProvider: LLMProvider = {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    requiredFields: [
        { key: 'apiKey', label: 'API Key', type: 'password' },
        { key: 'model', label: 'Model (e.g., claude-3-5-sonnet-latest)', type: 'text' }
    ],
    sendMessage: async (messages, systemPrompt, tools, config) => {
        const response = await fetch('/api/anthropic/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': config.apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true' // Since we are proxying, this might not be strictly needed but good for dev
            },
            body: JSON.stringify({
                model: config.model || 'claude-3-5-sonnet-latest',
                max_tokens: 1024,
                system: systemPrompt,
                messages: messages.map(m => ({ role: m.role, content: m.content })),
                tools: tools
            })
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Anthropic API Error: ${err}`);
        }

        const data = await response.json();

        let content = '';
        const toolCalls = [];

        for (const block of data.content) {
            if (block.type === 'text') {
                content += block.text;
            } else if (block.type === 'tool_use') {
                toolCalls.push({
                    id: block.id,
                    name: block.name,
                    input: block.input
                });
            }
        }

        return { content, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
    }
};
