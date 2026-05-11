#!/usr/bin/env node
/*
 * Cold-start importer: replay every logs/chat_archive_*.jsonl entry into the
 * multisemantic.sqlite segments table. Idempotent: rerunning produces no
 * duplicates because insertSegment uses INSERT OR IGNORE on the id PK.
 *
 * Each archive entry has shape { timestamp, summary_id, messages }. We use
 * summary_id as the segment id when present (so segments live-written by the
 * summarizer match this importer's output), and fall back to a generated UUID
 * otherwise. Lineage is left empty — historical focus state is not retained
 * in the archive; the lineage-repair wizard fast-follow is the path to fill it.
 *
 * Usage:
 *   node scripts/import_archives.js            # use ./logs and ./data
 *   LOGS_DIR=... DATA_DIR=... node scripts/import_archives.js
 */

import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { openDatabase, insertSegment, snapshotIfStale } from '../multisemantic-db.js';

const makeSegmentId = () => `seg-${randomUUID()}`;
const makeThreadId = () => `thread-${randomUUID()}`;

const LOGS_DIR = path.resolve(process.env.LOGS_DIR || 'logs');
const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');

const ARCHIVE_REGEX = /^chat_archive_(\d{4}-\d{2}-\d{2})\.jsonl$/;

export async function importArchives({ logsDir = LOGS_DIR, dataDir = DATA_DIR } = {}) {
    await fs.mkdir(dataDir, { recursive: true });
    const db = openDatabase(dataDir);

    let scanned = 0;
    let inserted = 0;
    let skipped = 0;
    let invalid = 0;

    let files;
    try {
        files = await fs.readdir(logsDir);
    } catch (e) {
        if (e.code === 'ENOENT') {
            console.warn(`No logs dir at ${logsDir}; nothing to import.`);
            db.close();
            return { scanned, inserted, skipped, invalid };
        }
        throw e;
    }

    const archiveFiles = files
        .filter(f => ARCHIVE_REGEX.test(f))
        .sort();

    // Group threads by date — entries from the same archive file share a thread_id
    // since they were the same continuous session prior to this importer's existence.
    const threadIdsByDate = new Map();
    const threadFor = (date) => {
        if (!threadIdsByDate.has(date)) {
            threadIdsByDate.set(date, makeThreadId());
        }
        return threadIdsByDate.get(date);
    };

    for (const file of archiveFiles) {
        const match = ARCHIVE_REGEX.exec(file);
        const date = match[1];
        const relPath = `logs/${file}`;
        const fullPath = path.join(logsDir, file);

        const content = await fs.readFile(fullPath, 'utf-8');
        const lines = content.split('\n').filter(Boolean);

        for (const line of lines) {
            scanned++;
            let entry;
            try {
                entry = JSON.parse(line);
            } catch {
                invalid++;
                continue;
            }

            if (!Array.isArray(entry.messages) || entry.messages.length === 0) {
                invalid++;
                continue;
            }

            const segment = {
                id: entry.summary_id || makeSegmentId(),
                thread_id: threadFor(date),
                created_at: entry.timestamp || `${date}T00:00:00.000Z`,
                updated_at: entry.timestamp || `${date}T00:00:00.000Z`,
                transcript: entry.messages,
                summary: typeof entry.summary === 'string' ? entry.summary : null,
                lineage: {},
                metadata: {
                    needs_classification: false,
                    open_loop: false,
                    archive_file: relPath,
                },
            };

            const result = insertSegment(db, segment);
            if (result.inserted) inserted++;
            else skipped++;
        }
    }

    try {
        await snapshotIfStale(dataDir);
    } catch (e) {
        console.error('Snapshot-after-import failed:', e);
    }

    db.close();
    return { scanned, inserted, skipped, invalid };
}

const isMain = import.meta.url === `file://${process.argv[1]}` ||
    import.meta.url.endsWith(process.argv[1] ?? '');

if (isMain) {
    importArchives()
        .then(({ scanned, inserted, skipped, invalid }) => {
            console.log(`Cold-start import complete:`);
            console.log(`  scanned: ${scanned}`);
            console.log(`  inserted: ${inserted}`);
            console.log(`  skipped (duplicates): ${skipped}`);
            console.log(`  invalid entries: ${invalid}`);
        })
        .catch(err => {
            console.error('Importer failed:', err);
            process.exitCode = 1;
        });
}
