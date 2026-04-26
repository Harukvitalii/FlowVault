import { useEffect, useState } from 'react'
import { Titlebar } from './components/Titlebar'
import { LockPage } from './pages/Lock'
import { DashboardPage } from './pages/Dashboard'
import { SettingsPage } from './pages/Settings'
import type { VaultState } from '@shared/types'

type View = 'dashboard' | 'settings'

export default function App() {
  const [vaultState, setVaultState] = useState<VaultState>('locked')
  const [view, setView] = useState<View>('dashboard')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    window.api.vault.state().then((s) => {
      setVaultState(s)
      setLoaded(true)
    })
  }, [])

  const unlocked = vaultState === 'unlocked'

  // Fire warmup every time the vault transitions into 'unlocked'.
  useEffect(() => {
    if (vaultState === 'unlocked') {
      window.api.exchanges.warmup().catch(() => undefined)
    }
  }, [vaultState])

  const lock = async () => {
    await window.api.vault.lock()
    setVaultState('locked')
    setView('dashboard')
  }

  return (
    <div className="h-full flex flex-col text-fg overflow-hidden">
      <div className="bg-ambient" />
      <Titlebar
        unlocked={unlocked}
        onLock={lock}
        onOpenSettings={() =>
          setView((v) => (v === 'settings' ? 'dashboard' : 'settings'))
        }
        current={view}
      />

      {!loaded ? (
        <div className="flex-1" />
      ) : !unlocked ? (
        <LockPage
          vaultState={vaultState}
          onUnlocked={() => setVaultState('unlocked')}
        />
      ) : view === 'settings' ? (
        <SettingsPage
          onWiped={() => {
            setVaultState('empty')
            setView('dashboard')
          }}
        />
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          <DashboardPage />
        </div>
      )}
    </div>
  )
}
