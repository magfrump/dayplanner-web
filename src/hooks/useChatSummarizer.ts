import { useState, useEffect, useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { LLMConfig, Message } from '../services/types';
import type { Capacity, FocusState, Value, Goal, Project, Task } from '../types/planner';
import { generateContextSummary } from '../services/llm';
import { resolveEffectiveFocus } from '../utils/focus';
import { makeMessageId, makeSegmentId } from '../utils/ids';

interface SummarizerArgs {
    conversation: Message[];
    setConversation: Dispatch<SetStateAction<Message[]>>;
    llmConfig: LLMConfig;
    setCapacity: Dispatch<SetStateAction<Capacity>>;
    isLoading: boolean;
    threadId: string;
    focus: FocusState;
    data: {
        values: Value[];
        goals: Goal[];
        projects: Project[];
        tasks: Task[];
    };
}

const AUTO_THRESHOLD = 25;
const KEEP_COUNT = 15;
const MIN_FORCE_LENGTH = 5;
const MIN_AUTO_SLICE = 5;

export const useChatSummarizer = ({
    conversation,
    setConversation,
    llmConfig,
    setCapacity,
    isLoading,
    threadId,
    focus,
    data,
}: SummarizerArgs) => {
    const [isSummarizing, setIsSummarizing] = useState(false);

    const summarizeConversation = useCallback(async (force: boolean = false) => {
        if (!force && (conversation.length <= AUTO_THRESHOLD || isSummarizing || isLoading)) return;
        if (force && (conversation.length < MIN_FORCE_LENGTH || isSummarizing)) return;

        setIsSummarizing(true);
        try {
            if (conversation.length <= KEEP_COUNT) return;

            const summarizeSlice = conversation.slice(0, conversation.length - KEEP_COUNT);
            const keepSlice = conversation.slice(conversation.length - KEEP_COUNT);

            if (summarizeSlice.length < MIN_AUTO_SLICE && !force) return;

            const summaryResult = await generateContextSummary(summarizeSlice, llmConfig);

            await fetch('/api/log/archive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: summarizeSlice, summary: summaryResult })
            });

            // Best-effort segment write. Failure must not stop summarization: the in-conversation
            // summary message and the archive write proceed regardless (spec §4.3 placement policy).
            const segmentId = makeSegmentId();
            const resolved = resolveEffectiveFocus(focus, summarizeSlice, data);
            const lineage = {
                valueId: resolved.focusedValue?.id ?? null,
                goalId: resolved.focusedGoal?.id ?? null,
                projectId: resolved.focusedProject?.id ?? null,
                taskId: resolved.focusedTask?.id ?? null,
            };
            const archiveFile = `logs/chat_archive_${new Date().toISOString().split('T')[0]}.jsonl`;
            try {
                await fetch('/api/segments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: segmentId,
                        thread_id: threadId,
                        transcript: summarizeSlice,
                        summary: summaryResult.summary,
                        lineage,
                        metadata: {
                            needs_classification: false,
                            open_loop: false,
                            archive_file: archiveFile,
                        },
                    }),
                });
            } catch (segErr) {
                console.error('Segment write failed (continuing with summary):', segErr);
            }

            const now = new Date().toISOString();
            const summaryMessage: Message = {
                role: 'system',
                type: 'summary',
                content: `[Summary] ${summaryResult.summary}`,
                summaryData: {
                    timestamp_start: now,
                    timestamp_end: now,
                    mood_score: summaryResult.mood,
                    key_facts: summaryResult.facts,
                    segmentId,
                },
                id: makeMessageId('summary')
            };

            setCapacity(prev => {
                const next = { ...prev };
                if (summaryResult.mood) next.mood = summaryResult.mood;
                if (summaryResult.stress) next.stress = summaryResult.stress;
                if (summaryResult.energy) next.energy = summaryResult.energy;
                if (summaryResult.physical) next.physicalState = summaryResult.physical;
                return next;
            });

            const updates: string[] = [];
            if (summaryResult.mood) updates.push(`Mood: ${summaryResult.mood}/5`);
            if (summaryResult.stress) updates.push(`Stress: ${summaryResult.stress}/5`);
            if (summaryResult.energy) updates.push(`Energy: ${summaryResult.energy}/5`);
            if (summaryResult.physical) updates.push(`Physical: ${summaryResult.physical}/5`);

            const moodNotification: Message = {
                role: 'system',
                content: updates.length > 0
                    ? `Context summarized. Stats updated based on chat: ${updates.join(', ')}`
                    : `Context summarized.`,
                id: makeMessageId('system'),
            };

            setConversation([summaryMessage, moodNotification, ...keepSlice]);
        } catch (error) {
            console.error('Auto-summarization failed:', error);
        } finally {
            setIsSummarizing(false);
        }
    }, [conversation, isSummarizing, isLoading, llmConfig, setCapacity, setConversation, threadId, focus, data]);

    useEffect(() => {
        const timeout = setTimeout(() => summarizeConversation(false), 1000);
        return () => clearTimeout(timeout);
    }, [summarizeConversation]);

    return { isSummarizing, summarizeConversation };
};
