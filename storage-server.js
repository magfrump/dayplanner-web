import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    openDatabase,
    snapshotIfStale,
    insertSegment,
    searchSegments,
    countSegmentsByLineage,
    recordRetrievalFeedback,
    recordRetrievalEvent,
    mergeSegments,
    splitSegment,
    getEvalSnapshot,
    LINEAGE_LEVELS,
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

// Translate a Windows-style absolute path to its WSL mount so folders pasted
// from Windows Explorer resolve against the WSL filesystem this server runs on.
//   C:\Users\me\Docs -> /mnt/c/Users/me/Docs ;  D:/data -> /mnt/d/data
// No-op on native Windows (path.sep === '\\'), for POSIX paths, and for UNC
// paths (\\server\share — left for the OS, currently unsupported).
const toWslPath = (inputPath) => {
    if (typeof inputPath !== 'string' || path.sep === '\\') return inputPath;
    const driveMatch = /^([A-Za-z]):[\\/](.*)$/.exec(inputPath);
    if (!driveMatch) return inputPath;
    const drive = driveMatch[1].toLowerCase();
    const rest = driveMatch[2].replace(/\\/g, '/');
    return `/mnt/${drive}/${rest}`;
};

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
app.use(express.json({ limit: '5mb' }));

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
        const archiveFileName = `chat_archive_${dateStr}.jsonl`;
        const archiveFile = path.join(logsDir, archiveFileName);

        const archiveEntry = {
            timestamp: new Date().toISOString(),
            summary_id: summary?.id,
            messages: messages
        };

        await fs.appendFile(
            archiveFile,
            JSON.stringify(archiveEntry) + '\n'
        );
        // Return the relative archive path so the segment write can attach the
        // *actual* file the entry landed in — avoids client/server clock-drift
        // disagreement near midnight UTC.
        res.json({ success: true, archive_file: `logs/${archiveFileName}` });
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

