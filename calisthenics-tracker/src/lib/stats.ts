import type { WorkoutSession } from './types'

export function computeStreak(sessions: WorkoutSession[]): number {
  const days = new Set(
    sessions
      .filter((s) => s.finishedAt)
      .map((s) => new Date(s.startedAt).toDateString()),
  )
  let streak = 0
  const cursor = new Date()
  // If nothing logged today yet, still allow the streak to count from yesterday
  if (!days.has(cursor.toDateString())) {
    cursor.setDate(cursor.getDate() - 1)
  }
  while (days.has(cursor.toDateString())) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export function totalRepsForExercise(sessions: WorkoutSession[], exerciseId: string): number {
  return sessions.reduce((total, session) => {
    return (
      total +
      session.logs
        .filter((l) => l.exerciseId === exerciseId && l.completed)
        .reduce((sum, l) => sum + l.reps, 0)
    )
  }, 0)
}

export interface DailyVolumePoint {
  date: string
  totalReps: number
}

export function volumeOverTime(sessions: WorkoutSession[], days = 14): DailyVolumePoint[] {
  const now = new Date()
  const points: DailyVolumePoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const dayKey = d.toDateString()
    const totalReps = sessions
      .filter((s) => new Date(s.startedAt).toDateString() === dayKey)
      .reduce((sum, s) => sum + s.logs.filter((l) => l.completed).reduce((a, l) => a + l.reps, 0), 0)
    points.push({ date: d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }), totalReps })
  }
  return points
}
