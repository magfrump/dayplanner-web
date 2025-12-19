import type { Value, Goal, Project, Task } from './planner';

export type EditItemData = Partial<Value & Goal & Project & Task>;

export interface EditModeState {
    type: 'value' | 'goal' | 'project' | 'task' | null;
    id: number | null;
    data: EditItemData | null;
}
