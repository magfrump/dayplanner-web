/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { SegmentPopover } from './SegmentPopover';

const makeSegment = (overrides: Record<string, any> = {}) => ({
    id: overrides.id ?? `seg-${Math.random().toString(36).slice(2, 7)}`,
    thread_id: 'thread-1',
    created_at: '2026-05-10T10:00:00.000Z',
    updated_at: '2026-05-10T10:00:00.000Z',
    transcript: overrides.transcript ?? [
        { role: 'user', content: 'one' },
        { role: 'assistant', content: 'two' },
    ],
    summary: overrides.summary ?? 'Test summary',
    lineage: { projectId: 42 },
    metadata: { needs_classification: false, open_loop: false, archive_file: 'logs/x.jsonl' },
    ...overrides,
});

describe('SegmentPopover', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('renders segments fetched with a lineage filter', async () => {
        const fetchSpy = vi.fn(async (input: string) => ({
            ok: true,
            json: async () => ({
                results: [
                    makeSegment({ id: 'seg-1', summary: 'First summary' }),
                    makeSegment({ id: 'seg-2', summary: 'Second summary' }),
                ],
            }),
            _url: input,
        }));
        vi.stubGlobal('fetch', fetchSpy);

        render(
            <SegmentPopover level="project" id={42} anchor={{ x: 0, y: 0 }} onClose={() => { }} />,
        );

        await screen.findByText('First summary');
        expect(screen.getByText('Second summary')).toBeInTheDocument();
        expect(screen.getByText(/2 segments/)).toBeInTheDocument();

        const calledUrl = String(fetchSpy.mock.calls[0]?.[0] ?? '');
        expect(calledUrl).toContain('projectId=42');
    });

    it('enables Merge button only when 2+ segments are selected and POSTs to /merge', async () => {
        const segments = [
            makeSegment({ id: 'seg-a', summary: 'alpha' }),
            makeSegment({ id: 'seg-b', summary: 'beta' }),
        ];

        let mergeBodySent: any = null;
        const fetchSpy = vi.fn(async (input: string, init?: RequestInit) => {
            const url = String(input);
            if (url.includes('/api/segments/merge')) {
                mergeBodySent = JSON.parse(String(init?.body ?? '{}'));
                return {
                    ok: true,
                    json: async () => ({ success: true, segment: makeSegment({ id: 'merged' }), mergedFrom: ['seg-a', 'seg-b'] }),
                } as Response;
            }
            return { ok: true, json: async () => ({ results: segments }) } as Response;
        });
        vi.stubGlobal('fetch', fetchSpy);

        render(
            <SegmentPopover level="project" id={42} anchor={{ x: 0, y: 0 }} onClose={() => { }} />,
        );
        await screen.findByText('alpha');

        const mergeBtn = screen.getByRole('button', { name: /Merge/ }) as HTMLButtonElement;
        expect(mergeBtn.disabled).toBe(true);

        fireEvent.click(screen.getByText('alpha'));
        expect(mergeBtn.disabled).toBe(true); // only 1 selected
        fireEvent.click(screen.getByText('beta'));
        expect(mergeBtn.disabled).toBe(false);

        fireEvent.click(mergeBtn);
        await waitFor(() => expect(mergeBodySent).not.toBeNull());
        expect(mergeBodySent.segmentIds).toEqual(['seg-a', 'seg-b']);
    });
});
