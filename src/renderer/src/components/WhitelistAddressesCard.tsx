import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  Copy,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Settings2,
  Wallet,
  X
} from 'lucide-react'
import { GlassCard } from './GlassCard'
import { Button, Input } from './ui'
import { cn } from '../lib/cn'
import { familyLabel, isEvmFamily } from '@shared/networks'
import { EXCHANGE_META } from '../data/sources'
import type {
  CoinNetworkPair,
  ExchangeAccountMeta,
  ExchangeId,
  UserPrefs,
  WalletMeta,
  WhitelistDepositAddress,
  WhitelistNetwork
} from '@shared/types'

const WHITELIST_URLS: Partial<Record<ExchangeId, string>> = {
  binance: 'https://www.binance.com/en/my/security/withdraw-whitelist',
  gate: 'https://www.gate.io/myaccount/withdrawlist',
  okx: 'https://www.okx.com/account/withdrawal',
  bybit: 'https://www.bybit.com/user/assets/address',
  kucoin: 'https://www.kucoin.com/asset-safety',
  bitget: 'https://www.bitget.com/asset/settings/address',
  htx: 'https://www.htx.com/en-us/finance/withdraw-address/',
  mexc: 'https://www.mexc.com/assets/security/address',
  phemex: 'https://phemex.com/assets/wallet/address-book'
}

const FAMILY_OPTIONS = [
  'ETH',
  'BSC',
  'TRX',
  'ARB',
  'BASE',
  'OP',
  'MATIC',
  'AVAX',
  'ZKSYNC',
  'LINEA',
  'BLAST',
  'SCROLL',
  'SOL',
  'BTC',
  'TON',
  'XRP',
  'ADA',
  'DOT',
  'NEAR',
  'APT',
  'SUI',
  'DOGE',
  'LTC',
  'ATOM',
  'FTM',
  'CELO',
  'KAS'
]

type NetFetchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; networks: WhitelistNetwork[] }
  | { kind: 'error'; message: string }

type DepFetchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; addresses: WhitelistDepositAddress[] }
  | { kind: 'error'; message: string }

