/**
 * Per-process idempotency map for withdraw submissions.
 *
 * The renderer generates a UUID once when the Review modal opens and sends it
 * with every submit attempt. We cache the result by submitId for a short TTL
 * so that an accidental retry (double-click, network blip, React re-mount)
 * does not double-charge the user.
 *
 * Two states per id:
 *   - in-flight  → a Promise currently resolving the original call
 *   - resolved   → the recorded result, returned for any duplicate
 */

type Cached<R> =
  | { kind: 'in-flight'; promise: Promise<R> }
  | { kind: 'resolved'; ts: number; value: R }

const TTL_MS = 5 * 60 * 1000 // 5 min — generous; renderer regenerates per Review-open
const cache = new Map<string, Cached<unknown>>()

function sweep(): void {
  const cutoff = Date.now() - TTL_MS
  for (const [k, v] of cache) {
    if (v.kind === 'resolved' && v.ts < cutoff) cache.delete(k)
  }
}

/**
 * Run `fn()` exactly once per `submitId`. Concurrent callers with the same id
 * get the same in-flight promise; later callers within TTL get the cached
 * resolved value.
 *
 * If `submitId` is empty/undefined, the call passes through without dedupe.
 */
export async function withIdempotency<R>(
  submitId: string | undefined,
  fn: () => Promise<R>
): Promise<R> {
  if (!submitId) return fn()
  sweep()
  const hit = cache.get(submitId) as Cached<R> | undefined
  if (hit) {
    if (hit.kind === 'in-flight') return hit.promise
    return hit.value
  }
  const promise = (async () => {
    try {
      const value = await fn()
      cache.set(submitId, { kind: 'resolved', ts: Date.now(), value })
      return value
    } catch (err) {
      // On throw, drop the in-flight record so a retry can re-enter.
      cache.delete(submitId)
      throw err
    }
  })()
  cache.set(submitId, { kind: 'in-flight', promise })
  return promise
}
