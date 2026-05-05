import { FormEvent, useEffect, useState } from 'react'
import { AlertTriangle, Globe, KeyRound, Loader2, ShieldOff, Trash2 } from 'lucide-react'
import { GlassCard } from './GlassCard'
import { Button, Input, Row } from './ui'
import { cn } from '../lib/cn'
import { useI18n } from '../lib/i18n'
import type { UserPrefs } from '@shared/types'

type Props = {
  onWiped: () => void
}

export function SecurityTab({ onWiped }: Props) {
  return (
    <div className="space-y-4">
      <ProxySetupCard />
      <SkipPreflightCard />
      <ChangeMasterCard />
      <WipeVaultCard onWiped={onWiped} />
    </div>
  )
}

function ProxySetupCard() {
  const { t } = useI18n()
  const [prefs, setPrefs] = useState<UserPrefs | null>(null)
  const [url, setUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<
    { ok: true; ip?: string; ms?: number } | { ok: false; error: string } | null
  >(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    window.api.prefs.get().then((p) => {
      setPrefs(p)
      if (p.proxy) {
        setUrl(p.proxy.url ?? '')
        setUsername(p.proxy.username ?? '')
        setPassword(p.proxy.password ?? '')
      }
    })
  }, [])

  if (!prefs) return null

  const enabled = prefs.proxy?.enabled === true
  const showForm = enabled || !!prefs.proxy?.url

  const toggle = async () => {
    if (!enabled) {
      const updated: UserPrefs = {
        ...prefs,
        proxy: {
          enabled: true,
          url: prefs.proxy?.url ?? '',
          username: prefs.proxy?.username,
          password: prefs.proxy?.password
        }
      }
      setPrefs(updated)
      return
    }
    setSaving(true)
    const updated: UserPrefs = {
      ...prefs,
      proxy: prefs.proxy ? { ...prefs.proxy, enabled: false } : undefined
    }
    const r = await window.api.prefs.save(updated)
    if (r.ok) setPrefs(updated)
    setSaving(false)
  }

  const runTest = async () => {
    const trimmed = url.trim()
    if (!trimmed) {
      setTestResult({ ok: false, error: t('security.proxy.urlRequired') })
      return
    }
    setTesting(true)
    setTestResult(null)
    const r = await window.api.proxy.test({
      url: trimmed,
      username: username || undefined,
      password: password || undefined
    })
    setTesting(false)
    if (r.ok) {
      setTestResult({ ok: true, ip: r.ip, ms: r.latencyMs })
    } else {
      setTestResult({ ok: false, error: r.error ?? t('security.proxy.testFail') })
    }
  }

  const save = async () => {
    setSaveMsg(null)
    const trimmed = url.trim()
    if (enabled && !trimmed) {
      setSaveMsg({ ok: false, text: t('security.proxy.urlRequired') })
      return
    }
    if (enabled && trimmed && !/^https?:\/\//i.test(trimmed)) {
      setSaveMsg({ ok: false, text: t('security.proxy.urlInvalid') })
      return
    }
    setSaving(true)
    const updated: UserPrefs = {
      ...prefs,
      proxy: {
        enabled,
        url: trimmed,
        username: username || undefined,
        password: password || undefined
      }
    }
    const r = await window.api.prefs.save(updated)
    setSaving(false)
    if (r.ok) {
      setPrefs(updated)
      setSaveMsg({ ok: true, text: t('security.proxy.saved') })
    } else {
      setSaveMsg({ ok: false, text: t('security.proxy.saveFail') })
    }
  }

  return (
    <GlassCard className={cn('p-5', enabled && 'border-accent/30')}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe size={16} className={enabled ? 'text-accent' : 'text-fg-muted'} />
          <div>
            <h3 className="text-sm font-semibold text-fg">{t('security.proxy')}</h3>
            <p className="text-xs text-fg-muted mt-0.5">
              {t('security.proxy.desc')}
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={toggle}
          disabled={saving}
          className={cn(
            'rounded-full relative transition-colors disabled:opacity-60',
            enabled ? 'bg-accent' : 'bg-white/[0.12]'
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

      {showForm && (
        <div className={cn('mt-4 space-y-3', !enabled && 'opacity-60')}>
          <Row label={t('security.proxy.url')}>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t('security.proxy.urlPlaceholder')}
              autoComplete="off"
              spellCheck={false}
            />
          </Row>
          <Row label={t('security.proxy.username')}>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </Row>
          <Row label={t('security.proxy.password')}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </Row>

          {testResult && testResult.ok && (
            <div className="text-xs text-accent">
              {t('security.proxy.testOk')
                .replace('{ip}', testResult.ip ?? '?')
                .replace('{ms}', String(testResult.ms ?? 0))}
            </div>
          )}
          {testResult && !testResult.ok && (
            <div className="text-xs text-danger">{testResult.error}</div>
          )}
          {saveMsg && (
            <div className={cn('text-xs', saveMsg.ok ? 'text-accent' : 'text-danger')}>
              {saveMsg.text}
            </div>
          )}

          <div className="flex items-center gap-2 justify-end">
            <Button
              variant="secondary"
              onClick={runTest}
              disabled={testing || saving}
              className="h-9 px-3 text-xs"
            >
              {testing && <Loader2 size={12} className="animate-spin" />}
              {testing ? t('security.proxy.testing') : t('security.proxy.test')}
            </Button>
            <Button
              variant="primary"
              onClick={save}
              disabled={saving || testing}
              className="h-9 px-3 text-xs"
            >
              {saving ? t('security.proxy.saving') : t('security.proxy.save')}
            </Button>
          </div>
        </div>
      )}
    </GlassCard>
  )
}

function SkipPreflightCard() {
  const { t } = useI18n()
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
            <h3 className="text-sm font-semibold text-fg">{t('security.skipPreflight')}</h3>
            <p className="text-xs text-fg-muted mt-0.5">
              {t('security.skipPreflight.desc')}
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
              <span className="font-semibold text-warn">{t('security.skipPreflight.confirm.title')}</span> {t('security.skipPreflight.confirm.body')}
            </div>
          </div>
          <p className="text-[11px] text-fg-muted">
            {t('security.skipPreflight.confirm.note')}
          </p>
          <div className="flex items-center gap-2 justify-end">
            <Button
              variant="ghost"
              onClick={() => setStep('closed')}
              className="h-8 px-3 text-xs"
            >
              {t('wallets.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={confirmEnable}
              disabled={busy}
              className="h-8 px-3 text-xs"
            >
              {t('security.skipPreflight.confirm.btn')}
            </Button>
          </div>
        </div>
      )}

      {enabled && step === 'closed' && (
        <div className="mt-3 flex items-center gap-2 text-[11px] text-warn">
          <AlertTriangle size={11} />
          {t('security.skipPreflight.warn')}
        </div>
      )}
    </GlassCard>
  )
}

