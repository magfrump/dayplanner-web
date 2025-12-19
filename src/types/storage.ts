import type { Value, Goal, Project, Task, Capacity } from './planner';

export interface StorageResult {
    value: string | null;
}

export type StorageItem = Value | Goal | Project | Task | Capacity;

export interface StorageAPI {
    get: (key: string) => Promise<StorageResult>;
    set: (key: string, value: string) => Promise<void>;
    patch: (key: string, action: 'add' | 'update' | 'delete', item: unknown, id?: number | string) => Promise<void>;
}

declare global {
    interface Window {
        storage: StorageAPI;
    }
}
