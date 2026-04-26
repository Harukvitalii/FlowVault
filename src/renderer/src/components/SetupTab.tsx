import { useEffect, useState } from 'react'
import {
  Apple,
  Bell,
  Copy,
  ExternalLink,
  Globe,
  Info,
  Loader2,
  Monitor,
  RefreshCw
} from 'lucide-react'
import type { UserPrefs } from '@shared/types'
import { GlassCard } from './GlassCard'
import { Button } from './ui'
import { cn } from '../lib/cn'
import { WhitelistAddressesCard } from './WhitelistAddressesCard'

type DetectState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; ip: string }
  | { kind: 'error'; message: string }

export function SetupTab() {
  const [ipState, setIpState] = useState<DetectState>({ kind: 'idle' })
  const [copied, setCopied] = useState(false)

  const detect = async () => {
    setIpState({ kind: 'loading' })
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    try {
      const res = await fetch('https://api.ipify.org?format=json', {
        signal: controller.signal
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { ip?: string }
      if (!data.ip) throw new Error('no ip')
      setIpState({ kind: 'ok', ip: data.ip })
    } catch (err) {
      setIpState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'failed'
      })
    } finally {
      clearTimeout(timer)
    }
  }

  useEffect(() => {
    detect()
  }, [])

  const copy = async () => {
    if (ipState.kind !== 'ok') return
    await navigator.clipboard.writeText(ipState.ip)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const platform = detectPlatform()

  return (
    <div className="space-y-6">
      {/* Deposit monitoring toggle */}
      <DepositMonitorCard />

      {/* Why */}
      <GlassCard className="p-5 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Info size={14} className="text-accent" />
          Why this matters
        </div>
        <p className="text-xs text-fg-muted leading-relaxed">
          Exchanges require API keys with withdrawal permission to have an{' '}
          <span className="text-fg">IP whitelist</span>. If your IP isn't in
          the allowed list, the exchange either rejects the request with an
          error or — worse — silently hangs the signed call. A stable public
          IP is the simplest path to a working withdraw flow.
        </p>
      </GlassCard>

      {/* Current IP */}
      <GlassCard className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-fg">
            <Globe size={14} className="text-accent" />
            Your current public IP
          </div>
          <Button
            variant="ghost"
            onClick={detect}
            disabled={ipState.kind === 'loading'}
            className="h-8 px-3 text-xs"
          >
            <RefreshCw
              size={12}
              className={cn(ipState.kind === 'loading' && 'animate-spin')}
            />
            Re-detect
          </Button>
        </div>
        <div className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.08] rounded-btn px-3 h-11">
          {ipState.kind === 'loading' && (
            <>
              <Loader2 size={14} className="animate-spin text-fg-muted" />
              <span className="text-xs text-fg-muted">Detecting…</span>
            </>
          )}
          {ipState.kind === 'error' && (
            <span className="text-xs text-danger font-mono">
              Failed: {ipState.message}
            </span>
          )}
          {ipState.kind === 'ok' && (
            <>
              <span className="font-mono text-sm text-fg flex-1">
                {ipState.ip}
              </span>
              <button
                onClick={copy}
                className="text-fg-muted hover:text-fg transition-colors"
                title={copied ? 'Copied' : 'Copy'}
              >
                <Copy size={13} />
              </button>
              {copied && (
                <span className="text-[10px] text-accent">copied</span>
              )}
            </>
          )}
        </div>
        <p className="text-[11px] text-fg-muted leading-relaxed">
          This is the address every exchange will see when the app signs a
          request. Paste it into the IP whitelist fields below.
        </p>
      </GlassCard>

      {/* How to get a static IP */}
      <GlassCard className="p-5 space-y-4">
        <div className="text-sm font-semibold text-fg">
          How to get a stable public IP
        </div>
        <Option
          n={1}
          title="Ask your ISP for a static IP"
          body="Most providers offer a static address add-on for a few dollars a month. Call support or check the account dashboard — usually labelled 'Static IP' or 'Fixed IP'. Best option if available: no extra software, no latency overhead."
          tone="recommended"
        />
        <Option
          n={2}
          title="VPN with a dedicated / static IP"
          body={
            <>
              Most consumer VPNs assign a different IP every session — useless
              for whitelisting. Look for a <b>dedicated IP</b> add-on
              (Mullvad, NordVPN, ExpressVPN, Proton, AirVPN all offer it,
              ~$2–10/month). Works on any OS and any network. Caveat: some
              exchanges rate-limit known VPN ranges, so pick a lesser-known
              provider if you see 4xx errors.
            </>
          }
        />
        <Option
          n={3}
          title="Cloud VPS as a SOCKS proxy"
          body={
            <>
              Rent a $5/mo VPS (DigitalOcean, Vultr, Hetzner) with a static
              IPv4, run a SOCKS5 proxy (e.g. dante, ssh tunnel). Route this
              app's traffic through it. Most stable and private, but requires
              command-line setup. Future feature: proxy support inside the
              app.
            </>
          }
        />
      </GlassCard>

      {/* Exchange whitelist instructions */}
      <GlassCard className="p-5 space-y-3">
        <div className="text-sm font-semibold text-fg">
          Whitelist your IP on each exchange
        </div>
        <p className="text-[11px] text-fg-muted">
          Paste the IP shown above into the API key's "IP restriction" field.
          After saving, the change can take up to a minute to propagate.
        </p>
        <ExchangeRow
          name="Binance"
          url="https://www.binance.com/en/my/settings/api-management"
          path={[
            'Sign in',
            '"API Management"',
            'Edit the key',
            '"IP Access Restrictions"',
            'Add current IP → Save'
          ]}
        />
        <ExchangeRow
          name="Gate"
          url="https://www.gate.io/myaccount/api_key_manage"
          path={[
            'Sign in',
            '"API Keys"',
            'Edit the key',
            '"IP Binding"',
            'Enter IP → Confirm'
          ]}
        />
        <ExchangeRow
          name="OKX"
          url="https://www.okx.com/account/my-api"
          path={[
            'Sign in',
            '"API"',
            'Edit the key',
            '"Link IP Address"',
            'Add IP → Confirm'
          ]}
        />
        <ExchangeRow
          name="Bybit"
          url="https://www.bybit.com/app/user/api-management"
          path={[
            'Sign in',
            '"API"',
            'Edit the key',
            '"IP Access Restrictions"',
            'Add IP → Confirm'
          ]}
        />
        <ExchangeRow
          name="KuCoin"
          url="https://www.kucoin.com/account/api"
          path={[
            'Sign in',
            '"API Management"',
            'Edit the key',
            '"IP Whitelist"',
            'Add IP → Confirm'
          ]}
        />
        <ExchangeRow
          name="Bitget"
          url="https://www.bitget.com/account/newapi"
          path={[
            'Sign in',
            '"API Management"',
            'Edit the key',
            '"IP Addresses"',
            'Add IP → Save'
          ]}
        />
        <ExchangeRow
          name="HTX"
          url="https://www.htx.com/en-us/apikey/"
          path={[
            'Sign in',
            '"API Key"',
            'Edit the key',
            '"Bind IP address"',
            'Enter IP → Confirm'
          ]}
        />
        <ExchangeRow
          name="MEXC"
          url="https://www.mexc.com/user/openapi"
          path={[
            'Sign in',
            '"API Management"',
            'Edit the key',
            '"Bindable IP Addresses"',
            'Enter IP → Confirm'
          ]}
        />
        <ExchangeRow
          name="Phemex"
          url="https://phemex.com/account/api-management"
          path={[
            'Sign in',
            '"API Keys"',
            'Edit the key',
            '"IP Address"',
            'Add IP → Confirm'
          ]}
        />
      </GlassCard>

      {/* Address whitelist */}
      <WhitelistAddressesCard />

      {/* Platform notes */}
      <GlassCard className="p-5 space-y-4">
        <div className="text-sm font-semibold text-fg">
          Platform notes (LAN-level)
        </div>
        <p className="text-[11px] text-fg-muted leading-relaxed">
          A static <span className="text-fg">LAN</span> IP (via macOS or
          Windows settings) only affects your home network. The{' '}
          <span className="text-fg">public</span> IP your ISP hands out is the
          one exchanges see. LAN-static is still useful if you run a router
          with DDNS / port-forwarding — but for most users, choose one of the
          three options above.
        </p>
        <PlatformBlock
          active={platform === 'mac'}
          icon={<Apple size={14} />}
          title="macOS"
          steps={[
            'Apple menu → System Settings → Network',
            'Click your active connection → Details',
            'TCP/IP tab → Configure IPv4 → Manually',
            'Set IP, subnet, router — outside DHCP range'
          ]}
        />
        <PlatformBlock
          active={platform === 'windows'}
          icon={<Monitor size={14} />}
          title="Windows 11"
          steps={[
            'Settings → Network & Internet',
            'Ethernet / WiFi → Properties',
            'IP assignment → Edit → Manual',
            'Enable IPv4 → enter IP, subnet, gateway, DNS'
          ]}
        />
      </GlassCard>
    </div>
  )
}

