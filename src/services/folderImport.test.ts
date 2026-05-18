import { describe, it, expect, vi } from 'vitest';
import { mergeDocuments, listFolder } from './folderImport';

describe('mergeDocuments', () => {
    it('appends new entries while preserving original order', () => {
        expect(mergeDocuments(['/a', '/b'], ['/c'])).toEqual(['/a', '/b', '/c']);
    });

    it('drops duplicates against the existing list', () => {
        expect(mergeDocuments(['/a', '/b'], ['/b', '/c', '/a'])).toEqual(['/a', '/b', '/c']);
    });

    it('handles an undefined existing list', () => {
        expect(mergeDocuments(undefined, ['/a'])).toEqual(['/a']);
    });
});

describe('listFolder', () => {
    it('encodes the path and returns files + truncated', async () => {
        const fetchSpy = vi.fn(async () => ({
            ok: true,
            json: async () => ({ files: ['/x/a.txt'], truncated: false }),
        }));
        vi.stubGlobal('fetch', fetchSpy);

        const result = await listFolder('/has space/dir');
        expect(fetchSpy).toHaveBeenCalledWith(
            '/api/list-folder?path=' + encodeURIComponent('/has space/dir')
        );
        expect(result).toEqual({ files: ['/x/a.txt'], truncated: false });
    });

    it('throws the server-provided error on non-ok response', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: false,
            status: 404,
            json: async () => ({ error: 'Folder not found' }),
        })));
        await expect(listFolder('/missing')).rejects.toThrow('Folder not found');
    });
});
