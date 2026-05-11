import { useEffect, useRef, useState } from 'react';
import type { Message } from '../services/types';
import { sendSmartMessage } from '../services/llm';
import { buildSystemContext, getGreeting } from '../services/aiContext';
import { allTools, executeToolCall, type PlannerActions, type ToolContext } from '../services/toolRegistry';
import type { Value, Goal, Project, Task, Capacity, PlannerMode, FocusState } from '../types/planner';
import { resolveEffectiveFocus } from '../utils/focus';
import { focusKey, makeMessageId, makeThreadId } from '../utils/ids';
import { useLLMConfig } from './useLLMConfig';
import { useChatSummarizer } from './useChatSummarizer';
import { useRefreshSuggestions } from './useRefreshSuggestions';

// Focus must persist for this many consecutive turns before thread_id rotates.
// Prevents thread fragmentation if focus thrashes briefly within a single train of thought.
const FOCUS_DEBOUNCE_TURNS = 2;

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
        initialConversation || [{ role: 'assistant', content: getGreeting(), id: makeMessageId('assistant') }]
    );
    const [isLoading, setIsLoading] = useState(false);

    const [threadId, setThreadId] = useState<string>(() => makeThreadId());
    // Tracks the focusKey from the previous turn and a debounce counter so we only
    // rotate thread_id once a new focus has persisted for FOCUS_DEBOUNCE_TURNS turns.
    const lastFocusKeyRef = useRef<string>('');
    const pendingFocusKeyRef = useRef<string>('');
    const pendingFocusTurnsRef = useRef<number>(0);

    const { llmConfig, setLlmConfig } = useLLMConfig();

    const { isSummarizing, summarizeConversation } = useChatSummarizer({
        conversation,
        setConversation,
        llmConfig,
        setCapacity: actions.setCapacity,
        isLoading,
        threadId,
        focus,
        data,
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

        const newUserMsg: Message = { role: 'user', content: userMessage, id: makeMessageId('user') };
        const updatedConversation = [...conversation, newUserMsg];
        setConversation(updatedConversation);

        // Debounced focus-change rotation: a new focus must persist for
        // FOCUS_DEBOUNCE_TURNS turns before we rotate thread_id.
        const resolved = resolveEffectiveFocus(focus, updatedConversation, data);
        const currentKey = focusKey(resolved);
        if (currentKey && currentKey !== lastFocusKeyRef.current) {
            if (currentKey === pendingFocusKeyRef.current) {
                pendingFocusTurnsRef.current += 1;
                if (pendingFocusTurnsRef.current >= FOCUS_DEBOUNCE_TURNS) {
                    setThreadId(makeThreadId());
                    lastFocusKeyRef.current = currentKey;
                    pendingFocusKeyRef.current = '';
                    pendingFocusTurnsRef.current = 0;
                }
            } else {
                pendingFocusKeyRef.current = currentKey;
                pendingFocusTurnsRef.current = 1;
            }
        } else if (currentKey === lastFocusKeyRef.current) {
            pendingFocusKeyRef.current = '';
            pendingFocusTurnsRef.current = 0;
        }

        try {
            const systemContext = buildSystemContext(updatedConversation, data, mode, focus);
            const response = await sendSmartMessage(updatedConversation, systemContext, allTools, llmConfig);

            const toolResults: Message[] = [];
            if (response.toolCalls) {
                for (const call of response.toolCalls) {
                    const content = await executeToolCall(call, toolContext);
                    toolResults.push({ role: 'user', content, id: makeMessageId('tool') });
                }
            }

            if (toolResults.length > 0) {
                const conversationWithToolRound: Message[] = [
                    ...updatedConversation,
                    {
                        role: 'assistant',
                        content: response.content || '(Tool Execution)',
                        traceData: response.traceData,
                        id: makeMessageId('assistant'),
                    },
                    ...toolResults
                ];

                const followUp = await sendSmartMessage(conversationWithToolRound, systemContext, allTools, llmConfig);

                setConversation(prev => [
                    ...prev,
                    {
                        role: 'assistant',
                        content: response.content + (response.content ? '\n' : '') + followUp.content,
                        traceData: followUp.traceData,
                        id: makeMessageId('assistant'),
                    }
                ]);
            } else {
                setConversation(prev => [
                    ...prev,
                    { role: 'assistant', content: response.content, traceData: response.traceData, id: makeMessageId('assistant') }
                ]);
            }
        } catch (error: unknown) {
            console.error('Error calling LLM API:', error);
            setConversation(prev => [...prev, {
                role: 'assistant',
                content: `Error: ${error instanceof Error ? error.message : String(error)}`,
                id: makeMessageId('assistant'),
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    // Seed lastFocusKeyRef on mount so the very first send doesn't see a spurious change.
    useEffect(() => {
        const resolved = resolveEffectiveFocus(focus, conversation, data);
        lastFocusKeyRef.current = focusKey(resolved);
        // intentional: only run once per hook lifetime
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
