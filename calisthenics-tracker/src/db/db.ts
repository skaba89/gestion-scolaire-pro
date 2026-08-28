import Dexie, { type Table } from 'dexie'
import type { WorkoutSession } from '../lib/types'

export class CalisthenicsDB extends Dexie {
  sessions!: Table<WorkoutSession, number>

  constructor() {
    super('calisthenics-tracker')
    this.version(1).stores({
      // auto-increment id, indexed by startedAt for history queries
      sessions: '++id, startedAt, programId',
    })
  }
}

export const db = new CalisthenicsDB()
