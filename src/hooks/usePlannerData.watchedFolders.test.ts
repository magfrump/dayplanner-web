import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePlannerData } from './usePlannerData';
import type { Project } from '../types/planner';

interface MockStorage {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
}

const installStorage = (initialProjects: Project[]): MockStorage => {
    const responseFor = (key: string) => {
        if (key === 'planner-projects') return { value: JSON.stringify(initialProjects) };
        return { value: null };
    };
    const storage: MockStorage = {
        get: vi.fn(async (key: string) => responseFor(key)),
        set: vi.fn(async () => undefined),
        patch: vi.fn(async () => undefined),
    };
    (window as unknown as { storage: MockStorage }).storage = storage;
    return storage;
};

describe('usePlannerData watched-folder rescan', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        delete (window as unknown as { storage?: MockStorage }).storage;
    });

    it('merges new files from watched folders into documents[] on initial load', async () => {
        const project: Project = {
            id: 1,
            name: 'P1',
            goalId: 99,
            status: 'in_progress',
            completed: false,
            documents: ['/notes/old.md'],
            watchedFolders: ['/notes'],
        };
        const storage = installStorage([project]);

        vi.stubGlobal('fetch', vi.fn(async (input: string) => {
            expect(input).toContain('/api/list-folder');
            return {
                ok: true,
                json: async () => ({ files: ['/notes/old.md', '/notes/new.md'], truncated: false }),
            };
        }));

        renderHook(() => usePlannerData());

        await waitFor(() => {
            expect(storage.patch).toHaveBeenCalledWith(
                'planner-projects',
                'update',
                expect.objectContaining({ id: 1, documents: ['/notes/old.md', '/notes/new.md'] }),
                1,
            );
        });
    });

    it('skips the rescan write when the folder contributes no new files', async () => {
        const project: Project = {
            id: 1,
            name: 'P1',
            goalId: 99,
            status: 'in_progress',
            completed: false,
            documents: ['/notes/old.md'],
            watchedFolders: ['/notes'],
        };
        const storage = installStorage([project]);

        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            json: async () => ({ files: ['/notes/old.md'], truncated: false }),
        })));

        const { result } = renderHook(() => usePlannerData());
        await waitFor(() => expect(result.current.isDataLoaded).toBe(true));
        // Let any pending async work flush. Single tick is enough because the
        // rescan IIFE awaits only listFolder.
        await new Promise(r => setTimeout(r, 0));

        const projectPatches = storage.patch.mock.calls.filter(c => c[0] === 'planner-projects');
        expect(projectPatches).toHaveLength(0);
    });

    it('continues to other folders when one listFolder call fails', async () => {
        const project: Project = {
            id: 1,
            name: 'P1',
            goalId: 99,
            status: 'in_progress',
            completed: false,
            documents: [],
            watchedFolders: ['/broken', '/ok'],
        };
        const storage = installStorage([project]);

        vi.stubGlobal('fetch', vi.fn(async (input: string) => {
            if (input.includes(encodeURIComponent('/broken'))) {
                return { ok: false, status: 500, json: async () => ({ error: 'boom' }) };
            }
            return { ok: true, json: async () => ({ files: ['/ok/a.txt'], truncated: false }) };
        }));

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

        renderHook(() => usePlannerData());

        await waitFor(() => {
            expect(storage.patch).toHaveBeenCalledWith(
                'planner-projects',
                'update',
                expect.objectContaining({ documents: ['/ok/a.txt'] }),
                1,
            );
        });
        expect(warnSpy).toHaveBeenCalled();
    });

    it('does not call /api/list-folder when no project has watched folders', async () => {
        const project: Project = {
            id: 1,
            name: 'P1',
            goalId: 99,
            status: 'in_progress',
            completed: false,
        };
        installStorage([project]);

        const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({ files: [], truncated: false }) }));
        vi.stubGlobal('fetch', fetchSpy);

        const { result } = renderHook(() => usePlannerData());
        await waitFor(() => expect(result.current.isDataLoaded).toBe(true));
        await new Promise(r => setTimeout(r, 0));

        const listCalls = fetchSpy.mock.calls.filter(c => String(c[0]).includes('/api/list-folder'));
        expect(listCalls).toHaveLength(0);
    });
});
