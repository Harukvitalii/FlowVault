import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
  Zap
} from 'lucide-react'
import { DEFAULT_RPCS } from '../data/rpcs'
import { GlassCard } from './GlassCard'
import { Button, Input, Row } from './ui'
import { cn } from '../lib/cn'
import { chainName as knownName } from '@shared/chains'
import type {
  ChainDetectResult,
  RpcEntry,
  RpcPingResult
} from '@shared/types'

type DetectState =
  | { kind: 'idle' }
  | { kind: 'detecting' }
  | { kind: 'ok'; result: ChainDetectResult }
  | { kind: 'error'; message: string }

export function RpcsTab() {
  const [rpcs, setRpcs] = useState<RpcEntry[]>([])
  const [pings, setPings] = useState<Record<string, RpcPingResult>>({})
  const [pinging, setPinging] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editUrl, setEditUrl] = useState('')
  const [addOpen, setAddOpen] = useState(false)

  useEffect(() => {
    ;(async () => {
      const loaded = await window.api.rpc.list()
      if (loaded.length === 0) {
        await window.api.rpc.save(DEFAULT_RPCS)
        setRpcs(DEFAULT_RPCS)
      } else {
        setRpcs(loaded)
      }
    })()
  }, [])

  // Ping once on initial load only — not on every rpcs state change.
  const initialPingDone = useRef(false)
  useEffect(() => {
    if (rpcs.length === 0 || initialPingDone.current) return
    initialPingDone.current = true
    pingNow(rpcs)
  }, [rpcs])

  const pingNow = async (list: RpcEntry[]) => {
    setPinging(true)
    const res = await window.api.rpc.pingMany(
      list.map((r) => ({ id: r.id, url: r.url }))
    )
    const byId: Record<string, RpcPingResult> = {}
    for (const r of res) byId[r.id] = r
    setPings(byId)
    setPinging(false)
  }

  const commit = async (next: RpcEntry[]) => {
    setRpcs(next)
    await window.api.rpc.save(next)
  }

  const startEdit = (r: RpcEntry) => {
    setEditingId(r.id)
    setEditUrl(r.url)
  }

  const saveEdit = async () => {
    if (!editingId) return
    const next = rpcs.map((r) =>
      r.id === editingId ? { ...r, url: editUrl.trim() } : r
    )
    setEditingId(null)
    await commit(next)
  }

  const remove = async (id: string) => {
    const next = rpcs.filter((r) => r.id !== id)
    setPings((p) => {
      const n = { ...p }
      delete n[id]
      return n
    })
    await commit(next)
  }

  const grouped = useMemo(() => {
    const byChainId: Record<number, RpcEntry[]> = {}
    for (const r of rpcs) (byChainId[r.chainId] ??= []).push(r)
    const fastestByChainId: Record<number, string | null> = {}
    for (const [cid, list] of Object.entries(byChainId)) {
      let bestId: string | null = null
      let bestMs = Infinity
      for (const r of list) {
        const p = pings[r.id]
        if (p?.latencyMs != null && p.latencyMs < bestMs) {
          bestMs = p.latencyMs
          bestId = r.id
        }
      }
      fastestByChainId[Number(cid)] = bestId
    }
    return { byChainId, fastestByChainId }
  }, [rpcs, pings])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-fg-muted">
          Multiple RPCs per chain. When sending tokens, the{' '}
          <span className="text-accent font-medium">fastest</span> RPC for that
          chain is picked automatically. Chain ID is detected from the URL.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            onClick={() => pingNow(rpcs)}
            disabled={pinging}
            className="h-9 px-3 text-xs"
          >
            <RefreshCw size={12} className={cn(pinging && 'animate-spin')} />
            Ping all
          </Button>
          <Button
            variant="primary"
            onClick={() => setAddOpen((v) => !v)}
            className="h-9 px-3 text-xs"
          >
            {addOpen ? <X size={12} /> : <Plus size={12} />}
            {addOpen ? 'Cancel' : 'Add custom'}
          </Button>
        </div>
      </div>

      {addOpen && (
        <AddRpcForm
          existing={rpcs}
          onAdd={async (entry) => {
            setAddOpen(false)
            await commit([...rpcs, entry])
          }}
          onCancel={() => setAddOpen(false)}
        />
      )}

      {Object.entries(grouped.byChainId)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([cidStr, list]) => {
          const chainId = Number(cidStr)
          const fastestId = grouped.fastestByChainId[chainId]
          const display =
            list.find((r) => r.chain && r.chain !== 'Unknown')?.chain ??
            knownName(chainId)
          return (
            <div key={chainId} className="space-y-2">
              <div className="flex items-center gap-2 pl-1">
                <div className="text-[10px] uppercase tracking-widest text-fg-muted">
                  {display}
                </div>
                <span className="font-mono text-[10px] text-fg-muted/70">
                  id {chainId}
                </span>
                <span className="text-[10px] text-fg-muted/60">
                  · {list.length} RPC{list.length > 1 ? 's' : ''}
                </span>
              </div>
              <GlassCard className="divide-y divide-white/[0.05]">
                {list.map((r) => {
                  const p = pings[r.id]
                  const editing = editingId === r.id
                  const isFastest = r.id === fastestId
                  return (
                    <div
                      key={r.id}
                      className="flex items-center gap-3 px-4 py-3 text-sm"
                    >
                      <PingDot result={p} />
                      <span className="font-mono font-tnum text-xs text-fg-muted w-14">
                        {p?.latencyMs != null
                          ? `${p.latencyMs}ms`
                          : p?.error
                            ? 'fail'
                            : '—'}
                      </span>
                      {editing ? (
                        <Input
                          mono
                          value={editUrl}
                          onChange={(e) => setEditUrl(e.target.value)}
                          className="h-8 text-xs"
                        />
                      ) : (
                        <span className="flex-1 font-mono text-xs text-fg truncate">
                          {r.url}
                        </span>
                      )}
                      {isFastest && !editing && (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-accent px-1.5 py-0.5 rounded-full bg-accent/10 border border-accent/30">
                          <Zap size={10} />
                          fastest
                        </span>
                      )}
                      {r.custom && !editing && (
                        <span className="text-[10px] uppercase tracking-wider text-fg-muted/80 px-1.5 py-0.5 rounded border border-white/[0.1]">
                          custom
                        </span>
                      )}
                      <div className="flex items-center gap-1">
                        {editing ? (
                          <>
                            <IconBtn onClick={saveEdit} title="Save">
                              <Check size={14} className="text-accent" />
                            </IconBtn>
                            <IconBtn
                              onClick={() => setEditingId(null)}
                              title="Cancel"
                            >
                              <X size={14} />
                            </IconBtn>
                          </>
                        ) : (
                          <>
                            <IconBtn onClick={() => startEdit(r)} title="Edit">
                              <Pencil size={13} />
                            </IconBtn>
                            <IconBtn
                              onClick={() => remove(r.id)}
                              title="Remove"
                            >
                              <Trash2 size={13} className="hover:text-danger" />
                            </IconBtn>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </GlassCard>
            </div>
          )
        })}
    </div>
  )
}

function AddRpcForm({
  existing,
  onAdd,
  onCancel
}: {
  existing: RpcEntry[]
  onAdd: (entry: RpcEntry) => void | Promise<void>
  onCancel: () => void
}) {
  const [url, setUrl] = useState('')
  const [chainLabel, setChainLabel] = useState('')
  const [labelEditedByUser, setLabelEditedByUser] = useState(false)
  const [detect, setDetect] = useState<DetectState>({ kind: 'idle' })
  const lastDetectedUrl = useRef<string>('')

  const runDetect = async (rawUrl: string) => {
    const u = rawUrl.trim()
    if (!u || u === lastDetectedUrl.current) return
    lastDetectedUrl.current = u
    setDetect({ kind: 'detecting' })
    const r = await window.api.rpc.detect(u)
    if (r.ok && r.chainId) {
      setDetect({ kind: 'ok', result: r })
      if (!labelEditedByUser) {
        setChainLabel(r.name ?? `Chain ${r.chainId}`)
      }
    } else {
      setDetect({ kind: 'error', message: r.error ?? 'detect failed' })
    }
  }

  const detected = detect.kind === 'ok' ? detect.result : null
  const duplicate =
    detected?.chainId !== undefined &&
    existing.some(
      (r) => r.chainId === detected.chainId && r.url.trim() === url.trim()
    )

  const canSubmit =
    detect.kind === 'ok' &&
    detect.result.chainId !== undefined &&
    chainLabel.trim().length > 0 &&
    !duplicate

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit || !detected?.chainId) return
    const entry: RpcEntry = {
      id: `custom-${crypto.randomUUID()}`,
      chainId: detected.chainId,
      chain: chainLabel.trim(),
      url: url.trim(),
      custom: true
    }
    await onAdd(entry)
  }

  return (
    <GlassCard className="p-4 space-y-3">
      <Row label="RPC URL">
        <Input
          mono
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => runDetect(url)}
          onPaste={(e) => {
            // Run detect after paste completes.
            const pasted = e.clipboardData.getData('text')
            if (pasted) setTimeout(() => runDetect(pasted), 50)
          }}
          placeholder="https://..."
          autoFocus
        />
      </Row>

      <DetectBanner state={detect} duplicate={duplicate} />

      <Row label="Chain name">
        <Input
          value={chainLabel}
          onChange={(e) => {
            setLabelEditedByUser(true)
            setChainLabel(e.target.value)
          }}
          placeholder={
            detected?.chainId ? `e.g. ${knownName(detected.chainId)}` : 'Detect URL first'
          }
          disabled={detect.kind !== 'ok'}
        />
      </Row>

      <div className="flex items-center gap-2 justify-end">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={!canSubmit}
          onClick={submit}
        >
          {duplicate ? 'Already added' : 'Add RPC'}
        </Button>
      </div>
    </GlassCard>
  )
}

