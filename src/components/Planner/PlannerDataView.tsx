import React from 'react';
import { ValuesSection } from './ValuesSection';
import { GoalsSection } from './GoalsSection';
import { ProjectsSection } from './ProjectsSection';
import { TasksSection } from './TasksSection';
import { CapacitySection } from './CapacitySection';
import { EditItemModal } from './EditItemModal';
import type { Value, Goal, Project, Task, Capacity } from '../../types/planner';

import type { EditModeState } from '../../types/ui';

interface DataViewProps {
    data: {
        values: Value[];
        goals: Goal[];
        projects: Project[];
        tasks: Task[];
        capacity: Capacity;
    };
    actions: {
        deleteItem: (type: 'value' | 'goal' | 'project' | 'task', id: number) => void;
        toggleTask: (id: number) => void;
        setCapacity: React.Dispatch<React.SetStateAction<Capacity>>;
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
    return (
        <div className="space-y-6">
            <EditItemModal
                editMode={ui.editMode}
                setEditMode={ui.setEditMode}
                onSave={ui.onSave}
                values={data.values} goals={data.goals} projects={data.projects}
            />

            <CapacitySection capacity={data.capacity} onUpdate={actions.setCapacity} />

            <ValuesSection
                values={data.values}
                onAdd={() => ui.onAdd('value')}
                onEdit={(v) => ui.onEdit('value', v)}
                onDelete={(id) => actions.deleteItem('value', id)}
            />

            <GoalsSection
                goals={data.goals} values={data.values}
                onAdd={() => ui.onAdd('goal')}
                onEdit={(g) => ui.onEdit('goal', g)}
                onDelete={(id) => actions.deleteItem('goal', id)}
            />

            <ProjectsSection
                projects={data.projects} goals={data.goals} values={data.values}
                onAdd={() => ui.onAdd('project')}
                onEdit={(p) => ui.onEdit('project', p)}
                onDelete={(id) => actions.deleteItem('project', id)}
            />

            <TasksSection
                tasks={data.tasks} projects={data.projects} goals={data.goals} values={data.values}
                onAdd={() => ui.onAdd('task')}
                onEdit={(t) => ui.onEdit('task', t)}
                onDelete={(id) => actions.deleteItem('task', id)}
                onToggle={actions.toggleTask}
            />
        </div>
    );
};
