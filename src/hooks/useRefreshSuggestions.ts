import { useState } from 'react';
import type { LLMConfig, Message, Tool } from '../services/types';
import type { Value, Goal, Project, Task, Capacity, Suggestion, PlannerMode } from '../types/planner';
import { sendSmartMessage } from '../services/llm';
import { buildSystemContext } from '../services/aiContext';
import { checkDeadlines, checkRecurrence } from '../utils/refreshLogic';
import { toolRegistry, type ToolContext } from '../services/toolRegistry';

interface RefreshArgs {
    data: {
        values: Value[];
        goals: Goal[];
        projects: Project[];
        tasks: Task[];
        capacity: Capacity;
    };
    llmConfig: LLMConfig;
    mode: PlannerMode;
    conversation: Message[];
    toolContext: ToolContext;
}

const proposeUpdateTool: Tool = {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normalizePayload = (raw: any) => {
    const payload = raw || {};
    const normalized = {
        ...payload,
        projectId: payload.projectId || payload.project_id,
        workType: payload.workType || payload.work_type,
        valueId: payload.valueId || payload.value_id,
        goalId: payload.goalId || payload.goal_id
    };
    delete normalized.project_id;
    delete normalized.work_type;
    delete normalized.value_id;
    delete normalized.goal_id;
    return normalized;
};

export const useRefreshSuggestions = ({
    data,
    llmConfig,
    mode,
    conversation,
    toolContext
}: RefreshArgs) => {
    const [refreshSuggestions, setRefreshSuggestions] = useState<Suggestion[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const generateRefreshSuggestions = async () => {
        setIsLoading(true);
        try {
            const systemSuggestions = [
                ...checkDeadlines(data.tasks),
                ...checkRecurrence(data.tasks)
            ];

            const refreshTools: Tool[] = [
                proposeUpdateTool,
                toolRegistry.read_project_documents.definition
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

            for (let turn = 0; turn < 3; turn++) {
                const response = await sendSmartMessage(promptMessages, systemContext, refreshTools, llmConfig);
                if (!response.toolCalls || response.toolCalls.length === 0) break;

                const toolResults: Message[] = [];

                for (const call of response.toolCalls) {
                    if (call.name === 'propose_update') {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const input = call.input as any;
                        const normalized = normalizePayload(input.payload);
                        let description = input.description as string;
                        if (normalized.projectId && !description.includes('Project')) {
                            const p = data.projects.find(proj => proj.id === normalized.projectId);
                            if (p) description += ` (in Project: ${p.name})`;
                        }

                        aiSuggestions.push({
                            id: `ai-${Date.now()}-${aiSuggestions.length}`,
                            source: 'ai',
                            ...input,
                            description,
                            payload: normalized
                        } as Suggestion);

                        toolResults.push({ role: 'user', content: 'Suggestion recorded.' });
                    } else if (call.name === 'read_project_documents') {
                        const content = await toolRegistry.read_project_documents.handler(call.input, toolContext);
                        toolResults.push({ role: 'user', content });
                    }
                }

                promptMessages.push({ role: 'assistant', content: response.content || '', toolCalls: response.toolCalls });
                promptMessages.push(...toolResults);

                if (response.toolCalls.every(c => c.name === 'propose_update')) break;
            }

            setRefreshSuggestions([...systemSuggestions, ...aiSuggestions]);
        } catch (error: unknown) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    return {
        refreshSuggestions,
        setRefreshSuggestions,
        generateRefreshSuggestions,
        isRefreshing: isLoading
    };
};
