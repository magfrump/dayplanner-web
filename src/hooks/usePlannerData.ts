
import { useState, useEffect, useRef } from 'react';
import type { Value, Goal, Project, Task, Capacity, SavedFilter } from '../types/planner';
import { initializeStorage } from '../utils/storagePolyfill';
import { nextId } from '../utils/ids';
import { listFolder, mergeDocuments } from '../services/folderImport';

initializeStorage();

export const usePlannerData = () => {
    // State
    const [values, setValues] = useState<Value[]>([]);
    const [goals, setGoals] = useState<Goal[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [capacity, setCapacity] = useState<Capacity>({
        energy: 3, mood: 4, stress: 2, timeAvailable: 6, physicalState: 3
    });
    const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
    const [isDataLoaded, setIsDataLoaded] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    // Initial Load
    useEffect(() => {
        const loadData = async () => {
            try {
                const [valuesResult, goalsResult, projectsResult, tasksResult, capacityResult, filtersResult] = await Promise.all([
                    window.storage.get('planner-values').catch(() => ({ value: null })),
                    window.storage.get('planner-goals').catch(() => ({ value: null })),
                    window.storage.get('planner-projects').catch(() => ({ value: null })),
                    window.storage.get('planner-tasks').catch(() => ({ value: null })),
                    window.storage.get('planner-capacity').catch(() => ({ value: null })),
                    window.storage.get('planner-saved-filters').catch(() => ({ value: null }))
                ]);

                // Defaults
                const defaultValues: Value[] = [
                    { id: 1, name: 'Health & Wellbeing', color: '#10b981' },
                    { id: 2, name: 'Creative Expression', color: '#8b5cf6' },
                    { id: 3, name: 'Financial Security', color: '#f59e0b' }
                ];
                const defaultGoals: Goal[] = [
                    { id: 1, name: 'Build sustainable exercise habit', valueId: 1, timeframe: 'This Month', completed: false },
                    { id: 2, name: 'Complete novel manuscript', valueId: 2, timeframe: 'This Year', completed: false },
                    { id: 3, name: 'Increase monthly income', valueId: 3, timeframe: 'Q1', completed: false }
                ];
                const defaultProjects: Project[] = [
                    { id: 1, name: 'Morning workout routine', goalId: 1, status: 'in_progress', completed: false },
                    { id: 2, name: 'Novel - Chapter revisions', goalId: 2, status: 'in_progress', completed: false },
                    { id: 3, name: 'Freelance client work', goalId: 3, status: 'in_progress', completed: false }
                ];
                const defaultTasks: Task[] = [
                    { id: 1, name: '30-min cardio', projectId: 1, importance: 4, urgency: 5, workType: 'physical', completed: false },
                    { id: 2, name: 'Revise chapter 3', projectId: 2, importance: 5, urgency: 3, workType: 'creative', completed: false },
                    // ... shortened to keep hook readable, could be external constant
                ];

                const parse = <T>(res: { value: string | null }, def: T): T => res?.value ? JSON.parse(res.value) : def;

                setValues(parse(valuesResult, defaultValues));
                setGoals(parse(goalsResult, defaultGoals));
                setProjects(parse(projectsResult, defaultProjects));
                setTasks(parse(tasksResult, defaultTasks));
                if (capacityResult?.value) setCapacity(JSON.parse(capacityResult.value));
                setSavedFilters(parse(filtersResult, [] as SavedFilter[]));

                setIsDataLoaded(true);
            } catch (error) {
                console.error('Error loading data:', error);
                setSaveError('Failed to load initial data.');
                setIsDataLoaded(true);
            }
        };
        loadData();
    }, []);

    // Debounced Capacity Save
    useEffect(() => {
        if (!isDataLoaded) return;
        const handler = setTimeout(() => {
            window.storage.set('planner-capacity', JSON.stringify(capacity))
                .catch(() => setSaveError('Failed to save capacity changes.'));
        }, 500);
        return () => clearTimeout(handler);
    }, [capacity, isDataLoaded]);

    // Saved filters: persisted as a whole array (small enough; mutations are infrequent).
    useEffect(() => {
        if (!isDataLoaded) return;
        const handler = setTimeout(() => {
            window.storage.set('planner-saved-filters', JSON.stringify(savedFilters))
                .catch(() => setSaveError('Failed to save filter changes.'));
        }, 300);
        return () => clearTimeout(handler);
    }, [savedFilters, isDataLoaded]);

    // Error auto-clear
    useEffect(() => {
        if (saveError) {
            const timer = setTimeout(() => setSaveError(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [saveError]);

    // CRUD Operations
    const addItem = (type: 'value' | 'goal' | 'project' | 'task', item: Omit<Value | Goal | Project | Task, 'id'>) => {
        const id = nextId();
        const newItem = { ...item, id };

        switch (type) {
            case 'value':
                setValues(prev => [...prev, newItem as Value]);
                window.storage.patch('planner-values', 'add', newItem);
                break;
            case 'goal':
                setGoals(prev => [...prev, newItem as Goal]);
                window.storage.patch('planner-goals', 'add', newItem);
                break;
            case 'project':
                setProjects(prev => [...prev, newItem as Project]);
                window.storage.patch('planner-projects', 'add', newItem);
                break;
            case 'task':
                setTasks(prev => [...prev, newItem as Task]);
                window.storage.patch('planner-tasks', 'add', newItem);
                break;
        }
    };

    const updateItem = (type: 'value' | 'goal' | 'project' | 'task', item: Partial<Value | Goal | Project | Task> & { id: number }) => {
        switch (type) {
            case 'value':
                setValues(prev => prev.map(v => v.id === item.id ? { ...v, ...(item as Partial<Value>) } : v));
                window.storage.patch('planner-values', 'update', item, item.id);
                break;
            case 'goal':
                setGoals(prev => prev.map(g => g.id === item.id ? { ...g, ...(item as Partial<Goal>) } : g));
                window.storage.patch('planner-goals', 'update', item, item.id);
                break;
            case 'project':
                setProjects(prev => prev.map(p => p.id === item.id ? { ...p, ...(item as Partial<Project>) } : p));
                window.storage.patch('planner-projects', 'update', item, item.id);
                break;
            case 'task':
                setTasks(prev => prev.map(t => t.id === item.id ? { ...t, ...(item as Partial<Task>) } : t));
                window.storage.patch('planner-tasks', 'update', item, item.id);
                break;
        }
    };

    const deleteItem = (type: 'value' | 'goal' | 'project' | 'task', id: number) => {
        switch (type) {
            case 'value':
                setValues(prev => prev.filter(v => v.id !== id));
                window.storage.patch('planner-values', 'delete', null, id);
                break;
            case 'goal':
                setGoals(prev => prev.filter(g => g.id !== id));
                window.storage.patch('planner-goals', 'delete', null, id);
                break;
            case 'project':
                setProjects(prev => prev.filter(p => p.id !== id));
                window.storage.patch('planner-projects', 'delete', null, id);
                break;
            case 'task':
                setTasks(prev => prev.filter(t => t.id !== id));
                window.storage.patch('planner-tasks', 'delete', null, id);
                break;
        }
    };

    // Specific Helpers
    const toggleTask = (id: number) => {
        const task = tasks.find(t => t.id === id);
        if (task) {
            updateItem('task', { ...task, completed: !task.completed });
        }
    };

    // Re-scan each project's watchedFolders once on initial load. New files are
    // merged into documents[]; existing files keep their position. Failures
    // (folder gone, server unreachable) are logged but don't block the app.
    const watchRescanRanRef = useRef(false);
    useEffect(() => {
        if (!isDataLoaded || watchRescanRanRef.current) return;
        watchRescanRanRef.current = true;

        const projectsWithWatchers = projects.filter(p => Array.isArray(p.watchedFolders) && p.watchedFolders.length > 0);
        if (projectsWithWatchers.length === 0) return;

        (async () => {
            for (const project of projectsWithWatchers) {
                const folders = project.watchedFolders ?? [];
                let nextDocs = project.documents ?? [];
                let changed = false;
                for (const folder of folders) {
                    try {
                        const { files } = await listFolder(folder);
                        const merged = mergeDocuments(nextDocs, files);
                        if (merged.length !== nextDocs.length) {
                            nextDocs = merged;
                            changed = true;
                        }
                    } catch (err) {
                        console.warn(`Watched folder rescan failed for project ${project.id} (${folder}):`, err);
                    }
                }
                if (changed) {
                    updateItem('project', { id: project.id, documents: nextDocs });
                }
            }
        })();
        // updateItem and projects are intentionally captured at first-load time;
        // ref-guarding prevents re-runs when projects update due to our own writes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isDataLoaded]);

    return {
        values, setValues,
        goals, setGoals,
        projects, setProjects,
        tasks, setTasks,
        capacity, setCapacity,
        savedFilters, setSavedFilters,
        isDataLoaded,
        saveError,
        addItem, updateItem, deleteItem, toggleTask
    };
};
