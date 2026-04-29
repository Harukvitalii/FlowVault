import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Copy,
  Loader2,
  MoveRight,
  Sparkles
} from 'lucide-react'
import type {
  DepositAddressEntry,
  ExchangeId,
  NetworkInfo
} from '@shared/types'
import {
  familyLabel,
  isEvmFamily,
  networkFamily
} from '@shared/networks'
import {
  TRANSFER_TYPES,
  WITHDRAW_TYPE as SHARED_WITHDRAW_TYPE,
  transferTypeLabel
} from '@shared/exchanges'
import { isValidAddress, addressFormatHint, networkClassOf } from '@shared/addresses'
import { etaMinutes, formatEta } from '@shared/eta'
import { ConfirmWithdrawModal } from './ConfirmWithdrawModal'
import type { Source } from '../data/sources'
import { SUPPORTED_COINS, type CoinSymbol } from '../data/sources'
import { GlassCard } from './GlassCard'
import { Button } from './ui'
import { cn } from '../lib/cn'
import { useI18n } from '../lib/i18n'

const WITHDRAW_TYPE = SHARED_WITHDRAW_TYPE

type Props = {
  source: Source
  sources: Source[]
  onRefresh?: () => void | Promise<void>
}

type NetworkState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; networks: NetworkInfo[] }
  | { status: 'error'; message: string }

type AddressState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; addresses: DepositAddressEntry[] }
  | { status: 'error'; message: string }

type Mode = 'cex-cex' | 'cex-evm' | 'evm-cex' | 'evm-evm' | 'none'

