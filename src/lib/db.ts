import Dexie, { Table } from 'dexie';

export interface LocalStudent {
    id: string;
    registration_number: string;
    first_name: string;
    last_name: string;
    email?: string;
    phone?: string;
    tenant_id: string;
    last_updated: number;
}

export interface SyncOperation {
    id?: number;
    table: string;
    action: 'INSERT' | 'UPDATE' | 'DELETE';
    data: any;
    timestamp: number;
    retry_count: number;
}

export class SchoolFlowDB extends Dexie {
    students!: Table<LocalStudent>;
    syncQueue!: Table<SyncOperation>;

    constructor() {
        super('SchoolFlowDB');
        this.version(1).stores({
            students: 'id, registration_number, tenant_id, last_updated',
            syncQueue: '++id, table, action, timestamp'
        });
    }
}

export const db = new SchoolFlowDB();
