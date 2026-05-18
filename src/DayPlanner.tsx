
import { Fragment, useState, useRef, useEffect } from 'react';
import { Send, Settings } from 'lucide-react';
import { SettingsModal } from './components/SettingsModal';
import { SummaryCard } from './components/Chat/SummaryCard';
import { ChatMessage } from './components/Chat/ChatMessage';
import { LineageBreadcrumb } from './components/Chat/LineageBreadcrumb';
import GraphView from './components/Planner/GraphView';
import { PlannerDataView } from './components/Planner/PlannerDataView';
import { usePlannerData } from './hooks/usePlannerData';
import { usePlannerAI } from './hooks/usePlannerAI';
import { HistorySection } from './components/Planner/HistorySection';
import { RefreshReviewModal } from './components/Planner/RefreshReviewModal';
import { RefreshCw, Archive } from 'lucide-react'; // Import Icon
import { TraceModal } from './components/TraceModal';
import { PlanControls } from './components/Planner/PlanControls';
import type { EditModeState } from './types/ui';
import type { Value, Goal, Project, Task, PlannerMode, FocusState } from './types/planner';
import type { TraceData } from './services/types';
import { resolveEffectiveFocus } from './utils/focus';
import { nextId } from './utils/ids';

const DayPlanner = () => {
    const [activeTab, setActiveTab] = useState('plan');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [mode, setMode] = useState<PlannerMode>('focusing');
    const [focus, setFocus] = useState<FocusState>({});

    // UI State for Editing
    const [editMode, setEditMode] = useState<EditModeState>({ type: null, id: null, data: null });
    const [isRefreshModalOpen, setIsRefreshModalOpen] = useState(false);
    const [viewingTrace, setViewingTrace] = useState<TraceData | null>(null);

    // Custom Hooks
    const data = usePlannerData();
    const {
        values, goals, projects, tasks, capacity, savedFilters,
        isDataLoaded, saveError,
        addItem, updateItem, deleteItem, toggleTask, setCapacity, setSavedFilters
    } = data;

    const {
        conversation, sendMessage, isLoading, isSummarizing, summarizeConversation, llmConfig, setLlmConfig,
        refreshSuggestions, setRefreshSuggestions, generateRefreshSuggestions
    } = usePlannerAI(
        { values, goals, projects, tasks, capacity },
        { addItem, updateItem, deleteItem, setCapacity, toggleTask },
        undefined, // initialConversation
        mode,
        { focus, setFocus }
    );

    const [userInput, setUserInput] = useState('');
    const chatEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
        }
    }, [userInput]);

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
        const tempId = nextId();
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

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    // --- Render Views ---

    const renderPlanView = () => {
        const { focusedValue, focusedGoal, focusedProject, focusedTask } = resolveEffectiveFocus(
            focus,
            conversation,
            { values, goals, projects, tasks }
        );
        return (
            <div className="flex flex-col gap-4 md:flex-row md:h-[calc(100dvh-12rem)]">
                {/* Chat Area */}
                <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200/50 overflow-hidden flex flex-col h-[70dvh] md:h-auto md:flex-1 md:min-h-0">
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {conversation.map((msg, idx) => {
                            if (msg.type === 'summary') {
                                return <SummaryCard key={idx} message={msg} />;
                            }

                            return (
                                <Fragment key={idx}>
                                    {msg.role === 'assistant' && msg.retrievalState && (
                                        <LineageBreadcrumb
                                            retrievalState={msg.retrievalState}
                                            values={values}
                                            goals={goals}
                                            projects={projects}
                                            tasks={tasks}
                                        />
                                    )}
                                    <ChatMessage
                                        message={msg}
                                        onViewTrace={msg.role === 'assistant' ? setViewingTrace : undefined}
                                    />
                                </Fragment>
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
                        <div className="flex gap-2 items-end">
                            <textarea
                                ref={textareaRef}
                                value={userInput}
                                onChange={(e) => setUserInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={
                                    mode === 'mapping' ? "What's on your mind? Let's get it all down..." :
                                        mode === 'execution' ? "What step are you on? Need any help?" :
                                            "How are you feeling? What would you like to do?"
                                }
                                className="flex-1 px-4 py-3 border border-gray-200 rounded-xl shadow-inner bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all resize-none overflow-hidden min-h-[50px]"
                                rows={1}
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

                <PlanControls
                    mode={mode}
                    setMode={setMode}
                    capacity={capacity}
                    focusedValue={focusedValue}
                    focusedGoal={focusedGoal}
                    focusedProject={focusedProject}
                    focusedTask={focusedTask}
                    onClearFocus={() => setFocus({})}
                />
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
                onSave={setLlmConfig}
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

            <div className="flex flex-wrap gap-1.5 mb-4">
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
                    data={{ values, goals, projects, tasks, capacity, savedFilters }}
                    actions={{ deleteItem, toggleTask, setCapacity, setSavedFilters }}
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
                <div className="h-[calc(100dvh-12rem)]">
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
