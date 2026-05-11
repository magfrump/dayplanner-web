import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    openDatabase,
    snapshotIfStale,
    insertSegment,
    getSegment,
    searchSegments,
    countSegmentsByLineage,
} from './multisemantic-db.js';

const app = express();
const port = 3002;
// const dataFile = path.resolve(process.env.DATA_FILE || 'planner-data.json');
const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
const LEGACY_DATA_FILE = path.resolve(process.env.DATA_FILE || 'planner-data.json');
const logsDir = path.resolve('logs');

// Map key to individual file path
const getFileForKey = (key) => path.join(DATA_DIR, `${key}.json`);
const getLastGoodFileForKey = (key) => path.join(DATA_DIR, `${key}.last-good.json`);

// Multer setup for file uploads
import multer from 'multer';
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
// Ensure uploads dir exists
fs.mkdir(UPLOADS_DIR, { recursive: true }).catch(console.error);

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOADS_DIR)
    },
    filename: function (req, file, cb) {
        // Sanitize and timestamp filename to prevent collisions
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_'))
    }
})

const upload = multer({ storage: storage });

// Serve uploads statically
app.use('/uploads', express.static(UPLOADS_DIR));

// In-memory lock for concurrency safety
const locks = new Map();
const acquireLock = async (key, fn) => {
    if (!locks.has(key)) {
        locks.set(key, Promise.resolve());
    }

    const currentLock = locks.get(key);
    const nextLock = currentLock.then(() => fn().catch(err => {
        console.error(`Error in lock for ${key}:`, err);
        throw err;
    }));

    locks.set(key, nextLock.catch(() => { })); // Prevent chain failure
    return nextLock;
};

app.use(cors());
app.use(express.json());

// Log all requests
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    if (req.method === 'POST' || req.method === 'PUT') {
        const body = JSON.stringify(req.body);
        console.log('Payload:', body.length > 2000 ? body.substring(0, 2000) + '...' : body);
    }
    next();
});

// Holds the open SQLite handle for the segment store. Initialized in initData.
let segmentDb = null;
const MULTISEMANTIC_LOCK_KEY = '__multisemantic__';

// Initialize data directory and migrate if needed
async function initData() {
    try {
        await fs.access(DATA_DIR);
    } catch {
        await fs.mkdir(DATA_DIR, { recursive: true });
    }

    try {
        await fs.access(logsDir);
    } catch {
        await fs.mkdir(logsDir, { recursive: true });
    }

    if (segmentDb) {
        try { segmentDb.close(); } catch { /* ignore */ }
    }
    segmentDb = openDatabase(DATA_DIR);
    try {
        await snapshotIfStale(DATA_DIR);
    } catch (e) {
        console.error('Initial multisemantic snapshot failed:', e);
    }

    // Migration: Check for legacy file
    try {
        await fs.access(LEGACY_DATA_FILE);
        console.log('Found legacy data file. Migrating to split files...');
        const content = await fs.readFile(LEGACY_DATA_FILE, 'utf-8');
        const data = JSON.parse(content);

        for (const [key, value] of Object.entries(data)) {
            const filePath = getFileForKey(key);
            // Don't overwrite existing split files
            try {
                await fs.access(filePath);
            } catch {
                let parseable = value;
                if (typeof value === 'string') {
                    try { parseable = JSON.parse(value); } catch { }
                }

                await fs.writeFile(filePath, JSON.stringify(parseable, null, 2));
                console.log(`Migrated ${key} to ${filePath}`);
            }
        }

        // Rename legacy file to avoid re-migration
        await fs.rename(LEGACY_DATA_FILE, `${LEGACY_DATA_FILE}.migrated`);
        console.log('Migration complete.');
    } catch (e) {
        if (e.code !== 'ENOENT') console.error('Migration error:', e);
    }
}

