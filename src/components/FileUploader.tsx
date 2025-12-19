import { useState } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';

interface FileUploaderProps {
    onUploadComplete: (path: string) => void;
}

export const FileUploader = ({ onUploadComplete }: FileUploaderProps) => {
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        setError(null);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error('Upload failed');
            }

            const data = await response.json();
            onUploadComplete(data.path);
        } catch (err) {
            console.error(err);
            setError('Failed to upload file');
        } finally {
            setIsUploading(false);
            // Reset input so same file can be selected again if needed
            e.target.value = '';
        }
    };

    return (
        <div className="relative">
            <input
                type="file"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
                disabled={isUploading}
            />
            <label
                htmlFor="file-upload"
                className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg border border-dashed transition-colors cursor-pointer
                    ${isUploading ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-300' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50 hover:text-blue-600 hover:border-blue-400'}`}
            >
                {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {isUploading ? 'Uploading...' : 'Attach File'}
            </label>
            {error && (
                <div className="absolute top-full left-0 mt-1 text-xs text-red-500 bg-red-50 px-2 py-1 rounded shadow-sm flex items-center gap-1">
                    <X size={12} className="cursor-pointer" onClick={() => setError(null)} />
                    {error}
                </div>
            )}
        </div>
    );
};
