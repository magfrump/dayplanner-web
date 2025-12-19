import type { Tool } from './types';

export const plannerTools: Tool[] = [
    {
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
    {
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
    {
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
    {
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
    {
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
    {
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
    {
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
    {
        name: 'update_capacity',
        description: 'Update the user\'s current capacity/state',
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
    {
        name: 'add_task',
        description: 'Add a new task to the user\'s list',
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
    {
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
    {
        name: 'read_project_documents',
        description: 'Read the content of documents attached to a project to better understand its context, scope, or next steps.',
        input_schema: {
            type: 'object',
            properties: {
                projectId: { type: 'number', description: 'The ID of the project' }
            },
            required: ['projectId']
        }
    }
];
