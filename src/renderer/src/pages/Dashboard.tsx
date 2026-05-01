import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Eye, EyeOff, RefreshCw, Wallet } from 'lucide-react'
import { EXCHANGE_META, type Source } from '../data/sources'
import { SourceCard } from '../components/SourceCard'
import { RpcTicker } from '../components/RpcTicker'
import { ActionPanel } from '../components/ActionPanel'
import { ActivityPanel } from '../components/ActivityPanel'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { Button } from '../components/ui'
import { cn } from '../lib/cn'
import { useI18n } from '../lib/i18n'
import { useCountUp } from '../lib/useCountUp'
import type { Balance } from '@shared/types'

/**
 * Tracks whether the Alt/Option key is currently held. Used to "peek" hidden
 * balances without flipping the global toggle — a power-user shortcut that
 * matches Linear/Raycast-style mod-key reveals.
 */
function useAltHeld(): boolean {
  const [alt, setAlt] = useState(false)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Alt' || e.altKey) setAlt(true)
    }
    const off = (e: KeyboardEvent) => {
      if (e.key === 'Alt' || !e.altKey) setAlt(false)
    }
    const blur = () => setAlt(false)
    window.addEventListener('keydown', on)
    window.addEventListener('keyup', off)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', on)
      window.removeEventListener('keyup', off)
      window.removeEventListener('blur', blur)
    }
  }, [])
  return alt
}

function formatAgo(ts: number | null, now: number): string | null {
  if (ts == null) return null
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  return `${h}h ago`
}

/**
 * Self-ticking timestamp display. Owns its own 15s interval so the parent
 * (Dashboard, with a large source-card grid) does not re-render on every
 * tick of the relative-time string.
 */
function UpdatedAgo({
  updatedAt,
  refreshing,
  className
}: {
  updatedAt: number | null
  refreshing: boolean
  className?: string
}) {
  const { t } = useI18n()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [])
  const ago = formatAgo(updatedAt, now)
  if (!ago) return null
  return (
    <span
      className={cn(
        'text-[11px] font-mono font-tnum text-fg-muted',
        refreshing && 'text-accent',
        className
      )}
    >
      {refreshing ? t('refreshing') : `${t('updated')} ${ago}`}
    </span>
  )
}

type DashboardProps = {
  hideBalances: boolean
  onToggleHide: () => void
}

