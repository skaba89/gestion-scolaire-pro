import { create } from 'zustand'
import type { ProgramDay, SetLog } from '../lib/types'

interface ActiveWorkout {
  programId?: string
  dayName: string
  startedAt: string
  logs: SetLog[]
}

interface WorkoutState {
  active: ActiveWorkout | null
  startWorkout: (day: ProgramDay, programId?: string) => void
  logSet: (exerciseId: string, setIndex: number, reps: number, weightKg?: number) => void
  clearWorkout: () => void
}

export const useWorkoutStore = create<WorkoutState>((set) => ({
  active: null,

  startWorkout: (day, programId) =>
    set({
      active: {
        programId,
        dayName: day.name,
        startedAt: new Date().toISOString(),
        logs: day.slots.flatMap((slot) =>
          Array.from({ length: slot.sets }, (_, i) => ({
            exerciseId: slot.exerciseId,
            setIndex: i,
            reps: 0,
            completed: false,
          })),
        ),
      },
    }),

  logSet: (exerciseId, setIndex, reps, weightKg) =>
    set((state) => {
      if (!state.active) return state
      const logs = state.active.logs.map((log) =>
        log.exerciseId === exerciseId && log.setIndex === setIndex
          ? { ...log, reps, weightKg, completed: true }
          : log,
      )
      return { active: { ...state.active, logs } }
    }),

  clearWorkout: () => set({ active: null }),
}))
