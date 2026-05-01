import { FormEvent, useEffect, useState } from 'react'
import {
  AlertTriangle,
  Check,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Wifi,
  X
} from 'lucide-react'
import { GlassCard } from './GlassCard'
import { Button, Input, Row } from './ui'
import { cn } from '../lib/cn'
import { EXCHANGE_META } from '../data/sources'
import { needsPassphrase } from '@shared/exchanges'
import { sanitizeAddressInput } from '@shared/addresses'
import type {
  ConnectionTestResult,
  ExchangeAccountMeta,
  ExchangeId
} from '@shared/types'

const EXCHANGE_ORDER: ExchangeId[] = [
  'binance',
  'bybit',
  'okx',
  'bitget',
  'gate',
  'kucoin',
  'htx',
  'mexc',
  'phemex'
]

const EXCHANGES: {
  id: ExchangeId
  name: string
  short: string
  accent: string
}[] = EXCHANGE_ORDER.map((id) => ({
  id,
  name: EXCHANGE_META[id].displayName,
  short: EXCHANGE_META[id].short,
  accent: EXCHANGE_META[id].accent
}))

type FormState = {
  mode: 'create' | 'edit'
  exchange: ExchangeId
  accountId?: string
  initialLabel?: string
}

type TestState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; result: ConnectionTestResult }

export function ExchangesTab() {
  const [list, setList] = useState<ExchangeAccountMeta[]>([])
  const [form, setForm] = useState<FormState | null>(null)
  const [tests, setTests] = useState<Record<string, TestState>>({})

  const refresh = async () => setList(await window.api.exchanges.list())

  useEffect(() => {
    refresh()
  }, [])

  const runTest = async (accountId: string) => {
    setTests((prev) => ({ ...prev, [accountId]: { status: 'running' } }))
    const result = await window.api.exchanges.test(accountId)
    setTests((prev) => ({
      ...prev,
      [accountId]: { status: 'done', result }
    }))
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-fg-muted">
        Add multiple accounts per exchange (sub-accounts, different labels).
        Each label must be unique within the exchange.
      </p>

      {EXCHANGES.map((ex) => {
        const accounts = list.filter((x) => x.exchange === ex.id)
        const isAdding =
          form?.mode === 'create' && form.exchange === ex.id
        return (
          <section key={ex.id} className="space-y-2">
            <header className="flex items-center gap-3 pl-1">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold"
                style={{
                  background: ex.accent + '22',
                  color: ex.accent,
                  border: `1px solid ${ex.accent}33`
                }}
              >
                {ex.short}
              </div>
              <h3 className="text-sm font-semibold text-fg">{ex.name}</h3>
              <span className="text-xs text-fg-muted">
                {accounts.length
                  ? `${accounts.length} account${accounts.length > 1 ? 's' : ''}`
                  : 'none'}
              </span>
              <div className="flex-1" />
              <Button
                variant={isAdding ? 'ghost' : 'secondary'}
                onClick={() =>
                  setForm(
                    isAdding ? null : { mode: 'create', exchange: ex.id }
                  )
                }
                className="h-8 px-3 text-xs"
              >
                {isAdding ? <X size={13} /> : <Plus size={13} />}
                {isAdding ? 'Cancel' : 'Add account'}
              </Button>
            </header>

            {accounts.length === 0 && !isAdding && (
              <GlassCard className="px-4 py-3 text-xs text-fg-muted/80">
                No {ex.name} accounts yet.
              </GlassCard>
            )}

            {accounts.map((acc) => {
              const editing =
                form?.mode === 'edit' && form.accountId === acc.accountId
              const testState = tests[acc.accountId] ?? { status: 'idle' }
              return (
                <GlassCard key={acc.accountId} className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-fg truncate">
                        {acc.label}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-fg-muted">
                        <span className="font-mono font-tnum">
                          {acc.apiKeyPreview}
                        </span>
                        {acc.hasPassphrase && (
                          <span className="text-[10px] uppercase tracking-wider text-accent/80 border border-accent/30 rounded px-1.5">
                            passphrase
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() => runTest(acc.accountId)}
                      disabled={testState.status === 'running'}
                      className="h-9 px-3 text-xs"
                      title="Test connection"
                    >
                      {testState.status === 'running' ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Wifi size={14} />
                      )}
                      Test
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setForm(
                          editing
                            ? null
                            : {
                                mode: 'edit',
                                exchange: acc.exchange,
                                accountId: acc.accountId,
                                initialLabel: acc.label
                              }
                        )
                      }
                      className="h-9 px-3 text-xs"
                    >
                      {editing ? <X size={14} /> : <Pencil size={14} />}
                      {editing ? 'Cancel' : 'Edit'}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        await window.api.exchanges.remove(acc.accountId)
                        setForm(null)
                        refresh()
                      }}
                      className="h-9 px-3 text-xs hover:text-danger"
                      title="Remove account"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>

                  {testState.status === 'done' && (
                    <TestPanel
                      result={testState.result}
                      onClose={() =>
                        setTests((prev) => ({
                          ...prev,
                          [acc.accountId]: { status: 'idle' }
                        }))
                      }
                    />
                  )}

                  {editing && (
                    <ExchangeForm
                      exchange={acc.exchange}
                      accountId={acc.accountId}
                      initialLabel={acc.label}
                      onDone={() => {
                        setForm(null)
                        refresh()
                      }}
                    />
                  )}
                </GlassCard>
              )
            })}

            {isAdding && (
              <GlassCard className="p-4">
                <ExchangeForm
                  exchange={ex.id}
                  onDone={() => {
                    setForm(null)
                    refresh()
                  }}
                />
              </GlassCard>
            )}
          </section>
        )
      })}
    </div>
  )
}

