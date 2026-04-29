import { FormEvent, useEffect, useState } from 'react'
import { Copy, Eye, Key, Trash2, Wallet, X } from 'lucide-react'
import { GlassCard } from './GlassCard'
import { Button, Input, Row } from './ui'
import { cn } from '../lib/cn'
import type { WalletMeta } from '@shared/types'

const NETWORK_OPTIONS = [
  { value: 'EVM', label: 'EVM (all EVM chains)' },
  { value: 'ETH', label: 'Ethereum' },
  { value: 'ARB', label: 'Arbitrum' },
  { value: 'BASE', label: 'Base' },
  { value: 'OP', label: 'Optimism' },
  { value: 'BSC', label: 'BNB Chain' },
  { value: 'MATIC', label: 'Polygon' },
  { value: 'TRX', label: 'Tron' },
  { value: 'SOL', label: 'Solana' },
  { value: 'BTC', label: 'Bitcoin' },
  { value: 'APT', label: 'Aptos' },
  { value: 'TON', label: 'TON' }
]

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function WalletsTab() {
  const [list, setList] = useState<WalletMeta[]>([])
  const [addMode, setAddMode] = useState<'none' | 'key' | 'watch'>('none')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const refresh = async () => setList(await window.api.wallets.list())

  useEffect(() => {
    refresh()
  }, [])

  const copy = async (addr: string) => {
    await navigator.clipboard.writeText(addr)
    setCopied(addr)
    setTimeout(() => setCopied(null), 1200)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-fg-muted">
          Full wallets (with private key) can send. Watch-only wallets are
          destination-only.
        </p>
        <div className="flex items-center gap-1.5">
          {addMode !== 'none' ? (
            <Button
              variant="ghost"
              onClick={() => setAddMode('none')}
              className="h-9 px-3 text-xs"
            >
              <X size={14} />
              Cancel
            </Button>
          ) : (
            <>
              <Button
                variant="primary"
                onClick={() => setAddMode('key')}
                className="h-9 px-3 text-xs"
              >
                <Key size={13} />
                Add with key
              </Button>
              <Button
                variant="ghost"
                onClick={() => setAddMode('watch')}
                className="h-9 px-3 text-xs"
              >
                <Eye size={13} />
                Watch-only
              </Button>
            </>
          )}
        </div>
      </div>

      {addMode === 'key' && (
        <GlassCard className="p-4">
          <AddKeyWalletForm
            onDone={() => {
              setAddMode('none')
              refresh()
            }}
          />
        </GlassCard>
      )}

      {addMode === 'watch' && (
        <GlassCard className="p-4">
          <AddWatchWalletForm
            onDone={() => {
              setAddMode('none')
              refresh()
            }}
          />
        </GlassCard>
      )}

      {list.length === 0 && addMode === 'none' ? (
        <GlassCard className="p-8 text-center text-sm text-fg-muted">
          No wallets yet. Add one with a private key (for sending) or
          watch-only (as a destination).
        </GlassCard>
      ) : (
        list.map((w) => {
          const confirming = confirmId === w.id
          return (
            <GlassCard key={w.id} className="p-4">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'w-10 h-10 rounded-lg flex items-center justify-center border',
                    w.canSend
                      ? 'bg-[#627EEA]/20 border-[#627EEA]/30'
                      : 'bg-white/[0.04] border-white/[0.08]'
                  )}
                >
                  {w.canSend ? (
                    <Wallet size={16} className="text-[#627EEA]" />
                  ) : (
                    <Eye size={16} className="text-fg-muted" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-fg truncate">
                      {w.label}
                    </span>
                    <span
                      className={cn(
                        'text-[9px] uppercase tracking-wider font-semibold border rounded px-1.5 py-0.5',
                        w.canSend
                          ? 'text-[#627EEA] border-[#627EEA]/30'
                          : 'text-fg-muted border-white/[0.08]'
                      )}
                    >
                      {w.network ?? 'EVM'}
                      {!w.canSend && ' · watch'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-xs text-fg-muted">
                      {shortAddr(w.address)}
                    </span>
                    <button
                      onClick={() => copy(w.address)}
                      className="text-fg-muted hover:text-fg transition-colors"
                      title={copied === w.address ? 'Copied' : 'Copy address'}
                    >
                      <Copy size={12} />
                    </button>
                    {copied === w.address && (
                      <span className="text-[10px] text-accent">copied</span>
                    )}
                  </div>
                </div>
                {confirming ? (
                  <>
                    <span className="text-xs text-fg-muted mr-1">Sure?</span>
                    <Button
                      variant="danger"
                      onClick={async () => {
                        await window.api.wallets.remove(w.id)
                        setConfirmId(null)
                        refresh()
                      }}
                      className="h-9 px-3 text-xs"
                    >
                      Remove
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setConfirmId(null)}
                      className="h-9 px-3 text-xs"
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={() => setConfirmId(w.id)}
                    className="h-9 px-3 text-xs hover:text-danger"
                    title="Remove wallet"
                  >
                    <Trash2 size={14} />
                  </Button>
                )}
              </div>
            </GlassCard>
          )
        })
      )}
    </div>
  )
}

