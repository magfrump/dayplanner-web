import type { Value, Goal, Project, Task, FocusState, ResolvedFocus } from '../types/planner';
import type { Message, SegmentLineage } from '../services/types';

interface FocusData {
    values: Value[];
    goals: Goal[];
    projects: Project[];
    tasks: Task[];
}

export const isFocusEmpty = (focus?: FocusState): boolean =>
    !focus || (!focus.valueId && !focus.goalId && !focus.projectId && !focus.taskId);

// Resolve explicit focus IDs into objects, walking up the hierarchy to fill ancestors.
export const resolveExplicitFocus = (focus: FocusState, data: FocusData): ResolvedFocus => {
    const focusedTask = focus.taskId ? data.tasks.find(t => t.id === focus.taskId) : undefined;
    const focusedProject = focus.projectId
        ? data.projects.find(p => p.id === focus.projectId)
        : focusedTask
            ? data.projects.find(p => p.id === focusedTask.projectId)
            : undefined;
    const focusedGoal = focus.goalId
        ? data.goals.find(g => g.id === focus.goalId)
        : focusedProject
            ? data.goals.find(g => g.id === focusedProject.goalId)
            : undefined;
    const focusedValue = focus.valueId
        ? data.values.find(v => v.id === focus.valueId)
        : focusedGoal
            ? data.values.find(v => v.id === focusedGoal.valueId)
            : undefined;
    return { focusedValue, focusedGoal, focusedProject, focusedTask };
};

// Best-effort focus inference from recent message text. Used when no explicit focus is set.
export const inferFocusFromMessages = (messages: Message[], data: FocusData): ResolvedFocus => {
    const recentText = messages.slice(-3).map(m => m.content.toLowerCase()).join(' ');
    const focusedTask = data.tasks.find(t => recentText.includes(t.name.toLowerCase()));
    const focusedProject = data.projects.find(p => recentText.includes(p.name.toLowerCase())) ||
        (focusedTask ? data.projects.find(p => p.id === focusedTask.projectId) : undefined);
    const focusedGoal = data.goals.find(g => recentText.includes(g.name.toLowerCase())) ||
        (focusedProject ? data.goals.find(g => g.id === focusedProject.goalId) : undefined);
    const focusedValue = data.values.find(v => recentText.includes(v.name.toLowerCase())) ||
        (focusedGoal ? data.values.find(v => v.id === focusedGoal.valueId) : undefined);
    return { focusedValue, focusedGoal, focusedProject, focusedTask };
};

// Top-level helper: prefer explicit focus when set, otherwise infer from conversation.
export const resolveEffectiveFocus = (
    focus: FocusState | undefined,
    messages: Message[],
    data: FocusData
): ResolvedFocus => {
    if (!isFocusEmpty(focus)) return resolveExplicitFocus(focus!, data);
    return inferFocusFromMessages(messages, data);
};

export const lineageFromResolved = (r: ResolvedFocus): SegmentLineage => ({
    valueId: r.focusedValue?.id ?? null,
    goalId: r.focusedGoal?.id ?? null,
    projectId: r.focusedProject?.id ?? null,
    taskId: r.focusedTask?.id ?? null,
});
