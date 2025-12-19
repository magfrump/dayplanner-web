import type { LLMProvider, LLMConfig, Message, Tool, LLMResponse, TraceData } from './types';
import { AnthropicProvider } from './providers/anthropic';
import { OllamaProvider } from './providers/ollama';
import { GeminiProvider } from './providers/gemini';

const providers: Record<string, LLMProvider> = {
    anthropic: AnthropicProvider,
    ollama: OllamaProvider,
    gemini: GeminiProvider
};

export const getProvider = (id: string): LLMProvider => {
    const provider = providers[id] || AnthropicProvider;

    // Wrap sendMessage with logging
    const originalSendMessage = provider.sendMessage;
    return {
        ...provider,
        sendMessage: async (messages, systemPrompt, tools, config) => {
            // Setup Trace Data
            const traceData: TraceData = {
                direction: 'response',
                messages,
                systemPrompt,
                tools,
                config: { ...config, apiKey: '***' } // Mask API key
            };

            // Log Request
            try {
                await fetch('/api/log/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        direction: 'request',
                        provider: provider.id,
                        ...traceData
                    })
                });
            } catch (e) {
                console.error('Failed to log chat request', e);
            }

            // Execute
            try {
                const response = await originalSendMessage(messages, systemPrompt, tools, config);

                // Attach trace data to response
                response.traceData = {
                    ...traceData,
                    rawResponse: response // Self-reference or specific raw data if providers returned it
                };

                // Log Response
                try {
                    await fetch('/api/log/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            direction: 'response',
                            provider: provider.id,
                            response
                        })
                    });
                } catch (e) {
                    console.error('Failed to log chat response', e);
                }

                return response;
            } catch (error) {
                // Log Error
                try {
                    await fetch('/api/log/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            direction: 'error',
                            provider: provider.id,
                            error: error instanceof Error ? error.message : String(error)
                        })
                    });
                } catch (e) {
                    console.error('Failed to log chat error', e);
                }
                throw error;
            }
        }
    };
};

export const getAvailableProviders = () => Object.values(providers);

const FALLBACK_ORDER = ['anthropic', 'gemini', 'ollama'];

export const sendSmartMessage = async (
    messages: Message[],
    systemPrompt: string,
    tools: Tool[],
    llmConfig: LLMConfig
): Promise<LLMResponse> => {
    // Determine order: Preferred -> Others in priority order
    const preferred = llmConfig.provider;
    const others = FALLBACK_ORDER.filter(id => id !== preferred);
    const order = [preferred, ...others];

    // De-dupe
    const uniqueOrder = [...new Set(order)];

    let lastError: Error | null = null;
    const errors: string[] = [];

    for (const providerId of uniqueOrder) {
        // Get config for this provider
        // Check active config first if it matches, then providerConfigs
        let config: Record<string, string> | undefined;

        if (providerId === llmConfig.provider) {
            config = llmConfig.config;
        }

        if ((!config || providerId !== llmConfig.provider) && llmConfig.providerConfigs?.[providerId]) {
            config = llmConfig.providerConfigs[providerId];
        }

        const provider = getProvider(providerId);
        const validConfig = config || {};

        // Skip if required keys are missing (and we have no config for it)
        if (provider.requiredFields.length > 0 && Object.keys(validConfig).length === 0) {
            continue;
        }

        try {
            const response = await provider.sendMessage(messages, systemPrompt, tools, validConfig);

            // If we had previous errors, append a note to the content so the user knows
            if (errors.length > 0) {
                const errorSummary = errors.map(e => `[${e}]`).join(' -> ');
                response.content = `[System Notice: Recovered from API errors: ${errorSummary}]\n\n${response.content}`;
            }
            return response;
        } catch (e: unknown) {
            console.warn(`Provider ${providerId} failed:`, e);
            lastError = e instanceof Error ? e : new Error(String(e));
            const msg = e instanceof Error ? e.message : String(e);
            const cleanMsg = msg.length > 50 ? msg.substring(0, 50) + '...' : msg;
            errors.push(`${providerId}: ${cleanMsg}`);
        }
    }

    throw lastError || new Error('All accessible providers failed. Please check your API keys.');
};

export const generateContextSummary = async (
    messages: Message[],
    llmConfig: LLMConfig
): Promise<{ summary: string; mood: number; facts: string[] }> => {
    // We want to summarize the set of messages. 
    // We'll use a specific tool definition to force structured output.
    const summaryTool: Tool = {
        name: 'commit_summary',
        description: 'Commit the summary of the conversation segment',
        input_schema: {
            type: 'object',
            properties: {
                summary: { type: 'string', description: 'A concise 1-paragraph summary of what happened, maintaining context for future tasks.' },
                mood_score: { type: 'number', minimum: 1, maximum: 5, description: 'The user\'s estimated mood/energy during this segment (1=Low/Bad, 5=High/Good)' },
                key_facts: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'List of extraction-worthy facts or constraints mentioned (e.g. "Meeting at 5pm", "Project X is delayed"). Do not include opinions.'
                }
            },
            required: ['summary', 'mood_score', 'key_facts']
        }
    };

    const promptMessages: Message[] = [
        {
            role: 'user',
            content: `Please analyze the following conversation segment and summarize it to clear the context window. 
            Extract key facts and estimate the user's mood. 
            Ignore separate "venting" or emotional outbursts in the summary unless they are relevant to the user's state (mood score).
            
            CONVERSATION SEGMENT:
            ${messages.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n\n')}
            `
        }
    ];

    try {
        const response = await sendSmartMessage(
            promptMessages,
            "You are a helpful assistant responsible for maintaining context hygiene. Summarize the conversation.",
            [summaryTool],
            llmConfig
        );

        const toolCall = response.toolCalls?.find(tc => tc.name === 'commit_summary');
        if (toolCall) {
            return {
                summary: (toolCall.input.summary as string),
                mood: (toolCall.input.mood_score as number),
                facts: (toolCall.input.key_facts as string[])
            };
        }

        // Fallback if no tool call (shouldn't happen with good models, but handle text)
        return {
            summary: response.content,
            mood: 3,
            facts: []
        };
    } catch (e) {
        console.error("Summarization failed", e);
        return { summary: "Error generating summary.", mood: 3, facts: [] };
    }
};
