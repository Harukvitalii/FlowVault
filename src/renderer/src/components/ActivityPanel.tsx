import { useEffect, useMemo, useState } from 'react'
import { List, type RowComponentProps } from 'react-window'
import {
  AlertTriangle,
  ArrowDownLeft,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Trash2
} from 'lucide-react'
import type { DepositRecord, WithdrawRecord, WithdrawStatus } from '@shared/types'
import { familyLabel, networkFamily } from '@shared/networks'
import { shortAddr } from '@shared/format'
import { GlassCard } from './GlassCard'
import { Button } from './ui'
import { CopyButton } from './CopyButton'
import { cn } from '../lib/cn'
import { useI18n } from '../lib/i18n'

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

const ROW_HEIGHT = 88
const VIRTUALIZE_THRESHOLD = 30
const MAX_LIST_PX = 600

type ActivityRowProps = { items: ActivityItem[]; now: number }

function ActivityRow({
  index,
  style,
  items,
  now
}: RowComponentProps<ActivityRowProps>) {
  const it = items[index]
  if (!it) return null
  return (
    <div
      style={style}
      className="border-b border-white/[0.05] overflow-hidden"
    >
      {it.type === 'withdraw' ? (
        <Row record={it.record} now={now} />
      ) : (
        <DepositRow record={it.record} now={now} />
      )}
    </div>
  )
}

export function ActivityPanel() {
  const { t } = useI18n()
  const [withdrawals, setWithdrawals] = useState<WithdrawRecord[] | null>(null)
  const [deposits, setDeposits] = useState<DepositRecord[]>([])
  const [collapsed, setCollapsed] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    // Subscribe first so any push that fires while list() is in flight is
    // captured; mark `live` so the late list() resolution doesn't overwrite
    // a fresher snapshot from the push channel.
    let cancelled = false
    let live = false
    const sortDesc = (rs: WithdrawRecord[]) =>
      rs.slice().sort((a, b) => b.submittedAt - a.submittedAt)
    const unsub = window.api.withdrawals.onUpdate((next) => {
      if (cancelled) return
      live = true
      setWithdrawals(sortDesc(next))
    })
    window.api.withdrawals
      .list()
      .then((data) => {
        if (cancelled || live) return
        setWithdrawals(sortDesc(data))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let live = false
    const unsub = window.api.deposits.onUpdate((next) => {
      if (cancelled) return
      live = true
      setDeposits(next)
    })
    window.api.deposits
      .list()
      .then((data) => {
        if (cancelled || live) return
        setDeposits(data)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      unsub()
    }
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
        items.length <= VIRTUALIZE_THRESHOLD ? (
          <GlassCard className="divide-y divide-white/[0.05]">
            {items.map((it) =>
              it.type === 'withdraw' ? (
                <Row key={it.record.id} record={it.record} now={now} />
              ) : (
                <DepositRow key={it.record.id} record={it.record} now={now} />
              )
            )}
          </GlassCard>
        ) : (
          // Virtualized for long histories — only the rows in the viewport
          // are mounted, so the 15s `now` tick stops re-rendering 100+ rows.
          <GlassCard className="p-0 overflow-hidden">
            <List
              rowCount={items.length}
              rowHeight={ROW_HEIGHT}
              rowComponent={ActivityRow}
              rowProps={{ items, now }}
              style={{
                height: Math.min(items.length * ROW_HEIGHT, MAX_LIST_PX)
              }}
            />
          </GlassCard>
        )
      )}
    </section>
  )
}

function Row({ record, now }: { record: WithdrawRecord; now: number }) {
  const { t } = useI18n()
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
            {record.exchangeLabel} → {record.destLabel ? `${record.destLabel} · ` : ''}{shortAddr(record.address)}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-fg-muted/70">
            {record.network} · {familyLabel(family)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-fg-muted mt-0.5">
          <StatusPill status={record.status} />
          <span>{ago(record.updatedAt, now, t)}</span>
          {record.fee > 0 && (
            <span className="font-mono font-tnum">· fee {record.fee} {record.coin}</span>
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
          <div className="flex items-center gap-1.5 text-[11px] font-mono font-tnum text-fg-muted mt-0.5">
            tx: {shortAddr(record.chainTxHash, 10, 8)}
            <CopyButton value={record.chainTxHash} size={11} title={t('copy')} />
            {explorer && (
              <a
                href={explorer}
                target="_blank"
                rel="noreferrer"
                className="text-fg-muted/70 hover:text-fg transition-colors"
                title={t('viewExplorer')}
                aria-label={t('viewExplorer')}
              >
                <ExternalLink size={11} />
              </a>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <CopyButton
          value={record.address}
          size={12}
          title={t('copyAddress')}
          className="w-7 h-7 rounded-md hover:bg-white/[0.06]"
        />
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
          <StatusPill
            status={record.status}
            label={DEPOSIT_LABEL[record.status] ?? record.status}
          />
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

/**
 * Status palette shared by withdrawals and deposits. In-flight states get a
 * pulsing amber dot so the eye is drawn to rows that still need attention.
 *   submitting/pending/processing → amber + pulse
 *   ok                            → accent green
 *   failed                        → danger red
 */
function StatusPill({
  status,
  label
}: {
  status: WithdrawStatus | 'pending' | 'processing' | 'ok'
  /** Override the default i18n withdraw label (e.g. for deposit-side wording). */
  label?: string
}) {
  const { t } = useI18n()
  const inFlight =
    status === 'submitting' || status === 'pending' || status === 'processing'
  const tone =
    status === 'ok'
      ? 'text-accent border-accent/30 bg-accent/10'
      : status === 'failed'
        ? 'text-danger border-danger/30 bg-danger/10'
        : 'text-warn border-warn/30 bg-warn/10'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 h-5 px-1.5 rounded-full text-[10px] uppercase tracking-wider font-semibold border',
        tone
      )}
    >
      {inFlight && (
        <span className="relative inline-flex w-1.5 h-1.5">
          <span className="absolute inset-0 rounded-full bg-warn animate-ping opacity-70" />
          <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-warn" />
        </span>
      )}
      {label ?? statusLabel(status as WithdrawStatus, t)}
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