function DetectBanner({
  state,
  duplicate
}: {
  state: DetectState
  duplicate: boolean
}) {
  if (state.kind === 'idle') return null
  if (state.kind === 'detecting') {
    return (
      <div className="flex items-center gap-2 text-xs text-fg-muted">
        <Loader2 size={12} className="animate-spin" />
        Detecting chain ID…
      </div>
    )
  }
  if (state.kind === 'error') {
    return (
      <div className="text-xs text-danger">
        RPC unreachable — {state.message}
      </div>
    )
  }
  // ok
  const r = state.result
  const known = r.chainId !== undefined && !!r.name
  return (
    <div className="flex items-center gap-2 text-xs">
      <Check size={12} className="text-accent" />
      <span className="text-fg-muted">Detected:</span>
      <span className="font-mono font-tnum text-fg">
        chain {r.chainId}
      </span>
      {known && (
        <span className="text-accent">· {r.name}</span>
      )}
      {!known && (
        <span className="text-warn">· unknown — pick a name</span>
      )}
      {r.latencyMs != null && (
        <span className="text-fg-muted/70 font-mono font-tnum ml-1">
          {r.latencyMs}ms
        </span>
      )}
      {duplicate && <span className="text-danger ml-auto">duplicate URL</span>}
    </div>
  )
}

function PingDot({ result }: { result?: RpcPingResult }) {
  const color = !result
    ? 'bg-fg-muted/40'
    : result.latencyMs == null
      ? 'bg-danger'
      : result.latencyMs < 100
        ? 'bg-accent'
        : result.latencyMs < 300
          ? 'bg-warn'
          : 'bg-danger'
  return <span className={cn('w-1.5 h-1.5 rounded-full', color)} />
}

function IconBtn({
  onClick,
  title,
  children
}: {
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-7 h-7 rounded-md text-fg-muted hover:text-fg hover:bg-white/[0.06] inline-flex items-center justify-center transition-colors"
    >
      {children}
    </button>
  )
}