// List non-hidden, non-directory entries in a folder. Accepts any absolute path
// the local user supplies — same trust model as /api/read-file once a file is
// in a project's documents[]. Capped at 500 entries to prevent runaway folders.
app.get('/api/list-folder', async (req, res) => {
    const rawPath = req.query.path;
    if (!rawPath || typeof rawPath !== 'string') {
        return res.status(400).json({ error: 'Missing path parameter' });
    }
    const folderPath = toWslPath(rawPath);
    if (!path.isAbsolute(folderPath)) {
        return res.status(400).json({ error: 'Path must be absolute' });
    }

    try {
        const absolutePath = path.resolve(folderPath);
        const stats = await fs.stat(absolutePath);
        if (!stats.isDirectory()) {
            return res.status(400).json({ error: 'Not a directory' });
        }

        const entries = await fs.readdir(absolutePath, { withFileTypes: true });
        const files = entries
            .filter(e => e.isFile() && !e.name.startsWith('.'))
            .map(e => path.join(absolutePath, e.name))
            .sort();

        const capped = files.slice(0, 500);
        res.json({ files: capped, truncated: files.length > 500 });
    } catch (error) {
        if (error.code === 'ENOENT') {
            return res.status(404).json({ error: 'Folder not found' });
        }
        console.error(`Error listing folder ${folderPath}:`, error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/read-file', async (req, res) => {
    const rawPath = req.query.path;
    if (!rawPath || typeof rawPath !== 'string') {
        return res.status(400).send('Missing path parameter');
    }
    const filePath = toWslPath(rawPath);

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
            const { segment: stored, inserted } = insertSegment(segmentDb, segment);
            if (inserted) {
                try {
                    await snapshotIfStale(DATA_DIR);
                } catch (e) {
                    console.error('Snapshot-after-insert failed:', e);
                }
            }
            res.json({ success: true, segment: stored, duplicate: !inserted });
        });
    } catch (error) {
        console.error('Segment insert error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/segments/search', async (req, res) => {
    try {
        const { q, limit } = req.query;
        const lineageFilter = {};
        for (const { key } of LINEAGE_LEVELS) {
            if (req.query[key] != null) lineageFilter[key] = Number(req.query[key]);
        }

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

app.post('/api/retrieval_feedback', async (req, res) => {
    try {
        await acquireLock(MULTISEMANTIC_LOCK_KEY, async () => {
            const { query, segment_ids, helpful, contributing_indexes, cited_ids, uncited_ids } = req.body || {};
            const contributingIndexes = Array.isArray(contributing_indexes) ? contributing_indexes : undefined;

            if (Array.isArray(cited_ids) || Array.isArray(uncited_ids)) {
                const citedIds = Array.isArray(cited_ids) ? cited_ids : [];
                const uncitedIds = Array.isArray(uncited_ids) ? uncited_ids : [];
                if (citedIds.length === 0 && uncitedIds.length === 0) {
                    res.status(400).json({ error: 'cited_ids and uncited_ids cannot both be empty' });
                    return;
                }
                const result = recordRetrievalEvent(segmentDb, { query, citedIds, uncitedIds, contributingIndexes });
                res.json({ success: true, inserted: result.inserted });
                return;
            }

            if (!Array.isArray(segment_ids) || segment_ids.length === 0) {
                res.status(400).json({ error: 'segment_ids must be a non-empty array' });
                return;
            }
            const result = recordRetrievalFeedback(segmentDb, {
                query,
                segmentIds: segment_ids,
                helpful: helpful == null ? 1 : Number(helpful),
                contributingIndexes,
            });
            res.json({ success: true, inserted: result.inserted });
        });
    } catch (error) {
        console.error('Retrieval feedback error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/segments/merge', async (req, res) => {
    try {
        await acquireLock(MULTISEMANTIC_LOCK_KEY, async () => {
            const { segmentIds, newId, summary } = req.body || {};
            if (!Array.isArray(segmentIds) || segmentIds.length < 2) {
                res.status(400).json({ error: 'segmentIds must be an array of length >= 2' });
                return;
            }
            try {
                const result = mergeSegments(segmentDb, { segmentIds, newId, summary });
                try {
                    await snapshotIfStale(DATA_DIR);
                } catch (e) {
                    console.error('Snapshot-after-merge failed:', e);
                }
                res.json({ success: true, segment: result.segment, mergedFrom: result.mergedFrom });
            } catch (e) {
                res.status(400).json({ error: e.message });
            }
        });
    } catch (error) {
        console.error('Segment merge error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/segments/split', async (req, res) => {
    try {
        await acquireLock(MULTISEMANTIC_LOCK_KEY, async () => {
            const { segmentId, boundaryIndex, newIds } = req.body || {};
            if (!segmentId || !Number.isInteger(boundaryIndex)) {
                res.status(400).json({ error: 'segmentId (string) and boundaryIndex (integer) are required' });
                return;
            }
            try {
                const result = splitSegment(segmentDb, { segmentId, boundaryIndex, newIds });
                try {
                    await snapshotIfStale(DATA_DIR);
                } catch (e) {
                    console.error('Snapshot-after-split failed:', e);
                }
                res.json({ success: true, segments: result.segments, splitFrom: result.splitFrom });
            } catch (e) {
                res.status(400).json({ error: e.message });
            }
        });
    } catch (error) {
        console.error('Segment split error:', error);
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

// Ad-hoc snapshot of the §6 retrieval-evaluation counters. The decision rule lives
// in docs/decisions/002-multisemantic-retrieval-eval.md; this endpoint surfaces the
// numbers that rule consumes without requiring direct SQL access.
app.get('/api/segments/eval-snapshot', async (req, res) => {
    try {
        const { since, until } = req.query;
        const snapshot = getEvalSnapshot(segmentDb, {
            since: typeof since === 'string' ? since : undefined,
            until: typeof until === 'string' ? until : undefined,
        });
        res.json(snapshot);
    } catch (error) {
        console.error('Eval snapshot error:', error);
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

export { app, initData, toWslPath };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    initData().then(() => {
        app.listen(port, () => {
            console.log(`Server running at http://localhost:${port}`);
            console.log(`Data directory: ${DATA_DIR}`);
        });
    });
}
