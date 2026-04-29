import { FormEvent, useEffect, useState } from 'react'
import { AlertTriangle, KeyRound, ShieldOff, Trash2 } from 'lucide-react'
import { GlassCard } from './GlassCard'
import { Button, Input, Row } from './ui'
import { cn } from '../lib/cn'
import type { UserPrefs } from '@shared/types'

type Props = {
  onWiped: () => void
}

export function SecurityTab({ onWiped }: Props) {
  return (
    <div className="space-y-4">
      <SkipPreflightCard />
      <ChangeMasterCard />
      <WipeVaultCard onWiped={onWiped} />
    </div>
  )
}

function SkipPreflightCard() {
  const [prefs, setPrefs] = useState<UserPrefs | null>(null)
  const [step, setStep] = useState<'closed' | 'confirm' | 'done'>('closed')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.api.prefs.get().then(setPrefs)
  }, [])

  if (!prefs) return null

  const enabled = prefs.skipPreflight === true

  const toggle = async () => {
    if (!enabled) {
      // Turning ON (dangerous) — need confirmation
      setStep('confirm')
      return
    }
    // Turning OFF (safe) — no confirmation needed
    setBusy(true)
    const updated: UserPrefs = { ...prefs, skipPreflight: undefined }
    const r = await window.api.prefs.save(updated)
    if (r.ok) setPrefs(updated)
    setBusy(false)
  }

  const confirmEnable = async () => {
    setBusy(true)
    const updated: UserPrefs = { ...prefs, skipPreflight: true }
    const r = await window.api.prefs.save(updated)
    if (r.ok) setPrefs(updated)
    setBusy(false)
    setStep('closed')
  }

  return (
    <GlassCard className={cn('p-5', enabled && 'border-warn/30')}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldOff size={16} className={enabled ? 'text-warn' : 'text-fg-muted'} />
          <div>
            <h3 className="text-sm font-semibold text-fg">Skip preflight checks</h3>
            <p className="text-xs text-fg-muted mt-0.5">
              Submit withdrawals without running the dry-run safety check first.
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={toggle}
          disabled={busy}
          className={cn(
            'rounded-full relative transition-colors disabled:opacity-60',
            enabled ? 'bg-warn' : 'bg-white/[0.12]'
          )}
          style={{ width: 40, height: 22 }}
        >
          <span
            className="absolute rounded-full bg-white shadow transition-all"
            style={{
              width: 18,
              height: 18,
              top: 2,
              left: enabled ? 20 : 2
            }}
          />
        </button>
      </div>

      {step === 'confirm' && (
        <div className="mt-4 rounded-btn border border-warn/30 bg-warn/5 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="text-warn mt-0.5 shrink-0" />
            <div className="text-xs text-fg leading-relaxed">
              <span className="font-semibold text-warn">Warning:</span> Disabling
              preflight checks removes the safety net that catches mistakes before
              your funds leave the exchange. You could send to a wrong address, wrong
              network, or with insufficient balance — and <span className="font-semibold">
              crypto transactions are irreversible</span>.
            </div>
          </div>
          <p className="text-[11px] text-fg-muted">
            Only disable this if you fully understand the risk and want faster
            withdrawals without the dry-run step.
          </p>
          <div className="flex items-center gap-2 justify-end">
            <Button
              variant="ghost"
              onClick={() => setStep('closed')}
              className="h-8 px-3 text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={confirmEnable}
              disabled={busy}
              className="h-8 px-3 text-xs"
            >
              I understand, disable preflight
            </Button>
          </div>
        </div>
      )}

      {enabled && step === 'closed' && (
        <div className="mt-3 flex items-center gap-2 text-[11px] text-warn">
          <AlertTriangle size={11} />
          Preflight checks are disabled — withdrawals submit without dry-run verification.
        </div>
      )}
    </GlassCard>
  )
}

function ChangeMasterCard() {
  const [oldKey, setOldKey] = useState('')
  const [newKey, setNewKey] = useState('')
  const [repeatKey, setRepeatKey] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setMsg(null)
    if (newKey.length < 8) {
      setMsg({ ok: false, text: 'New master key must be at least 8 chars.' })
      return
    }
    if (newKey !== repeatKey) {
      setMsg({ ok: false, text: 'New keys do not match.' })
      return
    }
    setBusy(true)
    const r = await window.api.vault.changeMasterKey(oldKey, newKey)
    setBusy(false)
    if (!r.ok) {
      setMsg({ ok: false, text: r.error ?? 'Failed' })
      return
    }
    setOldKey('')
    setNewKey('')
    setRepeatKey('')
    setMsg({ ok: true, text: 'Master key changed.' })
  }

  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <KeyRound size={16} className="text-accent" />
        <h3 className="text-sm font-semibold text-fg">Change master key</h3>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <Row label="Current master key">
          <Input
            type="password"
            value={oldKey}
            onChange={(e) => setOldKey(e.target.value)}
            autoComplete="current-password"
          />
        </Row>
        <Row label="New master key">
          <Input
            type="password"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            autoComplete="new-password"
          />
        </Row>
        <Row label="Repeat new master key">
          <Input
            type="password"
            value={repeatKey}
            onChange={(e) => setRepeatKey(e.target.value)}
            autoComplete="new-password"
          />
        </Row>
        {msg && (
          <div
            className={`text-xs ${msg.ok ? 'text-accent' : 'text-danger'}`}
          >
            {msg.text}
          </div>
        )}
        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Re-encrypting…' : 'Change key'}
          </Button>
        </div>
      </form>
    </GlassCard>
  )
}

function WipeVaultCard({ onWiped }: { onWiped: () => void }) {
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const ready = confirm.trim() === 'WIPE'

  const wipe = async () => {
    setBusy(true)
    await window.api.vault.wipe()
    setBusy(false)
    onWiped()
  }

  return (
    <GlassCard className="p-5 border-danger/25">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle size={16} className="text-danger" />
        <h3 className="text-sm font-semibold text-fg">Wipe vault</h3>
      </div>
      <p className="text-xs text-fg-muted mb-4">
        Permanently deletes all exchange keys and wallet private keys stored on
        this device. Cannot be undone.
      </p>
      {!open ? (
        <Button variant="danger" onClick={() => setOpen(true)}>
          <Trash2 size={14} />
          Wipe vault…
        </Button>
      ) : (
        <div className="space-y-3">
          <Row label="Type WIPE to confirm">
            <Input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="WIPE"
              autoFocus
            />
          </Row>
          <div className="flex items-center gap-2 justify-end">
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false)
                setConfirm('')
              }}
            >
              Cancel
            </Button>
            <Button variant="danger" disabled={!ready || busy} onClick={wipe}>
              {busy ? 'Wiping…' : 'Wipe vault'}
            </Button>
          </div>
        </div>
      )}
    </GlassCard>
  )
}
