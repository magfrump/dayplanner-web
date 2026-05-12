import Database from 'better-sqlite3';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

export const makeSegmentId = () => `seg-${randomUUID()}`;

const DB_FILENAME = 'multisemantic.sqlite';
const SNAPSHOT_FILENAME = 'multisemantic.sqlite.last-good';
const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

// Lineage level metadata. Single source of truth for the four (column, payload-key)
// pairs used by every lineage-aware query, the row→segment mapper, and the
// HTTP query-string parser in storage-server.js. Keep ordered value→task; consumers rely on it.
export const LINEAGE_LEVELS = [
    { name: 'value', col: 'value_id', key: 'valueId' },
    { name: 'goal', col: 'goal_id', key: 'goalId' },
    { name: 'project', col: 'project_id', key: 'projectId' },
    { name: 'task', col: 'task_id', key: 'taskId' },
];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS segments (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  transcript_json TEXT NOT NULL,
  transcript_text TEXT NOT NULL,
  summary TEXT,
  value_id INTEGER,
  goal_id INTEGER,
  project_id INTEGER,
  task_id INTEGER,
  needs_classification INTEGER NOT NULL DEFAULT 0,
  open_loop INTEGER NOT NULL DEFAULT 0,
  archive_file TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_segments_thread ON segments(thread_id);
CREATE INDEX IF NOT EXISTS idx_segments_created ON segments(created_at);
CREATE INDEX IF NOT EXISTS idx_segments_project ON segments(project_id);
CREATE INDEX IF NOT EXISTS idx_segments_open ON segments(open_loop, updated_at);

CREATE VIRTUAL TABLE IF NOT EXISTS segments_fts USING fts5(
  transcript_text,
  summary,
  content='segments',
  content_rowid='rowid',
  tokenize='trigram'
);

CREATE TRIGGER IF NOT EXISTS segments_ai AFTER INSERT ON segments BEGIN
  INSERT INTO segments_fts(rowid, transcript_text, summary)
  VALUES (new.rowid, new.transcript_text, COALESCE(new.summary, ''));
END;

CREATE TRIGGER IF NOT EXISTS segments_ad AFTER DELETE ON segments BEGIN
  INSERT INTO segments_fts(segments_fts, rowid, transcript_text, summary)
  VALUES('delete', old.rowid, old.transcript_text, COALESCE(old.summary, ''));
END;

CREATE TRIGGER IF NOT EXISTS segments_au AFTER UPDATE ON segments BEGIN
  INSERT INTO segments_fts(segments_fts, rowid, transcript_text, summary)
  VALUES('delete', old.rowid, old.transcript_text, COALESCE(old.summary, ''));
  INSERT INTO segments_fts(rowid, transcript_text, summary)
  VALUES (new.rowid, new.transcript_text, COALESCE(new.summary, ''));
END;

CREATE TABLE IF NOT EXISTS retrieval_feedback (
  id INTEGER PRIMARY KEY,
  query_hash TEXT NOT NULL,
  query_text TEXT NOT NULL,
  segment_id TEXT NOT NULL REFERENCES segments(id),
  retrieved_at TEXT NOT NULL,
  helpful INTEGER,
  contributing_indexes TEXT NOT NULL,
  UNIQUE(query_hash, segment_id, retrieved_at)
);

CREATE INDEX IF NOT EXISTS idx_rf_segment ON retrieval_feedback(segment_id);
CREATE INDEX IF NOT EXISTS idx_rf_query ON retrieval_feedback(query_hash);
`;

export function openDatabase(dataDir) {
    const dbPath = path.join(dataDir, DB_FILENAME);
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    // synchronous=NORMAL is the right value for WAL: durable across crashes,
    // not durable across power loss — acceptable for this workload, and avoids
    // an fsync per write that would otherwise dominate bulk-import time.
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');
    db.exec(SCHEMA);
    return db;
}

export async function snapshotIfStale(dataDir) {
    const dbPath = path.join(dataDir, DB_FILENAME);
    const snapPath = path.join(dataDir, SNAPSHOT_FILENAME);

    let snapMtime = 0;
    try {
        const stat = await fs.stat(snapPath);
        snapMtime = stat.mtimeMs;
    } catch (e) {
        if (e.code !== 'ENOENT') throw e;
    }

    if (Date.now() - snapMtime < SNAPSHOT_TTL_MS) return false;

    try {
        await fs.copyFile(dbPath, snapPath);
        return true;
    } catch (e) {
        if (e.code === 'ENOENT') return false;
        throw e;
    }
}

// Extract human-readable text from a Message[] for FTS indexing.
// Skips JSON-structural noise that would otherwise dilute the trigram index.
export function extractTranscriptText(messages) {
    if (!Array.isArray(messages)) return '';
    return messages
        .map(m => (typeof m?.content === 'string' ? m.content : ''))
        .filter(Boolean)
        .join('\n');
}

const INSERT_SEGMENT_SQL = `
INSERT OR IGNORE INTO segments (
  id, thread_id, created_at, updated_at,
  transcript_json, transcript_text, summary,
  value_id, goal_id, project_id, task_id,
  needs_classification, open_loop, archive_file
) VALUES (
  @id, @thread_id, @created_at, @updated_at,
  @transcript_json, @transcript_text, @summary,
  @value_id, @goal_id, @project_id, @task_id,
  @needs_classification, @open_loop, @archive_file
)
`;

// Returns { segment, inserted }. `inserted` is false when a row with this id already
// existed (INSERT OR IGNORE skipped the write); callers can use this to count
// idempotent re-runs during cold-start import.
//
// Hot-path note: on the inserted path we synthesize the return value from the input
// rather than re-SELECTing — halves SQLite work in the importer loop. On the duplicate
// path we SELECT to give the caller the actually-stored row.
export function insertSegment(db, segment) {
    const now = new Date().toISOString();
    const lineage = segment.lineage || {};
    const metadata = segment.metadata || {};
    const created_at = segment.created_at || now;
    const updated_at = segment.updated_at || now;

    const result = db.prepare(INSERT_SEGMENT_SQL).run({
        id: segment.id,
        thread_id: segment.thread_id,
        created_at,
        updated_at,
        transcript_json: JSON.stringify(segment.transcript || []),
        transcript_text: extractTranscriptText(segment.transcript),
        summary: segment.summary ?? null,
        value_id: lineage.valueId ?? null,
        goal_id: lineage.goalId ?? null,
        project_id: lineage.projectId ?? null,
        task_id: lineage.taskId ?? null,
        needs_classification: metadata.needs_classification ? 1 : 0,
        open_loop: metadata.open_loop ? 1 : 0,
        archive_file: metadata.archive_file,
    });

    if (result.changes > 0) {
        return {
            segment: {
                id: segment.id,
                thread_id: segment.thread_id,
                created_at,
                updated_at,
                transcript: segment.transcript || [],
                summary: segment.summary ?? null,
                lineage: {
                    valueId: lineage.valueId ?? null,
                    goalId: lineage.goalId ?? null,
                    projectId: lineage.projectId ?? null,
                    taskId: lineage.taskId ?? null,
                },
                metadata: {
                    needs_classification: !!metadata.needs_classification,
                    open_loop: !!metadata.open_loop,
                    archive_file: metadata.archive_file,
                },
            },
            inserted: true,
        };
    }

    return { segment: getSegment(db, segment.id), inserted: false };
}

export function getSegment(db, id) {
    const row = db.prepare('SELECT * FROM segments WHERE id = ? AND deleted_at IS NULL').get(id);
    return row ? rowToSegment(row) : null;
}

// Soft-delete the listed ids and create a new segment whose transcript is the
// concatenation of theirs in input order. Lineage, thread_id, and archive_file
// inherit from the first input — the UI filters the popover by lineage, so all
// merge inputs share it in practice. Runs atomically.
//
// Returns { segment, mergedFrom: [ids] }. Throws if any id is missing or already deleted.
export function mergeSegments(db, { segmentIds, newId, summary } = {}) {
    if (!Array.isArray(segmentIds) || segmentIds.length < 2) {
        throw new Error('mergeSegments requires at least 2 segmentIds');
    }
    const stmt = db.prepare('SELECT * FROM segments WHERE id = ? AND deleted_at IS NULL');
    const rows = segmentIds.map(id => {
        const row = stmt.get(id);
        if (!row) throw new Error(`Segment not found or already deleted: ${id}`);
        return row;
    });

    const transcript = rows.flatMap(r => JSON.parse(r.transcript_json));
    const first = rows[0];
    const mergedId = newId || makeSegmentId();

    const tx = db.transaction(() => {
        const softDelete = db.prepare('UPDATE segments SET deleted_at = ? WHERE id = ?');
        const now = new Date().toISOString();
        for (const r of rows) softDelete.run(now, r.id);

        return insertSegment(db, {
            id: mergedId,
            thread_id: first.thread_id,
            transcript,
            summary: summary ?? first.summary ?? null,
            lineage: {
                valueId: first.value_id,
                goalId: first.goal_id,
                projectId: first.project_id,
                taskId: first.task_id,
            },
            metadata: {
                needs_classification: !!first.needs_classification,
                open_loop: !!first.open_loop,
                archive_file: first.archive_file,
            },
        });
    });

    const { segment, inserted } = tx();
    if (!inserted) throw new Error(`Merge id collision: ${mergedId}`);
    return { segment, mergedFrom: segmentIds.slice() };
}

// Soft-delete the original and create two new segments split at the given
// boundaryIndex (messages[0..boundary) and messages[boundary..end]). Lineage,
// thread_id, and archive_file inherit from the original. Runs atomically.
//
// Returns { segments: [first, second], splitFrom: id }. Throws if boundaryIndex
// would produce an empty side or the source is missing/deleted.
export function splitSegment(db, { segmentId, boundaryIndex, newIds } = {}) {
    const row = db.prepare('SELECT * FROM segments WHERE id = ? AND deleted_at IS NULL').get(segmentId);
    if (!row) throw new Error(`Segment not found or already deleted: ${segmentId}`);

    const transcript = JSON.parse(row.transcript_json);
    if (!Number.isInteger(boundaryIndex) || boundaryIndex <= 0 || boundaryIndex >= transcript.length) {
        throw new Error(`boundaryIndex must be between 1 and transcript.length-1 (got ${boundaryIndex})`);
    }

    const [firstId, secondId] = newIds || [makeSegmentId(), makeSegmentId()];
    const sharedFields = {
        thread_id: row.thread_id,
        summary: row.summary,
        lineage: {
            valueId: row.value_id,
            goalId: row.goal_id,
            projectId: row.project_id,
            taskId: row.task_id,
        },
        metadata: {
            needs_classification: !!row.needs_classification,
            open_loop: !!row.open_loop,
            archive_file: row.archive_file,
        },
    };

    const tx = db.transaction(() => {
        const now = new Date().toISOString();
        db.prepare('UPDATE segments SET deleted_at = ? WHERE id = ?').run(now, segmentId);

        const first = insertSegment(db, {
            ...sharedFields,
            id: firstId,
            transcript: transcript.slice(0, boundaryIndex),
        });
        const second = insertSegment(db, {
            ...sharedFields,
            id: secondId,
            transcript: transcript.slice(boundaryIndex),
        });
        if (!first.inserted || !second.inserted) {
            throw new Error(`Split id collision: ${firstId} or ${secondId}`);
        }
        return [first.segment, second.segment];
    });

    return { segments: tx(), splitFrom: segmentId };
}

function rowToSegment(row) {
    const lineage = {};
    for (const { col, key } of LINEAGE_LEVELS) lineage[key] = row[col];
    return {
        id: row.id,
        thread_id: row.thread_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        transcript: JSON.parse(row.transcript_json),
        summary: row.summary,
        lineage,
        metadata: {
            needs_classification: !!row.needs_classification,
            open_loop: !!row.open_loop,
            archive_file: row.archive_file,
        },
    };
}

// Strict-AND lineage filter: every lineage field set on the filter must match
// the segment's corresponding field exactly. Unset filter fields are unconstrained.
// Per the v0.3 implementation plan, this is the focus-mode default; relaxing to
// OR is explicitly discouraged.
function buildLineageWhere(lineage) {
    if (!lineage) return { sql: '', params: {} };
    const clauses = [];
    const params = {};
    for (const { col, key } of LINEAGE_LEVELS) {
        if (lineage[key] != null) {
            clauses.push(`s.${col} = @${col}`);
            params[col] = lineage[key];
        }
    }
    return {
        sql: clauses.length ? clauses.join(' AND ') : '',
        params,
    };
}

// FTS5 treats characters like `.`, `:`, `-` as syntactic operators (column filters,
// NEAR clauses). Wrap each whitespace-delimited token as a quoted phrase so arbitrary
// user text — identifiers, punctuation — is treated as literal content.
function escapeFtsQuery(raw) {
    const tokens = raw.trim().split(/\s+/).filter(Boolean);
    return tokens.map(t => `"${t.replace(/"/g, '""')}"`).join(' ');
}

