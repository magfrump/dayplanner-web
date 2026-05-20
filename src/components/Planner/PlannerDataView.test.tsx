import React, { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { PlannerDataView } from './PlannerDataView';
import type { Value, Goal, Project, Task, Capacity, SavedFilter } from '../../types/planner';
import type { EditModeState } from '../../types/ui';

const value = (id: number, name: string, tags?: string[]): Value => ({ id, name, color: '#000', tags });
const goal = (id: number, name: string, valueId: number, tags?: string[]): Goal => ({
    id, name, valueId, timeframe: 'Q1', completed: false, tags,
});
const project = (id: number, name: string, goalId: number, tags?: string[]): Project => ({
    id, name, goalId, status: 'in_progress', completed: false, tags,
});
const task = (id: number, name: string, projectId: number, tags?: string[]): Task => ({
    id, name, projectId, importance: 3, urgency: 3, workType: 'focus', completed: false, tags,
});

const Harness: React.FC<{
    values: Value[]; goals: Goal[]; projects: Project[]; tasks: Task[];
    savedFilters?: SavedFilter[];
}> = ({ values, goals, projects, tasks, savedFilters = [] }) => {
    const [editMode, setEditMode] = useState<EditModeState>({ type: null, id: null, data: null });
    const [filters, setFilters] = useState<SavedFilter[]>(savedFilters);
    const capacity: Capacity = { energy: 3, mood: 3, stress: 3, timeAvailable: 4, physicalState: 3 };
    return (
        <PlannerDataView
            data={{ values, goals, projects, tasks, capacity, savedFilters: filters }}
            actions={{
                deleteItem: () => { },
                toggleTask: () => { },
                setCapacity: () => { },
                setSavedFilters: setFilters as React.Dispatch<React.SetStateAction<SavedFilter[]>>,
                updateItem: () => { },
            }}
            ui={{
                editMode,
                setEditMode,
                onSave: () => { },
                onAdd: () => { },
                onEdit: () => { },
            }}
        />
    );
};

// Returns the chip from the top-level filter bar (which sits next to a "Filter:" label),
// not the duplicate chips that appear on each row.
const filterBarChip = (tag: string): HTMLElement => {
    const filterLabel = screen.getByText('Filter:');
    const bar = filterLabel.parentElement as HTMLElement;
    return within(bar).getByRole('button', { name: `#${tag}` });
};

// Section components share a containing `.bg-white.rounded-lg.border.p-4` wrapper that
// has a heading. Scope queries to the section so cross-section name leakage doesn't
// trip the assertions (e.g. a Goal row shows its Value's name).
const sectionForHeading = (heading: string): HTMLElement => {
    const headingEl = screen.getByText(heading);
    let el: HTMLElement | null = headingEl;
    while (el && !el.className.includes('bg-white rounded-lg border')) el = el.parentElement;
    if (!el) throw new Error(`section wrapper for "${heading}" not found`);
    return el;
};

describe('PlannerDataView tag filtering integration', () => {
    it('narrows visible rows across all four sections when a tag is toggled', () => {
        render(
            <Harness
                values={[value(1, 'Health', ['health']), value(2, 'Career', ['work'])]}
                goals={[goal(1, 'Run5k', 1, ['health']), goal(2, 'Promotion', 2, ['work'])]}
                projects={[project(1, 'CardioRoutine', 1, ['health']), project(2, 'Sideproject', 2, ['work'])]}
                tasks={[task(1, 'MorningRun', 1, ['health']), task(2, 'WritePRD', 2, ['work'])]}
            />
        );

        const valuesSection = sectionForHeading('Values');
        const tasksSection = sectionForHeading('All Tasks');

        // Both values visible initially in the Values section.
        expect(within(valuesSection).getByText('Health')).toBeTruthy();
        expect(within(valuesSection).getByText('Career')).toBeTruthy();
        expect(within(tasksSection).getByText('MorningRun')).toBeTruthy();
        expect(within(tasksSection).getByText('WritePRD')).toBeTruthy();

        fireEvent.click(filterBarChip('work'));

        expect(within(valuesSection).queryByText('Health')).toBeNull();
        expect(within(valuesSection).getByText('Career')).toBeTruthy();
        expect(within(tasksSection).queryByText('MorningRun')).toBeNull();
        expect(within(tasksSection).getByText('WritePRD')).toBeTruthy();
    });

    it('applies AND semantics — only items carrying both required tags remain', () => {
        render(
            <Harness
                values={[]}
                goals={[]}
                projects={[]}
                tasks={[
                    task(1, 'TaskA', 1, ['a']),
                    task(2, 'TaskAB', 1, ['a', 'b']),
                    task(3, 'TaskB', 1, ['b']),
                ]}
            />
        );
        const tasksSection = sectionForHeading('All Tasks');

        fireEvent.click(filterBarChip('a'));
        fireEvent.click(filterBarChip('b'));

        expect(within(tasksSection).queryByText('TaskA')).toBeNull();
        expect(within(tasksSection).queryByText('TaskB')).toBeNull();
        expect(within(tasksSection).getByText('TaskAB')).toBeTruthy();
    });

    it('applies a saved filter when its chip is clicked', () => {
        const saved: SavedFilter = { id: 'f1', name: 'Just health', tags: ['health'] };
        render(
            <Harness
                values={[value(1, 'Health', ['health']), value(2, 'Career', ['work'])]}
                goals={[]} projects={[]} tasks={[]}
                savedFilters={[saved]}
            />
        );

        fireEvent.click(screen.getByText('Just health'));
        const valuesSection = sectionForHeading('Values');
        expect(within(valuesSection).getByText('Health')).toBeTruthy();
        expect(within(valuesSection).queryByText('Career')).toBeNull();
    });
});
