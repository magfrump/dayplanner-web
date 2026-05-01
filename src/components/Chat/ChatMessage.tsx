import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bug } from 'lucide-react';
import type { TraceData, Message } from '../../services/types';

interface ChatMessageProps {
    message: Message;
    onViewTrace?: (trace: TraceData) => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, onViewTrace }) => {
    return (
        <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} group relative`}>
            <div className={`max-w-[80%] rounded-2xl px-5 py-3 shadow-sm ${message.role === 'user'
                ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white'
                : 'bg-white border border-gray-100 text-gray-800'
                }`}>
                <div className="prose prose-sm max-w-none break-words dark:prose-invert">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                            p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                            ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                            li: ({ children }) => <li className="pl-1">{children}</li>,
                            strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                            a: ({ href, children }) => (
                                <a
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-500 hover:underline"
                                >
                                    {children}
                                </a>
                            ),
                            code: ({ children, className }) => {
                                const isInline = !className;
                                return isInline ? (
                                    <code className="bg-gray-100 rounded px-1 py-0.5 text-xs font-mono text-pink-600">
                                        {children}
                                    </code>
                                ) : (
                                    <div className="bg-gray-800 text-gray-100 rounded-lg p-3 my-2 text-xs font-mono overflow-x-auto">
                                        {children}
                                    </div>
                                );
                            }
                        }}
                    >
                        {message.content}
                    </ReactMarkdown>
                </div>
            </div>
            {message.role === 'assistant' && !!message.traceData && onViewTrace && (
                <button
                    onClick={() => onViewTrace(message.traceData as TraceData)}
                    className="absolute -right-8 top-2 p-1.5 text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all"
                    title="View LLM Trace"
                >
                    <Bug size={16} />
                </button>
            )}
        </div>
    );
};
