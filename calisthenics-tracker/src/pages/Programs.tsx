import { Link } from 'react-router-dom'
import { programs } from '../data/programs'
import type { Difficulty } from '../lib/types'

const difficultyLabel: Record<Difficulty, string> = {
  debutant: 'Débutant',
  intermediaire: 'Intermédiaire',
  avance: 'Avancé',
}

const difficultyColor: Record<Difficulty, string> = {
  debutant: 'bg-emerald-500/15 text-emerald-400',
  intermediaire: 'bg-amber-500/15 text-amber-400',
  avance: 'bg-rose-500/15 text-rose-400',
}

export function Programs() {
  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <h1 className="mb-6 text-2xl font-bold text-white">Programmes</h1>
      <div className="flex flex-col gap-3">
        {programs.map((program) => (
          <Link
            key={program.id}
            to={`/programs/${program.id}`}
            className="rounded-2xl border border-slate-800 bg-slate-800/40 p-4 transition-colors hover:bg-slate-800/70"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <p className="font-medium text-white">{program.name}</p>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${difficultyColor[program.difficulty]}`}
              >
                {difficultyLabel[program.difficulty]}
              </span>
            </div>
            <p className="text-sm text-slate-400">{program.description}</p>
            <p className="mt-2 text-xs text-slate-500">{program.days.length} jours d'entraînement</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