function shortAddr(addr: string): string {
  if (addr.length <= 14) return addr
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`
}

function pairKey(p: CoinNetworkPair): string {
  return `${p.coin}::${p.family}`
}

/** Icon/background color for an address card, based on the first family seen. */
function familyAccent(family: string): string {
  if (isEvmFamily(family)) return '#627EEA'
  switch (family) {
    case 'SOL':
      return '#9945FF'
    case 'TRX':
      return '#EF4136'
    case 'BTC':
      return '#F7931A'
    case 'TON':
      return '#0098EA'
    case 'XRP':
      return '#23292F'
    case 'ADA':
      return '#0033AD'
    case 'DOT':
      return '#E6007A'
    case 'LTC':
      return '#345D9D'
    case 'DOGE':
      return '#C2A633'
    default:
      return '#8892B0'
  }
}

export function WhitelistAddressesCard() {
  const [accounts, setAccounts] = useState<ExchangeAccountMeta[]>([])
  const [wallets, setWallets] = useState<WalletMeta[]>([])
  const [prefs, setPrefs] = useState<UserPrefs | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [netStates, setNetStates] = useState<Record<string, NetFetchState>>({})
  const [depStates, setDepStates] = useState<Record<string, DepFetchState>>({})
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      window.api.exchanges.list(),
      window.api.wallets.list(),
      window.api.prefs.get()
    ]).then(([exs, ws, p]) => {
      setAccounts(exs)
      setWallets(ws)
      setPrefs(p)
    })
  }, [])

  // Only re-fetch on initial load, not on every prefs change.
  const initialFetchDone = useRef(false)
  useEffect(() => {
    if (!prefs || accounts.length === 0) return
    if (initialFetchDone.current) return
    initialFetchDone.current = true
    for (const acc of accounts)
      fetchDeposits(acc.accountId, prefs.whitelistSelection)
  }, [prefs, accounts])

  const fetchNetworks = async (accountId: string) => {
    setNetStates((s) => ({ ...s, [accountId]: { kind: 'loading' } }))
    const r = await window.api.exchanges.getWithdrawNetworks(accountId)
    setNetStates((s) => ({
      ...s,
      [accountId]: r.ok
        ? { kind: 'ok', networks: r.networks ?? [] }
        : { kind: 'error', message: r.error ?? 'failed' }
    }))
  }

  const fetchDeposits = async (
    accountId: string,
    pairs: CoinNetworkPair[]
  ) => {
    setDepStates((s) => ({ ...s, [accountId]: { kind: 'loading' } }))
    if (pairs.length === 0) {
      setDepStates((s) => ({
        ...s,
        [accountId]: { kind: 'ok', addresses: [] }
      }))
      return
    }
    const r = await window.api.exchanges.getDepositAddressesForPairs(
      accountId,
      pairs
    )
    setDepStates((s) => ({
      ...s,
      [accountId]: r.ok
        ? { kind: 'ok', addresses: r.addresses ?? [] }
        : { kind: 'error', message: r.error ?? 'failed' }
    }))
  }

  const toggle = (accountId: string) => {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(accountId)) next.delete(accountId)
      else next.add(accountId)
      return next
    })
    const current = netStates[accountId]
    if (!current || current.kind === 'error') fetchNetworks(accountId)
  }

  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1200)
  }

  const updateSelection = async (next: CoinNetworkPair[]) => {
    const nextPrefs: UserPrefs = { whitelistSelection: next }
    setPrefs(nextPrefs)
    await window.api.prefs.save(nextPrefs)
  }

  return (
    <GlassCard className="p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-fg">
          Addresses to whitelist on each exchange
        </div>
        <Button
          variant="ghost"
          onClick={() => setEditorOpen((v) => !v)}
          className="h-8 px-3 text-xs"
        >
          <Settings2 size={12} />
          {editorOpen ? 'Done' : 'Customize pairs'}
        </Button>
      </div>
      <p className="text-[11px] text-fg-muted leading-relaxed">
        For each exchange, add both your wallets (so you can withdraw to
        yourself) and other exchanges' deposit addresses (for cross-exchange
        transfers).
      </p>

      {editorOpen && prefs && (
        <SelectionEditor
          selection={prefs.whitelistSelection}
          onChange={updateSelection}
        />
      )}

      {accounts.length === 0 ? (
        <div className="rounded-btn border border-white/[0.06] bg-white/[0.02] p-4 text-xs text-fg-muted">
          Add an exchange API in the Exchanges tab first.
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map((acc) => (
            <AccountRow
              key={acc.accountId}
              account={acc}
              allAccounts={accounts}
              wallets={wallets}
              netState={netStates[acc.accountId] ?? { kind: 'idle' }}
              depStates={depStates}
              open={open.has(acc.accountId)}
              onToggle={() => toggle(acc.accountId)}
              onRetryNets={() => fetchNetworks(acc.accountId)}
              onRetryDeps={(otherId) =>
                prefs && fetchDeposits(otherId, prefs.whitelistSelection)
              }
              copied={copied}
              onCopy={copy}
            />
          ))}
        </div>
      )}
    </GlassCard>
  )
}

function SelectionEditor({
  selection,
  onChange
}: {
  selection: CoinNetworkPair[]
  onChange: (next: CoinNetworkPair[]) => void
}) {
  const [coin, setCoin] = useState('')
  const [family, setFamily] = useState(FAMILY_OPTIONS[0])

  const sortedFamilies = useMemo(
    () =>
      FAMILY_OPTIONS.slice().sort((a, b) =>
        familyLabel(a).localeCompare(familyLabel(b))
      ),
    []
  )

  const addPair = () => {
    const c = coin.trim().toUpperCase()
    if (!c) return
    const next: CoinNetworkPair = { coin: c, family }
    const key = pairKey(next)
    if (selection.some((p) => pairKey(p) === key)) {
      setCoin('')
      return
    }
    onChange([...selection, next])
    setCoin('')
  }

  const removePair = (p: CoinNetworkPair) => {
    onChange(selection.filter((x) => pairKey(x) !== pairKey(p)))
  }

  return (
    <div className="rounded-btn border border-white/[0.08] bg-white/[0.03] p-3 space-y-3">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-fg-muted mb-2">
          Selected ({selection.length})
        </div>
        {selection.length === 0 ? (
          <div className="text-[11px] text-fg-muted">
            No pairs selected — add some below.
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {selection.map((p) => (
              <button
                key={pairKey(p)}
                onClick={() => removePair(p)}
                className="inline-flex items-center gap-1.5 h-7 pl-2.5 pr-2 rounded-full text-[11px] bg-white/[0.05] border border-white/[0.10] hover:bg-danger/10 hover:border-danger/30 hover:text-danger transition-colors group"
                title={`Remove ${p.coin} · ${familyLabel(p.family)}`}
              >
                <span className="text-fg group-hover:text-danger">
                  {p.coin}
                </span>
                <span className="text-fg-muted/60">·</span>
                <span className="text-fg-muted group-hover:text-danger">
                  {familyLabel(p.family)}
                </span>
                <X size={10} className="shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-end gap-2 pt-1 border-t border-white/[0.06]">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-fg-muted mb-1">
            Coin
          </div>
          <Input
            value={coin}
            onChange={(e) => setCoin(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addPair()
            }}
            placeholder="USDT"
            className="h-9"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-fg-muted mb-1">
            Network
          </div>
          <select
            value={family}
            onChange={(e) => setFamily(e.target.value)}
            className="w-full h-9 rounded-btn px-3 bg-white/[0.04] border border-white/[0.08] text-sm text-fg focus:outline-none focus:border-accent/60 focus:bg-white/[0.06] transition-colors"
          >
            {sortedFamilies.map((f) => (
              <option key={f} value={f} className="bg-[#061512]">
                {familyLabel(f)} ({f})
              </option>
            ))}
          </select>
        </div>
        <Button
          variant="primary"
          onClick={addPair}
          disabled={!coin.trim()}
          className="h-9 px-3 text-xs shrink-0"
        >
          <Plus size={12} /> Add
        </Button>
      </div>
    </div>
  )
}

function AccountRow({
  account,
  allAccounts,
  wallets,
  netState,
  depStates,
  open,
  onToggle,
  onRetryNets,
  onRetryDeps,
  copied,
  onCopy
}: {
  account: ExchangeAccountMeta
  allAccounts: ExchangeAccountMeta[]
  wallets: WalletMeta[]
  netState: NetFetchState
  depStates: Record<string, DepFetchState>
  open: boolean
  onToggle: () => void
  onRetryNets: () => void
  onRetryDeps: (otherId: string) => void
  copied: string | null
  onCopy: (text: string, key: string) => void
}) {
  const meta = EXCHANGE_META[account.exchange]
  const url = WHITELIST_URLS[account.exchange]
  const others = allAccounts.filter((a) => a.accountId !== account.accountId)
  const evmNetworks =
    netState.kind === 'ok'
      ? netState.networks.filter((n) => isEvmFamily(n.family))
      : []

  return (
    <div className="rounded-btn border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <button
          onClick={onToggle}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          <ChevronDown
            size={14}
            className={cn(
              'text-fg-muted transition-transform shrink-0',
              open && 'rotate-180'
            )}
          />
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-semibold shrink-0 border"
            style={{
              backgroundColor: `${meta.accent}20`,
              borderColor: `${meta.accent}40`,
              color: meta.accent
            }}
          >
            {meta.short}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-fg truncate">
              {meta.displayName}
              <span className="text-fg-muted font-normal"> · {account.label}</span>
            </div>
          </div>
          {netState.kind === 'loading' && (
            <Loader2 size={12} className="animate-spin text-fg-muted shrink-0" />
          )}
          {netState.kind === 'ok' && (
            <span className="text-[10px] text-fg-muted shrink-0">
              {evmNetworks.length} EVM networks
            </span>
          )}
        </button>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-accent hover:underline inline-flex items-center gap-1 shrink-0"
          >
            Open whitelist <ExternalLink size={11} />
          </a>
        )}
      </div>

      {open && (
        <div className="px-3 pb-3 border-t border-white/[0.06] pt-3 space-y-4">
          <SectionHeader>Your wallets</SectionHeader>
          {netState.kind === 'loading' && (
            <div className="text-xs text-fg-muted">Loading networks…</div>
          )}
          {netState.kind === 'error' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-danger font-mono flex-1 min-w-0 break-all">
                Failed to load networks — {netState.message}
              </span>
              <Button
                variant="ghost"
                onClick={onRetryNets}
                className="h-8 px-3 text-xs shrink-0"
              >
                <RefreshCw size={12} /> Retry
              </Button>
            </div>
          )}
          {netState.kind === 'ok' &&
            (wallets.length === 0 ? (
              <div className="text-xs text-fg-muted">
                Add an EVM wallet in the Wallets tab to see it here.
              </div>
            ) : (
              <div className="space-y-2">
                {wallets.map((w) => (
                  <WalletBlock
                    key={w.id}
                    wallet={w}
                    networks={evmNetworks}
                    copied={copied}
                    onCopy={onCopy}
                    accountId={account.accountId}
                  />
                ))}
              </div>
            ))}

          {others.length > 0 && (
            <>
              <SectionHeader>Other exchanges' deposit addresses</SectionHeader>
              <div className="space-y-3">
                {others.map((other) => (
                  <OtherExchangeBlock
                    key={other.accountId}
                    other={other}
                    state={depStates[other.accountId] ?? { kind: 'idle' }}
                    onRetry={() => onRetryDeps(other.accountId)}
                    copied={copied}
                    onCopy={onCopy}
                    ownerAccountId={account.accountId}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-widest text-fg-muted">
      {children}
    </div>
  )
}

function WalletBlock({
  wallet,
  networks,
  copied,
  onCopy,
  accountId
}: {
  wallet: WalletMeta
  networks: WhitelistNetwork[]
  copied: string | null
  onCopy: (text: string, key: string) => void
  accountId: string
}) {
  const [expanded, setExpanded] = useState(false)
  const copyKey = `wallet::${accountId}::${wallet.id}`
  return (
    <div className="rounded-btn border border-white/[0.06] bg-white/[0.03] p-3 space-y-2">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-md flex items-center justify-center bg-[#627EEA]/15 border border-[#627EEA]/30 shrink-0">
          <Wallet size={13} className="text-[#627EEA]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-fg truncate">
            {wallet.label}{' '}
            <span className="text-fg-muted/70 text-[11px]">· EVM</span>
          </div>
          <span
            className="font-mono text-[11px] text-fg-muted"
            title={wallet.address}
          >
            {shortAddr(wallet.address)}
          </span>
        </div>
        <button
          onClick={() => onCopy(wallet.address, copyKey)}
          className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg transition-colors"
          title="Copy address"
        >
          <Copy size={12} />
          {copied === copyKey ? 'copied' : 'Copy'}
        </button>
      </div>
      {networks.length > 0 && (
        <>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-[11px] text-fg-muted hover:text-fg inline-flex items-center gap-1 transition-colors"
          >
            <ChevronDown
              size={10}
              className={cn('transition-transform', expanded && 'rotate-180')}
            />
            {expanded ? 'Hide' : 'Show'} {networks.length} networks
          </button>
          {expanded && (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 pt-1">
              {networks.map((n) => (
                <li
                  key={n.exchangeCode}
                  className="text-xs text-fg-muted flex items-center gap-1.5"
                >
                  <span className="w-1 h-1 rounded-full bg-fg-muted/40 shrink-0" />
                  <span className="text-fg">{n.familyLabel}</span>
                  <span className="font-mono text-[10px] text-fg-muted/80">
                    ({n.exchangeCode})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

type AddressGroup = {
  address: string
  tag?: string
  /** Family of the first entry — used to pick an accent color. */
  primaryFamily: string
  coins: Array<{
    coin: string
    entries: WhitelistDepositAddress[]
  }>
}

function groupByAddress(
  entries: WhitelistDepositAddress[]
): AddressGroup[] {
  const map = new Map<string, AddressGroup>()
  for (const e of entries) {
    const key = `${e.address}::${e.tag ?? ''}`
    let g = map.get(key)
    if (!g) {
      g = {
        address: e.address,
        tag: e.tag,
        primaryFamily: e.family,
        coins: []
      }
      map.set(key, g)
    }
    let coinGroup = g.coins.find((c) => c.coin === e.coin)
    if (!coinGroup) {
      coinGroup = { coin: e.coin, entries: [] }
      g.coins.push(coinGroup)
    }
    coinGroup.entries.push(e)
  }
  return Array.from(map.values())
}

function OtherExchangeBlock({
  other,
  state,
  onRetry,
  copied,
  onCopy,
  ownerAccountId
}: {
  other: ExchangeAccountMeta
  state: DepFetchState
  onRetry: () => void
  copied: string | null
  onCopy: (text: string, key: string) => void
  ownerAccountId: string
}) {
  const meta = EXCHANGE_META[other.exchange]
  const groups = useMemo(
    () => (state.kind === 'ok' ? groupByAddress(state.addresses) : []),
    [state]
  )

  return (
    <div className="rounded-btn border border-white/[0.06] bg-white/[0.03] p-3 space-y-2">
      <div className="flex items-center gap-3">
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-semibold shrink-0 border"
          style={{
            backgroundColor: `${meta.accent}20`,
            borderColor: `${meta.accent}40`,
            color: meta.accent
          }}
        >
          {meta.short}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-fg truncate">
            {meta.displayName}
            <span className="text-fg-muted font-normal"> · {other.label}</span>
          </div>
        </div>
        {state.kind === 'loading' && (
          <Loader2 size={12} className="animate-spin text-fg-muted" />
        )}
      </div>
      {state.kind === 'error' && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-danger font-mono flex-1 min-w-0 break-all">
            {state.message}
          </span>
          <Button
            variant="ghost"
            onClick={onRetry}
            className="h-7 px-2 text-[11px] shrink-0"
          >
            <RefreshCw size={11} /> Retry
          </Button>
        </div>
      )}
      {state.kind === 'ok' &&
        (groups.length === 0 ? (
          <div className="text-[11px] text-fg-muted">
            No deposit addresses for the selected pairs.
          </div>
        ) : (
          <div className="space-y-2">
            {groups.map((g) => (
              <AddressGroupRow
                key={`${g.address}::${g.tag ?? ''}`}
                group={g}
                copied={copied}
                onCopy={onCopy}
                ownerAccountId={ownerAccountId}
                otherAccountId={other.accountId}
              />
            ))}
          </div>
        ))}
    </div>
  )
}

function AddressGroupRow({
  group,
  copied,
  onCopy,
  ownerAccountId,
  otherAccountId
}: {
  group: AddressGroup
  copied: string | null
  onCopy: (text: string, key: string) => void
  ownerAccountId: string
  otherAccountId: string
}) {
  const accent = familyAccent(group.primaryFamily)
  const copyKey = `dep::${ownerAccountId}::${otherAccountId}::${group.address}::${group.tag ?? ''}`
  return (
    <div className="rounded-btn bg-white/[0.02] border border-white/[0.04] px-3 py-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <div
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: accent }}
        />
        <span
          className="font-mono text-[12px] text-fg flex-1 min-w-0 truncate"
          title={group.address}
        >
          {shortAddr(group.address)}
        </span>
        {group.tag && (
          <span className="text-[10px] text-fg-muted font-mono shrink-0">
            tag {group.tag}
          </span>
        )}
        <button
          onClick={() => onCopy(group.address, copyKey)}
          className="inline-flex items-center gap-1 text-[11px] text-fg-muted hover:text-fg transition-colors shrink-0"
          title="Copy address"
        >
          <Copy size={11} />
          {copied === copyKey ? 'copied' : 'Copy'}
        </button>
      </div>
      <div className="pl-3.5 space-y-0.5">
        {group.coins.map((c) => (
          <div
            key={c.coin}
            className="flex items-baseline gap-2 text-[11px]"
          >
            <span className="text-fg font-medium w-10 shrink-0">{c.coin}</span>
            <span className="text-fg-muted">
              {c.entries
                .map((e) => `${e.familyLabel} (${e.exchangeCode})`)
                .join(' · ')}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
