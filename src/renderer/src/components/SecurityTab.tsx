import { FormEvent, useState } from 'react'
import { AlertTriangle, KeyRound, Trash2 } from 'lucide-react'
import { GlassCard } from './GlassCard'
import { Button, Input, Row } from './ui'

type Props = {
  onWiped: () => void
}

export function SecurityTab({ onWiped }: Props) {
  return (
    <div className="space-y-4">
      <ChangeMasterCard />
      <WipeVaultCard onWiped={onWiped} />
    </div>
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