function AddKeyWalletForm({ onDone }: { onDone: () => void }) {
  const [label, setLabel] = useState('')
  const [pk, setPk] = useState('')
  const [walletType, setWalletType] = useState<'EVM' | 'SOL'>('EVM')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const r = await window.api.wallets.add({
      label: label || undefined,
      privateKey: pk,
      network: walletType === 'SOL' ? 'SOL' : undefined
    })
    setBusy(false)
    if (!r.ok) setError(r.error ?? 'Failed')
    else onDone()
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="text-[10px] uppercase tracking-widest text-fg-muted mb-2">
        Full wallet — can send transactions
      </div>
      <Row label="Chain">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setWalletType('EVM')}
            className={cn(
              'h-9 px-4 rounded-btn text-xs font-medium border transition-colors',
              walletType === 'EVM'
                ? 'bg-accent/[0.12] border-accent/50 text-accent'
                : 'bg-white/[0.03] border-white/[0.08] text-fg-muted hover:text-fg'
            )}
          >
            EVM
          </button>
          <button
            type="button"
            onClick={() => setWalletType('SOL')}
            className={cn(
              'h-9 px-4 rounded-btn text-xs font-medium border transition-colors',
              walletType === 'SOL'
                ? 'bg-accent/[0.12] border-accent/50 text-accent'
                : 'bg-white/[0.03] border-white/[0.08] text-fg-muted hover:text-fg'
            )}
          >
            Solana
          </button>
        </div>
      </Row>
      <Row label="Label (optional)">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Main EVM"
        />
      </Row>
      <Row label={walletType === 'SOL' ? 'Private key (base58 or JSON array)' : 'Private key (0x... 64 hex chars)'}>
        <Input
          mono
          type="password"
          value={pk}
          onChange={(e) => setPk(e.target.value)}
          placeholder={walletType === 'SOL' ? 'base58 secret key…' : '0x…'}
          autoComplete="new-password"
        />
      </Row>
      {error && <div className="text-xs text-danger">{error}</div>}
      <div className="flex items-center gap-2 justify-end">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Deriving…' : 'Add wallet'}
        </Button>
      </div>
    </form>
  )
}

function AddWatchWalletForm({ onDone }: { onDone: () => void }) {
  const [label, setLabel] = useState('')
  const [address, setAddress] = useState('')
  const [network, setNetwork] = useState('EVM')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!address.trim()) {
      setError('Address is required')
      return
    }
    setError(null)
    setBusy(true)
    const r = await window.api.wallets.add({
      label: label || undefined,
      address: address.trim(),
      network
    })
    setBusy(false)
    if (!r.ok) setError(r.error ?? 'Failed')
    else onDone()
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="text-[10px] uppercase tracking-widest text-fg-muted mb-2">
        Watch-only — destination only, no private key
      </div>
      <Row label="Label (optional)">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Cold storage"
        />
      </Row>
      <Row label="Network">
        <select
          value={network}
          onChange={(e) => setNetwork(e.target.value)}
          className={cn(
            'w-full h-11 rounded-btn px-4',
            'bg-white/[0.04] border border-white/[0.08]',
            'text-fg text-sm',
            'focus:outline-none focus:border-accent/60 transition-colors'
          )}
        >
          {NETWORK_OPTIONS.map((n) => (
            <option key={n.value} value={n.value} className="bg-[#061512]">
              {n.label} ({n.value})
            </option>
          ))}
        </select>
      </Row>
      <Row label="Address">
        <Input
          mono
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={
            network === 'TRX'
              ? 'T...'
              : network === 'SOL'
                ? 'Base58...'
                : network === 'BTC'
                  ? 'bc1...'
                  : '0x...'
          }
        />
      </Row>
      {error && <div className="text-xs text-danger">{error}</div>}
      <div className="flex items-center gap-2 justify-end">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Adding…' : 'Add watch-only'}
        </Button>
      </div>
    </form>
  )
}
