
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import fs from 'fs/promises';
import path from 'path';

const TEST_DATA_FILE = path.resolve('test-planner-data.json');

describe('Storage Server Integration', () => {
    let app;
    let initData;

    const TEST_DIR = path.resolve('test-data-storage');

    beforeAll(async () => {
        // Set environment variable BEFORE importing the module
        process.env.DATA_FILE = 'test-planner-data.json'; // Legacy
        process.env.DATA_DIR = TEST_DIR;

        // Ensure clean start
        try { await fs.rm(TEST_DIR, { recursive: true, force: true }); } catch { }
        await fs.mkdir(TEST_DIR, { recursive: true });

        // Dynamic import to ensure env var is picked up
        const module = await import('./storage-server.js');
        app = module.app;
        initData = module.initData;
    });

    beforeEach(async () => {
        // Clean start for each test
        try {
            await fs.unlink(TEST_DATA_FILE);
        } catch { }

        // Clean TEST_DIR recursively to handle uploads folder or other subdirs
        try {
            await fs.rm(TEST_DIR, { recursive: true, force: true });
        } catch { }
        await fs.mkdir(TEST_DIR, { recursive: true });

        await initData();
    });

    afterAll(async () => {
        // Cleanup
        try {
            await fs.unlink(TEST_DATA_FILE);
        } catch { }
        try { await fs.rm(TEST_DIR, { recursive: true, force: true }); } catch { }
    });

    it('should return null for non-existent keys', async () => {
        const res = await request(app).get('/api/storage/missing_key');
        expect(res.status).toBe(200);
        expect(res.body.value).toBeNull();
    });

    it('should store and retrieve data', async () => {
        const testData = { foo: 'bar' };

        // Store
        await request(app)
            .post('/api/storage/test_key')
            .send({ value: testData })
            .expect(200);

        // Retrieve
        const res = await request(app).get('/api/storage/test_key');
        if (res.status !== 200) console.log('GET failed:', res.status, res.body, res.text);
        expect(res.status).toBe(200);

        // The server returns nested JSON string if content was object?
        // storage-server.js: res.json({ value: data ? JSON.stringify(data) : null });
        // So res.body.value is a STRING.
        // We need to parse it if we want to compare with object.
        // Original check: expect(res.body.value).toEqual(testData);
        // If supertest parses JSON response:
        // res.body = { value: "{\"foo\":\"bar\"}" }
        // So res.body.value is string. testData is object.
        // They are NOT equal.
        // Previously it might have worked if server returned object?
        // Let's check server code...
        // app.get... res.json({ value: data ? JSON.stringify(data) : null });
        // Yes, it returns stringified data.

        expect(JSON.parse(res.body.value)).toEqual(testData);
    });

    it('should recover from corrupted data file', async () => {
        // 1. Create a file with invalid content in the split directory
        const key = 'new_key';
        const file = path.join(TEST_DIR, `${key}.json`);

        // We need to ensure the file exists first? Or just write it?
        // The server reads from it.
        await fs.writeFile(file, '{ invalid json content ...');

        // 2. Try to save new data for this key
        // This should trigger the corruption handling mechanism (restore from backup or overwrite if no backup?)
        // In storage-server.js:
        // GET /api/storage/:key -> reads file, if corrupted -> tries lastGood.
        // POST /api/storage/:key -> writes to file, then copies to lastGood.
        // So POST just overwrites. It doesn't care if previous was corrupted.
        // The test presumably wants to verify that READ handles corruption?
        // But the original test did POST...
        // "should recover from corrupted data file": 
        // Original logic: corrupted file -> POST success -> Verify content.
        // This verifies that POST doesn't crash if file is corrupted.
        // AND that it overwrites it with valid data.

        const newData = { recovery: 'success' };
        await request(app)
            .post(`/api/storage/${key}`)
            .send({ value: newData })
            .expect(200);

        // 3. Verify the file is now valid valid JSON containing the new data
        const content = await fs.readFile(file, 'utf-8');
        const parsed = JSON.parse(content);
        expect(parsed).toEqual(newData);

        // 4. Verify a backup was created (POST creates backup)
        const backupFile = path.join(TEST_DIR, `${key}.last-good.json`);
        const backupExists = await fs.access(backupFile).then(() => true).catch(() => false);
        expect(backupExists).toBe(true);
    });
});
