import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';

/**
 * StorageService handles CRUD operations for persistent data on the Even G2 glasses.
 * It uses the official Even Hub SDK bridge.LocalStorage methods exactly like Tamagotchi.
 */
export class StorageService {
    /**
     * Creates a new entry (or overwrites existing) in the bridge's local storage.
     */
    static async create(key: string, value: string): Promise<boolean> {
        try {
            const bridge = await waitForEvenAppBridge();
            const result = await bridge.setLocalStorage(key, value);
            console.log(`[StorageService] Create/Update: ${key} -> result: ${result}`);
            return result;
        } catch (error) {
            console.error(`[StorageService] Error creating key "${key}":`, error);
            return false;
        }
    }

    /**
     * Reads a value from the bridge's local storage.
     */
    static async read(key: string): Promise<string | null> {
        try {
            const bridge = await waitForEvenAppBridge();
            const value = await bridge.getLocalStorage(key);
            console.log(`[StorageService] Read: ${key} -> ${value ? 'exists' : 'empty'}`);
            // In the Even SDK, an empty string "" typically represents a non-existent value.
            if (!value || value === "") return null;
            return value;
        } catch (error) {
            console.error(`[StorageService] Error reading key "${key}":`, error);
            return null;
        }
    }

    /**
     * Updates an existing entry in the bridge's local storage.
     */
    static async update(key: string, value: string): Promise<boolean> {
        return this.create(key, value);
    }

    /**
     * Deletes an entry from the bridge's local storage by setting it to an empty string.
     */
    static async delete(key: string): Promise<boolean> {
        console.log(`[StorageService] Deleting: ${key}`);
        return this.create(key, "");
    }
}

// Map the old storage interface to the new StorageService for backwards compatibility
export const storage = {
    setItem: async (key: string, value: string): Promise<boolean> => {
        return await StorageService.create(key, value);
    },
    getItem: async (key: string): Promise<string | null> => {
        return await StorageService.read(key);
    },
    removeItem: async (key: string): Promise<boolean> => {
        return await StorageService.delete(key);
    }
};
