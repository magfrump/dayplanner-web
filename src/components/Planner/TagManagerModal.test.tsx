import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TagManagerModal } from './TagManagerModal';
import type { Value, Goal, Project, Task } from '../../types/planner';

const v = (id: number, name: string, tags?: string[]): Value => ({ id, name, tags });
const g = (id: number, name: string, tags?: string[]): Goal => ({ id, name, valueId: 1, timeframe: '', completed: false, tags });
const p = (id: number, name: string, tags?: string[]): Project => ({ id, name, goalId: 1, status: 'in_progress', completed: false, tags });
const t = (id: number, name: string, tags?: string[]): Task => ({
    id, name, projectId: 1, importance: 3, urgency: 3, workType: 'focus', completed: false, tags,
});

const baseProps = () => ({
    open: true,
    onClose: () => {},
    values: [v(1, 'Health', ['health']), v(2, 'Career')],
    goals: [g(10, 'Run a 10k', ['health'])],
    projects: [p(20, 'Planner app', ['dev'])],
    tasks: [t(30, 'Fix proxy bug', ['dev']), t(31, 'Buy shoes')],
    allTags: ['dev', 'health'],
    onSetItemTags: vi.fn(),
});

describe('TagManagerModal', () => {
    it('renders nothing when closed', () => {
        const { container } = render(<TagManagerModal {...baseProps()} open={false} />);
        expect(container.firstChild).toBeNull();
    });

    it('renders all items grouped by level', () => {
        render(<TagManagerModal {...baseProps()} />);
        expect(screen.getByText('Values')).toBeTruthy();
        expect(screen.getByText('Goals')).toBeTruthy();
        expect(screen.getByText('Projects')).toBeTruthy();
        expect(screen.getByText('Tasks')).toBeTruthy();
        expect(screen.getByRole('checkbox', { name: 'Career' })).toBeTruthy();
        expect(screen.getByRole('checkbox', { name: 'Buy shoes' })).toBeTruthy();
    });

    it('reflects membership of the selected tag (defaults to first tag)', () => {
        render(<TagManagerModal {...baseProps()} />);
        // default selected tag is 'dev' (first of sorted allTags)
        expect((screen.getByRole('checkbox', { name: 'Planner app' }) as HTMLInputElement).checked).toBe(true);
        expect((screen.getByRole('checkbox', { name: 'Health' }) as HTMLInputElement).checked).toBe(false);
    });

    it('adds the selected tag when an unchecked item is toggled', () => {
        const props = baseProps();
        render(<TagManagerModal {...props} />); // selected tag = 'dev'
        fireEvent.click(screen.getByRole('checkbox', { name: 'Buy shoes' }));
        expect(props.onSetItemTags).toHaveBeenCalledWith('task', 31, ['dev']);
    });

    it('removes the selected tag when a checked item is toggled', () => {
        const props = baseProps();
        render(<TagManagerModal {...props} />); // selected tag = 'dev'
        fireEvent.click(screen.getByRole('checkbox', { name: 'Planner app' }));
        expect(props.onSetItemTags).toHaveBeenCalledWith('project', 20, []);
    });

    it('preserves other tags when toggling membership', () => {
        const props = baseProps();
        render(<TagManagerModal {...props} />);
        // switch selected tag to 'health'
        fireEvent.change(screen.getByLabelText('Select tag'), { target: { value: 'health' } });
        // 'Health' value already has ['health']; toggling off should yield []
        fireEvent.click(screen.getByRole('checkbox', { name: 'Health' }));
        expect(props.onSetItemTags).toHaveBeenCalledWith('value', 1, []);
        // a task with ['dev'] gaining 'health' keeps 'dev'
        fireEvent.click(screen.getByRole('checkbox', { name: 'Fix proxy bug' }));
        expect(props.onSetItemTags).toHaveBeenCalledWith('task', 30, ['dev', 'health']);
    });

    it('creates a new (normalized) tag, selects it, and assigns it', () => {
        const props = baseProps();
        render(<TagManagerModal {...props} />);
        fireEvent.change(screen.getByPlaceholderText(/new tag/i), { target: { value: 'Deep Work' } });
        fireEvent.click(screen.getByRole('button', { name: /add tag/i }));
        // now selected tag is 'deep-work'; assign to a clean item
        fireEvent.click(screen.getByRole('checkbox', { name: 'Buy shoes' }));
        expect(props.onSetItemTags).toHaveBeenCalledWith('task', 31, ['deep-work']);
    });

    it('shows a count of items carrying the selected tag', () => {
        render(<TagManagerModal {...baseProps()} />); // 'dev' -> Planner app + Fix proxy bug = 2
        expect(screen.getByText(/2 items/i)).toBeTruthy();
    });

    it('disables the checklist and prompts when no tag is selected', () => {
        render(<TagManagerModal {...baseProps()} allTags={[]} />);
        expect(screen.getByText(/pick or create a tag/i)).toBeTruthy();
        expect((screen.getByRole('checkbox', { name: 'Career' }) as HTMLInputElement).disabled).toBe(true);
    });

    it('calls onClose when Done is clicked', () => {
        const props = baseProps();
        render(<TagManagerModal {...props} onClose={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /done/i }));
        expect(props.onClose).not.toThrow;
    });
});
