export interface Value {
    id: number;
    name: string;
    description?: string;
    color?: string;
    tags?: string[];
}

export interface Goal {
    id: number;
    name: string;
    description?: string;
    valueId: number;
    timeframe: string;
    completed: boolean;
    tags?: string[];
}

export interface Project {
    id: number;
    name: string;
    description?: string;
    goalId: number;
    documents?: string[]; // List of absolute file paths
    // Folders to re-scan periodically; new files merge into documents[].
    watchedFolders?: string[];
    status: 'not_started' | 'in_progress' | 'completed';
    completed: boolean;
    tags?: string[];
}

export interface Task {
    id: number;
    name: string;
    description?: string;
    projectId: number;
    importance: number;
    urgency: number;
    workType: 'focus' | 'creative' | 'admin' | 'physical' | 'social';
    completed: boolean;
    deadline?: string;
    recurrence?: string;
    attachments?: string[];
    tags?: string[];
}

export interface SavedFilter {
    id: string; // uuid-ish
    name: string;
    tags: string[]; // AND semantics — item matches when it has all tags
}

export interface Capacity {
    energy: number;
    mood: number;
    stress: number;
    timeAvailable: number;
    physicalState: number;
}

export interface WorkType {
    name: string;
    color: string;
}

export const WORK_TYPES: Record<string, WorkType> = {
    focus: { name: 'Deep Focus', color: '#3b82f6' },
    creative: { name: 'Creative', color: '#8b5cf6' },
    admin: { name: 'Administrative', color: '#6b7280' },
    physical: { name: 'Physical', color: '#10b981' },
    social: { name: 'Social', color: '#f59e0b' }
};

export interface Suggestion {
    id: string; // unique ID for keying
    type: 'urgency_update' | 'new_recurring_task' | 'project_next_step' | 'value_importance' | 'goal_completed' | 'cleanup';
    description: string;
    source: 'system' | 'ai';
    action: 'update' | 'create' | 'delete';
    targetType: 'task' | 'project' | 'goal' | 'value';
    targetId?: number; // if update/delete
    payload: unknown; // The data to apply
}

export interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
    type?: 'text' | 'summary';
    summaryData?: {
        timestamp_start: string;
        timestamp_end: string;
        mood_score: number; // 1-5 inferred
        key_facts: string[];
    };
    id?: string; // Optional, useful for keys
    traceData?: unknown; // For debugging
}

export type PlannerMode = 'mapping' | 'focusing' | 'execution';

export interface FocusState {
    valueId?: number;
    goalId?: number;
    projectId?: number;
    taskId?: number;
}

export interface ResolvedFocus {
    focusedValue?: Value;
    focusedGoal?: Goal;
    focusedProject?: Project;
    focusedTask?: Task;
}
