
import { describe, it, expect } from 'vitest';
import { buildSystemContext } from './aiContext';
import type { Value, Goal, Project, Task, Capacity } from '../types/planner';
import type { Message } from './types';

describe('buildSystemContext Data Filtering', () => {
    // Mock Data
    const values: Value[] = [
        { id: 1, name: 'Health' },
        { id: 2, name: 'Career' }
    ];
    const goals: Goal[] = [
        { id: 10, name: 'Run Marathon', valueId: 1, timeframe: 'Year', completed: false },
        { id: 20, name: 'Get Promoted', valueId: 2, timeframe: 'Year', completed: false }
    ];
    const projects: Project[] = [
        { id: 100, name: 'Training Plan', goalId: 10, status: 'in_progress', completed: false, documents: ['/doc/run.md'] },
        { id: 200, name: 'Project X', goalId: 20, status: 'in_progress', completed: false }
    ];
    const tasks: Task[] = [
        { id: 1001, name: 'Buy Shoes', projectId: 100, importance: 5, urgency: 5, workType: 'physical', completed: false },
        { id: 1002, name: 'Run 5k', projectId: 100, importance: 3, urgency: 3, workType: 'physical', completed: false },
        { id: 2001, name: 'Write Code', projectId: 200, importance: 4, urgency: 4, workType: 'focus', completed: false },
        { id: 9000, name: 'Inbox Task', projectId: 0, importance: 2, urgency: 2, workType: 'admin', completed: false } // No project
    ];
    const capacity: Capacity = { energy: 3, mood: 3, stress: 3, timeAvailable: 5, physicalState: 3 };

    const data = { values, goals, projects, tasks, capacity };
    const baseMsg: Message[] = [{ role: 'user', content: 'Hello' }];

    it('should show everything in Focusing mode (default)', () => {
        const context = buildSystemContext(baseMsg, data, 'focusing');

        expect(context).toContain('Health');
        expect(context).toContain('Career');
        expect(context).toContain('Project X');
        expect(context).toContain('Buy Shoes');
        expect(context).toContain('Run 5k');
        expect(context).toContain('Inbox Task');
    });

    it('should filter tasks in Mapping mode', () => {
        const context = buildSystemContext(baseMsg, data, 'mapping');

        // Should show all values/goals/projects
        expect(context).toContain('Health');
        expect(context).toContain('Project X');

        // Should filter tasks:
        // 'Buy Shoes': High importance (5) -> KEEP
        // 'Write Code': High importance (4) -> KEEP
        // 'Run 5k': Low importance (3) -> HIDE
        // 'Inbox Task': No project -> KEEP

        expect(context).toContain('Buy Shoes');
        expect(context).toContain('Write Code');
        expect(context).toContain('Inbox Task');

        expect(context).not.toContain('Run 5k');
    });

    it('should isolate lineage in Execution mode when task is focused', () => {
        // Conversation sets focus on "Run 5k" (id: 1002)
        const msgs: Message[] = [{ role: 'user', content: 'I am working on Run 5k' }];
        const context = buildSystemContext(msgs, data, 'execution');

        // Focused: Run 5k (Project: Training Plan, Goal: Run Marathon, Value: Health)
        expect(context).toContain('Health');
        expect(context).toContain('Run Marathon');
        expect(context).toContain('Training Plan');

        // Unrelated
        expect(context).not.toContain('Career');
        expect(context).not.toContain('Get Promoted');
        expect(context).not.toContain('Project X');

        // Tasks in same project
        expect(context).toContain('Buy Shoes'); // Sibling
        expect(context).toContain('Run 5k'); // Self

        // Tasks in other project
        expect(context).not.toContain('Write Code');
        expect(context).not.toContain('Inbox Task');

        // Documents
        expect(context).toContain('RELEVANT DOCUMENTS');
        expect(context).toContain('/doc/run.md');
    });

    it('should fallback to all in Execution mode if no focus detected', () => {
        const msgs: Message[] = [{ role: 'user', content: 'Just chilling' }];
        // No match for "Just chilling"
        const context = buildSystemContext(msgs, data, 'execution');

        // Fallback behavior: Show all (as per empty else block in code)
        expect(context).toContain('Health');
        expect(context).toContain('Career');
    });
});
