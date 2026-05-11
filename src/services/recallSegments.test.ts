import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toolRegistry } from './toolRegistry';
import type { ToolContext } from './toolRegistry';

const sampleResults = [
    {
        id: 'seg-A',
        thread_id: 'thread-1',
        summary: 'About training plan',
        lineage: { projectId: 100, valueId: 1, goalId: 10, taskId: null },
        created_at: '2026-05-10T00:00:00.000Z',
        updated_at: '2026-05-10T00:00:00.000Z',
        transcript: [
            { role: 'user', content: 'this is the original message body' },
            { role: 'assistant', content: 'reply' },
        ],
        metadata: { archive_file: 'logs/chat_archive_2026-05-10.jsonl', needs_classification: false, open_loop: false },
    },
];

const captured: string[] = [];

beforeEach(() => {
    captured.length = 0;
    vi.stubGlobal('fetch', vi.fn((url: string) => {
        captured.push(url);
        return Promise.resolve({
            ok: true,
            statusText: 'OK',
            status: 200,
            json: () => Promise.resolve({ results: sampleResults }),
        } as Response);
    }));
});

afterEach(() => {
    vi.unstubAllGlobals();
});

// Minimal stub — the recall_segments handler only fetches, never touches ctx.
const stubCtx = {} as unknown as ToolContext;

describe('recall_segments tool', () => {
    it('is registered and addressable', () => {
        expect(toolRegistry.recall_segments).toBeDefined();
        expect(toolRegistry.recall_segments.definition.name).toBe('recall_segments');
    });

    it('returns summaries only by default (no transcript attached)', async () => {
        const out = await toolRegistry.recall_segments.handler({ query: 'training' }, stubCtx);
        const parsed = JSON.parse(out);
        expect(parsed.count).toBe(1);
        expect(parsed.results[0].id).toBe('seg-A');
        expect(parsed.results[0].summary).toBe('About training plan');
        expect(parsed.results[0].archive_file).toBe('logs/chat_archive_2026-05-10.jsonl');
        expect(parsed.results[0]).not.toHaveProperty('transcript');
    });

    it('attaches transcript when includeTranscript=true', async () => {
        const out = await toolRegistry.recall_segments.handler(
            { query: 'training', includeTranscript: true },
            stubCtx,
        );
        const parsed = JSON.parse(out);
        expect(parsed.results[0].transcript).toEqual(sampleResults[0].transcript);
    });

    it('threads lineageFilter onto the search URL', async () => {
        await toolRegistry.recall_segments.handler(
            { query: 'x', lineageFilter: { projectId: 100, taskId: 7 } },
            stubCtx,
        );
        expect(captured[0]).toContain('projectId=100');
        expect(captured[0]).toContain('taskId=7');
        expect(captured[0]).toContain('q=x');
    });

    it('defaults limit to 10 and honors override', async () => {
        await toolRegistry.recall_segments.handler({ query: 'x' }, stubCtx);
        expect(captured[0]).toContain('limit=10');
        await toolRegistry.recall_segments.handler({ query: 'x', limit: 25 }, stubCtx);
        expect(captured[1]).toContain('limit=25');
    });

    it('surfaces a friendly error string on fetch failure', async () => {
        vi.unstubAllGlobals();
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network down'))));
        const out = await toolRegistry.recall_segments.handler({ query: 'x' }, stubCtx);
        expect(out).toMatch(/recall_segments error:.*network down/);
    });
});
