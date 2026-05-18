import React, { useMemo, useState } from 'react';
import { ValuesSection } from './ValuesSection';
import { GoalsSection } from './GoalsSection';
import { ProjectsSection } from './ProjectsSection';
import { TasksSection } from './TasksSection';
import { CapacitySection } from './CapacitySection';
import { EditItemModal } from './EditItemModal';
import { TagFilterBar } from './TagFilterBar';
import { collectAllTags, matchesAllTags } from '../../utils/tags';
import type { Value, Goal, Project, Task, Capacity, SavedFilter } from '../../types/planner';

import type { EditModeState } from '../../types/ui';

interface DataViewProps {
    data: {
        values: Value[];
        goals: Goal[];
        projects: Project[];
        tasks: Task[];
        capacity: Capacity;
        savedFilters: SavedFilter[];
    };
    actions: {
        deleteItem: (type: 'value' | 'goal' | 'project' | 'task', id: number) => void;
        toggleTask: (id: number) => void;
        setCapacity: React.Dispatch<React.SetStateAction<Capacity>>;
        setSavedFilters: React.Dispatch<React.SetStateAction<SavedFilter[]>>;
    };
    ui: {
        editMode: EditModeState;
        setEditMode: React.Dispatch<React.SetStateAction<EditModeState>>;
        onSave: () => void;
        onAdd: (type: 'value' | 'goal' | 'project' | 'task') => void;
        onEdit: (type: 'value' | 'goal' | 'project' | 'task', item: Value | Goal | Project | Task) => void;
    };
}

export const PlannerDataView: React.FC<DataViewProps> = ({ data, actions, ui }) => {
    const allTags = useMemo(
        () => collectAllTags(data.values, data.goals, data.projects, data.tasks),
        [data.values, data.goals, data.projects, data.tasks]
    );

    const [activeTags, setActiveTags] = useState<string[]>([]);

    const toggleActiveTag = (tag: string) => {
        setActiveTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
    };

    const filtered = useMemo(() => {
        if (activeTags.length === 0) {
            return { values: data.values, goals: data.goals, projects: data.projects, tasks: data.tasks };
        }
        return {
            values: data.values.filter(v => matchesAllTags(v, activeTags)),
            goals: data.goals.filter(g => matchesAllTags(g, activeTags)),
            projects: data.projects.filter(p => matchesAllTags(p, activeTags)),
            tasks: data.tasks.filter(t => matchesAllTags(t, activeTags)),
        };
    }, [data.values, data.goals, data.projects, data.tasks, activeTags]);

    return (
        <div className="space-y-6">
            <EditItemModal
                editMode={ui.editMode}
                setEditMode={ui.setEditMode}
                onSave={ui.onSave}
                values={data.values} goals={data.goals} projects={data.projects}
                allTags={allTags}
            />

            <CapacitySection capacity={data.capacity} onUpdate={actions.setCapacity} />

            <TagFilterBar
                allTags={allTags}
                activeTags={activeTags}
                onToggleTag={toggleActiveTag}
                onClear={() => setActiveTags([])}
                savedFilters={data.savedFilters}
                onApplyFilter={(f) => setActiveTags(f.tags)}
                onSaveFilter={(f) => actions.setSavedFilters(prev => [...prev, f])}
                onDeleteFilter={(id) => actions.setSavedFilters(prev => prev.filter(x => x.id !== id))}
            />

            <ValuesSection
                values={filtered.values}
                onAdd={() => ui.onAdd('value')}
                onEdit={(v) => ui.onEdit('value', v)}
                onDelete={(id) => actions.deleteItem('value', id)}
                activeTags={activeTags}
                onTagClick={toggleActiveTag}
            />

            <GoalsSection
                goals={filtered.goals} values={data.values}
                onAdd={() => ui.onAdd('goal')}
                onEdit={(g) => ui.onEdit('goal', g)}
                onDelete={(id) => actions.deleteItem('goal', id)}
                activeTags={activeTags}
                onTagClick={toggleActiveTag}
            />

            <ProjectsSection
                projects={filtered.projects} goals={data.goals} values={data.values}
                onAdd={() => ui.onAdd('project')}
                onEdit={(p) => ui.onEdit('project', p)}
                onDelete={(id) => actions.deleteItem('project', id)}
                activeTags={activeTags}
                onTagClick={toggleActiveTag}
            />

            <TasksSection
                tasks={filtered.tasks} projects={data.projects} goals={data.goals} values={data.values}
                onAdd={() => ui.onAdd('task')}
                onEdit={(t) => ui.onEdit('task', t)}
                onDelete={(id) => actions.deleteItem('task', id)}
                onToggle={actions.toggleTask}
                activeTags={activeTags}
                onTagClick={toggleActiveTag}
            />
        </div>
    );
};
