import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';

let toWslPath;

describe('toWslPath', () => {
    beforeAll(async () => {
        // Importing storage-server.js has side effects (creates data/uploads);
        // point it at a throwaway dir like the other server tests do.
        process.env.DATA_DIR = path.resolve('test-data-windows-path');
        ({ toWslPath } = await import('./storage-server.js'));
    });

    it('converts a backslash drive path to its WSL mount', () => {
        expect(toWslPath('C:\\Users\\me\\Documents')).toBe('/mnt/c/Users/me/Documents');
    });

    it('converts a forward-slash drive path', () => {
        expect(toWslPath('D:/data/files')).toBe('/mnt/d/data/files');
    });

    it('lowercases the drive letter', () => {
        expect(toWslPath('E:\\Photos')).toBe('/mnt/e/Photos');
    });

    it('handles a bare drive root', () => {
        expect(toWslPath('C:\\')).toBe('/mnt/c/');
    });

    it('leaves an already-POSIX path unchanged', () => {
        expect(toWslPath('/mnt/c/Users/me')).toBe('/mnt/c/Users/me');
        expect(toWslPath('/home/magfrump/docs')).toBe('/home/magfrump/docs');
    });

    it('leaves a UNC path unchanged (out of scope)', () => {
        expect(toWslPath('\\\\server\\share\\dir')).toBe('\\\\server\\share\\dir');
    });

    it('passes through non-strings untouched', () => {
        expect(toWslPath(undefined)).toBe(undefined);
    });
});
