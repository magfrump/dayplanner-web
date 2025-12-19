import { FileText, Trash2 } from 'lucide-react';

interface AttachmentListProps {
    attachments: string[];
    onRemove: (path: string) => void;
}

export const AttachmentList = ({ attachments, onRemove }: AttachmentListProps) => {
    if (!attachments || attachments.length === 0) return null;

    return (
        <div className="flex flex-wrap gap-2 mt-2">
            {attachments.map((path, index) => {
                const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(path);
                const filename = path.split('/').pop();

                return (
                    <div key={index} className="group relative flex items-center gap-2 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm max-w-full">
                        {isImage ? (
                            <div className="w-8 h-8 rounded overflow-hidden bg-gray-200 flex-shrink-0">
                                <img src={path} alt={filename} className="w-full h-full object-cover" />
                            </div>
                        ) : (
                            <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center text-gray-500 flex-shrink-0">
                                <FileText size={16} />
                            </div>
                        )}

                        <a href={path} target="_blank" rel="noopener noreferrer" className="truncate hover:text-blue-600 hover:underline max-w-[120px]" title={filename}>
                            {filename}
                        </a>

                        <button
                            onClick={() => onRemove(path)}
                            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                            title="Remove attachment"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                );
            })}
        </div>
    );
};
