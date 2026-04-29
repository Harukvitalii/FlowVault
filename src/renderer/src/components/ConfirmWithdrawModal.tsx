import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Copy,
  Loader2,
  Play,
  RefreshCw,
  Send,
  X
} from 'lucide-react'
import type { Source } from '../data/sources'
import type {
  PreflightCheck,
  PreflightResult
} from '@shared/types'
import { familyLabel } from '@shared/networks'
import { formatEta } from '@shared/eta'
import { cn } from '../lib/cn'
import { useI18n } from '../lib/i18n'
import { Button } from './ui'

type Props = {
  source: Source
  dest: Source
  coin: string
  amount: number
  fee: number
  address: string
  tag?: string
  /** For CEX source: exchange network code. For EVM source: chain short. */
  network: string
  /** For EVM source: the chain id derived from `network` via CHAIN_TOKENS. */
  chainId?: number
  family: string
  onClose: () => void
  onSubmitted: () => void
}

type PreflightState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; result: PreflightResult }

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'ok'; txHash?: string; recordId?: string }
  | { kind: 'error'; message: string; hint?: string }

export function ConfirmWithdrawModal(props: Props) {
  const { t } = useI18n()
  const {
    source,
    dest,
    coin,
    amount,
    fee,
    address,
    tag,
    network,
    chainId,
    family,
    onClose,
    onSubmitted
  } = props

  const [ack, setAck] = useState(false)
  const [preflight, setPreflight] = useState<PreflightState>({ kind: 'idle' })
  const [submit, setSubmit] = useState<SubmitState>({ kind: 'idle' })
  const [skipPreflight, setSkipPreflight] = useState(false)
  const submitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Check if preflight is disabled in settings.
  useEffect(() => {
    window.api.prefs.get().then((p) => {
      if (p.skipPreflight) {
        setSkipPreflight(true)
        setPreflight({ kind: 'done', result: { ok: true, checks: [] } })
      }
    })
  }, [])

  // Cleanup timeout on unmount to avoid state updates on unmounted component.
  useEffect(() => {
    return () => {
      if (submitTimerRef.current) clearTimeout(submitTimerRef.current)
    }
  }, [])

  const receive = useMemo(() => Math.max(0, amount - fee), [amount, fee])

  const runPreflight = async () => {
    setPreflight({ kind: 'running' })
    if (source.kind === 'cex') {
      const r = await window.api.exchanges.preflight({
        accountId: source.id,
        coin,
        network,
        amount,
        address,
        tag
      })
      setPreflight({ kind: 'done', result: r })
    } else if (source.kind === 'evm' && chainId) {
      const r = await window.api.evm.preflight({
        walletId: source.id,
        coin,
        amount,
        chainId,
        toAddress: address
      })
      setPreflight({ kind: 'done', result: r })
    } else {
      setPreflight({
        kind: 'done',
        result: {
          ok: false,
          checks: [
            {
              label: 'Chain id',
              status: 'fail',
              detail: 'missing chain id for EVM send'
            }
          ]
        }
      })
    }
  }

  // Auto-run preflight on open and when relevant inputs change.
  useEffect(() => {
    if (!skipPreflight) runPreflight()
  }, [source.id, coin, amount, address, network, chainId, skipPreflight])

  const preflightOk =
    preflight.kind === 'done' && preflight.result.ok

  const canSubmit =
    ack && preflightOk && submit.kind !== 'submitting' && submit.kind !== 'ok'

  const doSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmit({ kind: 'submitting' })
    if (source.kind === 'cex') {
      const r = await window.api.exchanges.withdraw({
        accountId: source.id,
        coin,
        network,
        amount,
        address,
        tag,
        destLabel: dest.name
      })
      if (r.ok) {
        setSubmit({ kind: 'ok', recordId: r.recordId })
        submitTimerRef.current = setTimeout(onSubmitted, 1200)
      } else {
        setSubmit({
          kind: 'error',
          message: r.error ?? 'Unknown error',
          hint: r.hint
        })
      }
    } else if (source.kind === 'evm' && chainId) {
      const r = await window.api.evm.submit({
        walletId: source.id,
        coin,
        amount,
        chainId,
        toAddress: address,
        destCexAccountId: dest.kind === 'cex' ? dest.id : undefined,
        destLabel: dest.name
      })
      if (r.ok) {
        setSubmit({ kind: 'ok', txHash: r.txHash, recordId: r.recordId })
        submitTimerRef.current = setTimeout(onSubmitted, 1500)
      } else {
        setSubmit({
          kind: 'error',
          message: r.error ?? 'Unknown error'
        })
      }
    } else {
      setSubmit({
        kind: 'error',
        message: t('evmSendNoChainId')
      })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
      <div
        className={cn(
          'w-full max-w-xl rounded-card border border-white/[0.08]',
          'bg-[#0D1F1A]/95 shadow-glass backdrop-blur-xl relative',
          'max-h-[90vh] overflow-y-auto'
        )}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-lg text-fg-muted hover:text-fg hover:bg-white/[0.06] flex items-center justify-center transition-colors z-10"
          title={t('close')}
        >
          <X size={14} />
        </button>

        <form onSubmit={doSubmit} className="p-6 space-y-5">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-fg-muted mb-2">
              {t('review')} {source.kind === 'evm' ? t('onChainTransfer') : t('withdrawal')}
            </div>
            <div className="flex items-center gap-3">
              <Pill>{source.name}</Pill>
              <ArrowRight size={14} className="text-fg-muted" />
              <Pill>{dest.name}</Pill>
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-btn border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.04]">
            <Row
              label={t('send')}
              value={
                <span className="font-mono font-tnum">
                  {amount.toLocaleString('en-US', { maximumFractionDigits: 6 })}{' '}
                  {coin}
                </span>
              }
            />
            <Row
              label={t('network')}
              value={
                <>
                  <span className="font-medium">{network}</span>
                  {family && (
                    <span className="text-fg-muted ml-2">
                      · {familyLabel(family)} · ~{formatEta(family)}
                    </span>
                  )}
                </>
              }
            />
            {source.kind === 'cex' && (
              <Row
                label={t('exchangeFee')}
                value={
                  <span className="font-mono font-tnum">
                    {fee.toLocaleString('en-US', { maximumFractionDigits: 6 })}{' '}
                    {coin}
                  </span>
                }
              />
            )}
            {source.kind === 'cex' && (
              <Row
                label={t('recipientReceives')}
                value={
                  <span className="font-mono font-tnum text-accent font-semibold">
                    {receive.toLocaleString('en-US', {
                      maximumFractionDigits: 6
                    })}{' '}
                    {coin}
                  </span>
                }
              />
            )}
            <Row
              label={t('toAddress')}
              value={
                <span className="font-mono text-xs break-all">
                  {address}
                  <CopyBtn text={address} />
                </span>
              }
            />
            {tag && (
              <Row
                label={t('memoTag')}
                value={
                  <span className="font-mono text-xs">
                    {tag}
                    <CopyBtn text={tag} />
                  </span>
                }
              />
            )}
          </div>

          {/* Preflight */}
          {skipPreflight ? (
            <div className="rounded-btn border border-warn/20 bg-warn/5 p-3">
              <div className="flex items-center gap-2 text-xs text-warn">
                <AlertTriangle size={12} />
                {t('preflightSkipped')}
              </div>
            </div>
          ) : (
            <div className="rounded-btn border border-white/[0.08] bg-white/[0.02] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-widest text-fg-muted inline-flex items-center gap-1.5">
                  <Play size={10} />
                  {t('dryRun')} — {source.kind === 'evm' ? t('onChainSim') : t('apiPreflight')}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={runPreflight}
                  disabled={preflight.kind === 'running'}
                  className="h-7 px-2 text-[11px]"
                >
                  <RefreshCw
                    size={11}
                    className={cn(preflight.kind === 'running' && 'animate-spin')}
                  />
                  {t('rerun')}
                </Button>
              </div>

              {preflight.kind === 'idle' && (
                <div className="text-xs text-fg-muted">{t('queued')}</div>
              )}
              {preflight.kind === 'running' && (
                <div className="flex items-center gap-2 text-xs text-fg-muted">
                  <Loader2 size={12} className="animate-spin" />
                  {t('runningChecks')}
                </div>
              )}
              {preflight.kind === 'done' && (
                <PreflightPanel result={preflight.result} />
              )}
            </div>
          )}

          {/* Ack */}
          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              className="accent-accent mt-0.5"
            />
            <span className="text-xs text-fg-muted leading-relaxed">
              {t('confirmCheckbox')}
            </span>
          </label>

          {/* Status */}
          {submit.kind === 'error' && (
            <div className="rounded-btn border border-danger/30 bg-danger/10 p-3 space-y-1">
              <div className="flex items-start gap-2 text-xs text-danger">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                <span className="font-mono break-all">{submit.message}</span>
              </div>
              {submit.hint && (
                <div className="text-[11px] text-warn pl-5">
                  {t('hint')} {submit.hint}
                </div>
              )}
            </div>
          )}
          {submit.kind === 'ok' && (
            <div className="rounded-btn border border-accent/30 bg-accent/10 p-3 text-xs text-accent flex items-center gap-2">
              <Check size={12} />
              {submit.txHash
                ? `${t('broadcasted')} — ${submit.txHash.slice(0, 10)}…${submit.txHash.slice(-8)}`
                : t('submitted')}
            </div>
          )}

          <div className="flex items-center gap-2 justify-end pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('close')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!canSubmit}
              className="min-w-[180px]"
              title={
                !preflightOk
                  ? t('dryRun.mustPass')
                  : !ack
                    ? t('confirmCheckboxTick')
                    : undefined
              }
            >
              {submit.kind === 'submitting' ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  {t('submitting')}
                </>
              ) : submit.kind === 'ok' ? (
                <>
                  <Check size={14} />
                  {t('done')}
                </>
              ) : (
                <>
                  <Send size={14} />
                  {source.kind === 'evm' ? t('signBroadcast') : t('confirmWithdrawal')}
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function PreflightPanel({ result }: { result: PreflightResult }) {
  const { t } = useI18n()
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {result.checks.map((c, i) => (
          <CheckRow key={i} check={c} />
        ))}
      </div>
      {result.info && result.info.length > 0 && (
        <div className="pt-2 border-t border-white/[0.05] space-y-1">
          {result.info.map((row, i) => (
            <div
              key={i}
              className="flex items-center justify-between text-[11px]"
            >
              <span className="text-fg-muted">{row.label}</span>
              <span className="font-mono text-fg">{row.value}</span>
            </div>
          ))}
        </div>
      )}
      <div
        className={cn(
          'text-[11px] pt-2 border-t border-white/[0.05]',
          result.ok ? 'text-accent' : 'text-danger'
        )}
      >
        {result.ok
          ? t('allChecksPassed')
          : t('dryRunFailed')}
      </div>
    </div>
  )
}

function CheckRow({ check: c }: { check: PreflightCheck }) {
  const icon =
    c.status === 'ok' ? (
      <Check size={12} className="text-accent shrink-0" />
    ) : c.status === 'warn' ? (
      <AlertTriangle size={12} className="text-warn shrink-0" />
    ) : c.status === 'skip' ? (
      <Loader2 size={12} className="text-fg-muted/60 shrink-0" />
    ) : (
      <AlertTriangle size={12} className="text-danger shrink-0" />
    )
  const tone =
    c.status === 'ok'
      ? 'text-fg'
      : c.status === 'warn'
        ? 'text-warn'
        : c.status === 'skip'
          ? 'text-fg-muted'
          : 'text-danger'
  return (
    <div className="flex items-start gap-2 text-[11px]">
      <span className="mt-0.5">{icon}</span>
      <span className={cn('flex-1 min-w-0', tone)}>
        {c.label}
        {c.detail && (
          <span className="font-mono text-fg-muted/80 ml-2 break-all">
            · {c.detail}
          </span>
        )}
      </span>
    </div>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="h-7 px-3 rounded-full inline-flex items-center gap-1 text-xs font-medium bg-white/[0.04] border border-white/[0.08]">
      {children}
    </span>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-2.5 text-xs">
      <span className="text-fg-muted shrink-0">{label}</span>
      <span className="text-fg text-right">{value}</span>
    </div>
  )
}

function CopyBtn({ text }: { text: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation()
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
      className="ml-2 text-fg-muted hover:text-fg transition-colors align-middle"
      title={copied ? t('copied') : t('copy')}
    >
      <Copy size={12} />
    </button>
  )
}

