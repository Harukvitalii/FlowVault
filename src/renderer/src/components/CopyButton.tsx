import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '../lib/cn'

type Props = {
  /** Text to copy to the clipboard. */
  value: string
  /** Icon size in px. */
  size?: number
  /** Tailwind classes for the button. */
  className?: string
  /** Optional title (tooltip) override. */
  title?: string
  /** How long to show the checkmark before reverting, ms. */
  feedbackMs?: number
}

/**
 * Click-to-copy button with a swap animation: Copy icon → Check icon for
 * `feedbackMs`, then back. Replaces the older "copy + flash 'copied' text"
 * pattern; reads as more polished and never causes layout shift.
 */
export function CopyButton({
  value,
  size = 13,
  className,
  title = 'Copy',
  feedbackMs = 1200
}: Props) {
  const [copied, setCopied] = useState(false)
  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // Clipboard may be denied in sandboxed contexts; swallow silently.
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), feedbackMs)
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={copied ? 'Copied' : title}
      aria-label={copied ? 'Copied' : title}
      className={cn(
        'inline-flex items-center justify-center transition-colors',
        copied ? 'text-accent' : 'text-fg-muted hover:text-fg',
        className
      )}
    >
      {copied ? <Check size={size} /> : <Copy size={size} />}
    </button>
  )
}