app.get('/api/storage/:key', async (req, res) => {
    try {
        await acquireLock(req.params.key, async () => {
            let content;
            let data = null;
            const file = getFileForKey(req.params.key);
            const lastGood = getLastGoodFileForKey(req.params.key);

            try {
                content = await fs.readFile(file, 'utf-8');
                data = content ? JSON.parse(content) : null;
            } catch (parseError) {
                if (parseError.code === 'ENOENT') {
                    data = null;
                } else {
                    console.warn(`File ${file} corrupted or missing:`, parseError.message);
                    try {
                        content = await fs.readFile(lastGood, 'utf-8');
                        data = content ? JSON.parse(content) : null;
                        console.log(`Restored ${req.params.key} from last-good backup.`);
                    } catch (backupError) {
                        console.error('Backup also missing or corrupted:', backupError.message);
                        data = null;
                    }
                }
            }
            res.json({ value: data ? JSON.stringify(data) : null });
        });
    } catch (error) {
        console.error('GET Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/log/chat', async (req, res) => {
    try {
        const logEntry = {
            timestamp: new Date().toISOString(),
            ...req.body
        };
        await fs.appendFile(
            path.join(logsDir, 'chat_history.jsonl'),
            JSON.stringify(logEntry) + '\n'
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Log Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/log/archive', async (req, res) => {
    try {
        const { messages, summary } = req.body;
        const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const archiveFile = path.join(logsDir, `chat_archive_${dateStr}.jsonl`);

        const archiveEntry = {
            timestamp: new Date().toISOString(),
            summary_id: summary?.id,
            messages: messages
        };

        await fs.appendFile(
            archiveFile,
            JSON.stringify(archiveEntry) + '\n'
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Archive Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    // Return path relative to server root (which we serve at /uploads)
    res.json({ path: `/uploads/${req.file.filename}` });
});

app.post('/api/storage/:key', async (req, res) => {
    try {
        await acquireLock(req.params.key, async () => {
            const file = getFileForKey(req.params.key);
            const lastGood = getLastGoodFileForKey(req.params.key);

            let dataToWrite = req.body.value;
            if (typeof dataToWrite === 'string') {
                try { dataToWrite = JSON.parse(dataToWrite); } catch { }
            }

            await fs.writeFile(file, JSON.stringify(dataToWrite, null, 2), 'utf-8');
            await fs.copyFile(file, lastGood);
            res.json({ success: true });
        });
    } catch (error) {
        console.error('POST Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Read a file for AI context. Sandboxed: must be inside uploads/, or listed in
// some project's documents[]. Path is resolved before comparison so '..' tricks
// can't escape the allowlist.
const isReadFileAllowed = async (resolvedPath) => {
    const uploadsResolved = path.resolve(UPLOADS_DIR);
    if (resolvedPath === uploadsResolved || resolvedPath.startsWith(uploadsResolved + path.sep)) {
        return true;
    }

    try {
        const projectsFile = getFileForKey('planner-projects');
        const content = await fs.readFile(projectsFile, 'utf-8');
        const projects = JSON.parse(content);
        if (Array.isArray(projects)) {
            for (const project of projects) {
                if (Array.isArray(project.documents)) {
                    for (const docPath of project.documents) {
                        if (typeof docPath === 'string' && path.resolve(docPath) === resolvedPath) {
                            return true;
                        }
                    }
                }
            }
        }
    } catch {
        // Projects file missing or unreadable — no project allowlist available.
    }

    return false;
};

app.get('/api/read-file', async (req, res) => {
    const filePath = req.query.path;
    if (!filePath || typeof filePath !== 'string') {
        return res.status(400).send('Missing path parameter');
    }

    try {
        const absolutePath = path.resolve(filePath);

        if (!(await isReadFileAllowed(absolutePath))) {
            return res.status(403).send('Path not in allowlist');
        }

        const stats = await fs.stat(absolutePath);
        if (!stats.isFile()) {
            return res.status(400).send('Not a file');
        }

        if (stats.size > 100 * 1024) {
            return res.status(400).send('File too large for AI context');
        }

        const content = await fs.readFile(absolutePath, 'utf-8');
        res.json({ content });
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        res.status(500).send(`Failed to read file: ${error.message}`);
    }
});

app.post('/api/segments', async (req, res) => {
    try {
        await acquireLock(MULTISEMANTIC_LOCK_KEY, async () => {
            const segment = req.body;
            if (!segment?.id || !segment?.thread_id || !segment?.metadata?.archive_file) {
                res.status(400).json({ error: 'Missing required fields: id, thread_id, metadata.archive_file' });
                return;
            }
            const existing = getSegment(segmentDb, segment.id);
            if (existing) {
                res.json({ success: true, segment: existing, duplicate: true });
                return;
            }
            const inserted = insertSegment(segmentDb, segment);
            try {
                await snapshotIfStale(DATA_DIR);
            } catch (e) {
                console.error('Snapshot-after-insert failed:', e);
            }
            res.json({ success: true, segment: inserted });
        });
    } catch (error) {
        console.error('Segment insert error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/segments/search', async (req, res) => {
    try {
        const { q, limit, valueId, goalId, projectId, taskId } = req.query;
        const lineageFilter = {};
        if (valueId != null) lineageFilter.valueId = Number(valueId);
        if (goalId != null) lineageFilter.goalId = Number(goalId);
        if (projectId != null) lineageFilter.projectId = Number(projectId);
        if (taskId != null) lineageFilter.taskId = Number(taskId);

        const results = searchSegments(segmentDb, {
            query: typeof q === 'string' ? q : '',
            lineageFilter: Object.keys(lineageFilter).length ? lineageFilter : null,
            limit: limit ? Number(limit) : 10,
        });
        res.json({ results });
    } catch (error) {
        console.error('Segment search error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/segments/counts', async (req, res) => {
    try {
        const { level, ids } = req.query;
        if (!level || !ids) {
            return res.status(400).json({ error: 'Missing level or ids query params' });
        }
        const idList = String(ids).split(',').map(s => Number(s)).filter(n => Number.isFinite(n));
        const counts = countSegmentsByLineage(segmentDb, level, idList);
        res.json({ counts });
    } catch (error) {
        console.error('Segment counts error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.patch('/api/storage/:key', async (req, res) => {
    try {
        await acquireLock(req.params.key, async () => {
            const { action, item, id } = req.body;
            const file = getFileForKey(req.params.key);
            const lastGood = getLastGoodFileForKey(req.params.key);

            let list = [];
            let content;
            try {
                content = await fs.readFile(file, 'utf-8');
                list = content ? JSON.parse(content) : [];
            } catch (e) {
                if (e.code !== 'ENOENT') {
                    try {
                        content = await fs.readFile(lastGood, 'utf-8');
                        list = content ? JSON.parse(content) : [];
                    } catch { list = []; }
                } else {
                    list = [];
                }
            }

            if (!Array.isArray(list)) list = [];

            if (action === 'add') {
                list.push(item);
            } else if (action === 'update') {
                list = list.map(i => i.id === (item.id || id) ? { ...i, ...item } : i);
            } else if (action === 'delete') {
                list = list.filter(i => i.id !== id);
            }

            await fs.writeFile(file, JSON.stringify(list, null, 2), 'utf-8');
            await fs.copyFile(file, lastGood);

            res.json({ success: true });
        });
    } catch (error) {
        console.error('PATCH Error:', error);
        res.status(500).json({ error: error.message });
    }
});

export { app, initData };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    initData().then(() => {
        app.listen(port, () => {
            console.log(`Server running at http://localhost:${port}`);
            console.log(`Data directory: ${DATA_DIR}`);
        });
    });
}
