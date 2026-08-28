import { useLiveQuery } from 'dexie-react-hooks'
import { Trash2 } from 'lucide-react'
import { db } from '../db/db'
import { getExerciseById } from '../data/exercises'
import { volumeOverTime } from '../lib/stats'
import { VolumeChart } from '../components/VolumeChart'

export function History() {
  const sessions = useLiveQuery(() => db.sessions.orderBy('startedAt').reverse().toArray(), []) ?? []
  const volumeData = volumeOverTime(sessions, 14)

  async function deleteSession(id?: number) {
    if (id === undefined) return
    await db.sessions.delete(id)
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <h1 className="mb-4 text-2xl font-bold text-white">Progression</h1>

      <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-800/40 p-4">
        <p className="mb-3 text-sm font-medium text-slate-300">Volume (répétitions) — 14 derniers jours</p>
        <VolumeChart data={volumeData} />
      </div>

      <h2 className="mb-3 font-semibold text-white">Historique des séances</h2>
      {sessions.length === 0 && (
        <p className="text-sm text-slate-500">Aucune séance enregistrée pour l'instant. Lance ton premier entraînement !</p>
      )}
      <div className="flex flex-col gap-3">
        {sessions.map((session) => {
          const completedSets = session.logs.filter((l) => l.completed)
          const totalReps = completedSets.reduce((sum, l) => sum + l.reps, 0)
          const exerciseNames = [...new Set(completedSets.map((l) => getExerciseById(l.exerciseId)?.name ?? l.exerciseId))]

          return (
            <div key={session.id} className="rounded-2xl border border-slate-800 bg-slate-800/40 p-4">
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <p className="font-medium text-white">{session.dayName}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(session.startedAt).toLocaleDateString('fr-FR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <button
                  onClick={() => deleteSession(session.id)}
                  className="rounded-full p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400"
                  title="Supprimer"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <p className="text-sm text-slate-400">
                {completedSets.length} séries · {totalReps} reps totales
              </p>
              <p className="mt-1 text-xs text-slate-500">{exerciseNames.join(', ')}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
