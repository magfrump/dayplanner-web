
import type { Task, Suggestion } from '../types/planner';

export const checkDeadlines = (tasks: Task[]): Suggestion[] => {
    const suggestions: Suggestion[] = [];
    const now = new Date();
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

    tasks.filter(t => !t.completed && t.deadline).forEach(task => {
        if (!task.deadline) return;
        const deadlineDate = new Date(task.deadline);
        const diff = deadlineDate.getTime() - now.getTime();

        // If deadline is passed or within 3 days, and urgency is low (<4)
        if (diff < threeDaysMs && task.urgency < 4) {
            suggestions.push({
                id: `urgency-${task.id}-${Date.now()}`,
                type: 'urgency_update',
                description: `Increase urgency for "${task.name}" (Deadline approaching: ${task.deadline})`,
                source: 'system',
                action: 'update',
                targetType: 'task',
                targetId: task.id,
                payload: { urgency: 5 } // Max urgency
            });
        }
    });

    return suggestions;
};

// Simple recurrence: "daily", "weekly", "monthly"
// Checks if the LAST instance was completed > period ago
// OR if it's just a simple schedule check against today.
// For MVP: We will check if a task with "recurrence" is marked completed.
// If so, we suggest creating a NEW instance of it if the "recurrence date" has arrived.
// BUT, to simplify logic without a full history log:
// We will look for completed recurring tasks. If they don't have an open active successor, we suggest one.
// "successor" implies same name, same project.
export const checkRecurrence = (tasks: Task[]): Suggestion[] => {
    const suggestions: Suggestion[] = [];
    const today = new Date().toISOString().split('T')[0];
    // today unused but good for future date checks
    console.log(today);

    const completedRecurring = tasks.filter(t => t.completed && t.recurrence);
    const activeTasks = tasks.filter(t => !t.completed);

    completedRecurring.forEach(task => {
        // Check if an active version already exists
        const hasActiveCopy = activeTasks.some(t =>
            t.projectId === task.projectId &&
            t.name === task.name && // Assuming name matching for copy detection
            t.recurrence === task.recurrence
        );

        if (!hasActiveCopy) {
            // Determine if it SHOULD be created today?
            // For MVP: "Daily" -> yes. "Weekly" -> simple 7 day check?
            // Let's assume user triggers this daily.
            // We'll just suggest it. User can decline.

            // Logic improvement: Check completion date? We don't track it yet.
            // We'll just suggest "Refresh recurring task: [Name]"

            suggestions.push({
                id: `recur-${task.id}-${Date.now()}`,
                type: 'new_recurring_task',
                description: `Create new instance of recurring task: "${task.name}"`,
                source: 'system',
                action: 'create',
                targetType: 'task',
                payload: {
                    ...task,
                    id: Date.now(), // Placeholder, real ID on apply
                    completed: false,
                    // If we had logic for next deadline, we'd set it here.
                    // For now, clear the deadline or keep it? 
                    // Let's keep it null for the prompt to prompt user, or user edits it.
                    deadline: undefined
                }
            });
        }
    });

    return suggestions;
};
