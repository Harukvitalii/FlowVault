import { FormEvent, useEffect, useState } from 'react'
import { KeyRound, Lock as LockIcon } from 'lucide-react'
import { GlassCard } from '../components/GlassCard'
import { cn } from '../lib/cn'
import { useI18n } from '../lib/i18n'
import type { VaultState } from '@shared/types'

type Props = {
  vaultState: VaultState
  onUnlocked: () => void
}

export function LockPage({ vaultState, onUnlocked }: Props) {
  const { t } = useI18n()
  const isCreate = vaultState === 'empty'

  const [key1, setKey1] = useState('')
  const [key2, setKey2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setError(null)
  }, [key1, key2])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setError(null)
    if (key1.length < 8) {
      setError(t('lock.minChars'))
      return
    }
    if (isCreate && key1 !== key2) {
      setError(t('lock.noMatch'))
      return
    }
    setBusy(true)
    try {
      if (isCreate) {
        const r = await window.api.vault.create(key1)
        if (!r.ok) setError(t('lock.createFailed'))
        else onUnlocked()
      } else {
        const r = await window.api.vault.unlock(key1)
        if (!r.ok) setError(r.error ?? t('lock.unlockFailed'))
        else onUnlocked()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center p-8 relative z-10">
      <GlassCard className="w-full max-w-md p-8 space-y-6">
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/30 flex items-center justify-center">
            <LockIcon size={22} className="text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-fg">
              {isCreate ? t('lock.create') : t('lock.unlock')}
            </h1>
            <p className="text-sm text-fg-muted mt-1">
              {isCreate
                ? t('lock.create.desc')
                : t('lock.unlock.desc')}
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <InputRow
            autoFocus
            placeholder={t('lock.masterKey')}
            value={key1}
            onChange={setKey1}
          />
          {isCreate && (
            <InputRow
              placeholder={t('lock.repeat')}
              value={key2}
              onChange={setKey2}
            />
          )}

          {error && (
            <div className="text-xs text-danger font-medium">{error}</div>
          )}

          <button
            type="submit"
            disabled={busy}
            className={cn(
              'w-full h-12 rounded-btn font-semibold text-sm transition-all mt-2',
              busy
                ? 'bg-white/[0.06] text-fg-muted cursor-not-allowed'
                : 'bg-accent text-on-accent hover:bg-accent-hover active:scale-[0.99] shadow-cta'
            )}
          >
            {isCreate ? t('lock.createBtn') : t('lock.unlockBtn')}
          </button>
        </form>

        {isCreate && (
          <p className="text-[11px] text-fg-muted/80 text-center leading-relaxed">
            {t('lock.noRecovery')}
          </p>
        )}
      </GlassCard>
    </div>
  )
}

function InputRow({
  value,
  onChange,
  placeholder,
  autoFocus
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  autoFocus?: boolean
}) {
  return (
    <div className="relative">
      <KeyRound
        size={15}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted"
      />
      <input
        type="password"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full h-11 rounded-btn pl-9 pr-3',
          'bg-white/[0.04] border border-white/[0.08]',
          'text-fg placeholder:text-fg-muted/50',
          'focus:outline-none focus:border-accent/60 focus:bg-white/[0.06] transition-colors'
        )}
      />
    </div>
  )
}
