import React, { useState } from 'react';
import { Archive, ChevronDown, ChevronUp, Brain } from 'lucide-react';
import type { Message } from '../../services/types';

interface SummaryCardProps {
    message: Message;
}

export const SummaryCard: React.FC<SummaryCardProps> = ({ message }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const data = message.summaryData;

    // Mood color helper
    const getMoodColor = (score: number) => {
        if (score >= 4) return 'text-green-600 bg-green-50 border-green-200';
        if (score === 3) return 'text-blue-600 bg-blue-50 border-blue-200';
        return 'text-orange-600 bg-orange-50 border-orange-200';
    };

    const moodColor = data ? getMoodColor(data.mood_score) : 'text-gray-600';

    return (
        <div className="w-full flex justify-center my-4">
            <div className="w-full max-w-[85%] bg-gray-50/80 backdrop-blur-sm border border-gray-200 rounded-lg overflow-hidden shadow-sm transition-all hover:shadow-md">

                {/* Header / Collapsed View */}
                <div
                    className="p-3 flex items-center gap-3 cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    <div className="p-2 bg-white rounded-full border border-gray-200 text-gray-400">
                        <Archive size={16} />
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                Context Archived
                            </span>
                            {data && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${moodColor}`}>
                                    Mood: {data.mood_score}/5
                                </span>
                            )}
                        </div>
                        <div className="text-sm text-gray-600 truncate">
                            {message.content}
                        </div>
                    </div>

                    <button className="text-gray-400 hover:text-gray-600">
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                </div>

                {/* Expanded View */}
                {isExpanded && (
                    <div className="border-t border-gray-200 p-4 bg-white">
                        <div className="space-y-3">
                            <div>
                                <h4 className="text-xs font-semibold text-gray-500 mb-1">Summary</h4>
                                <p className="text-sm text-gray-700 leading-relaxed">
                                    {message.content}
                                </p>
                            </div>

                            {data && data.key_facts && data.key_facts.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                                        <Brain size={12} /> Key Facts Retained
                                    </h4>
                                    <ul className="text-xs text-gray-600 space-y-1 bg-gray-50 p-2 rounded border border-gray-100">
                                        {data.key_facts.map((fact, idx) => (
                                            <li key={idx} className="flex gap-2">
                                                <span>•</span>
                                                <span>{fact}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <div className="text-[10px] text-gray-400 text-right">
                                Encapsulated at {data?.timestamp_end ? new Date(data.timestamp_end).toLocaleTimeString() : 'Recently'}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
