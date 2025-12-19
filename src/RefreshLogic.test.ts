import { describe, it, expect } from 'vitest';
import { checkDeadlines, checkRecurrence } from './utils/refreshLogic';
import type { Task } from './types/planner';

describe('Refresh Logic System Checks', () => {

    it('should suggest increasing urgency for tasks arriving soon', () => {
        const now = new Date();
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const tasks: Task[] = [
            { id: 1, name: 'Safe Task', projectId: 10, urgency: 1, importance: 3, workType: 'admin', completed: false, deadline: '2099-12-31' },
            { id: 2, name: 'Urgent Task', projectId: 10, urgency: 1, importance: 3, workType: 'admin', completed: false, deadline: tomorrow },
        ];

        const suggestions = checkDeadlines(tasks);
        expect(suggestions).toHaveLength(1);
        expect(suggestions[0].type).toBe('urgency_update');
        expect(suggestions[0].targetId).toBe(2);
        expect(suggestions[0].payload.urgency).toBe(5);
    });

    it('should NOT suggest urgency if already high', () => {
        const now = new Date();
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const tasks: Task[] = [
            { id: 1, name: 'Already Urgent', projectId: 10, urgency: 5, importance: 3, workType: 'admin', completed: false, deadline: tomorrow },
        ];

        const suggestions = checkDeadlines(tasks);
        expect(suggestions).toHaveLength(0);
    });

    it('should suggest recurring task creation if previous one is complete', () => {
        // Mock simple recurrence check where we just look for completed recurring tasks without an active copy
        const tasks: Task[] = [
            {
                id: 1, name: 'Daily Standup', projectId: 10, urgency: 3, importance: 3, workType: 'social',
                completed: true, recurrence: 'daily'
            },
            {
                id: 2, name: 'One-off Task', projectId: 10, urgency: 3, importance: 3, workType: 'focus',
                completed: true
            }
        ];

        const suggestions = checkRecurrence(tasks);
        expect(suggestions).toHaveLength(1);
        expect(suggestions[0].type).toBe('new_recurring_task');
        expect(suggestions[0].payload.name).toBe('Daily Standup');
    });

    it('should ignore recurring task if active copy exists', () => {
        const tasks: Task[] = [
            {
                id: 1, name: 'Daily Standup', projectId: 10, urgency: 3, importance: 3, workType: 'social',
                completed: true, recurrence: 'daily'
            },
            {
                id: 2, name: 'Daily Standup', projectId: 10, urgency: 3, importance: 3, workType: 'social',
                completed: false, recurrence: 'daily' // Active copy
            }
        ];

        const suggestions = checkRecurrence(tasks);
        expect(suggestions).toHaveLength(0);
    });
});
