import { Link, useParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { getExerciseById } from '../data/exercises'

const groupLabel: Record<string, string> = {
  push: 'Push',
  pull: 'Pull',
  legs: 'Jambes',
  core: 'Gainage',
  'full-body': 'Corps entier',
}

const difficultyLabel: Record<string, string> = {
  debutant: 'Débutant',
  intermediaire: 'Intermédiaire',
  avance: 'Avancé',
}

export function ExerciseDetail() {
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const exercise = exerciseId ? getExerciseById(exerciseId) : undefined

  if (!exercise) {
    return (
      <div className="mx-auto max-w-lg px-4 pb-24 pt-6">
        <p className="text-slate-400">Exercice introuvable.</p>
      </div>
    )
  }

  const easier = exercise.progressionFrom ? getExerciseById(exercise.progressionFrom) : undefined
  const harder = exercise.progressionTo ? getExerciseById(exercise.progressionTo) : undefined

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <Link to="/exercises" className="mb-4 flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200">
        <ChevronLeft size={16} /> Exercices
      </Link>

      <div className="mb-3 flex flex-wrap gap-2">
        <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-300">
          {groupLabel[exercise.muscleGroup]}
        </span>
        <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-300">
          {difficultyLabel[exercise.difficulty]}
        </span>
      </div>

      <h1 className="text-2xl font-bold text-white">{exercise.name}</h1>
      <p className="mt-2 text-slate-400">{exercise.description}</p>

      <div className="mt-6">
        <h2 className="mb-2 font-semibold text-white">Comment faire</h2>
        <ol className="flex flex-col gap-2">
          {exercise.instructions.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-slate-300">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-semibold text-emerald-400">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      {(easier || harder) && (
        <div className="mt-6">
          <h2 className="mb-2 font-semibold text-white">Progression</h2>
          <div className="flex flex-col gap-2">
            {easier && (
              <Link
                to={`/exercises/${easier.id}`}
                className="rounded-xl border border-slate-800 bg-slate-800/40 p-3 text-sm hover:bg-slate-800/70"
              >
                <span className="text-slate-500">← Plus facile : </span>
                <span className="text-white">{easier.name}</span>
              </Link>
            )}
            {harder && (
              <Link
                to={`/exercises/${harder.id}`}
                className="rounded-xl border border-slate-800 bg-slate-800/40 p-3 text-sm hover:bg-slate-800/70"
              >
                <span className="text-slate-500">Plus difficile → </span>
                <span className="text-white">{harder.name}</span>
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
