import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import fs from 'fs/promises';
import path from 'path';

const TEST_DIR = path.resolve('test-data-multisemantic');

describe('Multisemantic segment store', () => {
    let app;
    let initData;

    beforeAll(async () => {
        process.env.DATA_DIR = TEST_DIR;
        try { await fs.rm(TEST_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
        await fs.mkdir(TEST_DIR, { recursive: true });

        const module = await import('./storage-server.js');
        app = module.app;
        initData = module.initData;
    });

    beforeEach(async () => {
        try { await fs.rm(TEST_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
        await fs.mkdir(TEST_DIR, { recursive: true });
        await initData();
    });

    afterAll(async () => {
        try { await fs.rm(TEST_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    const makeSegment = (overrides = {}) => ({
        id: overrides.id ?? `seg-${Math.random().toString(36).slice(2)}`,
        thread_id: overrides.thread_id ?? 'thread-1',
        transcript: overrides.transcript ?? [
            { role: 'user', content: 'hello world from Nat.add_succ' },
            { role: 'assistant', content: 'response about snake_case_identifiers' },
        ],
        summary: overrides.summary ?? 'A short summary',
        lineage: overrides.lineage ?? { projectId: 42 },
        metadata: overrides.metadata ?? {
            needs_classification: false,
            open_loop: false,
            archive_file: 'logs/chat_archive_2026-05-11.jsonl',
        },
    });

    it('opens the SQLite file and creates schema idempotently', async () => {
        const dbPath = path.join(TEST_DIR, 'multisemantic.sqlite');
        const exists = await fs.access(dbPath).then(() => true).catch(() => false);
        expect(exists).toBe(true);

        await initData();
        await initData();
        const stillExists = await fs.access(dbPath).then(() => true).catch(() => false);
        expect(stillExists).toBe(true);
    });

    it('inserts a segment and reads it back via search', async () => {
        const seg = makeSegment({ id: 'seg-roundtrip' });
        const post = await request(app).post('/api/segments').send(seg);
        expect(post.status).toBe(200);
        expect(post.body.success).toBe(true);
        expect(post.body.segment.id).toBe('seg-roundtrip');

        const search = await request(app).get('/api/segments/search?q=hello');
        expect(search.status).toBe(200);
        expect(search.body.results).toHaveLength(1);
        expect(search.body.results[0].id).toBe('seg-roundtrip');
    });

    it('treats duplicate id as no-op', async () => {
        const seg = makeSegment({ id: 'seg-dup' });
        await request(app).post('/api/segments').send(seg).expect(200);
        const second = await request(app).post('/api/segments').send(seg).expect(200);
        expect(second.body.duplicate).toBe(true);

        const search = await request(app).get('/api/segments/search?q=hello');
        expect(search.body.results).toHaveLength(1);
    });

    it('FTS trigram handles identifier-style tokens', async () => {
        await request(app).post('/api/segments').send(makeSegment({ id: 'seg-ident' })).expect(200);

        const r1 = await request(app).get('/api/segments/search?q=Nat.add_succ');
        expect(r1.body.results.map(s => s.id)).toContain('seg-ident');

        const r2 = await request(app).get('/api/segments/search?q=snake_case');
        expect(r2.body.results.map(s => s.id)).toContain('seg-ident');
    });

    it('strict-AND lineage filter excludes non-matching segments', async () => {
        await request(app).post('/api/segments').send(makeSegment({
            id: 'seg-proj42-task7',
            lineage: { projectId: 42, taskId: 7 },
        })).expect(200);
        await request(app).post('/api/segments').send(makeSegment({
            id: 'seg-proj42-task8',
            lineage: { projectId: 42, taskId: 8 },
        })).expect(200);
        await request(app).post('/api/segments').send(makeSegment({
            id: 'seg-proj99',
            lineage: { projectId: 99 },
        })).expect(200);

        const r = await request(app).get('/api/segments/search?projectId=42&taskId=7');
        const ids = r.body.results.map(s => s.id);
        expect(ids).toContain('seg-proj42-task7');
        expect(ids).not.toContain('seg-proj42-task8');
        expect(ids).not.toContain('seg-proj99');
    });

    it('counts segments grouped by lineage level', async () => {
        await request(app).post('/api/segments').send(makeSegment({ id: 's1', lineage: { projectId: 1 } })).expect(200);
        await request(app).post('/api/segments').send(makeSegment({ id: 's2', lineage: { projectId: 1 } })).expect(200);
        await request(app).post('/api/segments').send(makeSegment({ id: 's3', lineage: { projectId: 2 } })).expect(200);

        const r = await request(app).get('/api/segments/counts?level=project&ids=1,2,3');
        expect(r.status).toBe(200);
        expect(r.body.counts).toEqual({ 1: 2, 2: 1 });
    });

    it('takes a last-good snapshot when none exists yet', async () => {
        const snapPath = path.join(TEST_DIR, 'multisemantic.sqlite.last-good');
        const exists = await fs.access(snapPath).then(() => true).catch(() => false);
        expect(exists).toBe(true);
    });

    it('refreshes last-good snapshot on insert when it is stale (>24h)', async () => {
        const snapPath = path.join(TEST_DIR, 'multisemantic.sqlite.last-good');
        const staleTime = new Date(Date.now() - 25 * 60 * 60 * 1000);
        await fs.utimes(snapPath, staleTime, staleTime);

        const before = await fs.stat(snapPath);
        await request(app).post('/api/segments').send(makeSegment({ id: 'seg-snap' })).expect(200);
        const after = await fs.stat(snapPath);
        expect(after.mtimeMs).toBeGreaterThan(before.mtimeMs);
    });

    it('does not refresh last-good snapshot when it is fresh', async () => {
        const snapPath = path.join(TEST_DIR, 'multisemantic.sqlite.last-good');
        const before = await fs.stat(snapPath);
        await request(app).post('/api/segments').send(makeSegment({ id: 'seg-fresh' })).expect(200);
        const after = await fs.stat(snapPath);
        expect(after.mtimeMs).toBe(before.mtimeMs);
    });

    it('rejects POST without required fields', async () => {
        const r = await request(app).post('/api/segments').send({ id: 'x' });
        expect(r.status).toBe(400);
    });
});
