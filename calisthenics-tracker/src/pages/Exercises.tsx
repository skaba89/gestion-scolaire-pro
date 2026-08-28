import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { exercises } from '../data/exercises'
import type { Difficulty, MuscleGroup } from '../lib/types'

const groupLabel: Record<MuscleGroup, string> = {
  push: 'Push',
  pull: 'Pull',
  legs: 'Jambes',
  core: 'Gainage',
  'full-body': 'Corps entier',
}

const difficultyLabel: Record<Difficulty, string> = {
  debutant: 'Débutant',
  intermediaire: 'Intermédiaire',
  avance: 'Avancé',
}

export function Exercises() {
  const [group, setGroup] = useState<MuscleGroup | 'all'>('all')
  const [difficulty, setDifficulty] = useState<Difficulty | 'all'>('all')

  const filtered = useMemo(
    () =>
      exercises.filter(
        (e) => (group === 'all' || e.muscleGroup === group) && (difficulty === 'all' || e.difficulty === difficulty),
      ),
    [group, difficulty],
  )

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <h1 className="mb-4 text-2xl font-bold text-white">Bibliothèque d'exercices</h1>

      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value as MuscleGroup | 'all')}
          className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200"
        >
          <option value="all">Tous les groupes</option>
          {(Object.entries(groupLabel) as [MuscleGroup, string][]).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as Difficulty | 'all')}
          className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200"
        >
          <option value="all">Tous niveaux</option>
          {(Object.entries(difficultyLabel) as [Difficulty, string][]).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        {filtered.map((exercise) => (
          <Link
            key={exercise.id}
            to={`/exercises/${exercise.id}`}
            className="rounded-xl border border-slate-800 bg-slate-800/40 p-3 transition-colors hover:bg-slate-800/70"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-white">{exercise.name}</p>
              <span className="shrink-0 rounded-full bg-slate-700 px-2 py-0.5 text-[11px] text-slate-300">
                {groupLabel[exercise.muscleGroup]}
              </span>
            </div>
            <p className="mt-1 line-clamp-1 text-sm text-slate-400">{exercise.description}</p>
          </Link>
        ))}
        {filtered.length === 0 && <p className="text-sm text-slate-500">Aucun exercice ne correspond aux filtres.</p>}
      </div>
    </div>
  )
}
