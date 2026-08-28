import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { useWorkoutStore } from '../stores/workoutStore'
import { getExerciseById } from '../data/exercises'
import { getProgramById } from '../data/programs'
import { db } from '../db/db'
import { CountdownTimer } from '../components/CountdownTimer'

export function Workout() {
  const active = useWorkoutStore((s) => s.active)
  const logSet = useWorkoutStore((s) => s.logSet)
  const clearWorkout = useWorkoutStore((s) => s.clearWorkout)
  const navigate = useNavigate()
  const [resting, setResting] = useState<{ exerciseId: string; seconds: number } | null>(null)

  const program = active?.programId ? getProgramById(active.programId) : undefined
  const day = program?.days.find((d) => d.name === active?.dayName)

  const exerciseIds = useMemo(() => {
    if (!active) return []
    return [...new Set(active.logs.map((l) => l.exerciseId))]
  }, [active])

  if (!active) {
    return (
      <div className="mx-auto max-w-lg px-4 pb-24 pt-6">
        <p className="text-slate-400">Aucune séance en cours.</p>
        <button onClick={() => navigate('/programs')} className="mt-2 text-emerald-400">
          Choisir un programme
        </button>
      </div>
    )
  }

  const allCompleted = active.logs.every((l) => l.completed)

  async function finishWorkout() {
    if (!active) return
    await db.sessions.add({
      programId: active.programId,
      dayName: active.dayName,
      startedAt: active.startedAt,
      finishedAt: new Date().toISOString(),
      logs: active.logs,
    })
    clearWorkout()
    navigate('/history')
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Séance en cours</p>
          <h1 className="text-xl font-bold text-white">{active.dayName}</h1>
        </div>
        <button
          onClick={() => {
            clearWorkout()
            navigate('/programs')
          }}
          className="rounded-full bg-slate-800 p-2 text-slate-400 hover:text-rose-400"
          title="Annuler la séance"
        >
          <X size={18} />
        </button>
      </div>

      {resting && (
        <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-800/60 p-4">
          <CountdownTimer
            seconds={resting.seconds}
            label="Repos"
            autoStart
            colorClass="text-amber-400"
            onComplete={() => setResting(null)}
          />
          <button
            onClick={() => setResting(null)}
            className="mt-3 w-full text-center text-xs text-slate-500 hover:text-slate-300"
          >
            Passer le repos
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {exerciseIds.map((exerciseId) => {
          const exercise = getExerciseById(exerciseId)
          const slot = day?.slots.find((s) => s.exerciseId === exerciseId)
          const setsForExercise = active.logs.filter((l) => l.exerciseId === exerciseId)

          return (
            <div key={exerciseId} className="rounded-2xl border border-slate-800 bg-slate-800/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-medium text-white">{exercise?.name ?? exerciseId}</p>
                {slot && <span className="text-xs text-slate-500">Objectif : {slot.reps}</span>}
              </div>
              <div className="flex flex-col gap-2">
                {setsForExercise.map((log) => (
                  <SetRow
                    key={log.setIndex}
                    setNumber={log.setIndex + 1}
                    completed={log.completed}
                    reps={log.reps}
                    onValidate={(reps) => {
                      logSet(exerciseId, log.setIndex, reps)
                      if (slot?.restSeconds) {
                        setResting({ exerciseId, seconds: slot.restSeconds })
                      }
                    }}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <button
        onClick={finishWorkout}
        disabled={!allCompleted}
        className="mt-6 w-full rounded-2xl bg-emerald-500 py-3 text-center font-semibold text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
      >
        {allCompleted ? 'Terminer la séance' : `${active.logs.filter((l) => l.completed).length} / ${active.logs.length} séries validées`}
      </button>
    </div>
  )
}

function SetRow({
  setNumber,
  completed,
  reps,
  onValidate,
}: {
  setNumber: number
  completed: boolean
  reps: number
  onValidate: (reps: number) => void
}) {
  const [value, setValue] = useState(reps || 0)

  return (
    <div className="flex items-center gap-3">
      <span className="w-16 text-sm text-slate-400">Série {setNumber}</span>
      <input
        type="number"
        min={0}
        value={value}
        disabled={completed}
        onChange={(e) => setValue(Number(e.target.value))}
        className="w-20 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-center text-sm text-white disabled:opacity-50"
      />
      <span className="text-xs text-slate-500">reps</span>
      <button
        onClick={() => onValidate(value)}
        disabled={completed}
        className={`ml-auto flex h-8 w-8 items-center justify-center rounded-full ${
          completed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-300 hover:bg-emerald-500 hover:text-slate-900'
        }`}
      >
        <Check size={16} />
      </button>
    </div>
  )
}
