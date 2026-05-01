import { HTMLAttributes, forwardRef } from 'react'
import { cn } from '../lib/cn'

type Props = HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean
  selected?: boolean
}

export const GlassCard = forwardRef<HTMLDivElement, Props>(
  ({ className, interactive, selected, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          // backdrop-saturate-150 makes the bg colors behind the blur read more
          // vividly through the glass — the page gradient + accent blobs
          // bloom into the card instead of getting fully washed out.
          'rounded-card border backdrop-blur-xl backdrop-saturate-150 shadow-glass transition-all duration-200',
          'border-white/[0.08] bg-white/[0.04]',
          interactive &&
            'cursor-pointer hover:-translate-y-px hover:bg-white/[0.07] hover:border-white/[0.14] hover:shadow-glass-hover active:translate-y-0 active:scale-[0.98]',
          selected && 'border-accent/60 bg-accent/[0.06] shadow-glass-hover',
          className
        )}
        {...rest}
      />
    )
  }
)

GlassCard.displayName = 'GlassCard'
