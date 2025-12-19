import type { LLMProvider, ToolCall } from '../types';

export const GeminiProvider: LLMProvider = {
    id: 'gemini',
    name: 'Google Gemini',
    requiredFields: [
        { key: 'apiKey', label: 'API Key', type: 'password' },
        { key: 'model', label: 'Model (e.g., gemini-1.5-flash, gemini-1.5-pro)', type: 'text' }
    ],
    sendMessage: async (messages, systemPrompt, tools, config) => {
        const model = config.model || 'gemini-1.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`;

        // Gemini API Format Map
        const contents = messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));

        // Add system instruction if supported or prepend (Gemini System Instructions are separate field in v1beta)
        // We will pass it as system_instruction

        const geckoTools = tools.map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.input_schema // Gemini matches JSON schema mostly
        }));

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: contents,
                system_instruction: { parts: [{ text: systemPrompt }] },
                tools: geckoTools.length > 0 ? [{ function_declarations: geckoTools }] : undefined
            })
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Gemini API Error: ${err}`);
        }

        const data = await response.json();
        const candidate = data.candidates?.[0];
        const parts = candidate?.content?.parts || [];

        let content = '';
        const toolCalls: ToolCall[] = [];


        for (const part of parts) {
            if (part.text) content += part.text;
            if (part.functionCall) {
                toolCalls.push({
                    id: 'call_' + Math.random().toString(36).substr(2, 9),
                    name: part.functionCall.name,
                    input: part.functionCall.args
                });
            }
        }

        return { content, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
    }
};
