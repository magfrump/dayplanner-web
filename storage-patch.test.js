
import request from 'supertest';
// import { app, initData } from './storage-server.js'; // REMOVED static import
import fs from 'fs/promises';
import path from 'path';

const TEST_DIR = path.resolve('test-data-patch');
const TEST_DATA_FILE = path.resolve('test-planner-data.json');
const LOGS_DIR = path.resolve('logs');

describe('Storage Server PATCH API', () => {
    let app;
    let initData;

    beforeAll(async () => {
        process.env.DATA_FILE = 'test-planner-data.json';
        process.env.DATA_DIR = TEST_DIR;

        try { await fs.rm(TEST_DIR, { recursive: true, force: true }); } catch { }
        await fs.mkdir(TEST_DIR, { recursive: true });

        const module = await import('./storage-server.js');
        app = module.app;
        initData = module.initData;

        await initData();
    });

    afterAll(async () => {
        try {
            await fs.unlink(TEST_DATA_FILE);
            // Cleanup logs if created during tests
            const files = await fs.readdir(LOGS_DIR);
            for (const file of files) {
                if (file.includes('test')) await fs.unlink(path.join(LOGS_DIR, file));
            }
            await fs.rm(TEST_DIR, { recursive: true, force: true });
        } catch (e) { }
    });

    beforeEach(async () => {
        // Just ensure DIR clean?
        // Use recursive rm and recreate to handle subdirectories like 'uploads'
        try {
            await fs.rm(TEST_DIR, { recursive: true, force: true });
        } catch { }
        await fs.mkdir(TEST_DIR, { recursive: true });
    });

    it('should add an item to the list', async () => {
        const newTask = { id: 1, name: 'Test Task' };

        await request(app)
            .patch('/api/storage/planner-tasks')
            .send({ action: 'add', item: newTask })
            .expect(200);

        // Verification: Read from the split file in TEST_DIR
        const file = path.join(TEST_DIR, 'planner-tasks.json');
        const tasks = JSON.parse(await fs.readFile(file, 'utf-8'));
        expect(tasks).toHaveLength(1);
        expect(tasks[0]).toEqual(newTask);
    });

    it('should update an item in the list', async () => {
        const initialTask = { id: 1, name: 'Test Task', completed: false };
        const file = path.join(TEST_DIR, 'planner-tasks.json');

        await fs.writeFile(file, JSON.stringify([initialTask]));

        await request(app)
            .patch('/api/storage/planner-tasks')
            .send({ action: 'update', id: 1, item: { completed: true } })
            .expect(200);

        const tasks = JSON.parse(await fs.readFile(file, 'utf-8'));
        expect(tasks[0].completed).toBe(true);
        expect(tasks[0].name).toBe('Test Task');
    });

    it('should delete an item from the list', async () => {
        const initialTask = { id: 1, name: 'Test Task' };
        const file = path.join(TEST_DIR, 'planner-tasks.json');
        await fs.writeFile(file, JSON.stringify([initialTask]));

        await request(app)
            .patch('/api/storage/planner-tasks')
            .send({ action: 'delete', id: 1 })
            .expect(200);

        const tasks = JSON.parse(await fs.readFile(file, 'utf-8'));
        expect(tasks).toHaveLength(0);
    });
});
