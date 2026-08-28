import { useState } from 'react'
import { CountdownTimer } from '../components/CountdownTimer'

const presets = [
  { label: '30s', seconds: 30 },
  { label: '45s', seconds: 45 },
  { label: '60s', seconds: 60 },
  { label: '90s', seconds: 90 },
  { label: '2 min', seconds: 120 },
  { label: '3 min', seconds: 180 },
]

export function TimerPage() {
  const [seconds, setSeconds] = useState(60)
  const [key, setKey] = useState(0) // force remount to reset the timer on preset change

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <h1 className="mb-6 text-2xl font-bold text-white">Minuteur libre</h1>

      <div className="mb-6 flex flex-wrap gap-2">
        {presets.map((preset) => (
          <button
            key={preset.seconds}
            onClick={() => {
              setSeconds(preset.seconds)
              setKey((k) => k + 1)
            }}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              seconds === preset.seconds
                ? 'bg-emerald-500 text-slate-900'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="flex justify-center rounded-2xl border border-slate-800 bg-slate-800/40 p-8">
        <CountdownTimer key={key} seconds={seconds} />
      </div>

      <p className="mt-4 text-center text-xs text-slate-500">
        Utile pour un circuit libre, du Tabata, ou pour minuter un temps de gainage.
      </p>
    </div>
  )
}
