import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { importArchives } from './import_archives.js';
import { openDatabase, searchSegments } from '../multisemantic-db.js';

const TEST_LOGS = path.resolve('test-import-logs');
const TEST_DATA = path.resolve('test-import-data');

const writeArchive = async (filename, entries) => {
    const body = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
    await fs.writeFile(path.join(TEST_LOGS, filename), body);
};

beforeEach(async () => {
    for (const dir of [TEST_LOGS, TEST_DATA]) {
        await fs.rm(dir, { recursive: true, force: true }).catch(() => { });
        await fs.mkdir(dir, { recursive: true });
    }
});

afterAll(async () => {
    for (const dir of [TEST_LOGS, TEST_DATA]) {
        await fs.rm(dir, { recursive: true, force: true }).catch(() => { });
    }
});

describe('cold-start archive importer', () => {
    it('imports entries from chat_archive_*.jsonl into segments', async () => {
        await writeArchive('chat_archive_2026-05-10.jsonl', [
            { timestamp: '2026-05-10T10:00:00.000Z', summary_id: 'arch-1', messages: [{ role: 'user', content: 'hello' }], summary: 's1' },
            { timestamp: '2026-05-10T11:00:00.000Z', summary_id: 'arch-2', messages: [{ role: 'user', content: 'world' }], summary: 's2' },
        ]);

        const result = await importArchives({ logsDir: TEST_LOGS, dataDir: TEST_DATA });

        expect(result.scanned).toBe(2);
        expect(result.inserted).toBe(2);
        expect(result.skipped).toBe(0);
        expect(result.invalid).toBe(0);

        const db = openDatabase(TEST_DATA);
        const all = searchSegments(db, { limit: 100 });
        const ids = all.map(s => s.id).sort();
        expect(ids).toEqual(['arch-1', 'arch-2']);

        const a1 = all.find(s => s.id === 'arch-1');
        expect(a1.metadata.archive_file).toBe('logs/chat_archive_2026-05-10.jsonl');
        expect(a1.lineage).toEqual({ valueId: null, goalId: null, projectId: null, taskId: null });
        db.close();
    });

    it('is idempotent — re-running produces no duplicates', async () => {
        await writeArchive('chat_archive_2026-05-10.jsonl', [
            { timestamp: '2026-05-10T10:00:00.000Z', summary_id: 'arch-1', messages: [{ role: 'user', content: 'hello' }], summary: 's1' },
            { timestamp: '2026-05-10T11:00:00.000Z', summary_id: 'arch-2', messages: [{ role: 'user', content: 'world' }], summary: 's2' },
        ]);

        const first = await importArchives({ logsDir: TEST_LOGS, dataDir: TEST_DATA });
        expect(first.inserted).toBe(2);
        expect(first.skipped).toBe(0);

        const second = await importArchives({ logsDir: TEST_LOGS, dataDir: TEST_DATA });
        expect(second.inserted).toBe(0);
        expect(second.skipped).toBe(2);

        const db = openDatabase(TEST_DATA);
        const all = searchSegments(db, { limit: 100 });
        expect(all).toHaveLength(2);
        db.close();
    });

    it('falls back to generated UUID when summary_id is missing', async () => {
        await writeArchive('chat_archive_2026-05-10.jsonl', [
            { timestamp: '2026-05-10T10:00:00.000Z', messages: [{ role: 'user', content: 'hello' }] },
        ]);

        const result = await importArchives({ logsDir: TEST_LOGS, dataDir: TEST_DATA });
        expect(result.inserted).toBe(1);

        const db = openDatabase(TEST_DATA);
        const all = searchSegments(db, { limit: 100 });
        expect(all).toHaveLength(1);
        expect(all[0].id).toMatch(/^seg-/);
        db.close();
    });

    it('groups entries from the same archive file under one thread_id', async () => {
        await writeArchive('chat_archive_2026-05-10.jsonl', [
            { timestamp: '2026-05-10T10:00:00.000Z', summary_id: 'day1-a', messages: [{ role: 'user', content: 'a' }] },
            { timestamp: '2026-05-10T11:00:00.000Z', summary_id: 'day1-b', messages: [{ role: 'user', content: 'b' }] },
        ]);
        await writeArchive('chat_archive_2026-05-11.jsonl', [
            { timestamp: '2026-05-11T10:00:00.000Z', summary_id: 'day2-a', messages: [{ role: 'user', content: 'c' }] },
        ]);

        await importArchives({ logsDir: TEST_LOGS, dataDir: TEST_DATA });

        const db = openDatabase(TEST_DATA);
        const all = searchSegments(db, { limit: 100 });
        const byId = Object.fromEntries(all.map(s => [s.id, s.thread_id]));
        expect(byId['day1-a']).toBe(byId['day1-b']);
        expect(byId['day1-a']).not.toBe(byId['day2-a']);
        db.close();
    });

    it('skips invalid entries (unparseable JSON, missing messages)', async () => {
        await writeArchive('chat_archive_2026-05-10.jsonl', [
            { timestamp: '2026-05-10T10:00:00.000Z', summary_id: 'ok', messages: [{ role: 'user', content: 'fine' }] },
            { timestamp: '2026-05-10T11:00:00.000Z', summary_id: 'no-msgs' },
        ]);
        // Append an unparseable line.
        await fs.appendFile(path.join(TEST_LOGS, 'chat_archive_2026-05-10.jsonl'), '{not valid json\n');

        const result = await importArchives({ logsDir: TEST_LOGS, dataDir: TEST_DATA });
        expect(result.inserted).toBe(1);
        expect(result.invalid).toBe(2);
    });

    it('returns gracefully when the logs directory does not exist', async () => {
        await fs.rm(TEST_LOGS, { recursive: true, force: true });
        const result = await importArchives({ logsDir: TEST_LOGS, dataDir: TEST_DATA });
        expect(result).toEqual({ scanned: 0, inserted: 0, skipped: 0, invalid: 0 });
    });
});
