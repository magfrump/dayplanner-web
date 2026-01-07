
import { useState, useEffect, useCallback } from 'react';
import type { LLMConfig, Tool, Message } from '../services/types';
import { sendSmartMessage, generateContextSummary } from '../services/llm';
import { buildSystemContext, getGreeting } from '../services/aiContext';
import { checkDeadlines, checkRecurrence } from '../utils/refreshLogic';
import { plannerTools } from '../services/plannerTools';
import type { Value, Goal, Project, Task, Capacity, Suggestion, PlannerMode } from '../types/planner';

interface PlannerActions {
    addItem: (type: 'value' | 'goal' | 'project' | 'task', item: Omit<Value | Goal | Project | Task, 'id'>) => void;
    updateItem: (type: 'value' | 'goal' | 'project' | 'task', item: Partial<Value | Goal | Project | Task> & { id: number }) => void;
    deleteItem: (type: 'value' | 'goal' | 'project' | 'task', id: number) => void;
    setCapacity: (value: React.SetStateAction<Capacity>) => void;
    toggleTask: (id: number) => void;
}



export const usePlannerAI = (
    data: {
        values: Value[],
        goals: Goal[],
        projects: Project[],
        tasks: Task[],
        capacity: Capacity
    },
    actions: PlannerActions,
    initialConversation?: Message[],
    mode: PlannerMode = 'focusing'
) => {
    const [conversation, setConversation] = useState<Message[]>(initialConversation || [{ role: 'assistant', content: getGreeting() }]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSummarizing, setIsSummarizing] = useState(false);
    const [refreshSuggestions, setRefreshSuggestions] = useState<Suggestion[]>([]);

    // Config
    const [llmConfig, setLlmConfig] = useState<LLMConfig>(() => {
        if (typeof window === 'undefined') return { provider: 'anthropic', config: {}, providerConfigs: {} };
        const saved = localStorage.getItem('dayplanner_llm_config');
        try {
            const parsed = saved ? JSON.parse(saved) : null;
            if (parsed && !parsed.providerConfigs) {
                // Migrate old format if needed
                return { ...parsed, providerConfigs: { [parsed.provider]: parsed.config || {} } };
            }
            return parsed || { provider: 'anthropic', config: {}, providerConfigs: {} };
        } catch {
            return { provider: 'anthropic', config: {}, providerConfigs: {} };
        }
    });

    // Auto-Summarization Logic
    const summarizeConversation = useCallback(async (force: boolean = false) => {
        if (!force && (conversation.length <= 25 || isSummarizing || isLoading)) return;
        if (force && (conversation.length < 5 || isSummarizing)) return; // Minimum buffer even for forced

        setIsSummarizing(true);
        try {
            // Keep the last 15 messages, summarize the rest
            const keepCount = 15;
            if (conversation.length <= keepCount) {
                setIsSummarizing(false);
                return;
            }

            const summarizeSlice = conversation.slice(0, conversation.length - keepCount);
            const keepSlice = conversation.slice(conversation.length - keepCount);

            // Don't summarize if we only have a few messages to summarize (avoid thrashing) unless forced?
            if (summarizeSlice.length < 5 && !force) {
                setIsSummarizing(false);
                return;
            }

            // 1. Generate Summary
            const summaryResult = await generateContextSummary(summarizeSlice, llmConfig);

            // 2. Archive to Server
            await fetch('/api/log/archive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: summarizeSlice,
                    summary: summaryResult
                })
            });

            // 3. Update Conversation State (Replace with Summary Card)
            const summaryMessage: Message = {
                role: 'system',
                type: 'summary',
                content: `[Summary] ${summaryResult.summary}`, // Fallback text
                summaryData: {
                    timestamp_start: new Date().toISOString(), // Approximation
                    timestamp_end: new Date().toISOString(),
                    mood_score: summaryResult.mood,
                    key_facts: summaryResult.facts
                },
                id: `summary-${Date.now()}`
            };

            // Automated Capacity Sync
            actions.setCapacity(prev => {
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
                    : `Context summarized.`
            };

            setConversation([summaryMessage, moodNotification, ...keepSlice]);

        } catch (error) {
            console.error("Auto-summarization failed:", error);
        } finally {
            setIsSummarizing(false);
        }
    }, [conversation, isSummarizing, isLoading, llmConfig, actions]);

    useEffect(() => {
        const timeout = setTimeout(() => summarizeConversation(false), 1000); // 1s debounce/delay after render
        return () => clearTimeout(timeout);
    }, [summarizeConversation]);

    // Persist config changes
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('dayplanner_llm_config', JSON.stringify(llmConfig));
        }
    }, [llmConfig]);



    const tools: Tool[] = plannerTools;

    const sendMessage = async (userMessage: string) => {
        if (!userMessage.trim() || isLoading) return;
        setIsLoading(true);
        // Cast role as specific type to satisfy Message interface
        const newUserMsg: Message = { role: 'user', content: userMessage };
        const updatedConversation = [...conversation, newUserMsg];
        setConversation(updatedConversation);

        try {
            // Note: Now using the imported context builder and passing the data object
            const systemContext = buildSystemContext(updatedConversation, data, mode);

            // First LLM Call (Smart Fallback)
            const response = await sendSmartMessage(
                updatedConversation,
                systemContext,
                tools,
                llmConfig
            );

            // Process Tool Calls
            const toolResults: Message[] = [];
            if (response.toolCalls) {
                for (const toolCall of response.toolCalls) {
                    const { name, input: rawInput } = toolCall;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const input = rawInput as any;

                    if (name === 'mark_task_complete') {
                        actions.toggleTask(input.task_id);
                    } else if (name === 'update_capacity') {
                        actions.setCapacity(prev => ({ ...prev, ...input }));
                    } else if (name === 'add_task') {
                        actions.addItem('task', {
                            name: input.name,
                            projectId: input.project_id,
                            importance: input.importance,
                            urgency: input.urgency,
                            workType: input.work_type,
                            completed: false,
                            deadline: input.deadline,
                            recurrence: input.recurrence
                        } as Task);
                    } else if (name === 'update_task') {
                        actions.updateItem('task', { id: input.task_id, ...input });
                    } else if (name === 'add_value') {
                        actions.addItem('value', input);
                    } else if (name === 'update_value') {
                        actions.updateItem('value', { id: input.id, ...input });
                    } else if (name === 'add_goal') {
                        actions.addItem('goal', input);
                    } else if (name === 'update_goal') {
                        actions.updateItem('goal', { id: input.id, ...input });
                    } else if (name === 'add_project') {
                        actions.addItem('project', input);
                    } else if (name === 'update_project') {
                        actions.updateItem('project', { id: input.id, ...input });
                    } else if (name === 'read_project_documents') {
                        const project = data.projects.find(p => p.id === input.projectId);
                        if (!project) {
                            toolResults.push({
                                role: 'user', content: `Tool error: Project ${input.projectId} not found.`
                            });
                            continue;
                        }
                        if (!project.documents || project.documents.length === 0) {
                            toolResults.push({
                                role: 'user', content: `Project "${project.name}" has no attached documents.`
                            });
                            continue;
                        }

                        let combinedContent = `Documents for project "${project.name}":\n\n`;
                        for (const path of project.documents) {
                            try {
                                const resp = await fetch(`/api/read-file?path=${encodeURIComponent(path)}`);
                                if (!resp.ok) {
                                    combinedContent += `[Error reading ${path}: ${resp.statusText}]\n\n`;
                                } else {
                                    const json = await resp.json();
                                    combinedContent += `--- FILE: ${path} ---\n${json.content}\n\n`;
                                }
                            } catch (e: unknown) {
                                const msg = e instanceof Error ? e.message : String(e);
                                combinedContent += `[Exception reading ${path}: ${msg}]\n\n`;
                            }
                        }

                        toolResults.push({
                            role: 'user', content: combinedContent
                        });
                        continue; // Skip the generic success message
                    }

                    toolResults.push({
                        role: 'user',
                        content: `Tool ${name} executed successfully.`
                    });
                }
            }

            // Follow up if tools executed
            if (toolResults.length > 0) {
                const conversationWithToolRound = [
                    ...updatedConversation,
                    { role: 'assistant', content: response.content || "(Tool Execution)", traceData: response.traceData } as Message,
                    ...toolResults
                ];

                const followUp = await sendSmartMessage(
                    conversationWithToolRound,
                    systemContext,
                    tools,
                    llmConfig
                );

                setConversation(prev => [
                    ...prev,
                    { role: 'assistant', content: response.content + (response.content ? '\n' : '') + followUp.content, traceData: followUp.traceData }
                ]);
            } else {
                setConversation(prev => [...prev, { role: 'assistant', content: response.content, traceData: response.traceData }]);
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

    const generateRefreshSuggestions = async () => {
        setIsLoading(true);
        try {
            // 1. System Logic
            const systemSuggestions = [
                ...checkDeadlines(data.tasks),
                ...checkRecurrence(data.tasks)
            ];

            // 2. LLM Analysis
            // We define a special temporary tool just for this analysis to output structured data
            const analysisTool: Tool = {
                name: 'propose_update',
                description: 'Propose a data update for the daily refresh',
                input_schema: {
                    type: 'object',
                    properties: {
                        type: { type: 'string', enum: ['project_next_step', 'value_importance', 'goal_completed', 'cleanup'] },
                        description: { type: 'string', description: 'Why this update is suggested' },
                        action: { type: 'string', enum: ['update', 'create', 'delete'] },
                        targetType: { type: 'string', enum: ['task', 'project', 'goal', 'value'] },
                        targetId: { type: 'number' },
                        payload: { type: 'object', description: 'The actual data fields to change' }
                    },
                    required: ['type', 'description', 'action', 'targetType', 'payload']
                }
            };

            // Include document reading in available tools for analysis
            const refreshTools = [
                analysisTool,
                tools.find(t => t.name === 'read_project_documents')!
            ];

            const systemContext = buildSystemContext(conversation, data, mode);
            const promptMessages: Message[] = [
                {
                    role: 'user', content: `Analyze the user's planner data and suggest a "Daily Refresh".
                Look for:
                1. Projects that are "in_progress" but have no incomplete tasks (Suggest "project_next_step" to add a task or complete the project).
                2. Values or Goals that haven't been touched recently (Suggest "value_importance" changes or new goals).
                3. Completed goals that should be marked as such.
                4. Any cleanup of old/irrelevant items.
                
                If you need more context on a project, use 'read_project_documents'.
                Otherwise, use the "propose_update" tool to output your suggestions. Output multiple tool calls if needed.` }
            ];

            const aiSuggestions: Suggestion[] = [];

            // Loop for max 3 turns to allow reading docs then proposing
            for (let turn = 0; turn < 3; turn++) {
                const response = await sendSmartMessage(promptMessages, systemContext, refreshTools, llmConfig);

                // If it's just content without calls, maybe we're done or it's chitchat, break
                if (!response.toolCalls || response.toolCalls.length === 0) {
                    break;
                }

                const toolResults: Message[] = [];

                for (const call of response.toolCalls) {
                    if (call.name === 'propose_update') {
                        // Process proposal same as before
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const input = call.input as any;
                        const payload = input.payload || {};
                        const normalizedPayload = {
                            ...payload,
                            projectId: payload.projectId || payload.project_id,
                            workType: payload.workType || payload.work_type,
                            valueId: payload.valueId || payload.value_id,
                            goalId: payload.goalId || payload.goal_id
                        };
                        delete normalizedPayload.project_id; delete normalizedPayload.work_type;
                        delete normalizedPayload.value_id; delete normalizedPayload.goal_id;

                        delete normalizedPayload.value_id; delete normalizedPayload.goal_id;
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        let description = (call.input as any).description as string;
                        if (normalizedPayload.projectId && !description.includes('Project')) {
                            const p = data.projects.find(proj => proj.id === normalizedPayload.projectId);
                            if (p) description += ` (in Project: ${p.name})`;
                        }

                        aiSuggestions.push({
                            id: `ai-${Date.now()}-${aiSuggestions.length}`,
                            source: 'ai',
                            ...call.input,
                            description,
                            payload: normalizedPayload
                        } as Suggestion);

                        toolResults.push({ role: 'user', content: "Suggestion recorded." });

                    } else if (call.name === 'read_project_documents') {
                        // Execute read
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const input = call.input as any;
                        const project = data.projects.find(p => p.id === input.projectId);
                        if (!project || !project.documents || project.documents.length === 0) {
                            toolResults.push({ role: 'user', content: "No documents found." });
                        } else {
                            let combined = "";
                            for (const path of project.documents) {
                                try {
                                    const resp = await fetch(`/api/read-file?path=${encodeURIComponent(path)}`);
                                    if (resp.ok) {
                                        const json = await resp.json();
                                        combined += `FILE ${path}:\n${json.content}\n\n`;
                                    } else {
                                        combined += `Error reading ${path}\n`;
                                    }
                                } catch { combined += "Error\n"; }
                            }
                            toolResults.push({ role: 'user', content: combined });
                        }
                    }
                }

                // If we only had proposals, we can stop early as we don't necessarily need a loop unless the AI wants to propose MORE after confirmation? 
                // Actually usually it proposes all at I once. But if it read docs, it needs another turn to propose.

                // Append response and results to history for next turn
                promptMessages.push({ role: 'assistant', content: response.content || '', toolCalls: response.toolCalls });
                promptMessages.push(...toolResults);

                // If only proposals were made (no reads), we can assume it's done providing suggestions
                const calls = response.toolCalls;
                if (calls.every(c => c.name === 'propose_update')) {
                    break;
                }
            }

            setRefreshSuggestions([...systemSuggestions, ...aiSuggestions]);

        } catch (error: unknown) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    return {
        conversation,
        sendMessage,
        isLoading,
        isSummarizing,
        summarizeConversation,
        llmConfig,
        setLlmConfig,
        refreshSuggestions,
        setRefreshSuggestions,
        generateRefreshSuggestions
    };
};