export function DashboardPage({ hideBalances: hideBalancesProp, onToggleHide }: DashboardProps) {
  // Hold Alt/Option to peek values temporarily without toggling the global
  // hidden-balance preference. Eye toggle is the durable setting; this is
  // the keyboard mod-key shortcut.
  const altPeek = useAltHeld()
  const hideBalances = hideBalancesProp && !altPeek
  const { t } = useI18n()
  const [sources, setSources] = useState<Source[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)

  const loadSources = useCallback(async () => {
    setLoadingMeta(true)
    const [accounts, wallets] = await Promise.all([
      window.api.exchanges.list(),
      window.api.wallets.list()
    ])
    const initial: Source[] = [
      ...accounts.map((acc) => {
        const meta = EXCHANGE_META[acc.exchange]
        return {
          kind: 'cex' as const,
          id: acc.accountId,
          name: acc.label,
          short: meta.short,
          accent: meta.accent,
          exchange: acc.exchange,
          balances: null
        }
      }),
      ...wallets.map((w) => ({
        kind: 'evm' as const,
        id: w.id,
        name: w.label,
        short: w.network ? w.network.toUpperCase() : 'EVM',
        accent: w.network === 'SOL' ? '#9945FF' : '#627EEA',
        address: w.address,
        network: w.network,
        canSend: w.canSend,
        balances: null as Source['balances']
      }))
    ]
    setSources(initial)
    setLoadingMeta(false)
    fetchAllBalances(initial)
  }, [])

  const fetchAllBalances = async (list: Source[]) => {
    await Promise.all(
      list.map(async (src) => {
        const r =
          src.kind === 'cex'
            ? await window.api.exchanges.getBalances(src.id)
            : src.network === 'SOL' && src.address
              ? await window.api.wallets.getSolBalances(src.address)
              : src.address
                ? await window.api.wallets.getBalances(src.address)
                : { ok: true, balances: [] }
        setSources((prev) =>
          prev.map((s) =>
            s.id === src.id
              ? r.ok
                ? { ...s, balances: r.balances ?? [], error: undefined }
                : { ...s, error: r.error ?? 'fetch failed', balances: [] }
              : s
          )
        )
      })
    )
    setUpdatedAt(Date.now())
  }

  useEffect(() => {
    loadSources()
  }, [loadSources])

  const refresh = async () => {
    setRefreshing(true)
    await fetchAllBalances(sources)
    setRefreshing(false)
  }

  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  const refreshingRef = useRef(refreshing)
  refreshingRef.current = refreshing
  useEffect(() => {
    const t = setInterval(() => {
      if (refreshingRef.current) return
      refreshRef.current()
    }, 60_000)
    return () => clearInterval(t)
  }, [])

  const selected = sources.find((s) => s.id === selectedId) ?? null

  // ---- Detail view (full takeover) ----
  if (selected) {
    return (
      <div className="flex-1 min-h-0 flex flex-col relative z-10">
        <RpcTicker />
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-8 py-6 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSelectedId(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-fg-muted hover:text-fg hover:bg-white/[0.06] transition-colors"
              >
                <ArrowLeft size={16} />
              </button>
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
                  style={{
                    background: selected.accent + '22',
                    color: selected.accent,
                    border: `1px solid ${selected.accent}33`
                  }}
                >
                  {selected.kind === 'evm' ? (
                    <Wallet size={16} />
                  ) : (
                    selected.short
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-lg font-semibold text-fg truncate">
                    {selected.name}
                  </div>
                  <div className="text-xs text-fg-muted flex items-center gap-2">
                    <span className="uppercase">
                      {selected.kind === 'evm' && selected.network === 'SOL'
                        ? 'SOL'
                        : selected.kind}
                    </span>
                    {selected.balances && (
                      <>
                        <span className="text-white/[0.15]">·</span>
                        <DetailTotal
                          sourceId={selected.id}
                          balances={selected.balances}
                          hideBalances={hideBalances}
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <UpdatedAgo updatedAt={updatedAt} refreshing={refreshing} />
                <Button
                  variant="ghost"
                  onClick={refresh}
                  disabled={refreshing}
                  className="h-8 px-3 text-xs"
                >
                  <RefreshCw
                    size={12}
                    className={cn(refreshing && 'animate-spin')}
                  />
                  {t('refresh')}
                </Button>
              </div>
            </div>

            {/* Transfer panel */}
            <ErrorBoundary label="Transfer panel">
              <ActionPanel
                source={selected}
                sources={sources}
                onRefresh={refresh}
              />
            </ErrorBoundary>

            {/* Activity — all transactions */}
            <ErrorBoundary label="Activity">
              <ActivityPanel />
            </ErrorBoundary>
          </div>
        </div>
      </div>
    )
  }

  // ---- Grid view ----
  return (
    <div className="flex-1 min-h-0 flex flex-col relative z-10">
      <RpcTicker />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-8 py-8 space-y-6">
          <section>
            <SectionHeader
              label={t('sources')}
              after={
                !loadingMeta && sources.length > 0 ? (
                  <DashboardTotals sources={sources} hideBalances={hideBalances} />
                ) : undefined
              }
              right={
                sources.length > 0 && (
                  <div className="flex items-center gap-3">
                    <UpdatedAgo updatedAt={updatedAt} refreshing={refreshing} />
                    <button
                      onClick={onToggleHide}
                      className="w-8 h-8 rounded-btn flex items-center justify-center text-fg-muted hover:text-fg hover:bg-white/[0.04] transition-colors"
                      title={hideBalances ? t('showBalances') : t('hideBalances')}
                    >
                      {hideBalances ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <Button
                      variant="ghost"
                      onClick={refresh}
                      disabled={refreshing}
                      className="h-8 px-3 text-xs"
                    >
                      <RefreshCw
                        size={12}
                        className={cn(refreshing && 'animate-spin')}
                      />
                      {t('refresh')}
                    </Button>
                  </div>
                )
              }
            />
            {loadingMeta ? (
              <GridSkeleton />
            ) : sources.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {sources.map((s) => {
                  const isSource = s.kind === 'cex' || s.canSend !== false
                  return (
                    <ErrorBoundary key={s.id} label={`source ${s.name}`}>
                      <SourceCard
                        source={s}
                        selected={false}
                        onSelect={isSource ? () => setSelectedId(s.id) : undefined}
                        hideBalances={hideBalances}
                      />
                    </ErrorBoundary>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

/**
 * Detail-view header total with count-up. Tweens whenever the selected
 * source's balance refreshes.
 */
function DetailTotal({
  sourceId,
  balances,
  hideBalances
}: {
  sourceId: string
  balances: Balance[]
  hideBalances: boolean
}) {
  const target = useMemo(
    () => balances.reduce((s, b) => s + b.usd, 0),
    [balances]
  )
  // Same key as the grid card — if the user already saw the intro on the
  // grid, opening the detail view doesn't replay it.
  const v = useCountUp(target, sourceId) ?? 0
  return (
    <span className="font-mono font-tnum">
      {hideBalances
        ? '$••••'
        : `$${v.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })}`}
    </span>
  )
}

/**
 * Dashboard summary totals with animated count-up. Lifted out of the inline
 * IIFE in `after={...}` so hooks (useCountUp) can be used legally.
 */
function DashboardTotals({
  sources,
  hideBalances
}: {
  sources: Source[]
  hideBalances: boolean
}) {
  const totals = useMemo(() => {
    const all = sources.flatMap((s) => s.balances ?? [])
    return {
      usd: all.reduce((s, b) => s + b.usd, 0),
      usdt: all.filter((b) => b.asset === 'USDT').reduce((s, b) => s + b.free, 0),
      usdc: all.filter((b) => b.asset === 'USDC').reduce((s, b) => s + b.free, 0)
    }
  }, [sources])
  const usd = useCountUp(totals.usd, 'dashboard:usd') ?? 0
  const usdt = useCountUp(totals.usdt, 'dashboard:usdt') ?? 0
  const usdc = useCountUp(totals.usdc, 'dashboard:usdc') ?? 0
  const fmt = (n: number) =>
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (
    <div className="flex items-center gap-3 font-mono font-tnum text-[11px]">
      <span className="text-fg font-semibold">
        {hideBalances ? '$••••' : `$${fmt(usd)}`}
      </span>
      <span className="text-fg-muted">
        USDT {hideBalances ? '••••' : fmt(usdt)}
      </span>
      <span className="text-fg-muted">
        USDC {hideBalances ? '••••' : fmt(usdc)}
      </span>
    </div>
  )
}

function SectionHeader({
  label,
  after,
  right
}: {
  label: string
  after?: React.ReactNode
  right?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between mb-2 pl-1 pr-1">
      <div className="flex items-center gap-3">
        <div className="text-[10px] uppercase tracking-[0.2em] text-fg-muted">
          {label}
        </div>
        {after}
      </div>
      {right}
    </div>
  )
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-[140px] rounded-card border border-white/[0.06] overflow-hidden relative bg-white/[0.02]"
        >
          {/* Shimmer sweep — accent-tinted gradient slides across to read as
              "live, loading" instead of "frozen grey block". */}
          <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-accent/[0.06] to-transparent" />
          <div className="p-4 flex flex-col gap-3 h-full">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-white/[0.05]" />
              <div className="h-3 w-20 rounded bg-white/[0.05]" />
            </div>
            <div className="h-4 w-24 rounded bg-white/[0.05] mt-2" />
            <div className="space-y-1.5 mt-auto">
              <div className="h-2.5 w-full rounded bg-white/[0.04]" />
              <div className="h-2.5 w-3/4 rounded bg-white/[0.04]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  const { t } = useI18n()
  return (
    <div className="rounded-card border border-white/[0.06] bg-white/[0.02] p-10 text-center">
      <div className="text-sm text-fg mb-1">{t('noSources')}</div>
      <div className="text-xs text-fg-muted">
        {t('noSources.desc')}
      </div>
    </div>
  )
}
