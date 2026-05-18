import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('GET /api/list-folder', () => {
    let app;
    let initData;
    const TEST_DIR = path.resolve('test-data-list-folder');
    let scratch;

    beforeAll(async () => {
        process.env.DATA_FILE = 'test-planner-data-list.json';
        process.env.DATA_DIR = TEST_DIR;
        try { await fs.rm(TEST_DIR, { recursive: true, force: true }); } catch { }
        await fs.mkdir(TEST_DIR, { recursive: true });
        const module = await import('./storage-server.js');
        app = module.app;
        initData = module.initData;
        await initData();
    });

    beforeEach(async () => {
        scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'list-folder-'));
    });

    afterAll(async () => {
        try { await fs.rm(TEST_DIR, { recursive: true, force: true }); } catch { }
    });

    it('lists visible files in the folder, sorted, absolute paths', async () => {
        await fs.writeFile(path.join(scratch, 'b.txt'), 'b');
        await fs.writeFile(path.join(scratch, 'a.txt'), 'a');
        await fs.writeFile(path.join(scratch, '.hidden'), 'h');
        await fs.mkdir(path.join(scratch, 'sub'));

        const res = await request(app).get('/api/list-folder').query({ path: scratch });
        expect(res.status).toBe(200);
        expect(res.body.files).toEqual([
            path.join(scratch, 'a.txt'),
            path.join(scratch, 'b.txt'),
        ]);
        expect(res.body.truncated).toBe(false);
    });

    it('rejects missing path parameter', async () => {
        const res = await request(app).get('/api/list-folder');
        expect(res.status).toBe(400);
    });

    it('rejects relative paths', async () => {
        const res = await request(app).get('/api/list-folder').query({ path: 'some/relative' });
        expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent folders', async () => {
        const res = await request(app).get('/api/list-folder').query({ path: '/nonexistent-9d7a/xyz' });
        expect(res.status).toBe(404);
    });

    it('returns 400 when the path is a file, not a folder', async () => {
        const f = path.join(scratch, 'file.txt');
        await fs.writeFile(f, 'hi');
        const res = await request(app).get('/api/list-folder').query({ path: f });
        expect(res.status).toBe(400);
    });

    it('caps results at 500 and reports truncation', async () => {
        for (let i = 0; i < 510; i++) {
            // pad index so sort order matches alphabetic order
            await fs.writeFile(path.join(scratch, `f${String(i).padStart(4, '0')}.txt`), '');
        }
        const res = await request(app).get('/api/list-folder').query({ path: scratch });
        expect(res.status).toBe(200);
        expect(res.body.files).toHaveLength(500);
        expect(res.body.truncated).toBe(true);
    });
});
