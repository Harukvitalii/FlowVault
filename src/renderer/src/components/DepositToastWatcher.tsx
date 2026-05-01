import { useEffect, useRef } from 'react'
import type { DepositRecord } from '@shared/types'
import { useToast } from './Toaster'

/**
 * Subscribes to deposit updates from main and emits a success toast each
 * time a record transitions into `'ok'` (i.e. the destination CEX credited
 * the deposit). Mounts once at app root so the notification fires regardless
 * of which view the user is on.
 *
 * Diff strategy:
 *  - On first push, snapshot all current ids that are already 'ok' — those
 *    landed before this session started, so we don't toast them.
 *  - On each subsequent push, any id that is 'ok' but wasn't 'ok' last time
 *    is a fresh credit → toast.
 */
export function DepositToastWatcher() {
  const toast = useToast()
  const okSeen = useRef<Set<string> | null>(null)

  useEffect(() => {
    let cancelled = false
    let initialized = false
    const handle = (records: DepositRecord[]) => {
      if (cancelled) return
      // Establish baseline on first emission (whichever path arrives first).
      if (!initialized) {
        initialized = true
        okSeen.current = new Set(
          records.filter((r) => r.status === 'ok').map((r) => r.id)
        )
        return
      }
      const seen = okSeen.current ?? new Set<string>()
      for (const r of records) {
        if (r.status !== 'ok' || seen.has(r.id)) continue
        seen.add(r.id)
        toast.push({
          kind: 'success',
          title: `+${r.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${r.coin}`,
          description: `Credited to ${r.exchangeLabel}`
        })
      }
      okSeen.current = seen
    }
    // Subscribe first; the live channel may fire before list() resolves and
    // we want it to count as the seed (or as a real event if list() seeded
    // first). Either path going through `handle` does the right thing.
    const unsub = window.api.deposits.onUpdate(handle)
    window.api.deposits.list().then(handle).catch(() => undefined)
    return () => {
      cancelled = true
      unsub()
    }
  }, [toast])

  return null
}
