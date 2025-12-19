import type { StorageAPI } from '../types/storage';

export const initializeStorage = () => {
    const storage: StorageAPI = {
        get: async (key: string) => {
            try {
                const response = await fetch(`/api/storage/${key}`);
                return await response.json();
            } catch (error) {
                console.error(`Error getting storage for ${key}:`, error);
                return { value: null };
            }
        },
        set: async (key: string, value: string) => {
            try {
                const response = await fetch(`/api/storage/${key}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ value })
                });
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            } catch (error) {
                console.error(`Error setting storage for ${key}:`, error);
                throw error;
            }
        },
        patch: async (key: string, action: 'add' | 'update' | 'delete', item: unknown, id?: number | string) => {
            try {
                const response = await fetch(`/api/storage/${key}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action, item, id })
                });
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            } catch (error) {
                console.error(`Error patching storage for ${key}:`, error);
                throw error;
            }
        }
    };

    window.storage = storage;
};
