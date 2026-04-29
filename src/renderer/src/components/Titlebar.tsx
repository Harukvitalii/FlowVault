import { Lock, Settings } from 'lucide-react'
import { cn } from '../lib/cn'
import { useI18n } from '../lib/i18n'

type Props = {
  unlocked: boolean
  onLock: () => void
  onOpenSettings: () => void
  current: 'dashboard' | 'settings'
}

const isMac = navigator.userAgent.includes('Mac')

export function Titlebar({ unlocked, onLock, onOpenSettings, current }: Props) {
  const { t } = useI18n()
  return (
    <div
      className={cn(
        'drag h-10 flex items-center relative',
        'bg-white/[0.03] backdrop-blur-xl',
        'after:absolute after:inset-x-0 after:bottom-0 after:h-px',
        'after:bg-gradient-to-r after:from-transparent after:via-white/[0.08] after:to-transparent',
        'text-xs text-fg-muted select-none z-20'
      )}
    >
      {/* macOS: leave space for traffic lights */}
      <div className={cn('flex items-center', isMac ? 'pl-20' : 'pl-4')}>
        <span className="text-fg font-semibold tracking-wide">FlowVault</span>
      </div>

      <div className="flex-1" />

      <div className={cn('no-drag flex items-center gap-1', isMac ? 'pr-3' : 'pr-36')}>
        <StatusPill unlocked={unlocked} />
        <button
          onClick={onOpenSettings}
          className={cn(
            'ml-1 px-3 h-7 rounded-btn inline-flex items-center gap-1.5 text-xs',
            'border border-transparent transition-colors',
            current === 'settings'
              ? 'bg-white/[0.08] text-fg border-white/[0.08]'
              : 'text-fg-muted hover:text-fg hover:bg-white/[0.04]'
          )}
        >
          <Settings size={13} />
          {t('settings')}
        </button>
        {unlocked && (
          <button
            onClick={onLock}
            className="px-3 h-7 rounded-btn inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-danger hover:bg-white/[0.04] transition-colors"
          >
            <Lock size={13} />
            {t('lock')}
          </button>
        )}
      </div>
    </div>
  )
}

function StatusPill({ unlocked }: { unlocked: boolean }) {
  const { t } = useI18n()
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full text-[11px] font-medium',
        'border border-white/[0.06] bg-white/[0.03]',
        unlocked ? 'text-accent' : 'text-fg-muted'
      )}
    >
      <span
        className={cn(
          'inline-block w-1.5 h-1.5 rounded-full',
          unlocked ? 'bg-accent' : 'bg-fg-muted'
        )}
      />
      {unlocked ? t('vault.unlocked') : t('vault.locked')}
    </div>
  )
}
