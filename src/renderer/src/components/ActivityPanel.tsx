import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Loader2,
  Trash2
} from 'lucide-react'
import type { DepositRecord, WithdrawRecord, WithdrawStatus } from '@shared/types'
import { familyLabel, networkFamily } from '@shared/networks'
import { GlassCard } from './GlassCard'
import { Button } from './ui'
import { cn } from '../lib/cn'
import { useI18n } from '../lib/i18n'

function short(s: string, head = 8, tail = 6): string {
  if (s.length <= head + tail + 1) return s
  return `${s.slice(0, head)}…${s.slice(-tail)}`
}

function ago(ts: number, now: number, t: (key: string) => string): string {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 10) return t('ago.justNow')
  if (s < 60) return t('ago.seconds').replace('{n}', String(s))
  const m = Math.round(s / 60)
  if (m < 60) return t('ago.minutes').replace('{n}', String(m))
  const h = Math.round(m / 60)
  if (h < 24) return t('ago.hours').replace('{n}', String(h))
  return t('ago.days').replace('{n}', String(Math.round(h / 24)))
}

function statusLabel(status: WithdrawStatus, t: (key: string) => string): string {
  return t(`status.${status}`)
}

type ActivityItem =
  | { type: 'withdraw'; record: WithdrawRecord; ts: number }
  | { type: 'deposit'; record: DepositRecord; ts: number }

export function ActivityPanel() {
  const { t } = useI18n()
  const [withdrawals, setWithdrawals] = useState<WithdrawRecord[] | null>(null)
  const [deposits, setDeposits] = useState<DepositRecord[]>([])
  const [collapsed, setCollapsed] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    window.api.withdrawals.list().then(setWithdrawals)
    const unsub = window.api.withdrawals.onUpdate((next) => {
      setWithdrawals(next.slice().sort((a, b) => b.submittedAt - a.submittedAt))
    })
    return unsub
  }, [])

  useEffect(() => {
    window.api.deposits.list().then(setDeposits)
    const unsub = window.api.deposits.onUpdate(setDeposits)
    return unsub
  }, [])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(t)
  }, [])

  const items: ActivityItem[] = useMemo(() => {
    const all: ActivityItem[] = []
    for (const r of withdrawals ?? []) {
      all.push({ type: 'withdraw', record: r, ts: r.submittedAt })
    }
    for (const r of deposits) {
      all.push({ type: 'deposit', record: r, ts: r.depositedAt })
    }
    return all.sort((a, b) => b.ts - a.ts)
  }, [withdrawals, deposits])

  const activeCount = useMemo(
    () =>
      items.filter((it) => {
        if (it.type === 'withdraw') {
          const s = it.record.status
          return s === 'submitting' || s === 'pending' || s === 'processing'
        }
        return it.record.status !== 'ok'
      }).length,
    [items]
  )

  if (withdrawals === null && deposits.length === 0) return null
  if (items.length === 0) return null

  return (
    <section>
      <div className="flex items-center justify-between mb-2 pl-1 pr-1">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-fg-muted hover:text-fg transition-colors"
        >
          {collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
          {t('activity')}
          <span className="text-fg-muted/60 ml-1">· {items.length}</span>
          {activeCount > 0 && (
            <span className="ml-2 text-[10px] text-accent normal-case tracking-normal">
              {activeCount} {t('inFlight')}
            </span>
          )}
        </button>
        <Button
          variant="ghost"
          onClick={async () => {
            if (activeCount > 0) return
            await window.api.withdrawals.clear()
          }}
          disabled={activeCount > 0}
          className="h-7 px-2 text-[11px]"
          title={
            activeCount > 0
              ? t('waitInFlight')
              : t('clearHistory')
          }
        >
          <Trash2 size={11} />
          {t('clear')}
        </Button>
      </div>

      {!collapsed && (
        <GlassCard className="divide-y divide-white/[0.05]">
          {items.map((it) =>
            it.type === 'withdraw' ? (
              <Row key={it.record.id} record={it.record} now={now} />
            ) : (
              <DepositRow key={it.record.id} record={it.record} now={now} />
            )
          )}
        </GlassCard>
      )}
    </section>
  )
}