function DepositMonitorCard() {
  const [prefs, setPrefs] = useState<UserPrefs | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.api.prefs.get().then(setPrefs)
  }, [])

  if (!prefs) return null

  const enabled = prefs.depositsEnabled !== false

  const toggle = async () => {
    if (busy) return
    setBusy(true)
    const next = !enabled
    const updated: UserPrefs = { ...prefs, depositsEnabled: next }
    setPrefs(updated)
    const r = await window.api.prefs.save(updated)
    if (!r.ok) {
      // Revert on failure.
      setPrefs(prefs)
    }
    setBusy(false)
  }

  return (
    <GlassCard className="p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-accent" />
          <div>
            <h3 className="text-sm font-semibold text-fg">Deposit monitoring</h3>
            <p className="text-xs text-fg-muted mt-0.5">
              Show incoming deposits from all exchanges in the Activity feed.
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Toggle deposit monitoring"
          onClick={toggle}
          disabled={busy}
          className={cn(
            'rounded-full relative transition-colors disabled:opacity-60',
            enabled ? 'bg-accent' : 'bg-white/[0.12]'
          )}
          style={{ width: 40, height: 22 }}
        >
          <span
            className="absolute rounded-full bg-white shadow transition-transform"
            style={{
              width: 18,
              height: 18,
              top: 2,
              left: enabled ? 20 : 2
            }}
          />
        </button>
      </div>
    </GlassCard>
  )
}

