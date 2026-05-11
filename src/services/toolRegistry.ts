import type { Tool, ToolCall } from './types';
import type { Value, Goal, Project, Task, Capacity, FocusState } from '../types/planner';
import type { Segment } from './multisemanticRetrieval';
import { LINEAGE_KEYS } from './lineageKeys';

export interface PlannerActions {
    addItem: (type: 'value' | 'goal' | 'project' | 'task', item: Omit<Value | Goal | Project | Task, 'id'>) => void;
    updateItem: (type: 'value' | 'goal' | 'project' | 'task', item: Partial<Value | Goal | Project | Task> & { id: number }) => void;
    deleteItem: (type: 'value' | 'goal' | 'project' | 'task', id: number) => void;
    setCapacity: (value: React.SetStateAction<Capacity>) => void;
    toggleTask: (id: number) => void;
}

export interface ToolContext {
    data: {
        values: Value[];
        goals: Goal[];
        projects: Project[];
        tasks: Task[];
        capacity: Capacity;
    };
    actions: PlannerActions;
    setFocus: (next: FocusState) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (input: any, ctx: ToolContext) => string | Promise<string>;

interface ToolEntry {
    definition: Tool;
    handler: Handler;
}

const ok = (name: string) => `Tool ${name} executed successfully.`;

const entries: ToolEntry[] = [
    {
        definition: {
            name: 'add_value',
            description: 'Add a new core value',
            input_schema: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Name of the value' },
                    description: { type: 'string', description: 'Description of the value' }
                },
                required: ['name', 'description']
            }
        },
        handler: (input, ctx) => {
            ctx.actions.addItem('value', input);
            return ok('add_value');
        }
    },
    {
        definition: {
            name: 'update_value',
            description: 'Update an existing core value',
            input_schema: {
                type: 'object',
                properties: {
                    id: { type: 'number', description: 'ID of the value to update' },
                    name: { type: 'string', description: 'New name' },
                    description: { type: 'string', description: 'New description' }
                },
                required: ['id']
            }
        },
        handler: (input, ctx) => {
            ctx.actions.updateItem('value', { id: input.id, ...input });
            return ok('update_value');
        }
    },
    {
        definition: {
            name: 'add_goal',
            description: 'Add a new goal linked to a value',
            input_schema: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Name of the goal' },
                    description: { type: 'string', description: 'Description' },
                    value_id: { type: 'number', description: 'ID of the parent value' },
                    timeframe: { type: 'string', description: 'Timeframe (e.g. "This Month")' }
                },
                required: ['name', 'value_id', 'timeframe']
            }
        },
        handler: (input, ctx) => {
            ctx.actions.addItem('goal', input);
            return ok('add_goal');
        }
    },
    {
        definition: {
            name: 'update_goal',
            description: 'Update an existing goal',
            input_schema: {
                type: 'object',
                properties: {
                    id: { type: 'number', description: 'ID of the goal' },
                    name: { type: 'string' },
                    description: { type: 'string' },
                    value_id: { type: 'number' },
                    timeframe: { type: 'string' },
                    completed: { type: 'boolean' }
                },
                required: ['id']
            }
        },
        handler: (input, ctx) => {
            ctx.actions.updateItem('goal', { id: input.id, ...input });
            return ok('update_goal');
        }
    },
    {
        definition: {
            name: 'add_project',
            description: 'Add a new project linked to a goal',
            input_schema: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Project name' },
                    description: { type: 'string', description: 'Project description' },
                    goal_id: { type: 'number', description: 'ID of the parent goal' },
                    status: { type: 'string', enum: ['not_started', 'in_progress', 'completed'] }
                },
                required: ['name', 'goal_id', 'status']
            }
        },
        handler: (input, ctx) => {
            ctx.actions.addItem('project', input);
            return ok('add_project');
        }
    },
    {
        definition: {
            name: 'update_project',
            description: 'Update an existing project',
            input_schema: {
                type: 'object',
                properties: {
                    id: { type: 'number', description: 'ID of the project' },
                    name: { type: 'string' },
                    description: { type: 'string' },
                    goal_id: { type: 'number' },
                    status: { type: 'string', enum: ['not_started', 'in_progress', 'completed'] }
                },
                required: ['id']
            }
        },
        handler: (input, ctx) => {
            ctx.actions.updateItem('project', { id: input.id, ...input });
            return ok('update_project');
        }
    },
    {
        definition: {
            name: 'mark_task_complete',
            description: 'Mark a task as complete or incomplete',
            input_schema: {
                type: 'object',
                properties: {
                    task_id: { type: 'number', description: 'The ID of the task to update' },
                    completed: { type: 'boolean', description: 'Whether the task is completed' }
                },
                required: ['task_id', 'completed']
            }
        },
        handler: (input, ctx) => {
            ctx.actions.toggleTask(input.task_id);
            return ok('mark_task_complete');
        }
    },
    {
        definition: {
            name: 'update_capacity',
            description: "Update the user's current capacity/state",
            input_schema: {
                type: 'object',
                properties: {
                    energy: { type: 'number', minimum: 1, maximum: 5 },
                    mood: { type: 'number', minimum: 1, maximum: 5 },
                    stress: { type: 'number', minimum: 1, maximum: 5 },
                    timeAvailable: { type: 'number', minimum: 0, maximum: 16 },
                    physicalState: { type: 'number', minimum: 1, maximum: 5 }
                }
            }
        },
        handler: (input, ctx) => {
            ctx.actions.setCapacity(prev => ({ ...prev, ...input }));
            return ok('update_capacity');
        }
    },
    {
        definition: {
            name: 'set_focus',
            description: "Declare what the user is currently focused on. Call this when the conversation shifts to a specific task, project, goal, or value. Provide whichever IDs are known; ancestors are inferred from the hierarchy.",
            input_schema: {
                type: 'object',
                properties: {
                    task_id: { type: 'number', description: 'ID of the focused task (optional)' },
                    project_id: { type: 'number', description: 'ID of the focused project (optional)' },
                    goal_id: { type: 'number', description: 'ID of the focused goal (optional)' },
                    value_id: { type: 'number', description: 'ID of the focused value (optional)' }
                }
            }
        },
        handler: (input, ctx) => {
            ctx.setFocus({
                taskId: input.task_id,
                projectId: input.project_id,
                goalId: input.goal_id,
                valueId: input.value_id
            });
            return ok('set_focus');
        }
    },
    {
        definition: {
            name: 'clear_focus',
            description: "Clear the current focus. Use when the user moves on, finishes their task, or wants a broader view.",
            input_schema: { type: 'object', properties: {} }
        },
        handler: (_input, ctx) => {
            ctx.setFocus({});
            return ok('clear_focus');
        }
    },
    {
        definition: {
            name: 'add_task',
            description: "Add a new task to the user's list",
            input_schema: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'The name/description of the task' },
                    project_id: { type: 'number', description: 'The ID of the project this task belongs to' },
                    importance: { type: 'number', minimum: 1, maximum: 5 },
                    urgency: { type: 'number', minimum: 1, maximum: 5 },
                    work_type: { type: 'string', enum: ['focus', 'creative', 'admin', 'physical', 'social'] },
                    deadline: { type: 'string', description: 'ISO date string (YYYY-MM-DD)' },
                    recurrence: { type: 'string' }
                },
                required: ['name', 'project_id', 'importance', 'urgency', 'work_type']
            }
        },
        handler: (input, ctx) => {
            ctx.actions.addItem('task', {
                name: input.name,
                projectId: input.project_id,
                importance: input.importance,
                urgency: input.urgency,
                workType: input.work_type,
                completed: false,
                deadline: input.deadline,
                recurrence: input.recurrence
            } as Task);
            return ok('add_task');
        }
    },
    {
        definition: {
            name: 'update_task',
            description: 'Update an existing task',
            input_schema: {
                type: 'object',
                properties: {
                    task_id: { type: 'number' },
                    name: { type: 'string' },
                    project_id: { type: 'number' },
                    importance: { type: 'number' },
                    urgency: { type: 'number' },
                    work_type: { type: 'string' },
                    completed: { type: 'boolean' },
                    deadline: { type: 'string' },
                    recurrence: { type: 'string' }
                },
                required: ['task_id']
            }
        },
        handler: (input, ctx) => {
            ctx.actions.updateItem('task', { id: input.task_id, ...input });
            return ok('update_task');
        }
    },
    {
        definition: {
            name: 'recall_segments',
            description: 'Search past conversation segments (BM25 over summarized transcripts). Use when you need historical context about a topic, project, or task. Returns summaries only by default; pass includeTranscript=true to fetch full transcripts.',
            input_schema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Free-text query. Trigram-tokenized FTS5 — identifier-style tokens (snake_case, dotted paths) are fine.' },
                    lineageFilter: {
                        type: 'object',
                        description: 'Optional strict-AND lineage filter. Set any subset of {valueId, goalId, projectId, taskId}.',
                        properties: {
                            valueId: { type: 'number' },
                            goalId: { type: 'number' },
                            projectId: { type: 'number' },
                            taskId: { type: 'number' }
                        }
                    },
                    limit: { type: 'number', description: 'Max results (default 10).' },
                    includeTranscript: { type: 'boolean', description: 'When true, attach full transcript to each result. Default false (summaries only).' }
                },
                required: ['query']
            }
        },
        handler: async (input) => {
            const params = new URLSearchParams();
            if (typeof input.query === 'string' && input.query.trim()) params.set('q', input.query);
            const lineage = input.lineageFilter || {};
            for (const k of LINEAGE_KEYS) {
                if (lineage[k] != null) params.set(k, String(lineage[k]));
            }
            params.set('limit', String(typeof input.limit === 'number' ? input.limit : 10));

            try {
                const resp = await fetch(`/api/segments/search?${params.toString()}`);
                if (!resp.ok) return `recall_segments error: ${resp.status} ${resp.statusText}`;
                const body = await resp.json();
                const results: Segment[] = Array.isArray(body?.results) ? body.results : [];
                const shaped = results.map(s => {
                    const base = {
                        id: s.id,
                        thread_id: s.thread_id,
                        summary: s.summary,
                        lineage: s.lineage,
                        created_at: s.created_at,
                        archive_file: s.metadata?.archive_file,
                    };
                    return input.includeTranscript ? { ...base, transcript: s.transcript } : base;
                });
                return JSON.stringify({ count: shaped.length, results: shaped });
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                return `recall_segments error: ${msg}`;
            }
        }
    },
    {
        definition: {
            name: 'read_project_documents',
            description: 'Read the content of documents attached to a project to better understand its context, scope, or next steps.',
            input_schema: {
                type: 'object',
                properties: {
                    projectId: { type: 'number', description: 'The ID of the project' }
                },
                required: ['projectId']
            }
        },
        handler: async (input, ctx) => {
            const project = ctx.data.projects.find(p => p.id === input.projectId);
            if (!project) return `Tool error: Project ${input.projectId} not found.`;
            if (!project.documents || project.documents.length === 0) {
                return `Project "${project.name}" has no attached documents.`;
            }

            let combined = `Documents for project "${project.name}":\n\n`;
            for (const path of project.documents) {
                try {
                    const resp = await fetch(`/api/read-file?path=${encodeURIComponent(path)}`);
                    if (!resp.ok) {
                        combined += `[Error reading ${path}: ${resp.statusText}]\n\n`;
                    } else {
                        const json = await resp.json();
                        combined += `--- FILE: ${path} ---\n${json.content}\n\n`;
                    }
                } catch (e: unknown) {
                    const msg = e instanceof Error ? e.message : String(e);
                    combined += `[Exception reading ${path}: ${msg}]\n\n`;
                }
            }
            return combined;
        }
    }
];

export const toolRegistry: Record<string, ToolEntry> = Object.fromEntries(
    entries.map(e => [e.definition.name, e])
);

export const allTools: Tool[] = entries.map(e => e.definition);

export async function executeToolCall(call: ToolCall, ctx: ToolContext): Promise<string> {
    const entry = toolRegistry[call.name];
    if (!entry) return `Unknown tool: ${call.name}`;
    return await entry.handler(call.input, ctx);
}
