export type MuscleGroup =
  | 'push'
  | 'pull'
  | 'legs'
  | 'core'
  | 'full-body'

export type Difficulty = 'debutant' | 'intermediaire' | 'avance'

export interface Exercise {
  id: string
  name: string
  muscleGroup: MuscleGroup
  difficulty: Difficulty
  description: string
  instructions: string[]
  progressionFrom?: string // id of the easier exercise this progresses from
  progressionTo?: string // id of the harder exercise this progresses to
}

export interface ProgramExerciseSlot {
  exerciseId: string
  sets: number
  reps: string // e.g. "8-12" or "AMRAP" or "30s"
  restSeconds: number
}

export interface ProgramDay {
  name: string // e.g. "Jour 1 — Push"
  slots: ProgramExerciseSlot[]
}

export interface Program {
  id: string
  name: string
  difficulty: Difficulty
  description: string
  days: ProgramDay[]
}

export interface SetLog {
  exerciseId: string
  setIndex: number
  reps: number
  weightKg?: number
  completed: boolean
}

export interface WorkoutSession {
  id?: number
  programId?: string
  dayName: string
  startedAt: string // ISO date
  finishedAt?: string
  logs: SetLog[]
  notes?: string
}
