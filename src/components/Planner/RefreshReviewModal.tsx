
import React, { useState } from 'react';
import { X, Check, CheckSquare, Square, AlertCircle, RefreshCw, ArrowRight } from 'lucide-react';
import type { Suggestion } from '../../types/planner';

interface RefreshReviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    suggestions: Suggestion[];
    onApply: (selectedIds: string[]) => void;
    isGenerating: boolean;
}

export const RefreshReviewModal: React.FC<RefreshReviewModalProps> = ({
    isOpen, onClose, suggestions, onApply, isGenerating
}) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Initialize selection when suggestions load
    React.useEffect(() => {
        if (suggestions.length > 0) {
            setSelectedIds(new Set(suggestions.map(s => s.id)));
        }
    }, [suggestions]);

    if (!isOpen) return null;

    const toggleSelection = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const handleApply = () => {
        onApply(Array.from(selectedIds));
    };

    const getIcon = (type: Suggestion['type']) => {
        switch (type) {
            case 'urgency_update': return <AlertCircle className="text-orange-500" />;
            case 'new_recurring_task': return <RefreshCw className="text-blue-500" />;
            case 'project_next_step': return <ArrowRight className="text-purple-500" />;
            default: return <Check className="text-green-500" />;
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                <div className="flex justify-between items-center p-6 border-b">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <RefreshCw className={isGenerating ? "animate-spin text-blue-500" : "text-blue-500"} />
                        Daily Refresh
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {isGenerating && suggestions.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            <RefreshCw className="animate-spin mx-auto mb-3 h-8 w-8 text-blue-400" />
                            <p>Analyzing your planner to find optimal updates...</p>
                        </div>
                    ) : suggestions.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            <Check className="mx-auto mb-3 h-8 w-8 text-green-400" />
                            <p>Everything looks up to date! No suggestions found.</p>
                        </div>
                    ) : (
                        suggestions.map(suggestion => (
                            <div
                                key={suggestion.id}
                                className={`flex items-start gap-4 p-4 rounded-lg border cursor-pointer transition-colors ${selectedIds.has(suggestion.id) ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'
                                    }`}
                                onClick={() => toggleSelection(suggestion.id)}
                            >
                                <button className="mt-1 text-blue-600">
                                    {selectedIds.has(suggestion.id) ? <CheckSquare size={20} /> : <Square size={20} />}
                                </button>
                                <div className="mt-1">{getIcon(suggestion.type)}</div>
                                <div>
                                    <h4 className="font-medium text-gray-900">{suggestion.type.replace(/_/g, ' ').toUpperCase()}</h4>
                                    <p className="text-gray-600 text-sm mt-1">{suggestion.description}</p>
                                    <span className="inline-block mt-2 text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full font-medium">
                                        Source: {suggestion.source.toUpperCase()}
                                    </span>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="p-6 border-t bg-gray-50 rounded-b-xl flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleApply}
                        disabled={selectedIds.size === 0 || isGenerating}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        Apply {selectedIds.size} Update{selectedIds.size !== 1 ? 's' : ''}
                    </button>
                </div>
            </div>
        </div>
    );
};