function Option({
  n,
  title,
  body,
  tone
}: {
  n: number
  title: string
  body: React.ReactNode
  tone?: 'recommended'
}) {
  return (
    <div className="flex gap-3 items-start">
      <div
        className={cn(
          'w-7 h-7 rounded-full inline-flex items-center justify-center text-xs font-mono shrink-0 border',
          tone === 'recommended'
            ? 'bg-accent/10 border-accent/40 text-accent'
            : 'bg-white/[0.04] border-white/[0.08] text-fg-muted'
        )}
      >
        {n}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm text-fg">
          {title}
          {tone === 'recommended' && (
            <span className="text-[9px] uppercase tracking-wider text-accent border border-accent/30 rounded px-1.5 py-px">
              recommended
            </span>
          )}
        </div>
        <div className="text-xs text-fg-muted leading-relaxed mt-1">
          {body}
        </div>
      </div>
    </div>
  )
}

function ExchangeRow({
  name,
  url,
  path
}: {
  name: string
  url: string
  path: string[]
}) {
  return (
    <div className="rounded-btn border border-white/[0.06] bg-white/[0.02] p-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-fg">{name}</span>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-accent hover:underline inline-flex items-center gap-1"
        >
          Open <ExternalLink size={11} />
        </a>
      </div>
      <div className="text-[11px] text-fg-muted flex flex-wrap items-center gap-1">
        {path.map((step, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            {i > 0 && <span className="text-fg-muted/50">›</span>}
            <span>{step}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function PlatformBlock({
  active,
  icon,
  title,
  steps
}: {
  active: boolean
  icon: React.ReactNode
  title: string
  steps: string[]
}) {
  return (
    <div
      className={cn(
        'rounded-btn border p-3 space-y-2',
        active
          ? 'border-accent/30 bg-accent/[0.04]'
          : 'border-white/[0.06] bg-white/[0.02]'
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn('shrink-0', active ? 'text-accent' : 'text-fg-muted')}
        >
          {icon}
        </span>
        <span className="text-sm font-medium text-fg">{title}</span>
        {active && (
          <span className="text-[10px] uppercase tracking-wider text-accent border border-accent/30 rounded px-1.5">
            you're on this
          </span>
        )}
      </div>
      <ol className="text-xs text-fg-muted space-y-1 pl-1">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-fg-muted/60 shrink-0">{i + 1}.</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function detectPlatform(): 'mac' | 'windows' | 'other' {
  if (typeof navigator === 'undefined') return 'other'
  const p = navigator.platform?.toLowerCase() ?? ''
  const ua = navigator.userAgent?.toLowerCase() ?? ''
  if (p.includes('mac') || ua.includes('mac os')) return 'mac'
  if (p.includes('win') || ua.includes('windows')) return 'windows'
  return 'other'
}
