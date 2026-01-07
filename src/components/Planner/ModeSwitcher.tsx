
import React from 'react';
import type { PlannerMode } from '../../types/planner';

interface ModeSwitcherProps {
    mode: PlannerMode;
    setMode: (mode: PlannerMode) => void;
}

export const ModeSwitcher: React.FC<ModeSwitcherProps> = ({ mode, setMode }) => {
    return (
        <div className="flex justify-center mb-4">
            <div className="bg-gray-100 p-1 rounded-lg flex gap-1">
                {(['mapping', 'focusing', 'execution'] as PlannerMode[]).map((m) => (
                    <button
                        key={m}
                        onClick={() => setMode(m)}
                        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${mode === m
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        {m.charAt(0).toUpperCase() + m.slice(1)}
                    </button>
                ))}
            </div>
        </div>
    );
};
