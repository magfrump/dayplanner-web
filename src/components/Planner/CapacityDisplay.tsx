
import React from 'react';
import type { Value, Goal, Project, Task, Capacity } from '../../types/planner';

interface CapacityDisplayProps {
    capacity: Capacity;
    focusedValue?: Value;
    focusedGoal?: Goal;
    focusedProject?: Project;
    focusedTask?: Task;
}

export const CapacityDisplay: React.FC<CapacityDisplayProps> = ({
    capacity, focusedValue, focusedGoal, focusedProject, focusedTask
}) => {
    const hasFocus = focusedValue || focusedGoal || focusedProject || focusedTask;

    return (
        <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-sm border border-gray-200/50 p-3 mb-3">
            <div className="flex justify-between items-start mb-2">
                <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Current State</div>
                {hasFocus && (
                    <div className="flex flex-wrap gap-1 items-center text-[10px] px-2 py-0.5 rounded-lg border"
                        style={{
                            backgroundColor: focusedValue ? `${focusedValue.color}10` : '#f9fafb',
                            borderColor: focusedValue ? `${focusedValue.color}30` : '#f3f4f6',
                            color: focusedValue ? focusedValue.color : '#6b7280'
                        }}
                    >
                        <span className="font-bold opacity-70">Focus:</span>
                        {focusedValue && <span className="font-medium">{focusedValue.name}</span>}
                        {focusedGoal && <><span>→</span><span className="font-medium">{focusedGoal.name}</span></>}
                        {focusedProject && <><span>→</span><span className="font-medium">{focusedProject.name}</span></>}
                        {focusedTask && <><span>→</span><span className="font-bold underline decoration-2 underline-offset-2">{focusedTask.name}</span></>}
                    </div>
                )}
            </div>
            <div className="grid grid-cols-5 gap-1 text-[10px]">
                <div><div className="text-gray-500">Energy</div><div className="font-bold text-gray-800">{capacity.energy}/5</div></div>
                <div><div className="text-gray-500">Mood</div><div className="font-bold text-gray-800">{capacity.mood}/5</div></div>
                <div><div className="text-gray-500">Stress</div><div className="font-bold text-gray-800">{capacity.stress}/5</div></div>
                <div><div className="text-gray-500">Physical</div><div className="font-bold text-gray-800">{capacity.physicalState}/5</div></div>
                <div><div className="text-gray-500">Hours</div><div className="font-bold text-gray-800">{capacity.timeAvailable}h</div></div>
            </div>
        </div>
    );
};
