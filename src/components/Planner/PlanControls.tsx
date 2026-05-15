import React from 'react';
import { ModeSwitcher } from './ModeSwitcher';
import { CapacityDisplay } from './CapacityDisplay';
import type { PlannerMode, Capacity, Value, Goal, Project, Task } from '../../types/planner';

interface PlanControlsProps {
    mode: PlannerMode;
    setMode: (mode: PlannerMode) => void;
    capacity: Capacity;
    focusedValue?: Value;
    focusedGoal?: Goal;
    focusedProject?: Project;
    focusedTask?: Task;
    onClearFocus?: () => void;
}

export const PlanControls: React.FC<PlanControlsProps> = (props) => {
    return (
        <div className="flex flex-col gap-4 w-full md:w-72 md:shrink-0">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200/50 p-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Planner Mode</h3>
                <div className="-mx-2">
                    <ModeSwitcher mode={props.mode} setMode={props.setMode} />
                </div>
            </div>

            <CapacityDisplay {...props} />
        </div>
    );
};
