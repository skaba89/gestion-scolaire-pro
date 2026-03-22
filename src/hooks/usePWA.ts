import { useState, useEffect, useCallback } from 'react';
import { db, SyncOperation } from '@/lib/db';
import { toast } from 'sonner';

export const usePWA = () => {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [isSyncing, setIsSyncing] = useState(false);
    const [pendingCount, setPendingCount] = useState(0);

    const updatePendingCount = useCallback(async () => {
        const count = await db.syncQueue.count();
        setPendingCount(count);
    }, []);

    useEffect(() => {
        const handleStatusChange = () => {
            setIsOnline(navigator.onLine);
            if (navigator.onLine) {
                syncData();
            }
        };

        window.addEventListener('online', handleStatusChange);
        window.addEventListener('offline', handleStatusChange);

        updatePendingCount();

        return () => {
            window.removeEventListener('online', handleStatusChange);
            window.removeEventListener('offline', handleStatusChange);
        };
    }, [updatePendingCount]);

    const addToSyncQueue = async (operation: Omit<SyncOperation, 'timestamp' | 'retry_count'>) => {
        await db.syncQueue.add({
            ...operation,
            timestamp: Date.now(),
            retry_count: 0
        });
        await updatePendingCount();

        if (!isOnline) {
            toast.info("Action enregistrée localement. Elle sera synchronisée à la reconnexion.");
        } else {
            syncData();
        }
    };

    const syncData = async () => {
        if (!navigator.onLine || isSyncing) return;

        const count = await db.syncQueue.count();
        if (count === 0) return;

        setIsSyncing(true);
        const operations = await db.syncQueue.toArray();

        try {
            for (const op of operations) {
                try {
                    // Here we would call the actual API / Supabase
                    // For now, it's a placeholder for the logic
                    console.log(`Syncing ${op.action} on ${op.table}`, op.data);

                    // If successful, remove from queue
                    await db.syncQueue.delete(op.id!);
                } catch (error) {
                    console.error(`Failed to sync operation ${op.id}`, error);
                    await db.syncQueue.update(op.id!, { retry_count: (op.retry_count || 0) + 1 });
                }
            }

            await updatePendingCount();
            const finalCount = await db.syncQueue.count();
            if (finalCount === 0) {
                toast.success("Synchronisation terminée avec succès.");
            }
        } finally {
            setIsSyncing(false);
        }
    };

    return {
        isOnline,
        isSyncing,
        pendingCount,
        addToSyncQueue,
        syncData
    };
};
