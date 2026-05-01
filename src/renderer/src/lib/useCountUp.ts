import { useEffect, useRef, useState } from 'react'

/**
 * Per-key "already animated this session" set. Each useCountUp instance
 * passes a stable key (e.g. a source id). After that key's animation runs
 * once, every subsequent mount with the same key skips the animation —
 * so navigating Dashboard ↔ Settings doesn't replay it.
 *
 * Cleared by `resetCountUp()` when the vault locks, so the next unlock
 * plays a fresh intro for every card.
 */
const animatedKeys = new Set<string>()

export function resetCountUp(): void {
  animatedKeys.clear()
}

const MIN_DURATION_MS = 400
const MAX_DURATION_MS = 5000

/**
 * Animate a counter from 0 → `target` exactly once per (key + unlock
 * session). The animation duration is the **wall-clock time it took for
 * the target to arrive** — measured as (now - mountTime). So a balance
 * that took 800ms to fetch animates over 800ms; one that took 4.5s
 * animates over 4.5s. Clamped to a sane band so 0ms/instant data still
 * gives a perceptible blip and stalled requests don't run forever.
 *
 * `target = null` keeps the counter dormant (used while balances load).
 *
 * @param target  numeric value to count up to, or null while loading
 * @param key     stable identity for this counter (e.g. source.id) so
 *                navigation/remounts don't re-animate
 */
export function useCountUp(
  target: number | null,
  key: string
): number | null {
  const alreadyAnimated = animatedKeys.has(key)
  const [value, setValue] = useState<number | null>(
    target == null ? null : alreadyAnimated ? target : 0
  )
  // Capture the mount time so we can compute "how long did the load take".
  const mountedAtRef = useRef<number>(performance.now())
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (target == null) {
      setValue(null)
      return
    }
    if (animatedKeys.has(key)) {
      setValue(target)
      return
    }
    const elapsed = performance.now() - mountedAtRef.current
    const dur = Math.max(MIN_DURATION_MS, Math.min(elapsed, MAX_DURATION_MS))
    const from = 0
    const to = target
    const t0 = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / dur)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(from + (to - from) * eased)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        animatedKeys.add(key)
        rafRef.current = null
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [target, key])

  return value
}
