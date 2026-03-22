import { useState, useEffect, useCallback } from "react";

interface PendingSyncItem {
  id: string;
  type: string;
  action: "create" | "update" | "delete";
  data: Record<string, unknown>;
  timestamp: number;
}

const STORAGE_KEY = "pendingSync";
const CACHE_PREFIX = "offline_cache_";

export const useOfflineStorage = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingItems, setPendingItems] = useState<PendingSyncItem[]>([]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Load pending items from storage
    loadPendingItems();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const loadPendingItems = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setPendingItems(JSON.parse(stored));
      }
    } catch {
      setPendingItems([]);
    }
  };

  const savePendingItems = (items: PendingSyncItem[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      setPendingItems(items);
    } catch (error) {
      console.error("Failed to save pending items:", error);
    }
  };

  const addPendingItem = useCallback(
    (type: string, action: "create" | "update" | "delete", data: Record<string, unknown>) => {
      const newItem: PendingSyncItem = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        action,
        data,
        timestamp: Date.now(),
      };

      const updatedItems = [...pendingItems, newItem];
      savePendingItems(updatedItems);

      return newItem.id;
    },
    [pendingItems]
  );

  const removePendingItem = useCallback(
    (id: string) => {
      const updatedItems = pendingItems.filter((item) => item.id !== id);
      savePendingItems(updatedItems);
    },
    [pendingItems]
  );

  const clearPendingItems = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setPendingItems([]);
  }, []);

  // Cache data for offline access
  const cacheData = useCallback((key: string, data: unknown) => {
    try {
      const cacheKey = `${CACHE_PREFIX}${key}`;
      localStorage.setItem(
        cacheKey,
        JSON.stringify({
          data,
          timestamp: Date.now(),
        })
      );
    } catch (error) {
      console.error("Failed to cache data:", error);
    }
  }, []);

  const getCachedData = useCallback(<T>(key: string, maxAge?: number): T | null => {
    try {
      const cacheKey = `${CACHE_PREFIX}${key}`;
      const stored = localStorage.getItem(cacheKey);
      if (!stored) return null;

      const { data, timestamp } = JSON.parse(stored);

      // Check if cache is expired
      if (maxAge && Date.now() - timestamp > maxAge) {
        localStorage.removeItem(cacheKey);
        return null;
      }

      return data as T;
    } catch {
      return null;
    }
  }, []);

  const clearCache = useCallback((key?: string) => {
    if (key) {
      localStorage.removeItem(`${CACHE_PREFIX}${key}`);
    } else {
      // Clear all cached data
      const keys = Object.keys(localStorage);
      keys.forEach((k) => {
        if (k.startsWith(CACHE_PREFIX)) {
          localStorage.removeItem(k);
        }
      });
    }
  }, []);

  return {
    isOnline,
    pendingItems,
    addPendingItem,
    removePendingItem,
    clearPendingItems,
    cacheData,
    getCachedData,
    clearCache,
  };
};
