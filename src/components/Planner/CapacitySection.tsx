
import React from 'react';
import type { Capacity } from '../../types/planner';

interface CapacitySectionProps {
    capacity: Capacity;
    onUpdate: (newCapacity: Capacity) => void;
}

export const CapacitySection: React.FC<CapacitySectionProps> = ({ capacity, onUpdate }) => {
    const handleChange = (field: keyof Capacity, value: number) => {
        onUpdate({ ...capacity, [field]: value });
    };

    return (
        <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-sm border border-gray-200/50 p-6">
            <h3 className="font-semibold mb-4">Capacity Assessment</h3>
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium mb-2">Energy Level</label>
                    <input
                        type="range" min="1" max="5"
                        value={capacity.energy}
                        onChange={(e) => handleChange('energy', parseInt(e.target.value))}
                        className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-600 mt-1">
                        <span>Exhausted</span><span>{capacity.energy}/5</span><span>Energized</span>
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium mb-2">Mood</label>
                    <input
                        type="range" min="1" max="5"
                        value={capacity.mood}
                        onChange={(e) => handleChange('mood', parseInt(e.target.value))}
                        className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-600 mt-1">
                        <span>Low</span><span>{capacity.mood}/5</span><span>Great</span>
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium mb-2">Stress Level</label>
                    <input
                        type="range" min="1" max="5"
                        value={capacity.stress}
                        onChange={(e) => handleChange('stress', parseInt(e.target.value))}
                        className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-600 mt-1">
                        <span>Calm</span><span>{capacity.stress}/5</span><span>Stressed</span>
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium mb-2">Physical State</label>
                    <input
                        type="range" min="1" max="5"
                        value={capacity.physicalState}
                        onChange={(e) => handleChange('physicalState', parseInt(e.target.value))}
                        className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-600 mt-1">
                        <span>Unwell</span><span>{capacity.physicalState}/5</span><span>Healthy</span>
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium mb-2">Hours Available Today</label>
                    <input
                        type="range" min="0" max="16"
                        value={capacity.timeAvailable}
                        onChange={(e) => handleChange('timeAvailable', parseInt(e.target.value))}
                        className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-600 mt-1">
                        <span>0h</span><span>{capacity.timeAvailable}h</span><span>16h</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
