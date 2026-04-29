import { useEffect, useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, BarChart3 } from 'lucide-react'
import { GlassCard } from './GlassCard'
import { cn } from '../lib/cn'
import { EXCHANGE_META } from '../data/sources'
import type {
  DepositRecord,
  ExchangeAccountMeta,
  WithdrawRecord
} from '@shared/types'

type Range = '7d' | '30d' | 'all'

const RANGE_MS: Record<Range, number> = {
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  all: 0
}

const RANGE_LABEL: Record<Range, string> = {
  '7d': '7 days',
  '30d': '30 days',
  all: 'All time'
}

type CoinSums = Record<string, number>

type AccountStats = {
  account: ExchangeAccountMeta
  deposits: CoinSums
  withdrawals: CoinSums
  depositCount: number
  withdrawCount: number
}

function fmtAmount(n: number): string {
  if (n === 0) return '0'
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 })
  return n.toLocaleString(undefined, { maximumFractionDigits: 8 })
}

function addCoin(sums: CoinSums, coin: string, amount: number) {
  const k = coin.toUpperCase()
  sums[k] = (sums[k] ?? 0) + amount
}

export function StatisticsTab() {
  const [accounts, setAccounts] = useState<ExchangeAccountMeta[]>([])
  const [withdrawals, setWithdrawals] = useState<WithdrawRecord[]>([])
  const [deposits, setDeposits] = useState<DepositRecord[]>([])
  const [range, setRange] = useState<Range>('30d')

  useEffect(() => {
    window.api.exchanges.list().then(setAccounts)
  }, [])

  useEffect(() => {
    window.api.withdrawals.list().then(setWithdrawals)
    return window.api.withdrawals.onUpdate(setWithdrawals)
  }, [])

  useEffect(() => {
    window.api.deposits.list().then(setDeposits)
    return window.api.deposits.onUpdate(setDeposits)
  }, [])

  const stats = useMemo<AccountStats[]>(() => {
    const cutoff = range === 'all' ? 0 : Date.now() - RANGE_MS[range]
    const byId = new Map<string, AccountStats>()
    for (const a of accounts) {
      byId.set(a.accountId, {
        account: a,
        deposits: {},
        withdrawals: {},
        depositCount: 0,
        withdrawCount: 0
      })
    }
    for (const w of withdrawals) {
      if (w.kind !== 'cex') continue
      if (w.status !== 'ok') continue
      if (w.submittedAt < cutoff) continue
      const row = byId.get(w.exchangeAccountId)
      if (!row) continue
      addCoin(row.withdrawals, w.coin, w.amount)
      row.withdrawCount += 1
    }
    for (const d of deposits) {
      if (d.status !== 'ok') continue
      if (d.depositedAt < cutoff) continue
      const row = byId.get(d.exchangeAccountId)
      if (!row) continue
      addCoin(row.deposits, d.coin, d.amount)
      row.depositCount += 1
    }
    return Array.from(byId.values()).sort((a, b) =>
      a.account.label.localeCompare(b.account.label)
    )
  }, [accounts, withdrawals, deposits, range])

  const totals = useMemo(() => {
    let d = 0
    let w = 0
    for (const s of stats) {
      d += s.depositCount
      w += s.withdrawCount
    }
    return { d, w }
  }, [stats])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">Statistics</h2>
          <p className="text-sm text-fg-muted mt-1">
            Completed deposits and withdrawals per exchange account.
          </p>
        </div>
        <div className="flex gap-1 rounded-btn bg-white/[0.04] border border-white/[0.08] p-1">
          {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                'px-3 h-8 rounded-md text-xs font-medium transition-colors',
                range === r
                  ? 'bg-white/[0.08] text-fg'
                  : 'text-fg-muted hover:text-fg'
              )}
            >
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>
      </div>

      {accounts.length === 0 ? (
        <GlassCard className="p-8 text-center">
          <BarChart3
            className="w-8 h-8 mx-auto mb-3 text-fg-muted"
            strokeWidth={1.5}
          />
          <p className="text-sm text-fg-muted">
            No exchange accounts configured.
          </p>
        </GlassCard>
      ) : totals.d === 0 && totals.w === 0 ? (
        <GlassCard className="p-8 text-center">
          <BarChart3
            className="w-8 h-8 mx-auto mb-3 text-fg-muted"
            strokeWidth={1.5}
          />
          <p className="text-sm text-fg-muted">
            No completed transfers in the selected range.
          </p>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {stats.map((s) => (
            <AccountRow key={s.account.accountId} stats={s} />
          ))}
        </div>
      )}
    </div>
  )
}

function AccountRow({ stats }: { stats: AccountStats }) {
  const meta = EXCHANGE_META[stats.account.exchange]
  const depCoins = Object.entries(stats.deposits).sort((a, b) =>
    a[0].localeCompare(b[0])
  )
  const wdCoins = Object.entries(stats.withdrawals).sort((a, b) =>
    a[0].localeCompare(b[0])
  )
  const empty = depCoins.length === 0 && wdCoins.length === 0

  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0"
          style={{
            background: `${meta.accent}22`,
            color: meta.accent,
            border: `1px solid ${meta.accent}44`
          }}
        >
          {meta.short}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">
            {stats.account.label}
          </div>
          <div className="text-xs text-fg-muted">{meta.displayName}</div>
        </div>
        <div className="text-xs text-fg-muted font-tnum">
          {stats.depositCount} in · {stats.withdrawCount} out
        </div>
      </div>

      {empty ? (
        <div className="text-xs text-fg-muted/70 italic">
          No completed transfers.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <CoinColumn
            icon={
              <ArrowDownLeft
                className="w-3.5 h-3.5 text-emerald-400"
                strokeWidth={2}
              />
            }
            label="Deposited"
            coins={depCoins}
          />
          <CoinColumn
            icon={
              <ArrowUpRight
                className="w-3.5 h-3.5 text-accent"
                strokeWidth={2}
              />
            }
            label="Withdrawn"
            coins={wdCoins}
          />
        </div>
      )}
    </GlassCard>
  )
}

function CoinColumn({
  icon,
  label,
  coins
}: {
  icon: React.ReactNode
  label: string
  coins: [string, number][]
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <span className="text-[10px] uppercase tracking-widest text-fg-muted">
          {label}
        </span>
      </div>
      {coins.length === 0 ? (
        <div className="text-xs text-fg-muted/60">—</div>
      ) : (
        <div className="space-y-1">
          {coins.map(([coin, amount]) => (
            <div
              key={coin}
              className="flex items-baseline justify-between text-sm"
            >
              <span className="text-fg-muted">{coin}</span>
              <span className="font-tnum text-fg">{fmtAmount(amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
