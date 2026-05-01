import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { AlertTriangle, Check, Loader2, X } from 'lucide-react'
import { cn } from '../lib/cn'

type ToastKind = 'success' | 'error' | 'info'

type Toast = {
  id: string
  kind: ToastKind
  title: string
  description?: string
  /** Auto-dismiss after this many ms. 0 = sticky. Default 4500. */
  durationMs?: number
  /** Internal: set when dismiss is requested so the card plays its exit
   *  animation before being removed from the list. */
  exiting?: boolean
}

/** Must match the `toast-out` animation duration in tailwind.config.js. */
const EXIT_MS = 240

type ToastInput = Omit<Toast, 'id'>

type ToastApi = {
  push: (t: ToastInput) => string
  dismiss: (id: string) => void
}

const ToastCtx = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx)
  if (!ctx) {
    throw new Error('useToast() must be used within <ToasterProvider>')
  }
  return ctx
}

export function ToasterProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])

  // Two-phase: mark exiting so the card plays its slide-out, then unmount
  // after the animation. Calling dismiss twice on the same id is a no-op.
  const dismiss = useCallback((id: string) => {
    setItems((prev) => {
      const target = prev.find((t) => t.id === id)
      if (!target || target.exiting) return prev
      return prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    })
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id))
    }, EXIT_MS)
  }, [])

  const push = useCallback((input: ToastInput): string => {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setItems((prev) => [...prev, { id, ...input }])
    return id
  }, [])

  // Schedule auto-dismiss per toast (skip ones already animating out).
  useEffect(() => {
    const timers = items
      .filter((t) => !t.exiting && (t.durationMs ?? 4500) > 0)
      .map((t) =>
        setTimeout(() => dismiss(t.id), t.durationMs ?? 4500)
      )
    return () => {
      for (const tm of timers) clearTimeout(tm)
    }
  }, [items, dismiss])

  return (
    <ToastCtx.Provider value={{ push, dismiss }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none"
      >
        {items.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const tone =
    toast.kind === 'success'
      ? 'border-accent/40 bg-accent/[0.08] text-accent'
      : toast.kind === 'error'
        ? 'border-danger/40 bg-danger/[0.08] text-danger'
        : 'border-white/[0.10] bg-white/[0.04] text-fg-muted'
  const Icon =
    toast.kind === 'success' ? Check : toast.kind === 'error' ? AlertTriangle : Loader2
  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto min-w-[260px] max-w-sm rounded-card border backdrop-blur-xl shadow-glass',
        'pl-3 pr-2 py-2.5 flex items-start gap-2.5 transition-[height,margin] duration-200',
        toast.exiting ? 'animate-toast-out' : 'animate-toast-in',
        tone
      )}
    >
      <Icon
        size={14}
        className={cn(
          'shrink-0 mt-0.5',
          toast.kind === 'info' && 'animate-spin'
        )}
      />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold text-fg leading-tight">
          {toast.title}
        </div>
        {toast.description && (
          <div className="mt-0.5 text-[11px] text-fg-muted leading-snug break-all">
            {toast.description}
          </div>
        )}
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 w-5 h-5 rounded inline-flex items-center justify-center text-fg-muted/70 hover:text-fg hover:bg-white/[0.06] transition-colors"
      >
        <X size={11} />
      </button>
    </div>
  )
}
