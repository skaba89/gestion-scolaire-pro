import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Flame, Timer as TimerIcon, ArrowRight } from 'lucide-react'
import { db } from '../db/db'
import { computeStreak } from '../lib/stats'
import { programs } from '../data/programs'

export function Home() {
  const sessions = useLiveQuery(() => db.sessions.toArray(), []) ?? []
  const streak = computeStreak(sessions)
  const lastSession = [...sessions].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0]

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <header className="mb-6">
        <p className="text-sm text-slate-400">Bien joué, continue comme ça 💪</p>
        <h1 className="text-2xl font-bold text-white">Calisthenics Tracker</h1>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-slate-800/70 p-4">
          <div className="mb-1 flex items-center gap-1.5 text-orange-400">
            <Flame size={18} />
            <span className="text-xs font-semibold uppercase tracking-wide">Série</span>
          </div>
          <p className="text-2xl font-bold text-white">
            {streak} <span className="text-sm font-normal text-slate-400">jour{streak > 1 ? 's' : ''}</span>
          </p>
        </div>
        <div className="rounded-2xl bg-slate-800/70 p-4">
          <div className="mb-1 flex items-center gap-1.5 text-emerald-400">
            <TimerIcon size={18} />
            <span className="text-xs font-semibold uppercase tracking-wide">Séances</span>
          </div>
          <p className="text-2xl font-bold text-white">{sessions.length}</p>
        </div>
      </div>

      {lastSession && (
        <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-800/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dernière séance</p>
          <p className="mt-1 font-medium text-white">{lastSession.dayName}</p>
          <p className="text-sm text-slate-400">
            {new Date(lastSession.startedAt).toLocaleDateString('fr-FR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </p>
        </div>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-white">Programmes</h2>
          <Link to="/programs" className="flex items-center gap-1 text-sm text-emerald-400">
            Tout voir <ArrowRight size={14} />
          </Link>
        </div>
        <div className="flex flex-col gap-3">
          {programs.slice(0, 2).map((program) => (
            <Link
              key={program.id}
              to={`/programs/${program.id}`}
              className="rounded-2xl border border-slate-800 bg-slate-800/40 p-4 transition-colors hover:bg-slate-800/70"
            >
              <p className="font-medium text-white">{program.name}</p>
              <p className="mt-1 text-sm text-slate-400">{program.days.length} jours d'entraînement</p>
            </Link>
          ))}
        </div>
      </section>

      <Link
        to="/timer"
        className="mt-6 flex items-center justify-between rounded-2xl bg-emerald-500 p-4 font-semibold text-slate-900 hover:bg-emerald-400"
      >
        Lancer un minuteur libre
        <ArrowRight size={18} />
      </Link>
    </div>
  )
}