function TestPanel({
  result,
  onClose
}: {
  result: ConnectionTestResult
  onClose: () => void
}) {
  const publicStep = result.steps.find((s) => s.name === 'public')
  const signedStep = result.steps.find((s) => s.name === 'signed')
  return (
    <div className="mt-4 pt-4 border-t border-white/[0.06] space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-widest text-fg-muted">
          Connection test
        </span>
        <button
          onClick={onClose}
          className="text-xs text-fg-muted hover:text-fg"
        >
          <X size={13} />
        </button>
      </div>
      {publicStep && (
        <StepRow
          label="Public endpoint"
          status={publicStep.status}
          latencyMs={publicStep.latencyMs}
          detail={publicStep.detail}
        />
      )}
      {signedStep && (
        <StepRow
          label="Signed request (bypasses ccxt)"
          status={signedStep.status}
          latencyMs={signedStep.latencyMs}
          detail={signedStep.detail}
        />
      )}
      <Diagnosis public={publicStep} signed={signedStep} />
    </div>
  )
}

function StepRow({
  label,
  status,
  latencyMs,
  detail
}: {
  label: string
  status: 'ok' | 'fail' | 'skip'
  latencyMs?: number
  detail?: string
}) {
  const tone =
    status === 'ok'
      ? 'text-accent'
      : status === 'fail'
        ? 'text-danger'
        : 'text-fg-muted'
  const Icon =
    status === 'ok' ? Check : status === 'fail' ? AlertTriangle : Wifi
  return (
    <div className="flex items-start gap-3 text-xs">
      <Icon size={14} className={cn('mt-0.5 shrink-0', tone)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-fg">{label}</span>
          {latencyMs != null && (
            <span className="font-mono font-tnum text-fg-muted">
              {latencyMs}ms
            </span>
          )}
          <span className={cn('text-[10px] uppercase tracking-wider', tone)}>
            {status}
          </span>
        </div>
        {detail && (
          <div className="font-mono text-[11px] text-fg-muted/80 mt-0.5 break-all">
            {detail}
          </div>
        )}
      </div>
    </div>
  )
}

function Diagnosis({
  public: pub,
  signed
}: {
  public?: { status: 'ok' | 'fail' | 'skip' }
  signed?: { status: 'ok' | 'fail' | 'skip' }
}) {
  if (!pub || !signed) return null
  let text = ''
  let tone = 'text-fg-muted'
  if (pub.status === 'ok' && signed.status === 'ok') {
    text =
      '✓ Everything works. If balance fetch still times out, ccxt might be doing retry loops — raise timeout or check account type (Classic vs Unified).'
    tone = 'text-accent'
  } else if (pub.status !== 'ok' && signed.status !== 'ok') {
    text =
      'Network issue — public endpoint also fails. ISP/firewall/geo block. Try VPN.'
    tone = 'text-danger'
  } else if (pub.status === 'ok' && signed.status !== 'ok') {
    text =
      'Network OK, but signed request fails. Check: (1) API key status on the exchange, (2) IP whitelist matches your current IP, (3) key has "Read / Wallet" permission.'
    tone = 'text-warn'
  }
  return text ? (
    <div className={cn('text-xs pt-2 border-t border-white/[0.05]', tone)}>
      {text}
    </div>
  ) : null
}

function ExchangeForm({
  exchange,
  accountId,
  initialLabel,
  onDone
}: {
  exchange: ExchangeId
  accountId?: string
  initialLabel?: string
  onDone: () => void
}) {
  const requiresPassphrase = needsPassphrase(exchange)
  const [label, setLabel] = useState(initialLabel ?? '')
  const [apiKey, setApiKey] = useState('')
  const [secret, setSecret] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const r = await window.api.exchanges.upsert({
      accountId,
      exchange,
      label,
      apiKey: sanitizeAddressInput(apiKey),
      secret: sanitizeAddressInput(secret),
      passphrase: requiresPassphrase ? sanitizeAddressInput(passphrase) : undefined
    })
    setBusy(false)
    if (!r.ok) setError(r.error ?? 'Failed')
    else onDone()
  }

  return (
    <form
      onSubmit={submit}
      className="pt-4 mt-1 border-t border-white/[0.06] space-y-3"
    >
      <Row label="Label">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Main · Sub-1 · Arb-acct"
          autoFocus
        />
      </Row>
      <Row label={accountId ? 'API key (re-enter)' : 'API key'}>
        <Input
          mono
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
        />
      </Row>
      <Row label={accountId ? 'Secret (re-enter)' : 'Secret'}>
        <Input
          mono
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          autoComplete="new-password"
        />
      </Row>
      {requiresPassphrase && (
        <Row label="Passphrase">
          <Input
            mono
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            autoComplete="new-password"
          />
        </Row>
      )}
      {error && <div className="text-xs text-danger">{error}</div>}
      <div className="flex items-center gap-2 justify-end">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Saving…' : accountId ? 'Save changes' : 'Add account'}
        </Button>
      </div>
    </form>
  )
}
