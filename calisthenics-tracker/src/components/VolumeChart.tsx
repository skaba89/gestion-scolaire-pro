import type { DailyVolumePoint } from '../lib/stats'

export function VolumeChart({ data }: { data: DailyVolumePoint[] }) {
  const max = Math.max(1, ...data.map((d) => d.totalReps))

  return (
    <div className="flex items-end gap-1.5" style={{ height: 120 }}>
      {data.map((point, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1">
          <div
            className={`w-full rounded-t-sm ${point.totalReps > 0 ? 'bg-emerald-500' : 'bg-slate-800'}`}
            style={{ height: `${Math.max(2, (point.totalReps / max) * 90)}px` }}
            title={`${point.totalReps} reps`}
          />
          <span className="text-[9px] text-slate-600">{point.date.slice(0, 2)}</span>
        </div>
      ))}
    </div>
  )
}
