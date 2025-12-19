
import request from 'supertest';
// import { app, initData } from './storage-server.js';
import fs from 'fs/promises';
import path from 'path';

const TEST_DIR = path.resolve('test-data-restore');
// We test against specific keys, which map to files in TEST_DIR
const TEST_KEY_FILE = path.join(TEST_DIR, 'test-key.json');
const TEST_KEY_BACKUP = path.join(TEST_DIR, 'test-key.last-good.json');

describe('Data Restoration Logic', () => {
    let app;
    let initData;

    beforeAll(async () => {
        process.env.DATA_DIR = 'test-data-restore';
        // Cleanup
        try { await fs.rm(TEST_DIR, { recursive: true, force: true }); } catch { }
        await fs.mkdir(TEST_DIR, { recursive: true });

        const module = await import('./storage-server.js');
        app = module.app;
        initData = module.initData;
        await initData();
    });

    afterAll(async () => {
        try {
            await fs.rm(TEST_DIR, { recursive: true, force: true });
        } catch (e) { }
    });

    beforeEach(async () => {
        // Start fresh
        try {
            const files = await fs.readdir(TEST_DIR);
            for (const file of files) await fs.unlink(path.join(TEST_DIR, file));
        } catch { }

        // Write initial data correctly as a split file
        await fs.writeFile(TEST_KEY_FILE, JSON.stringify("initial"));
    });

    it('should create a last-good backup on write', async () => {
        await request(app)
            .post('/api/storage/test-key')
            .send({ value: '"updated"' }) // The server wraps in JSON.stringify? No, server writes raw value if string?
            // Server: if (typeof dataToWrite === 'string') try parse... then json stringify
            // If we send { value: '"updated"' }, dataToWrite is '"updated"'. 
            // JSON.stringify('"updated"') -> "\"updated\""
            .expect(200);

        const backupExists = await fs.access(TEST_KEY_BACKUP).then(() => true).catch(() => false);
        expect(backupExists).toBe(true);

        const content = JSON.parse(await fs.readFile(TEST_KEY_BACKUP, 'utf-8'));
        expect(content).toBe("updated"); // Content of file is "\"updated\"" which parses to "updated"
    });

    it('should restore from last-good if main file is corrupted', async () => {
        // 1. Write good data (creates backup)
        await request(app)
            .post('/api/storage/test-key')
            .send({ value: '"good-data"' })
            .expect(200);

        // 2. Corrupt main file
        await fs.writeFile(TEST_KEY_FILE, '{ "test-key": "corrupted", invalid json }');

        // 3. Read data - should recover from backup
        const res = await request(app)
            .get('/api/storage/test-key')
            .expect(200);

        // Response.body.value is JSON stringified data
        expect(JSON.parse(res.body.value)).toBe("good-data");
    });

    it('should fallback to empty if both files are corrupted', async () => {
        await fs.writeFile(TEST_KEY_FILE, '{ invalid }');
        await fs.writeFile(TEST_KEY_BACKUP, '{ invalid }');

        const res = await request(app)
            .get('/api/storage/test-key')
            .expect(200);

        expect(res.body.value).toBeNull();
    });
});
