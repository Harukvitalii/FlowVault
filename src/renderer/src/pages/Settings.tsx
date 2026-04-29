import { useState } from 'react'
import { cn } from '../lib/cn'
import { useI18n } from '../lib/i18n'
import { ExchangesTab } from '../components/ExchangesTab'
import { WalletsTab } from '../components/WalletsTab'
import { RpcsTab } from '../components/RpcsTab'
import { SecurityTab } from '../components/SecurityTab'
import { SetupTab } from '../components/SetupTab'
import { StatisticsTab } from '../components/StatisticsTab'

type Tab = 'exchanges' | 'wallets' | 'rpcs' | 'setup' | 'security' | 'statistics'

type Props = {
  onWiped: () => void
}

export function SettingsPage({ onWiped }: Props) {
  const [tab, setTab] = useState<Tab>('setup')
  const { t } = useI18n()
  return (
    <div className="flex-1 overflow-y-auto relative z-10">
      <div className="max-w-5xl mx-auto px-8 py-8 space-y-5">
        <h1 className="text-2xl font-semibold">{t('settings.title')}</h1>
        <div className="flex gap-1 border-b border-white/[0.06]">
          <TabBtn active={tab === 'setup'} onClick={() => setTab('setup')}>
            {t('tab.setup')}
          </TabBtn>
          <TabBtn
            active={tab === 'exchanges'}
            onClick={() => setTab('exchanges')}
          >
            {t('tab.exchanges')}
          </TabBtn>
          <TabBtn active={tab === 'wallets'} onClick={() => setTab('wallets')}>
            {t('tab.wallets')}
          </TabBtn>
          <TabBtn active={tab === 'rpcs'} onClick={() => setTab('rpcs')}>
            {t('tab.rpcs')}
          </TabBtn>
          <TabBtn
            active={tab === 'statistics'}
            onClick={() => setTab('statistics')}
          >
            Statistics
          </TabBtn>
          <TabBtn
            active={tab === 'security'}
            onClick={() => setTab('security')}
          >
            {t('tab.security')}
          </TabBtn>
        </div>

        {tab === 'exchanges' && <ExchangesTab />}
        {tab === 'wallets' && <WalletsTab />}
        {tab === 'rpcs' && <RpcsTab />}
        {tab === 'setup' && <SetupTab />}
        {tab === 'statistics' && <StatisticsTab />}
        {tab === 'security' && <SecurityTab onWiped={onWiped} />}
      </div>
    </div>
  )
}

function TabBtn({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-4 h-10 text-sm font-medium transition-colors relative',
        active ? 'text-fg' : 'text-fg-muted hover:text-fg'
      )}
    >
      {children}
      {active && (
        <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-accent rounded-full" />
      )}
    </button>
  )
}
