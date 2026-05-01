import { useState } from 'react';
import type { Message } from '../services/types';
import { sendSmartMessage } from '../services/llm';
import { buildSystemContext, getGreeting } from '../services/aiContext';
import { allTools, executeToolCall, type PlannerActions, type ToolContext } from '../services/toolRegistry';
import type { Value, Goal, Project, Task, Capacity, PlannerMode, FocusState } from '../types/planner';
import { useLLMConfig } from './useLLMConfig';
import { useChatSummarizer } from './useChatSummarizer';
import { useRefreshSuggestions } from './useRefreshSuggestions';

interface UsePlannerAIOptions {
    focus?: FocusState;
    setFocus?: (next: FocusState) => void;
}

export const usePlannerAI = (
    data: {
        values: Value[];
        goals: Goal[];
        projects: Project[];
        tasks: Task[];
        capacity: Capacity;
    },
    actions: PlannerActions,
    initialConversation?: Message[],
    mode: PlannerMode = 'focusing',
    options: UsePlannerAIOptions = {}
) => {
    const [internalFocus, setInternalFocus] = useState<FocusState>({});
    const focus = options.focus ?? internalFocus;
    const setFocus = options.setFocus ?? setInternalFocus;

    const [conversation, setConversation] = useState<Message[]>(
        initialConversation || [{ role: 'assistant', content: getGreeting() }]
    );
    const [isLoading, setIsLoading] = useState(false);

    const { llmConfig, setLlmConfig } = useLLMConfig();

    const { isSummarizing, summarizeConversation } = useChatSummarizer({
        conversation,
        setConversation,
        llmConfig,
        setCapacity: actions.setCapacity,
        isLoading
    });

    const toolContext: ToolContext = { data, actions, setFocus };

    const {
        refreshSuggestions,
        setRefreshSuggestions,
        generateRefreshSuggestions,
        isRefreshing
    } = useRefreshSuggestions({
        data,
        llmConfig,
        mode,
        conversation,
        toolContext
    });

    const sendMessage = async (userMessage: string) => {
        if (!userMessage.trim() || isLoading) return;
        setIsLoading(true);

        const newUserMsg: Message = { role: 'user', content: userMessage };
        const updatedConversation = [...conversation, newUserMsg];
        setConversation(updatedConversation);

        try {
            const systemContext = buildSystemContext(updatedConversation, data, mode, focus);
            const response = await sendSmartMessage(updatedConversation, systemContext, allTools, llmConfig);

            const toolResults: Message[] = [];
            if (response.toolCalls) {
                for (const call of response.toolCalls) {
                    const content = await executeToolCall(call, toolContext);
                    toolResults.push({ role: 'user', content });
                }
            }

            if (toolResults.length > 0) {
                const conversationWithToolRound: Message[] = [
                    ...updatedConversation,
                    {
                        role: 'assistant',
                        content: response.content || '(Tool Execution)',
                        traceData: response.traceData
                    },
                    ...toolResults
                ];

                const followUp = await sendSmartMessage(conversationWithToolRound, systemContext, allTools, llmConfig);

                setConversation(prev => [
                    ...prev,
                    {
                        role: 'assistant',
                        content: response.content + (response.content ? '\n' : '') + followUp.content,
                        traceData: followUp.traceData
                    }
                ]);
            } else {
                setConversation(prev => [
                    ...prev,
                    { role: 'assistant', content: response.content, traceData: response.traceData }
                ]);
            }
        } catch (error: unknown) {
            console.error('Error calling LLM API:', error);
            setConversation(prev => [...prev, {
                role: 'assistant',
                content: `Error: ${error instanceof Error ? error.message : String(error)}`
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    return {
        conversation,
        sendMessage,
        isLoading: isLoading || isRefreshing,
        isSummarizing,
        summarizeConversation,
        llmConfig,
        setLlmConfig,
        refreshSuggestions,
        setRefreshSuggestions,
        generateRefreshSuggestions,
        focus,
        setFocus
    };
};
