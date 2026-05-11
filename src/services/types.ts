export type SegmentLineage = {
    valueId?: number | null;
    goalId?: number | null;
    projectId?: number | null;
    taskId?: number | null;
};

// What the system actually injected into the prompt before an assistant turn.
// Stashed on the assistant message itself so the Phase 4 breadcrumb (and any
// later auditing) reads from system-side record, never LLM self-report.
export type RetrievalState = {
    segmentIds: string[];
    lineage: SegmentLineage;
    freshness: string; // ISO timestamp of the newest injected segment
};

export type Message = {
    role: 'user' | 'assistant' | 'system';
    content: string;
    type?: 'text' | 'summary';
    summaryData?: {
        timestamp_start: string;
        timestamp_end: string;
        mood_score: number;
        key_facts: string[];
        segmentId?: string;
    };
    id?: string;
    traceData?: unknown;
    toolCalls?: ToolCall[];
    retrievalState?: RetrievalState;
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
    // Feature flag for system-prompt injection of retrieved past segments (Phase 3 of
    // multisemantic v0.3). Default off until the §6.5 baseline measurement completes.
    enableRelevantPastContext?: boolean;
};
