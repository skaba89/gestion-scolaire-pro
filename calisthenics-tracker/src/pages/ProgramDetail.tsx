import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Play } from 'lucide-react'
import { getProgramById } from '../data/programs'
import { getExerciseById } from '../data/exercises'
import { useWorkoutStore } from '../stores/workoutStore'

export function ProgramDetail() {
  const { programId } = useParams<{ programId: string }>()
  const navigate = useNavigate()
  const startWorkout = useWorkoutStore((s) => s.startWorkout)
  const program = programId ? getProgramById(programId) : undefined

  if (!program) {
    return (
      <div className="mx-auto max-w-lg px-4 pb-24 pt-6">
        <p className="text-slate-400">Programme introuvable.</p>
        <Link to="/programs" className="mt-2 inline-block text-emerald-400">
          Retour aux programmes
        </Link>
      </div>
    )
  }

  function handleStart(dayIndex: number) {
    if (!program) return
    startWorkout(program.days[dayIndex], program.id)
    navigate('/workout')
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <Link to="/programs" className="mb-4 flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200">
        <ChevronLeft size={16} /> Programmes
      </Link>
      <h1 className="text-2xl font-bold text-white">{program.name}</h1>
      <p className="mt-2 text-sm text-slate-400">{program.description}</p>

      <div className="mt-6 flex flex-col gap-4">
        {program.days.map((day, dayIndex) => (
          <div key={day.name} className="rounded-2xl border border-slate-800 bg-slate-800/40 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold text-white">{day.name}</p>
              <button
                onClick={() => handleStart(dayIndex)}
                className="flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-emerald-400"
              >
                <Play size={14} /> Démarrer
              </button>
            </div>
            <ul className="flex flex-col gap-2">
              {day.slots.map((slot, i) => {
                const exercise = getExerciseById(slot.exerciseId)
                return (
                  <li key={i} className="flex items-center justify-between text-sm">
                    <span className="text-slate-300">{exercise?.name ?? slot.exerciseId}</span>
                    <span className="text-slate-500">
                      {slot.sets} × {slot.reps}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
