export interface ListFolderResult {
    files: string[];
    truncated: boolean;
}

export async function listFolder(folderPath: string): Promise<ListFolderResult> {
    const res = await fetch(`/api/list-folder?path=${encodeURIComponent(folderPath)}`);
    if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
            const body = await res.json();
            if (body?.error) message = body.error;
        } catch {
            // body wasn't JSON; keep the status-based message
        }
        throw new Error(message);
    }
    const body = await res.json();
    return {
        files: Array.isArray(body.files) ? body.files : [],
        truncated: !!body.truncated,
    };
}

// Merge new file paths into an existing documents[] without duplicates, preserving order.
export function mergeDocuments(existing: string[] | undefined, additions: string[]): string[] {
    const seen = new Set(existing ?? []);
    const out = [...(existing ?? [])];
    for (const a of additions) {
        if (!seen.has(a)) {
            seen.add(a);
            out.push(a);
        }
    }
    return out;
}
