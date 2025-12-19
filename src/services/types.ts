export type Message = {
    role: 'user' | 'assistant' | 'system';
    content: string;
    type?: 'text' | 'summary';
    summaryData?: {
        timestamp_start: string;
        timestamp_end: string;
        mood_score: number;
        key_facts: string[];
    };
    id?: string;
    traceData?: unknown;
    toolCalls?: ToolCall[];
};

export type Tool = {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
};

export type ToolCall = {
    id: string;
    name: string;
    input: Record<string, unknown>;
};

export interface TraceData {
    direction: 'response';
    messages: Message[];
    systemPrompt: string;
    tools: Tool[];
    config: Record<string, string>;
    rawResponse?: unknown; // The raw provider response if available
}

export type LLMResponse = {
    content: string;
    toolCalls?: ToolCall[];
    traceData?: TraceData;
};

export interface LLMProvider {
    id: string;
    name: string;
    requiredFields: { key: string; label: string; type: 'text' | 'password' }[];
    sendMessage: (
        messages: Message[],
        systemPrompt: string,
        tools: Tool[],
        config: Record<string, string>
    ) => Promise<LLMResponse>;
}

export type LLMConfig = {
    provider: string;
    config: Record<string, string>;
    providerConfigs?: Record<string, Record<string, string>>; // Configs for each provider
    stylePrompt?: string; // Custom system instructions
};
