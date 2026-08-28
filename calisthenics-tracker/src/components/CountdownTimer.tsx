import { useEffect, useRef, useState } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { playBeep, vibrate } from '../lib/sound'

interface CountdownTimerProps {
  seconds: number
  label?: string
  autoStart?: boolean
  onComplete?: () => void
  colorClass?: string
}

function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function CountdownTimer({
  seconds,
  label,
  autoStart = false,
  onComplete,
  colorClass = 'text-emerald-400',
}: CountdownTimerProps) {
  const [remaining, setRemaining] = useState(seconds)
  const [running, setRunning] = useState(autoStart)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    setRemaining(seconds)
  }, [seconds])

  useEffect(() => {
    if (!running) return
    if (remaining <= 0) {
      setRunning(false)
      playBeep(1046, 300)
      vibrate([200, 100, 200])
      onCompleteRef.current?.()
      return
    }
    const id = window.setTimeout(() => {
      setRemaining((r) => r - 1)
      if (remaining <= 4) {
        playBeep(660, 100)
      }
    }, 1000)
    return () => window.clearTimeout(id)
  }, [running, remaining])

  const progress = seconds > 0 ? remaining / seconds : 0
  const circumference = 2 * Math.PI * 54

  return (
    <div className="flex flex-col items-center gap-3">
      {label && <p className="text-sm font-medium text-slate-400">{label}</p>}
      <div className="relative h-36 w-36">
        <svg className="h-36 w-36 -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="54" fill="none" stroke="#1e293b" strokeWidth="8" />
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            className={`${colorClass} transition-[stroke-dashoffset] duration-1000 ease-linear`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-3xl font-bold tabular-nums">{formatTime(remaining)}</span>
        </div>
      </div>
      <div className="flex gap-3">
        <button
          onClick={() => setRunning((r) => !r)}
          className="flex items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-emerald-400"
        >
          {running ? <Pause size={16} /> : <Play size={16} />}
          {running ? 'Pause' : 'Démarrer'}
        </button>
        <button
          onClick={() => {
            setRunning(false)
            setRemaining(seconds)
          }}
          className="flex items-center gap-1.5 rounded-full bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700"
        >
          <RotateCcw size={16} />
          Réinitialiser
        </button>
      </div>
    </div>
  )
}
