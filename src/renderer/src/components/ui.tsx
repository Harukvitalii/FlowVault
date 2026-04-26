import { InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '../lib/cn'

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  mono?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, mono, ...rest }, ref) => (
    <input
      ref={ref}
      className={cn(
        'w-full h-10 rounded-btn px-3 bg-white/[0.04] border border-white/[0.08]',
        'text-sm text-fg placeholder:text-fg-muted/50',
        'focus:outline-none focus:border-accent/60 focus:bg-white/[0.06] transition-colors',
        mono && 'font-mono font-tnum',
        className
      )}
      {...rest}
    />
  )
)
Input.displayName = 'Input'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function Button({
  variant = 'secondary',
  className,
  disabled,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const base =
    'h-10 px-4 rounded-btn text-sm font-medium transition-all inline-flex items-center justify-center gap-2'
  const styles: Record<ButtonVariant, string> = {
    primary: 'bg-accent text-on-accent hover:bg-accent-hover shadow-cta active:scale-[0.99]',
    secondary:
      'bg-white/[0.04] border border-white/[0.08] text-fg hover:bg-white/[0.07]',
    ghost: 'text-fg-muted hover:text-fg hover:bg-white/[0.04]',
    danger:
      'bg-danger/10 border border-danger/30 text-danger hover:bg-danger/20'
  }
  return (
    <button
      disabled={disabled}
      className={cn(
        base,
        styles[variant],
        disabled && 'opacity-40 cursor-not-allowed hover:bg-transparent',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-widest text-fg-muted mb-1.5">
      {children}
    </div>
  )
}

export function Row({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  )
}
