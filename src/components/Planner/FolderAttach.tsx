import React, { useState } from 'react';
import { FolderInput, Eye, EyeOff } from 'lucide-react';
import { listFolder, mergeDocuments } from '../../services/folderImport';

interface FolderAttachProps {
    documents: string[] | undefined;
    watchedFolders: string[] | undefined;
    onChange: (next: { documents: string[]; watchedFolders: string[] }) => void;
}

export const FolderAttach: React.FC<FolderAttachProps> = ({ documents, watchedFolders, onChange }) => {
    const [folderPath, setFolderPath] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);

    const currentDocs = documents ?? [];
    const currentWatched = watchedFolders ?? [];
    const trimmed = folderPath.trim();
    const isWatched = trimmed.length > 0 && currentWatched.includes(trimmed);

    const handleAttach = async () => {
        if (!trimmed) return;
        setIsLoading(true);
        setStatus(null);
        try {
            const { files, truncated } = await listFolder(trimmed);
            const before = currentDocs.length;
            const nextDocs = mergeDocuments(currentDocs, files);
            const added = nextDocs.length - before;
            onChange({ documents: nextDocs, watchedFolders: currentWatched });
            setStatus({
                kind: 'info',
                text: truncated
                    ? `Added ${added} (folder truncated at 500 — re-attach if you add more)`
                    : `Added ${added} file${added === 1 ? '' : 's'}.`,
            });
        } catch (e) {
            setStatus({ kind: 'error', text: e instanceof Error ? e.message : 'Failed to list folder' });
        } finally {
            setIsLoading(false);
        }
    };

    const toggleWatch = () => {
        if (!trimmed) return;
        const next = isWatched
            ? currentWatched.filter(f => f !== trimmed)
            : [...currentWatched, trimmed];
        onChange({ documents: currentDocs, watchedFolders: next });
    };

    return (
        <div className="space-y-2 border-t pt-3">
            <label className="block text-sm font-medium">Bulk-attach from folder</label>
            <div className="flex flex-wrap gap-2">
                <input
                    type="text"
                    value={folderPath}
                    onChange={(e) => setFolderPath(e.target.value)}
                    placeholder="/absolute/path/to/folder"
                    className="flex-1 min-w-0 basis-full sm:basis-auto px-3 py-2 border rounded-lg text-sm font-mono"
                />
                <button
                    type="button"
                    onClick={handleAttach}
                    disabled={!trimmed || isLoading}
                    className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:bg-gray-300 flex items-center gap-1"
                >
                    <FolderInput size={16} />
                    {isLoading ? 'Listing…' : 'Attach'}
                </button>
                <button
                    type="button"
                    onClick={toggleWatch}
                    disabled={!trimmed}
                    aria-pressed={isWatched}
                    title={isWatched ? 'Stop watching this folder' : 'Watch this folder'}
                    className={`px-3 py-2 rounded-lg text-sm border flex items-center gap-1 disabled:opacity-50 ${
                        isWatched
                            ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                            : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                >
                    {isWatched ? <Eye size={16} /> : <EyeOff size={16} />}
                    {isWatched ? 'Watching' : 'Watch'}
                </button>
            </div>
            {currentWatched.length > 0 && (
                <div className="text-xs text-gray-500 break-words">
                    Watching: {currentWatched.join(', ')}
                </div>
            )}
            {status && (
                <div className={`text-xs ${status.kind === 'error' ? 'text-red-600' : 'text-gray-600'}`}>
                    {status.text}
                </div>
            )}
        </div>
    );
};
