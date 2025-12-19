
import request from 'supertest';
// import { app, initData } from './storage-server.js';
import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.resolve('test-data-concurrency');
const TEST_FILE_TASKS = path.join(DATA_DIR, 'test-tasks.json');
const TEST_FILE_CAPACITY = path.join(DATA_DIR, 'test-capacity.json');

describe('Concurrency and Independence', () => {
    let app;
    let initData;

    beforeAll(async () => {
        process.env.DATA_DIR = 'test-data-concurrency';
        // Cleanup
        try { await fs.rm(DATA_DIR, { recursive: true, force: true }); } catch { }

        // Dynamic import
        const module = await import('./storage-server.js');
        app = module.app;
        initData = module.initData;

        await initData();
    });

    afterAll(async () => {
        try { await fs.rm(DATA_DIR, { recursive: true, force: true }); } catch { }
    });

    it('should handle concurrent updates to the same file without data loss', async () => {
        // Initialize
        await fs.writeFile(TEST_FILE_TASKS, '[]');

        const updates = [];
        for (let i = 0; i < 20; i++) {
            updates.push(
                request(app)
                    .patch('/api/storage/test-tasks')
                    .send({ action: 'add', item: { id: i, name: `task-${i}` } })
            );
        }

        await Promise.all(updates);

        const content = JSON.parse(await fs.readFile(TEST_FILE_TASKS, 'utf-8'));
        expect(content.length).toBe(20);
        const ids = content.map(c => c.id).sort((a, b) => a - b);
        expect(ids[0]).toBe(0);
        expect(ids[19]).toBe(19);
    });

    it('should keep different files independent', async () => {
        await fs.writeFile(TEST_FILE_TASKS, '[]');
        await fs.writeFile(TEST_FILE_CAPACITY, '{}');

        await Promise.all([
            request(app).patch('/api/storage/test-tasks').send({ action: 'add', item: { id: 1 } }),
            request(app).post('/api/storage/test-capacity').send({ value: JSON.stringify({ energy: 5 }) }),
            request(app).patch('/api/storage/test-tasks').send({ action: 'add', item: { id: 2 } })
        ]);

        const tasks = JSON.parse(await fs.readFile(TEST_FILE_TASKS, 'utf-8'));
        const capacity = JSON.parse(await fs.readFile(TEST_FILE_CAPACITY, 'utf-8'));

        expect(tasks.length).toBe(2);
        expect(capacity.energy).toBe(5);
    });
});