function Row({ record, now }: { record: WithdrawRecord; now: number }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState<string | null>(null)
  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(text)
    setTimeout(() => setCopied(null), 1200)
  }

  const family = networkFamily(record.network)
  const explorer = explorerUrl(record)

  return (
    <div className="px-4 py-3 text-sm grid grid-cols-[auto_1fr_auto] gap-3 items-center">
      <StatusIcon status={record.status} />
      <div className="min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-mono font-tnum text-fg">
            {record.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })}{' '}
            {record.coin}
          </span>
          <span className="text-fg-muted text-xs">
            {record.exchangeLabel} → {record.destLabel ? `${record.destLabel} · ` : ''}{short(record.address, 6, 6)}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-fg-muted/70">
            {record.network} · {familyLabel(family)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-fg-muted mt-0.5">
          <StatusPill status={record.status} />
          <span>{ago(record.updatedAt, now, t)}</span>
          {record.fee > 0 && (
            <span className="font-mono">· fee {record.fee} {record.coin}</span>
          )}
          {record.hint && (
            <span className="text-warn truncate" title={record.hint}>
              · {record.hint}
            </span>
          )}
          {!record.hint && record.error && (
            <span
              className="text-danger font-mono truncate"
              title={record.error}
            >
              · {record.error}
            </span>
          )}
        </div>
        {record.chainTxHash && (
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-fg-muted mt-0.5">
            tx: {short(record.chainTxHash, 10, 8)}
            <button
              onClick={() => copy(record.chainTxHash!)}
              className="text-fg-muted/70 hover:text-fg transition-colors"
              title={t('copy')}
            >
              <Copy size={11} />
            </button>
            {copied === record.chainTxHash && (
              <span className="text-accent">{t('copied')}</span>
            )}
            {explorer && (
              <a
                href={explorer}
                target="_blank"
                rel="noreferrer"
                className="text-fg-muted/70 hover:text-fg transition-colors"
                title={t('viewExplorer')}
              >
                <ExternalLink size={11} />
              </a>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => copy(record.address)}
          className="w-7 h-7 rounded-md text-fg-muted hover:text-fg hover:bg-white/[0.06] inline-flex items-center justify-center"
          title={t('copyAddress')}
        >
          <Copy size={12} />
        </button>
        <button
          onClick={() => {
            if (record.status === 'submitting' || record.status === 'pending' || record.status === 'processing') return
            window.api.withdrawals.remove(record.id)
          }}
          disabled={record.status === 'submitting' || record.status === 'pending' || record.status === 'processing'}
          className={cn(
            'w-7 h-7 rounded-md inline-flex items-center justify-center',
            record.status === 'submitting' || record.status === 'pending' || record.status === 'processing'
              ? 'text-fg-muted/30 cursor-not-allowed'
              : 'text-fg-muted hover:text-danger hover:bg-white/[0.06]'
          )}
          title={
            record.status === 'submitting' || record.status === 'pending' || record.status === 'processing'
              ? t('waitSettle')
              : t('removeHistory')
          }
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}

function DepositRow({ record, now }: { record: DepositRecord; now: number }) {
  const { t } = useI18n()
  const DEPOSIT_LABEL: Record<string, string> = {
    pending: t('deposit.pending'),
    processing: t('deposit.processing'),
    ok: t('deposit.ok')
  }
  const pillTone =
    record.status === 'ok'
      ? 'text-accent border-accent/30 bg-accent/10'
      : 'text-fg-muted border-white/[0.08] bg-white/[0.03]'

  return (
    <div className="px-4 py-3 text-sm grid grid-cols-[auto_1fr] gap-3 items-center border-l-2 border-accent/40">
      {record.status === 'ok' ? (
        <ArrowDownLeft size={14} className="text-accent" />
      ) : (
        <Loader2 size={14} className="text-fg-muted animate-spin" />
      )}
      <div className="min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-mono font-tnum text-emerald-400">
            +{record.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })}{' '}
            {record.coin}
          </span>
          <span className="text-fg-muted text-xs">
            → {record.exchangeLabel}
          </span>
          {record.network && (
            <span className="text-[10px] uppercase tracking-wider text-fg-muted/70">
              {record.network}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-fg-muted mt-0.5">
          <span
            className={cn(
              'inline-flex items-center h-5 px-1.5 rounded-full text-[10px] uppercase tracking-wider font-semibold border',
              pillTone
            )}
          >
            {DEPOSIT_LABEL[record.status] ?? record.status}
          </span>
          <span>{ago(record.depositedAt, now, t)}</span>
        </div>
      </div>
    </div>
  )
}

function StatusIcon({ status }: { status: WithdrawStatus }) {
  if (status === 'ok') return <Check size={14} className="text-accent" />
  if (status === 'failed')
    return <AlertTriangle size={14} className="text-danger" />
  return <Loader2 size={14} className="text-fg-muted animate-spin" />
}

function StatusPill({ status }: { status: WithdrawStatus }) {
  const { t } = useI18n()
  const tone =
    status === 'ok'
      ? 'text-accent border-accent/30 bg-accent/10'
      : status === 'failed'
        ? 'text-danger border-danger/30 bg-danger/10'
        : 'text-fg-muted border-white/[0.08] bg-white/[0.03]'
  return (
    <span
      className={cn(
        'inline-flex items-center h-5 px-1.5 rounded-full text-[10px] uppercase tracking-wider font-semibold border',
        tone
      )}
    >
      {statusLabel(status, t)}
    </span>
  )
}

function explorerUrl(record: WithdrawRecord): string | null {
  if (!record.chainTxHash) return null
  const fam = networkFamily(record.network)
  const BASES: Record<string, string> = {
    ETH: 'https://etherscan.io/tx/',
    BSC: 'https://bscscan.com/tx/',
    ARB: 'https://arbiscan.io/tx/',
    OP: 'https://optimistic.etherscan.io/tx/',
    BASE: 'https://basescan.org/tx/',
    MATIC: 'https://polygonscan.com/tx/',
    AVAX: 'https://snowscan.xyz/tx/',
    TRX: 'https://tronscan.org/#/transaction/',
    SOL: 'https://solscan.io/tx/',
    BTC: 'https://mempool.space/tx/'
  }
  const base = BASES[fam]
  return base ? base + record.chainTxHash : null
}
