
import { useState, useRef, useEffect } from 'react';
import { Send, Settings } from 'lucide-react';
import { SettingsModal } from './components/SettingsModal';
import { SummaryCard } from './components/Chat/SummaryCard';
import GraphView from './components/Planner/GraphView';
import { PlannerDataView } from './components/Planner/PlannerDataView';
import { usePlannerData } from './hooks/usePlannerData';
import { usePlannerAI } from './hooks/usePlannerAI';
import { HistorySection } from './components/Planner/HistorySection';
import { RefreshReviewModal } from './components/Planner/RefreshReviewModal';
import { RefreshCw, Bug, Archive } from 'lucide-react'; // Import Icon
import { TraceModal } from './components/TraceModal';
import type { EditModeState } from './types/ui';
import type { Value, Goal, Project, Task } from './types/planner';
import type { TraceData } from './services/types';

const DayPlanner = () => {
    const [activeTab, setActiveTab] = useState('plan');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    // UI State for Editing
    const [editMode, setEditMode] = useState<EditModeState>({ type: null, id: null, data: null });
    const [isRefreshModalOpen, setIsRefreshModalOpen] = useState(false);
    const [viewingTrace, setViewingTrace] = useState<TraceData | null>(null);

    // Custom Hooks
    const data = usePlannerData();
    const {
        values, goals, projects, tasks, capacity,
        isDataLoaded, saveError,
        addItem, updateItem, deleteItem, toggleTask, setCapacity
    } = data;

    const {
        conversation, sendMessage, isLoading, isSummarizing, summarizeConversation, llmConfig, setLlmConfig,
        refreshSuggestions, setRefreshSuggestions, generateRefreshSuggestions
    } = usePlannerAI(
        { values, goals, projects, tasks, capacity },
        { addItem, updateItem, deleteItem, setCapacity, toggleTask }
    );

    const [userInput, setUserInput] = useState('');
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [conversation]);

    // Refresh Handlers
    const handleRefreshClick = async () => {
        setIsRefreshModalOpen(true);
        await generateRefreshSuggestions();
    };

    const handleApplySuggestions = (selectedIds: string[]) => {
        const toApply = refreshSuggestions.filter(s => selectedIds.includes(s.id));

        toApply.forEach(s => {
            if (s.action === 'create') {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                addItem(s.targetType, s.payload as any);
            } else if (s.action === 'update') {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if (s.targetId) updateItem(s.targetType, { id: s.targetId, ...(s.payload as any) });
            } else if (s.action === 'delete') {
                if (s.targetId) deleteItem(s.targetType, s.targetId);
            }
        });

        // Remove applied suggestions from list
        setRefreshSuggestions(prev => prev.filter(s => !selectedIds.includes(s.id)));

        // Close if clean, or keep open if partial
        if (selectedIds.length === refreshSuggestions.length) {
            setIsRefreshModalOpen(false);
        }
    };

    // Helpers for UI interactions
    const handleStartEdit = (type: 'value' | 'goal' | 'project' | 'task', item: Value | Goal | Project | Task) => {
        setEditMode({ type, id: item.id, data: { ...item } });
    };

    const handleAddClick = (type: 'value' | 'goal' | 'project' | 'task') => {
        // Initialize empty item structure based on type
        // Note: ID is set in usePlannerData.addItem, but we need temporary ID for the modal form
        const tempId = Date.now();
        const newItem: Partial<Value & Goal & Project & Task> = { id: tempId, name: '', description: '' };

        if (type === 'value') newItem.color = '#6b7280';
        if (type === 'goal') { newItem.valueId = values[0]?.id; newItem.timeframe = 'This Month'; }
        if (type === 'project') { newItem.goalId = goals[0]?.id; newItem.status = 'not_started'; }
        if (type === 'task') {
            newItem.projectId = projects[0]?.id;
            newItem.importance = 3; newItem.urgency = 3;
            newItem.workType = 'focus'; newItem.completed = false;
        }

        setEditMode({ type, id: tempId, data: newItem });
    };

    const handleSaveEdit = () => {
        if (!editMode.type || !editMode.data) return;
        const { type, id, data } = editMode;

        // Determine if it's a new item (not in list) or update
        // We can check if ID exists in the relevant list
        const typeStr = type as 'value' | 'goal' | 'project' | 'task';
        let exists = false;
        if (type === 'value') exists = values.some(v => v.id === id);
        if (type === 'goal') exists = goals.some(g => g.id === id);
        if (type === 'project') exists = projects.some(p => p.id === id);
        if (type === 'task') exists = tasks.some(t => t.id === id);

        if (exists) {
            updateItem(typeStr, data as Partial<Value> & { id: number }); // Ensure checks are done by logic or use a union type guard if strictly needed, but casting to expected intersection is better than any
        } else {
            // New items only need Omit<..., id> but we have full object.
            // cast to unknown first to avoid deep type warnings if mismatch, 
            // but ideally we should use a proper type guard. For now, removing 'any' 
            // requires us to assert it conforms to the input type.
            addItem(typeStr, data as Omit<Value, 'id'>);
        }
        setEditMode({ type: null, id: null, data: null });
    };

    const handleSendMessage = () => {
        sendMessage(userInput);
        setUserInput('');
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    // --- Render Views ---

    const renderPlanView = () => {
        // Basic focus detection logic moved from original
        // Ideally this should be in a hook or util if needed for rendering
        const recentText = conversation.slice(-3).map(m => m.content.toLowerCase()).join(' ');
        const focusedTask = tasks.find(t => recentText.includes(t.name.toLowerCase()));
        const focusedProject = projects.find(p => recentText.includes(p.name.toLowerCase())) ||
            (focusedTask ? projects.find(p => p.id === focusedTask.projectId) : null);
        const focusedGoal = goals.find(g => recentText.includes(g.name.toLowerCase())) ||
            (focusedProject ? goals.find(g => g.id === focusedProject.goalId) : null);
        const focusedValue = values.find(v => recentText.includes(v.name.toLowerCase())) ||
            (focusedGoal ? values.find(v => v.id === focusedGoal.valueId) : null);

        const hasFocus = focusedValue || focusedGoal || focusedProject || focusedTask;

        return (
            <div className="flex flex-col h-[calc(100vh-12rem)]">
                {/* Capacity Quick View (Read Only / Small) */}
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

                {/* Chat Area */}
                <div className="flex-1 bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200/50 overflow-hidden flex flex-col">
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {conversation.map((msg, idx) => {
                            if (msg.type === 'summary') {
                                return <SummaryCard key={idx} message={msg} />;
                            }

                            return (
                                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group relative`}>
                                    <div className={`max-w-[80%] rounded-2xl px-5 py-3 shadow-sm ${msg.role === 'user'
                                        ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white'
                                        : 'bg-white border border-gray-100 text-gray-800'
                                        }`}>
                                        <div className="whitespace-pre-wrap">{msg.content}</div>
                                    </div>
                                    {msg.role === 'assistant' && !!msg.traceData && (
                                        <button
                                            onClick={() => setViewingTrace(msg.traceData as TraceData)}
                                            className="absolute -right-8 top-2 p-1.5 text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all"
                                            title="View LLM Trace"
                                        >
                                            <Bug size={16} />
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="bg-gray-100 rounded-lg px-4 py-2">
                                    <div className="flex gap-1">
                                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>

                    {/* Input Area */}
                    <div className="border-t p-4">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={userInput}
                                onChange={(e) => setUserInput(e.target.value)}
                                onKeyPress={handleKeyPress}
                                placeholder="How are you feeling? What would you like to do?"
                                className="flex-1 px-4 py-3 border border-gray-200 rounded-xl shadow-inner bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                                disabled={isLoading}
                            />
                            <button
                                data-testid="send-message-button"
                                onClick={handleSendMessage}
                                disabled={isLoading || !userInput.trim()}
                                className="bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed shadow-sm transition-colors"
                            >
                                <Send size={20} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // renderDataView removed (extracted to PlannerDataView)

    if (!isDataLoaded) return <div className="p-8 text-center text-gray-500">Loading planner data...</div>;

    return (
        <div className="max-w-4xl mx-auto p-4 bg-gray-50 min-h-screen">
            {/* Error Notification */}
            {saveError && (
                <div className="fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded shadow-lg z-50" role="alert">
                    <strong className="font-bold">Error: </strong>
                    <span className="block sm:inline">{saveError}</span>
                </div>
            )}

            <div className="flex justify-between items-center mb-4">
                <h1 className="text-xl font-bold text-gray-800">Day Planner</h1>
                <div className="flex gap-2">
                    <button
                        onClick={handleRefreshClick}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 bg-white border border-blue-200 shadow-sm rounded-full transition-colors"
                        title="Daily Refresh"
                    >
                        <RefreshCw size={20} />
                    </button>
                    <button
                        onClick={() => summarizeConversation(true)}
                        disabled={isLoading || isSummarizing}
                        className="p-1.5 text-orange-600 hover:bg-orange-50 bg-white border border-d-200 shadow-sm rounded-full transition-colors disabled:opacity-50"
                        title="Cleanup / Summarize Context"
                    >
                        <Archive size={20} />
                    </button>
                    <button
                        onClick={() => setIsSettingsOpen(true)}
                        className="p-1.5 text-gray-500 hover:bg-gray-200 rounded-full transition-colors"
                    >
                        <Settings size={20} />
                    </button>
                </div>
            </div>

            {isSettingsOpen && <SettingsModal
                isOpen={true}
                onClose={() => setIsSettingsOpen(false)}
                onSave={(config) => {
                    setLlmConfig(config);
                    localStorage.setItem('planner-llm-config', JSON.stringify(config));
                }}
                currentConfig={llmConfig}
            />}

            <RefreshReviewModal
                isOpen={isRefreshModalOpen}
                onClose={() => setIsRefreshModalOpen(false)}
                suggestions={refreshSuggestions}
                onApply={handleApplySuggestions}
                isGenerating={isLoading}  // Sharing isLoading from chat might be confusing if chat is also loading? 
            // Actually generateRefreshSuggestions sets isLoading too. 
            />

            <TraceModal
                isOpen={!!viewingTrace}
                onClose={() => setViewingTrace(null)}
                traceData={viewingTrace}
            />

            <div className="flex gap-1.5 mb-4">
                <button onClick={() => setActiveTab('plan')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'plan' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-100'}`}>
                    Plan
                </button>
                <button onClick={() => setActiveTab('data')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'data' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-100'}`}>
                    Data
                </button>
                <button onClick={() => setActiveTab('graph')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'graph' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-100'}`}>
                    Map
                </button>
                <button onClick={() => setActiveTab('history')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'history' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-100'}`}>
                    History
                </button>
            </div>

            {activeTab === 'plan' && renderPlanView()}
            {activeTab === 'data' && (
                <PlannerDataView
                    data={{ values, goals, projects, tasks, capacity }}
                    actions={{ deleteItem, toggleTask, setCapacity }}
                    ui={{
                        editMode,
                        setEditMode,
                        onSave: handleSaveEdit,
                        onAdd: handleAddClick,
                        onEdit: handleStartEdit
                    }}
                />
            )}
            {activeTab === 'graph' && (
                <div className="h-[calc(100vh-12rem)]">
                    <GraphView
                        values={values}
                        goals={goals}
                        projects={projects}
                        tasks={tasks}
                        onEdit={handleStartEdit}
                    />
                </div>
            )}
            {activeTab === 'history' && <HistorySection tasks={tasks} projects={projects} goals={goals} values={values} />}
        </div>
    );
};

export default DayPlanner;