export function searchSegments(db, { query, lineageFilter, limit = 10 } = {}) {
    const { sql: lineageSql, params: lineageParams } = buildLineageWhere(lineageFilter);
    const whereParts = ['s.deleted_at IS NULL'];
    if (lineageSql) whereParts.push(lineageSql);

    if (query && query.trim()) {
        const escapedQuery = escapeFtsQuery(query);
        const params = { ...lineageParams, q: escapedQuery, limit };
        const sql = `
            SELECT s.*, bm25(segments_fts) AS score
            FROM segments s
            JOIN segments_fts f ON f.rowid = s.rowid
            WHERE ${whereParts.join(' AND ')}
              AND segments_fts MATCH @q
            ORDER BY score
            LIMIT @limit
        `;
        return db.prepare(sql).all(params).map(rowToSegment);
    }

    const sql = `
        SELECT s.*
        FROM segments s
        WHERE ${whereParts.join(' AND ')}
        ORDER BY s.updated_at DESC
        LIMIT @limit
    `;
    return db.prepare(sql).all({ ...lineageParams, limit }).map(rowToSegment);
}

// query_hash is a deterministic fingerprint of query text only (no secrets) used to
// deduplicate identical (query, segment, retrieved_at) tuples via the table's UNIQUE
// constraint. INSERT OR IGNORE makes duplicate writes within the same ms a no-op.
export function recordRetrievalFeedback(db, { query, segmentIds, helpful = 1, contributingIndexes = ['bm25_fts'] }) {
    if (!Array.isArray(segmentIds) || segmentIds.length === 0) return { inserted: 0 };
    const retrievedAt = new Date().toISOString();
    const queryText = String(query ?? '');
    const queryHash = simpleHash(queryText);
    const contribStr = JSON.stringify(contributingIndexes);

    const stmt = db.prepare(`
        INSERT OR IGNORE INTO retrieval_feedback
            (query_hash, query_text, segment_id, retrieved_at, helpful, contributing_indexes)
        VALUES (@query_hash, @query_text, @segment_id, @retrieved_at, @helpful, @contributing_indexes)
    `);

    let inserted = 0;
    const tx = db.transaction(() => {
        for (const segmentId of segmentIds) {
            const result = stmt.run({
                query_hash: queryHash,
                query_text: queryText,
                segment_id: segmentId,
                retrieved_at: retrievedAt,
                helpful: helpful ? 1 : 0,
                contributing_indexes: contribStr,
            });
            if (result.changes > 0) inserted++;
        }
    });
    tx();
    return { inserted };
}

// 32-bit FNV-1a. Sufficient for the uniqueness role here (de-duping
// (query, segment, second) tuples) — not used for security or cross-host stability.
function simpleHash(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16);
}

export function getFeedbackForSegment(db, segmentId) {
    return db.prepare(
        'SELECT id, query_hash, query_text, retrieved_at, helpful, contributing_indexes FROM retrieval_feedback WHERE segment_id = ? ORDER BY retrieved_at DESC'
    ).all(segmentId);
}

export function countSegmentsByLineage(db, level, ids) {
    if (!Array.isArray(ids) || ids.length === 0) return {};
    const col = LINEAGE_LEVELS.find(l => l.name === level)?.col;
    if (!col) throw new Error(`Unknown lineage level: ${level}`);
    const placeholders = ids.map(() => '?').join(',');
    const rows = db.prepare(
        `SELECT ${col} AS id, COUNT(*) AS count
         FROM segments
         WHERE deleted_at IS NULL AND ${col} IN (${placeholders})
         GROUP BY ${col}`
    ).all(...ids);
    return Object.fromEntries(rows.map(r => [r.id, r.count]));
}
