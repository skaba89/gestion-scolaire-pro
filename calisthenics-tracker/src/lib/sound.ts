// Minimal beep + vibration feedback, no external assets needed.
export function playBeep(frequency = 880, durationMs = 150) {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioCtx()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.start()
    oscillator.stop(ctx.currentTime + durationMs / 1000)
    oscillator.onended = () => ctx.close()
  } catch {
    // Web Audio unavailable (e.g. no user interaction yet) — fail silently
  }
}

export function vibrate(pattern: number | number[] = 200) {
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate(pattern)
    } catch {
      // ignore
    }
  }
}
