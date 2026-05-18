import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FolderAttach } from './FolderAttach';

describe('FolderAttach', () => {
    it('attaches listed files, deduping against existing documents', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            json: async () => ({ files: ['/p/a.txt', '/p/b.txt', '/p/c.txt'], truncated: false }),
        })));
        const onChange = vi.fn();

        render(
            <FolderAttach
                documents={['/p/a.txt']}
                watchedFolders={undefined}
                onChange={onChange}
            />
        );

        fireEvent.change(screen.getByPlaceholderText(/absolute\/path/i), { target: { value: '/p' } });
        fireEvent.click(screen.getByRole('button', { name: /Attach/i }));

        await waitFor(() => expect(onChange).toHaveBeenCalled());
        const arg = onChange.mock.calls[0][0];
        expect(arg.documents).toEqual(['/p/a.txt', '/p/b.txt', '/p/c.txt']);
        expect(arg.watchedFolders).toEqual([]);
        await screen.findByText(/Added 2 files/);
    });

    it('toggles watch state without listing the folder', () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);
        const onChange = vi.fn();

        render(
            <FolderAttach
                documents={[]}
                watchedFolders={[]}
                onChange={onChange}
            />
        );

        fireEvent.change(screen.getByPlaceholderText(/absolute\/path/i), { target: { value: '/p' } });
        fireEvent.click(screen.getByRole('button', { name: /^Watch$/ }));

        expect(fetchSpy).not.toHaveBeenCalled();
        expect(onChange).toHaveBeenCalledWith({ documents: [], watchedFolders: ['/p'] });
    });

    it('removes a folder from the watch list when toggled while already watched', () => {
        const onChange = vi.fn();
        render(
            <FolderAttach
                documents={['/p/a.txt']}
                watchedFolders={['/p']}
                onChange={onChange}
            />
        );
        fireEvent.change(screen.getByPlaceholderText(/absolute\/path/i), { target: { value: '/p' } });
        fireEvent.click(screen.getByRole('button', { name: /Watching/ }));
        expect(onChange).toHaveBeenCalledWith({ documents: ['/p/a.txt'], watchedFolders: [] });
    });

    it('surfaces a server error message', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: false,
            status: 404,
            json: async () => ({ error: 'Folder not found' }),
        })));
        const onChange = vi.fn();
        render(<FolderAttach documents={[]} watchedFolders={[]} onChange={onChange} />);

        fireEvent.change(screen.getByPlaceholderText(/absolute\/path/i), { target: { value: '/missing' } });
        fireEvent.click(screen.getByRole('button', { name: /Attach/i }));

        await screen.findByText(/Folder not found/);
        expect(onChange).not.toHaveBeenCalled();
    });
});
