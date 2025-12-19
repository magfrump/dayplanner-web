import type { LLMProvider } from '../types';

export const OllamaProvider: LLMProvider = {
    id: 'ollama',
    name: 'Ollama (Local)',
    requiredFields: [
        { key: 'baseUrl', label: 'Base URL (default: /api/ollama)', type: 'text' },
        { key: 'model', label: 'Model (e.g., llama3.1)', type: 'text' }
    ],
    sendMessage: async (messages, systemPrompt, tools, config) => {
        const baseUrl = config.baseUrl || '/api/ollama';
        const model = config.model || 'llama3.1';

        // Ollama uses OpenAI compatible format mostly, or its own. Let's use /api/chat
        // Note: Ollama tools support is model dependent.

        const allMessages = [
            { role: 'system', content: systemPrompt },
            ...messages
        ];

        const response = await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: model,
                messages: allMessages,
                stream: false,
                tools: tools.map(t => ({
                    type: 'function',
                    function: {
                        name: t.name,
                        description: t.description,
                        parameters: t.input_schema
                    }
                }))
            })
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Ollama API Error (${response.status} ${response.statusText}): ${err}`);
        }

        const data = await response.json();
        const msg = data.message;

        const toolCalls = msg.tool_calls?.map((tc: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
            id: 'call_' + Math.random().toString(36).substr(2, 9), // Ollama might not return IDs in native format
            name: tc.function.name,
            input: tc.function.arguments
        })) || [];

        return {
            content: msg.content || '',
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined
        };
    }
};
