import { useEffect, useMemo, useRef, useState } from 'react'
import { chainName as knownName } from '@shared/chains'
import { cn } from '../lib/cn'
import type { RpcEntry } from '@shared/types'

type Status = Record<string, { latencyMs: number | null; error?: string }>

function bucket(latency: number | null): 'good' | 'mid' | 'bad' {
  if (latency == null) return 'bad'
  if (latency < 100) return 'good'
  if (latency < 300) return 'mid'
  return 'bad'
}

const dotColor = { good: 'text-accent', mid: 'text-warn', bad: 'text-danger' }

export function RpcTicker() {
  const [rpcs, setRpcs] = useState<RpcEntry[]>([])
  const [status, setStatus] = useState<Status>({})
  const trackRef = useRef<HTMLDivElement>(null)
  const [needsScroll, setNeedsScroll] = useState(false)

  useEffect(() => {
    window.api.rpc.list().then(setRpcs).catch(() => undefined)
  }, [])

  const pingAll = async (list: RpcEntry[]) => {
    if (list.length === 0) return
    const results = await window.api.rpc.pingMany(
      list.map((r) => ({ id: r.id, url: r.url }))
    )
    const next: Status = {}
    for (const r of results)
      next[r.id] = { latencyMs: r.latencyMs, error: r.error }
    setStatus(next)
  }

  useEffect(() => {
    if (rpcs.length === 0) return
    pingAll(rpcs)
    const t = setInterval(() => pingAll(rpcs), 30_000)
    return () => clearInterval(t)
  }, [rpcs])

  const chains = useMemo(() => {
    const byChainId: Record<number, RpcEntry[]> = {}
    for (const r of rpcs) (byChainId[r.chainId] ??= []).push(r)
    return Object.entries(byChainId)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([cidStr, list]) => {
        const chainId = Number(cidStr)
        let bestMs = Infinity
        for (const r of list) {
          const s = status[r.id]
          if (s?.latencyMs != null && s.latencyMs < bestMs) bestMs = s.latencyMs
        }
        const display =
          list.find((r) => r.chain && r.chain !== 'Unknown')?.chain ??
          knownName(chainId)
        return {
          chainId,
          display,
          latencyMs: Number.isFinite(bestMs) ? bestMs : null
        }
      })
  }, [rpcs, status])

  // Check if content overflows — enable marquee if so
  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    setNeedsScroll(el.scrollWidth > el.clientWidth * 1.05)
  }, [chains])

  if (rpcs.length === 0) return null

  const items = chains.map((c) => {
    const b = bucket(c.latencyMs)
    return (
      <span
        key={c.chainId}
        className="inline-flex items-center gap-1.5 shrink-0"
      >
        <span className={cn('text-[8px]', dotColor[b])}>●</span>
        <span className="text-fg/70">{c.display}</span>
        <span className="font-mono font-tnum text-fg-muted">
          {c.latencyMs != null ? `${c.latencyMs}ms` : '—'}
        </span>
      </span>
    )
  })

  return (
    <div className="h-6 overflow-hidden bg-white/[0.02] border-b border-white/[0.04] relative select-none">
      <div
        ref={trackRef}
        className={cn(
          'h-full flex items-center gap-5 px-4 text-[11px] whitespace-nowrap',
          needsScroll ? 'rpc-marquee' : 'justify-center'
        )}
      >
        {items}
        {/* Duplicate for seamless loop */}
        {needsScroll && (
          <>
            <span className="text-white/[0.08] shrink-0">│</span>
            {items}
          </>
        )}
      </div>
      <style>{`
        .rpc-marquee {
          animation: rpc-scroll var(--dur, 20s) linear infinite;
          width: max-content;
        }
        .rpc-marquee:hover { animation-play-state: paused; }
        @keyframes rpc-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  )
}
