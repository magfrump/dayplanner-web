
import React from 'react';
import { X, Copy, Terminal, MessageSquare, Briefcase } from 'lucide-react';
import type { TraceData } from '../services/types';

interface TraceModalProps {
    isOpen: boolean;
    onClose: () => void;
    traceData: TraceData | null;
}

export const TraceModal: React.FC<TraceModalProps> = ({ isOpen, onClose, traceData }) => {
    const [activeTab, setActiveTab] = React.useState<'system' | 'messages' | 'tools'>('messages');

    if (!isOpen || !traceData) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl">
                {/* Header */}
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-2xl">
                    <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <Terminal size={18} />
                        LLM Trace Details
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b">
                    <button
                        onClick={() => setActiveTab('messages')}
                        className={`flex-1 py-3 px-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors
                            ${activeTab === 'messages' ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50/50' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        <MessageSquare size={16} /> Messages
                    </button>
                    <button
                        onClick={() => setActiveTab('system')}
                        className={`flex-1 py-3 px-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors
                            ${activeTab === 'system' ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50/50' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        <Terminal size={16} /> System Prompt
                    </button>
                    <button
                        onClick={() => setActiveTab('tools')}
                        className={`flex-1 py-3 px-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors
                            ${activeTab === 'tools' ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50/50' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        <Briefcase size={16} /> Data/Tools
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 bg-gray-50/30">
                    {activeTab === 'system' && (
                        <div className="space-y-2">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-semibold text-gray-500 uppercase">System Prompt</span>
                                <button
                                    onClick={() => navigator.clipboard.writeText(traceData.systemPrompt)}
                                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                                >
                                    <Copy size={12} /> Copy
                                </button>
                            </div>
                            <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap font-mono">
                                {traceData.systemPrompt}
                            </pre>
                        </div>
                    )}

                    {activeTab === 'messages' && (
                        <div className="space-y-4">
                            {traceData.messages.map((msg, idx) => (
                                <div key={idx} className="flex gap-4">
                                    <div className="w-20 flex-shrink-0 text-xs font-bold text-gray-500 uppercase pt-2 text-right">
                                        {msg.role}
                                    </div>
                                    <div className={`flex-1 p-3 rounded-lg text-sm border ${msg.role === 'user' ? 'bg-blue-50 border-blue-100' :
                                        msg.role === 'system' ? 'bg-gray-100 border-gray-200' : 'bg-white border-gray-200'
                                        }`}>
                                        <div className="whitespace-pre-wrap">{msg.content}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {activeTab === 'tools' && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-sm font-bold text-gray-700 mb-2">Available Tools</h3>
                                <div className="grid gap-2">
                                    {traceData.tools.map((t, idx) => (
                                        <div key={idx} className="bg-white border p-3 rounded-lg">
                                            <div className="font-medium text-sm text-blue-700">{t.name}</div>
                                            <div className="text-xs text-gray-500 mt-1">{t.description}</div>
                                            <details className="mt-2">
                                                <summary className="text-xs cursor-pointer text-gray-400 hover:text-gray-600">Schema</summary>
                                                <pre className="mt-2 text-[10px] bg-gray-50 p-2 rounded overflow-x-auto">
                                                    {JSON.stringify(t.input_schema, null, 2)}
                                                </pre>
                                            </details>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <h3 className="text-sm font-bold text-gray-700 mb-2">Config</h3>
                                <pre className="bg-white border p-3 rounded-lg text-xs font-mono overflow-x-auto">
                                    {JSON.stringify(traceData.config, null, 2)}
                                </pre>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
