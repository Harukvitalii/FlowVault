import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Zap } from 'lucide-react'
import { GlassCard } from './GlassCard'
import { cn } from '../lib/cn'
import { chainName as knownName } from '@shared/chains'
import type { RpcEntry } from '@shared/types'

type Status = Record<string, { latencyMs: number | null; error?: string }>

function bucket(latency: number | null): 'good' | 'mid' | 'bad' {
  if (latency == null) return 'bad'
  if (latency < 100) return 'good'
  if (latency < 300) return 'mid'
  return 'bad'
}

const dotColor = {
  good: 'bg-accent',
  mid: 'bg-warn',
  bad: 'bg-danger'
}

export function RpcPingPanel() {
  const [rpcs, setRpcs] = useState<RpcEntry[]>([])
  const [status, setStatus] = useState<Status>({})
  const [pinging, setPinging] = useState(false)

  useEffect(() => {
    window.api.rpc.list().then(setRpcs).catch(() => undefined)
  }, [])

  // Subscribe to latency push from main; seed from latest() on mount.
  useEffect(() => {
    let cancelled = false
    window.api.rpc
      .latest()
      .then((snap) => {
        if (cancelled) return
        const next: Status = {}
        for (const [id, v] of Object.entries(snap))
          next[id] = { latencyMs: v.latencyMs }
        setStatus(next)
      })
      .catch(() => undefined)
    const off = window.api.rpc.onLatencies((snap) => {
      const next: Status = {}
      for (const [id, v] of Object.entries(snap))
        next[id] = { latencyMs: v.latencyMs }
      setStatus(next)
      setPinging(false)
    })
    return () => {
      cancelled = true
      off()
    }
  }, [])

  const chains = useMemo(() => {
    const byChainId: Record<number, RpcEntry[]> = {}
    for (const r of rpcs) (byChainId[r.chainId] ??= []).push(r)
    return Object.entries(byChainId)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([cidStr, list]) => {
        const chainId = Number(cidStr)
        let bestMs = Infinity
        let bestUrl = ''
        for (const r of list) {
          const s = status[r.id]
          if (s?.latencyMs != null && s.latencyMs < bestMs) {
            bestMs = s.latencyMs
            bestUrl = r.url
          }
        }
        const display =
          list.find((r) => r.chain && r.chain !== 'Unknown')?.chain ??
          knownName(chainId)
        return {
          chainId,
          display,
          best: {
            latencyMs: Number.isFinite(bestMs) ? bestMs : null,
            url: bestUrl
          },
          count: list.length
        }
      })
  }, [rpcs, status])

  // Manual refresh — kicks the main-process pinger; results arrive via
  // the onLatencies subscription above.
  const pingAll = async () => {
    setPinging(true)
    try {
      await window.api.rpc.refresh()
    } catch {
      setPinging(false)
    }
  }

  if (rpcs.length === 0) return null

  return (
    <GlassCard className="p-3 flex items-center gap-3 flex-wrap">
      <div className="text-[10px] uppercase tracking-widest text-fg-muted pl-1 pr-2 border-r border-white/[0.06] inline-flex items-center gap-1">
        <Zap size={10} className="text-accent" />
        Fastest
      </div>
      {chains.map(({ chainId, display, best, count }) => {
        const b = bucket(best.latencyMs)
        return (
          <div
            key={chainId}
            className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/[0.04] transition-colors"
            title={best.url || `${display} · chain ${chainId}`}
          >
            <span className={cn('w-1.5 h-1.5 rounded-full', dotColor[b])} />
            <span className="text-xs text-fg">{display}</span>
            <span className="font-mono font-tnum text-[11px] text-fg-muted">
              {best.latencyMs != null ? `${best.latencyMs}ms` : '—'}
            </span>
            <span className="text-[10px] text-fg-muted/60">of {count}</span>
          </div>
        )
      })}
      <button
        onClick={pingAll}
        disabled={pinging}
        className={cn(
          'ml-auto px-2.5 h-7 rounded-btn inline-flex items-center gap-1.5 text-xs',
          'text-fg-muted hover:text-fg hover:bg-white/[0.04] transition-colors',
          pinging && 'opacity-60 cursor-not-allowed'
        )}
      >
        <RefreshCw size={12} className={cn(pinging && 'animate-spin')} />
        Refresh
      </button>
    </GlassCard>
  )
}
