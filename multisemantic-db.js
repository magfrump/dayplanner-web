import Database from 'better-sqlite3';
import fs from 'fs/promises';
import path from 'path';

const DB_FILENAME = 'multisemantic.sqlite';
const SNAPSHOT_FILENAME = 'multisemantic.sqlite.last-good';
const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

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
INSERT INTO segments (
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

export function insertSegment(db, segment) {
    const now = new Date().toISOString();
    const lineage = segment.lineage || {};
    const metadata = segment.metadata || {};
    const transcriptJson = JSON.stringify(segment.transcript || []);
    const transcriptText = extractTranscriptText(segment.transcript);

    db.prepare(INSERT_SEGMENT_SQL).run({
        id: segment.id,
        thread_id: segment.thread_id,
        created_at: segment.created_at || now,
        updated_at: segment.updated_at || now,
        transcript_json: transcriptJson,
        transcript_text: transcriptText,
        summary: segment.summary ?? null,
        value_id: lineage.valueId ?? null,
        goal_id: lineage.goalId ?? null,
        project_id: lineage.projectId ?? null,
        task_id: lineage.taskId ?? null,
        needs_classification: metadata.needs_classification ? 1 : 0,
        open_loop: metadata.open_loop ? 1 : 0,
        archive_file: metadata.archive_file,
    });

    return getSegment(db, segment.id);
}

export function getSegment(db, id) {
    const row = db.prepare('SELECT * FROM segments WHERE id = ? AND deleted_at IS NULL').get(id);
    return row ? rowToSegment(row) : null;
}

function rowToSegment(row) {
    return {
        id: row.id,
        thread_id: row.thread_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        transcript: JSON.parse(row.transcript_json),
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
}

// Strict-AND lineage filter: every lineage field set on the filter must match
// the segment's corresponding field exactly. Unset filter fields are unconstrained.
// Per the v0.3 implementation plan, this is the focus-mode default; relaxing to
// OR is explicitly discouraged.
function buildLineageWhere(lineage) {
    if (!lineage) return { sql: '', params: {} };
    const clauses = [];
    const params = {};
    for (const [col, key] of [
        ['value_id', 'valueId'],
        ['goal_id', 'goalId'],
        ['project_id', 'projectId'],
        ['task_id', 'taskId'],
    ]) {
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

export function countSegmentsByLineage(db, level, ids) {
    if (!Array.isArray(ids) || ids.length === 0) return {};
    const col = { value: 'value_id', goal: 'goal_id', project: 'project_id', task: 'task_id' }[level];
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