export function ActionPanel({ source, sources, onRefresh }: Props) {
  const { t } = useI18n()
  const destinations = useMemo(
    () => sources.filter((s) => s.id !== source.id),
    [sources, source.id]
  )
  const [destId, setDestId] = useState(destinations[0]?.id ?? '')
  // Reset destId when the current one is no longer in the destinations list.
  useEffect(() => {
    if (destId && !destinations.some((d) => d.id === destId)) {
      setDestId(destinations[0]?.id ?? '')
    }
  }, [destinations, destId])
  const dest = destinations.find((s) => s.id === destId) ?? null

  // Available coins from source balances.
  const availableCoins = useMemo(() => {
    if (!source.balances) return SUPPORTED_COINS
    const owned = new Set(source.balances.map((b) => b.asset))
    return SUPPORTED_COINS.filter((c) => owned.has(c))
  }, [source.balances])

  const [coin, setCoin] = useState<CoinSymbol>(
    (availableCoins[0] ?? 'USDT') as CoinSymbol
  )
  useEffect(() => {
    if (!availableCoins.includes(coin) && availableCoins[0]) {
      setCoin(availableCoins[0] as CoinSymbol)
    }
  }, [availableCoins, coin])

  const mode: Mode = !dest
    ? 'none'
    : source.kind === 'cex' && dest.kind === 'cex'
      ? 'cex-cex'
      : source.kind === 'cex' && dest.kind === 'evm'
        ? 'cex-evm'
        : source.kind === 'evm' && dest.kind === 'cex'
          ? 'evm-cex'
          : source.kind === 'evm' && dest.kind === 'evm'
            ? 'evm-evm'
            : 'none'

  // ---------------- Source side ----------------
  // Either a CEX withdraw-network picker OR, for EVM source, a source-chain
  // picker derived from on-chain balances of the selected coin.
  const needsSourceNets = source.kind === 'cex'
  const [sourceNets, setSourceNets] = useState<NetworkState>({ status: 'idle' })
  useEffect(() => {
    let cancelled = false
    if (!needsSourceNets) {
      setSourceNets({ status: 'ok', networks: [] })
      return
    }
    // Only show "Loading…" if the call takes >80ms — cache hits are instant.
    const timer = setTimeout(() => {
      if (!cancelled) setSourceNets({ status: 'loading' })
    }, 80)
    window.api.exchanges.getNetworks(source.id, coin).then((r) => {
      clearTimeout(timer)
      if (cancelled) return
      setSourceNets(
        r.ok
          ? { status: 'ok', networks: r.networks ?? [] }
          : { status: 'error', message: r.error ?? 'failed' }
      )
    })
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [source.id, needsSourceNets, coin])

  const evmSourceChains = useMemo(() => {
    if (source.kind !== 'evm') return []
    return (source.balances ?? [])
      .filter((b) => b.asset === coin && b.chain && b.free > 0)
      .map((b) => ({
        chainShort: b.chain!,
        chainId: b.chainId ?? 0,
        free: b.free
      }))
  }, [source, coin])

  // ---------------- Dest side ----------------
  const needsDestNets = dest?.kind === 'cex'
  const [destNets, setDestNets] = useState<NetworkState>({ status: 'idle' })
  useEffect(() => {
    let cancelled = false
    if (!dest || !needsDestNets) {
      setDestNets({ status: 'ok', networks: [] })
      return
    }
    const timer = setTimeout(() => {
      if (!cancelled) setDestNets({ status: 'loading' })
    }, 80)
    window.api.exchanges.getNetworks(dest.id, coin).then((r) => {
      clearTimeout(timer)
      if (cancelled) return
      setDestNets(
        r.ok
          ? { status: 'ok', networks: r.networks ?? [] }
          : { status: 'error', message: r.error ?? 'failed' }
      )
    })
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [dest, needsDestNets, coin])

  // Selections
  const [withdrawNet, setWithdrawNet] = useState('') // CEX source: network code; EVM source: chain short
  const [depositNet, setDepositNet] = useState('') // CEX dest: network code
  const [touchedSource, setTouchedSource] = useState(false)
  const [touchedDest, setTouchedDest] = useState(false)

  useEffect(() => {
    setWithdrawNet('')
    setDepositNet('')
    setTouchedSource(false)
    setTouchedDest(false)
  }, [source.id, destId, coin])

  const withdrawList =
    sourceNets.status === 'ok'
      ? sourceNets.networks.filter((n) => n.withdrawEnabled)
      : []
  const depositList =
    destNets.status === 'ok'
      ? destNets.networks.filter((n) => n.depositEnabled)
      : []

  const withdrawInfo = withdrawList.find((n) => n.network === withdrawNet)
  const depositInfo = depositList.find((n) => n.network === depositNet)

  const setWithdrawNetTouched = (v: string) => {
    setTouchedSource(true)
    setWithdrawNet(v)
    // Mirror: auto-pick the same family on the deposit side so the chain
    // stays in sync without a second click.
    if (!v) return
    const fam = networkFamily(v)
    if (!fam) return
    const match = depositList.find(
      (n) => n.depositEnabled && networkFamily(n.network) === fam
    )
    if (match) setDepositNet(match.network)
  }
  const setDepositNetTouched = (v: string) => {
    setTouchedDest(true)
    setDepositNet(v)
    if (!v) return
    const fam = networkFamily(v)
    if (!fam) return
    // For EVM sources, mirror by setting the source-chain short (which is
    // itself a family-like code). For CEX, look up a matching withdraw
    // network and use its code.
    if (source.kind === 'evm') {
      const chain = evmSourceChains.find(
        (c) => networkFamily(c.chainShort) === fam
      )
      if (chain) setWithdrawNet(chain.chainShort)
      return
    }
    const match = withdrawList.find(
      (n) => n.withdrawEnabled && networkFamily(n.network) === fam
    )
    if (match) setWithdrawNet(match.network)
  }

  // Source-side family: from exchange network OR from EVM chain short.
  const sourceFamily =
    source.kind === 'cex'
      ? withdrawInfo
        ? networkFamily(withdrawInfo.network)
        : ''
      : withdrawNet
        ? networkFamily(withdrawNet)
        : ''
  const destFamily = depositInfo ? networkFamily(depositInfo.network) : ''

  // ---------------- Smart pick ----------------
  // Declared AFTER sourceFamily/destFamily so the closures don't hit a
  // temporal-dead-zone error on first render.
  const smartSourcePick = useMemo(() => {
    if (source.kind !== 'cex' || sourceNets.status !== 'ok') return ''
    const candidates = sourceNets.networks.filter((n) => {
      if (!n.withdrawEnabled) return false
      if (dest?.kind === 'evm') return isEvmFamily(networkFamily(n.network))
      if (destFamily) return networkFamily(n.network) === destFamily
      return true
    })
    if (candidates.length === 0) return ''
    let best = candidates[0]!
    for (const c of candidates) {
      if (smartPickScore(c) < smartPickScore(best)) best = c
    }
    return best.network
  }, [source.kind, sourceNets, dest, destFamily])

  const smartDestPick = useMemo(() => {
    if (dest?.kind !== 'cex' || destNets.status !== 'ok') return ''
    const candidates = destNets.networks.filter((n) => {
      if (!n.depositEnabled) return false
      if (source.kind === 'evm') return isEvmFamily(networkFamily(n.network))
      if (sourceFamily) return networkFamily(n.network) === sourceFamily
      return true
    })
    if (candidates.length === 0) return ''
    let best = candidates[0]!
    for (const c of candidates) {
      if (smartPickScore(c) < smartPickScore(best)) best = c
    }
    return best.network
  }, [dest, destNets, source.kind, sourceFamily])

  // Auto-adopt smart pick on first render after networks load (but never
  // overwrite a user's explicit click).
  useEffect(() => {
    if (!touchedSource && smartSourcePick && !withdrawNet) {
      setWithdrawNet(smartSourcePick)
    }
  }, [smartSourcePick, touchedSource, withdrawNet])
  useEffect(() => {
    if (!touchedDest && smartDestPick && !depositNet) {
      setDepositNet(smartDestPick)
    }
  }, [smartDestPick, touchedDest, depositNet])

  // Mode-aware cross-chain compatibility. For EVM destinations, we require
  // the source network to actually be EVM-compatible; for EVM sources, the
  // destination network must be EVM. For cex-cex, families must match exactly.
  type Compat =
    | { kind: 'pending' } // not enough input yet
    | { kind: 'ok'; family: string }
    | { kind: 'bad'; reason: string }

  const compat: Compat = (() => {
    if (mode === 'cex-cex') {
      if (!sourceFamily || !destFamily) return { kind: 'pending' }
      return sourceFamily === destFamily
        ? { kind: 'ok', family: sourceFamily }
        : {
            kind: 'bad',
            reason: t('differentChains').replace('{a}', familyLabel(sourceFamily)).replace('{b}', familyLabel(destFamily))
          }
    }
    if (mode === 'cex-evm') {
      if (!sourceFamily) return { kind: 'pending' }
      return isEvmFamily(sourceFamily)
        ? { kind: 'ok', family: sourceFamily }
        : {
            kind: 'bad',
            reason: t('notEvmCompatible').replace('{chain}', familyLabel(sourceFamily))
          }
    }
    if (mode === 'evm-cex') {
      if (!sourceFamily || !destFamily) return { kind: 'pending' }
      if (!isEvmFamily(destFamily)) {
        return {
          kind: 'bad',
          reason: t('cannotSendFromEvm').replace('{chain}', familyLabel(destFamily))
        }
      }
      return sourceFamily === destFamily
        ? { kind: 'ok', family: sourceFamily }
        : {
            kind: 'bad',
            reason: t('differentChains').replace('{a}', familyLabel(sourceFamily)).replace('{b}', familyLabel(destFamily))
          }
    }
    if (mode === 'evm-evm') {
      if (!sourceFamily) return { kind: 'pending' }
      return { kind: 'ok', family: sourceFamily }
    }
    return { kind: 'pending' }
  })()

  const familiesMatch = compat.kind !== 'bad'

  // ---------------- Deposit address(es) ----------------
  const [addr, setAddr] = useState<AddressState>({ status: 'idle' })
  const [selectedAddr, setSelectedAddr] = useState<string>('')
  // Use depositNet directly so switching networks clears immediately.
  const depositNetworkCode = depositInfo?.network ?? ''
  useEffect(() => {
    let cancelled = false
    // Clear immediately on any change — never show stale address from another network.
    setAddr({ status: 'idle' })
    setSelectedAddr('')
    if (!dest) return
    if (dest.kind === 'evm') {
      if (dest.address) {
        setAddr({ status: 'ok', addresses: [{ address: dest.address }] })
        setSelectedAddr(dest.address)
      }
      return
    }
    if (!depositNetworkCode) return
    const timer = setTimeout(() => {
      if (!cancelled) setAddr({ status: 'loading' })
    }, 80)
    window.api.exchanges
      .getDepositAddresses(dest.id, coin, depositNetworkCode)
      .then((r) => {
        clearTimeout(timer)
        if (cancelled) return
        if (r.ok && r.addresses && r.addresses.length > 0) {
          // Validate addresses match the expected network before showing
          const family = networkFamily(depositNetworkCode)
          const validated = r.addresses.filter(
            (a) => !family || isValidAddress(family, a.address) || networkClassOf(family) === 'other'
          )
          if (validated.length > 0) {
            setAddr({ status: 'ok', addresses: validated })
            setSelectedAddr(validated[0]!.address)
          } else {
            // Exchange returned address that doesn't match the network format
            setAddr({ status: 'error', message: t('addrFormatMismatch') })
          }
        } else {
          setAddr({ status: 'error', message: r.error ?? 'failed' })
        }
      })
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [dest?.id, dest?.kind, dest?.address, depositNetworkCode, coin])

  const selectedAddrEntry =
    addr.status === 'ok'
      ? addr.addresses.find((a) => a.address === selectedAddr) ??
        addr.addresses[0]
      : undefined

  // ---------------- Amount ----------------
  // For CEX sources, `withdraw()` only pulls from one account type; balances
  // held elsewhere need an internal transfer first.
  const withdrawType =
    source.kind === 'cex' && source.exchange
      ? WITHDRAW_TYPE[source.exchange] ?? 'spot'
      : null

  const typeBreakdown: { type: string; free: number }[] = useMemo(() => {
    if (source.kind !== 'cex' || !source.balances) return []
    return source.balances
      .filter((b) => b.asset === coin && b.accountType && b.free > 0)
      .map((b) => ({ type: b.accountType!, free: b.free }))
  }, [source, coin])

  const withdrawableNow =
    typeBreakdown.find((b) => b.type === withdrawType)?.free ?? 0
  const totalCexForCoin = typeBreakdown.reduce((s, b) => s + b.free, 0)

  const maxAmount = useMemo(() => {
    if (!source.balances) return 0
    const matching = source.balances.filter((b) => b.asset === coin)
    if (source.kind === 'evm' && withdrawNet) {
      const bal = matching.find((b) => b.chain === withdrawNet)
      return bal?.free ?? 0
    }
    // CEX: cap at what's actually withdrawable from the withdraw-type wallet.
    if (source.kind === 'cex') return withdrawableNow
    return matching.reduce((sum, b) => sum + b.free, 0)
  }, [source, coin, withdrawNet, withdrawableNow])

  const [amountStr, setAmountStr] = useState('')
  const amount = Number(amountStr) || 0
  const fee = withdrawInfo?.fee ?? 0
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Address format sanity check on the selected entry.
  // For watch-only wallets with a known network, use that network's family.
  const destWalletFamily = dest?.network ? networkFamily(dest.network) : ''
  const addressFamily = destWalletFamily || destFamily || sourceFamily
  const addressOk =
    selectedAddrEntry && addressFamily
      ? isValidAddress(addressFamily, selectedAddrEntry.address)
      : null

  const canSubmit =
    !!dest &&
    ((source.kind === 'cex' && !!withdrawInfo) ||
      (source.kind === 'evm' && !!withdrawNet)) &&
    (mode === 'cex-cex' || mode === 'evm-cex' ? !!depositInfo : true) &&
    familiesMatch &&
    !!selectedAddrEntry &&
    addressOk !== false &&
    amount > 0 &&
    amount <= maxAmount &&
    (withdrawInfo ? amount >= (withdrawInfo.minWithdraw ?? 0) : true)

  return (
    <GlassCard className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex items-center gap-3 shrink-0 h-8">
          <div className="text-[10px] uppercase tracking-widest text-fg-muted">
            {t('from')}
          </div>
          <div className="h-8 px-3 rounded-full inline-flex items-center gap-2 bg-white/[0.04] border border-white/[0.08]">
            <span className="text-sm font-medium text-fg">{source.name}</span>
            <span className="text-[10px] uppercase tracking-wider text-fg-muted border border-white/[0.08] rounded px-1.5 py-0.5">
              {source.kind.toUpperCase()}
            </span>
          </div>
          <ArrowRight size={16} className="text-fg-muted" />
          <div className="text-[10px] uppercase tracking-widest text-fg-muted">
            {t('to')}
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap min-w-0">
          {destinations.map((d) => (
            <Pill
              key={d.id}
              active={d.id === destId}
              onClick={() => setDestId(d.id)}
            >
              {d.name}
              <span className="text-[9px] uppercase tracking-wider text-fg-muted/70 ml-1.5">
                {d.kind}
              </span>
            </Pill>
          ))}
          {destinations.length === 0 && (
            <span className="text-xs text-fg-muted">
              {t('noOtherSources')}
            </span>
          )}
        </div>
      </div>

      {/* Coin */}
      <Field label={t('coin')}>
        {availableCoins.length === 0 ? (
          <div className="text-xs text-fg-muted">
            {source.balances === null
              ? t('loadingBalances')
              : t('noSupportedCoins')}
          </div>
        ) : (
          <div className="flex gap-1.5">
            {availableCoins.map((c) => (
              <Pill key={c} active={c === coin} onClick={() => setCoin(c)}>
                {c}
              </Pill>
            ))}
          </div>
        )}
      </Field>

      {/* Networks — mode-aware rendering */}
      <div className="grid grid-cols-2 gap-4">
        {source.kind === 'cex' ? (
          <Field label={t('networkWithdraw')}>
            <NetworkPicker
              state={sourceNets}
              selected={withdrawNet}
              onSelect={setWithdrawNetTouched}
              filter={(n) => n.withdrawEnabled}
              highlightFamily={destFamily || undefined}
              requireEvm={dest?.kind === 'evm'}
              coin={coin}
              smartPick={smartSourcePick}
              side="withdraw"
            />
          </Field>
        ) : (
          <Field label={t('sourceChain')}>
            {evmSourceChains.length === 0 ? (
              <div className="text-xs text-fg-muted/70 h-8 flex items-center">
                {source.balances === null
                  ? t('loading')
                  : t('noCoinBalance').replace('{coin}', coin)}
              </div>
            ) : (
              <div className="flex gap-1.5 flex-wrap">
                {evmSourceChains.map((c) => {
                  const fam = networkFamily(c.chainShort)
                  const isMatch = !!destFamily && fam === destFamily
                  return (
                    <button
                      key={c.chainShort}
                      type="button"
                      onClick={() => setWithdrawNetTouched(c.chainShort)}
                      title={`${familyLabel(fam)} · ${c.free.toFixed(4)} ${coin} · ~${formatEta(fam)}`}
                      className={cn(
                        'rounded-2xl px-3 py-1.5 text-xs font-medium transition-all border inline-flex flex-col items-start gap-0.5 min-w-[88px]',
                        withdrawNet === c.chainShort
                          ? 'bg-accent/[0.12] border-accent/50 text-accent'
                          : isMatch
                            ? 'bg-accent/[0.05] border-accent/30 text-fg hover:bg-accent/[0.1]'
                            : 'bg-white/[0.03] border-white/[0.08] text-fg-muted hover:text-fg hover:bg-white/[0.06]'
                      )}
                    >
                      <span className="text-[12px] leading-tight">
                        {c.chainShort}
                      </span>
                      <span className="font-mono font-tnum text-[10px] text-fg-muted/80 leading-tight">
                        {c.free.toFixed(2)} · {formatEta(fam)}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </Field>
        )}

        {dest?.kind === 'cex' ? (
          <Field label={t('networkDeposit')}>
            <NetworkPicker
              state={destNets}
              selected={depositNet}
              onSelect={setDepositNetTouched}
              filter={(n) => n.depositEnabled}
              highlightFamily={sourceFamily || undefined}
              requireEvm={source.kind === 'evm'}
              coin={coin}
              smartPick={smartDestPick}
              side="deposit"
            />
          </Field>
        ) : (
          <Field label={dest?.kind === 'evm' ? `${t('destination')} (EVM)` : t('destination')}>
            <div className="text-xs text-fg-muted/70 h-8 flex items-center">
              {dest?.kind === 'evm' ? t('anyEvmNetwork') : '—'}
            </div>
          </Field>
        )}
      </div>

      {/* Compatibility banner */}
      {compat.kind === 'ok' && mode !== 'evm-evm' && (
        <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg border text-accent bg-accent/5 border-accent/25">
          <Check size={12} />
          <span>
            {mode === 'cex-evm' ? (
              <>
                {t('evmCompatible')}:{' '}
                <span className="font-medium">
                  {familyLabel(compat.family)}
                </span>
              </>
            ) : (
              <>
                {t('sameChain')}:{' '}
                <span className="font-medium">
                  {familyLabel(compat.family)}
                </span>
              </>
            )}
          </span>
        </div>
      )}
      {compat.kind === 'bad' && (
        <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg border text-danger bg-danger/5 border-danger/25">
          <AlertTriangle size={12} />
          <span>{compat.reason}</span>
        </div>
      )}

      {/* Deposit address(es) */}
      <Field label={t('depositTo')}>
        <AddressPicker
          state={addr}
          family={addressFamily}
          isEvmDest={dest?.kind === 'evm'}
          selected={selectedAddr}
          onSelect={setSelectedAddr}
        />
      </Field>

      {/* Account-type breakdown + internal transfer */}
      {source.kind === 'cex' &&
        source.exchange &&
        typeBreakdown.length > 0 && (
          <TransferRow
            source={source}
            exchange={source.exchange}
            coin={coin}
            withdrawType={withdrawType ?? 'spot'}
            balances={typeBreakdown}
            totalCex={totalCexForCoin}
            onRefresh={onRefresh}
          />
        )}

      {/* Amount */}
      <Field label={t('amount')}>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              value={amountStr}
              onChange={(e) =>
                setAmountStr(e.target.value.replace(/[^\d.]/g, ''))
              }
              placeholder="0.00"
              className={cn(
                'w-full h-11 rounded-btn px-4 pr-14',
                'bg-white/[0.04] border border-white/[0.08]',
                'font-mono font-tnum text-fg placeholder:text-fg-muted/40',
                'focus:outline-none focus:border-accent/60 focus:bg-white/[0.06] transition-colors'
              )}
              inputMode="decimal"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-fg-muted font-mono">
              {coin}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setAmountStr(String(Math.max(0, maxAmount - fee)))}
            className="h-11 px-3 rounded-btn border border-white/[0.08] text-xs font-semibold text-fg-muted hover:text-fg hover:bg-white/[0.04] transition-colors"
          >
            MAX
          </button>
        </div>
        <div className="flex items-center justify-between mt-2 text-[11px] font-mono font-tnum text-fg-muted">
          <span>
            {t('available')}:{' '}
            <span className="text-fg">
              {maxAmount.toLocaleString('en-US', { maximumFractionDigits: 4 })}{' '}
              {coin}
            </span>
            {source.kind === 'evm' && !withdrawNet && (
              <span className="text-warn ml-2">{t('pickSource')}</span>
            )}
          </span>
          <span>
            {withdrawInfo
              ? `${t('fee')}: ${fee} ${coin} · min ${withdrawInfo.minWithdraw ?? 0}`
              : t('feeNone')}
          </span>
        </div>

        {/* Inline amount validation */}
        {(() => {
          if (amount === 0) return null
          if (amount > maxAmount) {
            return (
              <div className="mt-2 text-[11px] text-danger inline-flex items-center gap-1.5">
                <AlertTriangle size={11} />
                {t('exceeds')} {maxAmount.toLocaleString('en-US', {
                  maximumFractionDigits: 4
                })} {coin}.
              </div>
            )
          }
          if (
            withdrawInfo &&
            amount < (withdrawInfo.minWithdraw ?? 0)
          ) {
            return (
              <div className="mt-2 text-[11px] text-danger inline-flex items-center gap-1.5">
                <AlertTriangle size={11} />
                {t('belowMin')} — {withdrawInfo.minWithdraw} {coin} ({withdrawInfo.network})
              </div>
            )
          }
          return null
        })()}
      </Field>

      {/* Submit button + reason when disabled */}
      {(() => {
        const reason = disabledReason({
          dest,
          source,
          withdrawInfo,
          withdrawNet,
          depositInfo,
          mode,
          compat,
          selectedAddrEntry,
          addressOk,
          amount,
          maxAmount,
          t
        })
        return (
          <div className="space-y-2">
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => setConfirmOpen(true)}
              title={reason ?? undefined}
              className={cn(
                'w-full h-12 rounded-btn font-semibold text-sm transition-all',
                canSubmit
                  ? 'bg-accent text-on-accent hover:bg-accent-hover active:scale-[0.99] shadow-cta'
                  : 'bg-white/[0.04] text-fg-muted cursor-not-allowed'
              )}
            >
              {t('reviewWithdraw')}
            </button>
            {!canSubmit && reason && (
              <div className="text-[11px] text-fg-muted text-center">
                {reason}
              </div>
            )}
          </div>
        )
      })()}

      {confirmOpen && selectedAddrEntry && dest && (
        <ConfirmWithdrawModal
          source={source}
          dest={dest}
          coin={coin}
          amount={amount}
          fee={fee}
          address={selectedAddrEntry.address}
          tag={selectedAddrEntry.tag}
          network={withdrawNet}
          chainId={
            source.kind === 'evm'
              ? evmSourceChains.find((c) => c.chainShort === withdrawNet)?.chainId
              : undefined
          }
          family={compat.kind === 'ok' ? compat.family : ''}
          onClose={() => setConfirmOpen(false)}
          onSubmitted={() => {
            setConfirmOpen(false)
            setAmountStr('')
          }}
        />
      )}
    </GlassCard>
  )
}

function AddressPicker({
  state,
  family,
  isEvmDest,
  selected,
  onSelect
}: {
  state: AddressState
  family: string
  isEvmDest: boolean
  selected: string
  onSelect: (addr: string) => void
}) {
  const { t } = useI18n()
  if (state.status === 'idle') {
    return (
      <div className="text-xs text-fg-muted/70 h-8 flex items-center">
        {isEvmDest
          ? t('destAddressWillAppear')
          : t('pickNetwork')}
      </div>
    )
  }
  if (state.status === 'loading') {
    return (
      <div className="flex items-center gap-2 text-xs text-fg-muted h-8">
        <Loader2 size={12} className="animate-spin" />
        {t('fetchingDepositAddr')}
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <div className="flex items-center gap-2 text-xs text-danger h-8">
        <AlertTriangle size={12} />
        {state.message}
      </div>
    )
  }
  const multiple = state.addresses.length > 1
  return (
    <div className="space-y-1.5">
      {multiple && (
        <div className="text-[11px] text-fg-muted">
          {t('depositAddressesPick').replace('{n}', String(state.addresses.length))}
        </div>
      )}
      <div className="space-y-1.5">
        {state.addresses.map((entry) => (
          <AddressRow
            key={`${entry.address}::${entry.tag ?? ''}`}
            entry={entry}
            family={family}
            selected={multiple ? entry.address === selected : true}
            selectable={multiple}
            onSelect={() => onSelect(entry.address)}
          />
        ))}
      </div>
    </div>
  )
}

function AddressRow({
  entry,
  family,
  selected,
  selectable,
  onSelect
}: {
  entry: DepositAddressEntry
  family: string
  selected: boolean
  selectable: boolean
  onSelect: () => void
}) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const valid = family ? isValidAddress(family, entry.address) : null

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(entry.address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  const Wrapper: React.ElementType = selectable ? 'button' : 'div'
  const hint = family ? addressFormatHint(family) : null

  return (
    <div className="space-y-1">
      <Wrapper
        type={selectable ? 'button' : undefined}
        onClick={selectable ? onSelect : undefined}
        className={cn(
          'w-full flex items-center gap-2 rounded-btn px-3 h-11 text-left',
          'border transition-colors',
          valid === false
            ? 'bg-danger/[0.04] border-danger/30'
            : selected
              ? 'bg-accent/[0.06] border-accent/40'
              : 'bg-white/[0.03] border-white/[0.08]',
          selectable && !selected && 'hover:bg-white/[0.06] cursor-pointer'
        )}
      >
        {selectable && (
          <span
            className={cn(
              'w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0',
              selected
                ? 'border-accent bg-accent/30'
                : 'border-white/[0.2] bg-transparent'
            )}
          >
            {selected && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
          </span>
        )}
        {valid === true && !selectable && (
          <Check size={13} className="text-accent shrink-0" />
        )}
        {valid === false && (
          <AlertTriangle size={13} className="text-danger shrink-0" />
        )}
        <span className="flex-1 font-mono text-xs text-fg truncate">
          {entry.address}
        </span>
        {entry.label && (
          <span className="text-[10px] uppercase tracking-wider text-fg-muted border border-white/[0.08] rounded px-1.5 py-0.5 shrink-0">
            {entry.label}
          </span>
        )}
        {entry.tag && (
          <span className="text-[10px] font-mono text-fg-muted shrink-0">
            tag: <span className="text-fg">{entry.tag}</span>
          </span>
        )}
        <button
          type="button"
          onClick={copy}
          className="text-fg-muted hover:text-fg transition-colors shrink-0"
          title={copied ? t('copied') : t('copy')}
        >
          <Copy size={13} />
        </button>
        {copied && (
          <span className="text-[10px] text-accent shrink-0">{t('copied')}</span>
        )}
      </Wrapper>
      {valid === false && hint && (
        <div className="text-[10px] text-danger pl-3 flex items-center gap-1.5">
          <AlertTriangle size={10} />
          {t('addrFormatInvalid').replace('{hint}', hint)}
        </div>
      )}
      {valid === true && hint && !selectable && (
        <div className="text-[10px] text-fg-muted/60 pl-3">
          {hint}
        </div>
      )}
    </div>
  )
}

function formatFee(fee: number, coin: string): string {
  if (!fee || fee === 0) return 'free'
  if (fee < 0.0001) return `<0.0001 ${coin}`
  if (fee < 1) return `${fee.toFixed(4)} ${coin}`
  if (fee < 100) return `${fee.toFixed(2)} ${coin}`
  return `${Math.round(fee)} ${coin}`
}

function formatMinDeposit(min: number, coin: string): string {
  if (!min || min <= 0) return 'any'
  if (min < 0.0001) return `min <0.0001 ${coin}`
  if (min < 1) return `min ${min.toFixed(4)} ${coin}`
  if (min < 100) return `min ${min.toFixed(2)} ${coin}`
  return `min ${Math.round(min)} ${coin}`
}

/**
 * Rank an EVM-valid network for "smart" auto-pick. Lower is better.
 * Factors: fee (primary), ETA minutes (secondary), network code (tie-breaker).
 */
function smartPickScore(n: NetworkInfo): number {
  const fam = networkFamily(n.network)
  const fee = Number.isFinite(n.fee) ? n.fee : 999
  const eta = etaMinutes(fam) ?? 10
  // Heavy fee weight; tiny ETA adjustment.
  return fee * 100 + eta
}

/**
 * Inspects the same conditions as `canSubmit` and returns a short, human
 * reason why it's false — so the user isn't left staring at a dead button.
 */
function disabledReason(args: {
  dest: Source | null
  source: Source
  withdrawInfo: NetworkInfo | undefined
  withdrawNet: string
  depositInfo: NetworkInfo | undefined
  mode: Mode
  compat: { kind: 'pending' | 'ok' | 'bad'; reason?: string; family?: string }
  selectedAddrEntry: DepositAddressEntry | undefined
  addressOk: boolean | null
  amount: number
  maxAmount: number
  t: (key: string) => string
}): string | null {
  const {
    dest,
    source,
    withdrawInfo,
    withdrawNet,
    depositInfo,
    mode,
    compat,
    selectedAddrEntry,
    addressOk,
    amount,
    maxAmount,
    t
  } = args
  if (!dest) return t('pickDest')
  if (source.kind === 'cex' && !withdrawInfo)
    return t('pickWithdrawNet')
  if (source.kind === 'evm' && !withdrawNet) return t('pickSourceChain')
  if ((mode === 'cex-cex' || mode === 'evm-cex') && !depositInfo)
    return t('pickDepositNet')
  if (compat.kind === 'bad') return compat.reason ?? t('networksNoMatch')
  if (!selectedAddrEntry) return t('waitingDepositAddr')
  if (addressOk === false) return t('destAddrInvalid')
  if (amount <= 0) return t('enterAmount')
  if (amount > maxAmount) return t('exceedsAvailableMax').replace('{max}', String(maxAmount))
  if (withdrawInfo && amount < (withdrawInfo.minWithdraw ?? 0))
    return t('belowMinNeed').replace('{min}', String(withdrawInfo.minWithdraw))
  return null
}

function TransferRow({
  source,
  exchange,
  coin,
  withdrawType,
  balances,
  totalCex,
  onRefresh
}: {
  source: Source
  exchange: ExchangeId
  coin: string
  withdrawType: string
  balances: { type: string; free: number }[]
  totalCex: number
  onRefresh?: () => void | Promise<void>
}) {
  const types = TRANSFER_TYPES[exchange] ?? []
  // Build {type, free} for every type the exchange supports — including
  // zero-balance ones, since they're valid destinations.
  const rows = useMemo(
    () =>
      types.map((t) => ({
        type: t,
        free: balances.find((b) => b.type === t)?.free ?? 0
      })),
    [types, balances]
  )
  const firstNonEmpty =
    rows.find((r) => r.type !== withdrawType && r.free > 0)?.type ??
    rows.find((r) => r.type !== withdrawType)?.type ??
    rows[0]?.type ??
    ''
  const [fromType, setFromType] = useState<string>(firstNonEmpty)
  const [toType, setToType] = useState<string>(withdrawType)
  const [amountStr, setAmountStr] = useState('')
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'running' }
    | { kind: 'ok' }
    | { kind: 'error'; message: string; hint?: string }
  >({ kind: 'idle' })

  const fromFree = rows.find((r) => r.type === fromType)?.free ?? 0
  const amount = Number(amountStr) || 0
  const valid =
    fromType &&
    toType &&
    fromType !== toType &&
    amount > 0 &&
    amount <= fromFree

  const { t } = useI18n()

  if (types.length < 2) return null

  const run = async () => {
    if (!valid) return
    setState({ kind: 'running' })
    const r = await window.api.exchanges.transfer({
      accountId: source.id,
      coin,
      amount,
      fromType,
      toType
    })
    if (r.ok) {
      setState({ kind: 'ok' })
      setAmountStr('')
      // Trigger immediate UI refresh — main has already cleared its cache for
      // this account, so the next getBalances() hits the exchange directly.
      if (onRefresh) {
        Promise.resolve(onRefresh()).catch(() => undefined)
      } else {
        window.api.exchanges.warmup().catch(() => undefined)
      }
    } else {
      setState({
        kind: 'error',
        message: r.error ?? 'failed',
        hint: r.hint
      })
    }
  }

  return (
    <div className="rounded-btn border border-warn/25 bg-warn/5 px-3 py-2.5 space-y-2">
      <div className="text-[11px] text-fg-muted">
        {t('internalTransfer')} · {t('withdrawFrom')}{' '}
        <span className="uppercase text-fg">{withdrawType}</span> {t('only')}.{' '}
        <span className="font-mono text-fg">
          {totalCex.toLocaleString('en-US', { maximumFractionDigits: 6 })}{' '}
          {coin}
        </span>{' '}
        {t('totalAcross')}.
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <TypeSelect
          label="From"
          value={fromType}
          rows={rows}
          coin={coin}
          exchange={exchange}
          onChange={(v) => {
            setFromType(v)
            if (v === toType) {
              const alt = rows.find((r) => r.type !== v)?.type
              if (alt) setToType(alt)
            }
          }}
        />
        <MoveRight size={12} className="text-fg-muted shrink-0" />
        <TypeSelect
          label="To"
          value={toType}
          rows={rows}
          coin={coin}
          exchange={exchange}
          onChange={(v) => {
            setToType(v)
            if (v === fromType) {
              const alt = rows.find((r) => r.type !== v)?.type
              if (alt) setFromType(alt)
            }
          }}
        />
        <div className="relative flex-1 min-w-[140px]">
          <input
            value={amountStr}
            onChange={(e) =>
              setAmountStr(e.target.value.replace(/[^\d.]/g, ''))
            }
            placeholder="0.00"
            inputMode="decimal"
            className="w-full h-8 rounded-btn px-3 pr-12 bg-white/[0.04] border border-white/[0.08] font-mono text-[12px] text-fg placeholder:text-fg-muted/40 focus:outline-none focus:border-warn/60"
          />
          <button
            type="button"
            onClick={() => setAmountStr(String(fromFree))}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 px-2 rounded text-[10px] font-semibold text-fg-muted hover:text-fg hover:bg-white/[0.06]"
          >
            MAX
          </button>
        </div>
        <Button
          variant="secondary"
          onClick={run}
          disabled={!valid || state.kind === 'running'}
          className="h-8 px-3 text-[11px]"
        >
          {state.kind === 'running' ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <MoveRight size={11} />
          )}
          {state.kind === 'running' ? t('moving') : t('transfer')}
        </Button>
      </div>
      {amount > 0 && amount > fromFree && (
        <div className="text-[11px] text-danger inline-flex items-center gap-1.5">
          <AlertTriangle size={11} />
          {t('exceedsBalance').replace('{type}', transferTypeLabel(fromType, exchange)).replace('{free}', String(fromFree)).replace('{coin}', coin)}
        </div>
      )}
      {state.kind === 'ok' && (
        <div className="text-[11px] text-accent inline-flex items-center gap-1.5">
          <Check size={11} /> {t('transferSubmitted')}
        </div>
      )}
      {state.kind === 'error' && (
        <div className="text-[11px] text-danger">
          <div className="font-mono break-all">{state.message}</div>
          {state.hint && (
            <div className="text-warn mt-0.5">{t('hint')} {state.hint}</div>
          )}
        </div>
      )}
    </div>
  )
}

function TypeSelect({
  label,
  value,
  rows,
  coin,
  exchange,
  onChange
}: {
  label: string
  value: string
  rows: { type: string; free: number }[]
  coin: string
  exchange: ExchangeId
  onChange: (v: string) => void
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-btn px-2 bg-white/[0.04] border border-white/[0.08] text-[11px] text-fg focus:outline-none focus:border-warn/60"
      >
        {rows.map((r) => (
          <option key={r.type} value={r.type} className="bg-[#061512]">
            {transferTypeLabel(r.type, exchange)} ·{' '}
            {r.free.toLocaleString('en-US', { maximumFractionDigits: 2 })}{' '}
            {coin}
          </option>
        ))}
      </select>
    </label>
  )
}

function NetworkPicker({
  state,
  selected,
  onSelect,
  filter,
  highlightFamily,
  requireEvm,
  coin,
  smartPick,
  side
}: {
  state: NetworkState
  selected: string
  onSelect: (n: string) => void
  filter: (n: NetworkInfo) => boolean
  highlightFamily?: string
  requireEvm?: boolean
  coin: string
  smartPick?: string
  /** 'withdraw' → show fee · eta. 'deposit' → show min deposit · eta. */
  side: 'withdraw' | 'deposit'
}) {
  const { t } = useI18n()
  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <div className="flex items-center gap-2 text-xs text-fg-muted h-8">
        <Loader2 size={12} className="animate-spin" />
        {t('loadingNetworks')}
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <div className="flex items-center gap-2 text-xs text-danger h-8">
        <AlertTriangle size={12} />
        {state.message}
      </div>
    )
  }
  const list = state.networks.filter(filter)
  if (list.length === 0) {
    return (
      <div className="text-xs text-fg-muted/70 h-8 flex items-center">
        {t('noNetworks')}
      </div>
    )
  }
  // Order: EVM-compatible first when requireEvm; within that group, cheapest
  // first (matches the "smart pick" heuristic). Incompatibles at the bottom.
  const sorted = [...list].sort((a, b) => {
    if (requireEvm) {
      const aEvm = isEvmFamily(networkFamily(a.network)) ? 0 : 1
      const bEvm = isEvmFamily(networkFamily(b.network)) ? 0 : 1
      if (aEvm !== bEvm) return aEvm - bEvm
    }
    return smartPickScore(a) - smartPickScore(b)
  })
  return (
    <div className="flex gap-1.5 flex-wrap">
      {sorted.map((n) => {
        const fam = networkFamily(n.network)
        const isEvm = isEvmFamily(fam)
        const incompat = !!requireEvm && !isEvm
        const isMatch =
          !incompat && !!highlightFamily && fam === highlightFamily
        const isActive = n.network === selected
        const isSmart = !incompat && smartPick === n.network
        const sideInfo =
          side === 'withdraw'
            ? `fee ${formatFee(n.fee, coin)}`
            : formatMinDeposit(n.minDeposit, coin)
        const title = incompat
          ? `${n.name} · ${familyLabel(fam)} — not EVM-compatible, funds would be lost`
          : `${n.name}${fam ? ` · ${familyLabel(fam)}` : ''} · ${sideInfo} · ~${formatEta(fam)}`
        return (
          <button
            key={n.network}
            type="button"
            disabled={incompat}
            onClick={() => {
              if (incompat) return
              onSelect(n.network)
            }}
            title={title}
            className={cn(
              'rounded-2xl px-3 py-1.5 text-xs font-medium transition-all border inline-flex flex-col items-start gap-0.5 min-w-[88px]',
              incompat
                ? 'bg-white/[0.02] border-white/[0.04] text-fg-muted/40 line-through cursor-not-allowed'
                : isActive
                  ? 'bg-accent/[0.12] border-accent/50 text-accent'
                  : isMatch
                    ? 'bg-accent/[0.05] border-accent/30 text-fg hover:bg-accent/[0.1]'
                    : 'bg-white/[0.03] border-white/[0.08] text-fg-muted hover:text-fg hover:bg-white/[0.06]'
            )}
          >
            <span className="inline-flex items-center gap-1 text-[12px] leading-tight">
              {n.network}
              {isSmart && (
                <Sparkles
                  size={10}
                  className={cn(
                    'opacity-80',
                    isActive ? 'text-accent' : 'text-accent/80'
                  )}
                />
              )}
            </span>
            {!incompat && (
              <span className="font-mono font-tnum text-[10px] text-fg-muted/80 leading-tight">
                {sideInfo} · {formatEta(fam)}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function Field({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-fg-muted mb-1.5">
        {label}
      </div>
      {children}
    </div>
  )
}

function Pill({
  active,
  disabled,
  onClick,
  children
}: {
  active?: boolean
  disabled?: boolean
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'h-8 px-3 rounded-full text-xs font-medium transition-all inline-flex items-center',
        'border',
        active
          ? 'bg-accent/[0.12] border-accent/50 text-accent'
          : 'bg-white/[0.03] border-white/[0.08] text-fg-muted hover:text-fg hover:bg-white/[0.06]',
        disabled && 'opacity-30 cursor-not-allowed hover:bg-white/[0.03]'
      )}
    >
      {children}
    </button>
  )
}