function ChangeMasterCard() {
  const { t } = useI18n()
  const [oldKey, setOldKey] = useState('')
  const [newKey, setNewKey] = useState('')
  const [repeatKey, setRepeatKey] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setMsg(null)
    if (newKey.length < 8) {
      setMsg({ ok: false, text: t('lock.minChars') })
      return
    }
    if (newKey !== repeatKey) {
      setMsg({ ok: false, text: t('lock.noMatch') })
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
    setMsg({ ok: true, text: t('security.keyChanged') })
  }

  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <KeyRound size={16} className="text-accent" />
        <h3 className="text-sm font-semibold text-fg">{t('security.changeMaster')}</h3>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <Row label={t('security.currentKey')}>
          <Input
            type="password"
            value={oldKey}
            onChange={(e) => setOldKey(e.target.value)}
            autoComplete="current-password"
          />
        </Row>
        <Row label={t('security.newKey')}>
          <Input
            type="password"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            autoComplete="new-password"
          />
        </Row>
        <Row label={t('security.repeatNew')}>
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
            {busy ? t('security.reencrypting') : t('security.changeBtn')}
          </Button>
        </div>
      </form>
    </GlassCard>
  )
}

function WipeVaultCard({ onWiped }: { onWiped: () => void }) {
  const { t } = useI18n()
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
        <h3 className="text-sm font-semibold text-fg">{t('security.wipeVault')}</h3>
      </div>
      <p className="text-xs text-fg-muted mb-4">
        {t('security.wipeDesc')}
      </p>
      {!open ? (
        <Button variant="danger" onClick={() => setOpen(true)}>
          <Trash2 size={14} />
          {t('security.wipeBtn')}
        </Button>
      ) : (
        <div className="space-y-3">
          <Row label={t('security.wipeConfirm')}>
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
              {t('wallets.cancel')}
            </Button>
            <Button variant="danger" disabled={!ready || busy} onClick={wipe}>
              {busy ? t('security.wiping') : t('security.wipeVault')}
            </Button>
          </div>
        </div>
      )}
    </GlassCard>
  )
}
