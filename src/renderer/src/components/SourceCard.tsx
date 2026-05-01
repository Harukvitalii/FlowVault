import { memo } from 'react'
import { AlertTriangle, Eye, Loader2, Wallet } from 'lucide-react'
import { GlassCard } from './GlassCard'
import { cn } from '../lib/cn'
import type { Source } from '../data/sources'
import { shortAddr } from '@shared/format'
import { useCountUp } from '../lib/useCountUp'

type Props = {
  source: Source
  selected: boolean
  /** Undefined = not clickable (watch-only wallet). */
  onSelect?: () => void
  hideBalances?: boolean
}

function SourceCardImpl({ source, selected, onSelect, hideBalances }: Props) {
  const totalUsd =
    source.balances?.reduce((acc, b) => acc + b.usd, 0) ?? null
  const animatedTotal = useCountUp(totalUsd, source.id)
  const watchOnly = source.canSend === false

  return (
    <GlassCard
      interactive={!!onSelect}
      selected={selected}
      onClick={onSelect}
      className={cn('p-4 flex flex-col gap-3 min-w-[180px]', watchOnly && 'opacity-70')}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0"
            style={{
              background: source.accent + '22',
              color: source.accent,
              border: `1px solid ${source.accent}33`
            }}
          >
            {source.kind === 'evm' ? (watchOnly ? <Eye size={14} /> : <Wallet size={14} />) : source.short}
          </div>
          <span className="text-sm font-medium text-fg truncate">
            {source.name}
          </span>
        </div>
        <span
          className={cn(
            'text-[10px] uppercase tracking-wider font-semibold shrink-0',
            source.kind === 'cex'
              ? 'text-fg-muted'
              : source.network === 'SOL'
                ? 'text-[#9945FF]'
                : 'text-[#627EEA]'
          )}
        >
          {source.kind === 'cex'
            ? 'CEX'
            : source.network
              ? source.network
              : source.canSend === false
                ? 'WATCH'
                : 'EVM'}
        </span>
      </div>

      <div>
        <div className="text-xs text-fg-muted mb-1">Total</div>
        {source.error ? (
          <div className="font-mono font-tnum text-sm text-danger inline-flex items-center gap-1.5">
            <AlertTriangle size={12} />
            error
          </div>
        ) : source.balances === null ? (
          <div className="font-mono font-tnum text-sm text-fg-muted inline-flex items-center gap-1.5">
            <Loader2 size={12} className="animate-spin" />
            loading
          </div>
        ) : hideBalances ? (
          <div className="font-mono font-tnum text-lg text-fg">$••••</div>
        ) : (
          <div className="font-mono font-tnum text-lg text-fg">
            $
            {(animatedTotal ?? 0).toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-0.5 text-[11px] font-mono font-tnum text-fg-muted min-h-[3rem]">
        {source.error ? (
          <span className="text-fg-muted/70 truncate" title={source.error}>
            {source.error}
          </span>
        ) : source.balances === null ? (
          <span className="text-fg-muted/50">Fetching balances…</span>
        ) : hideBalances ? (
          source.balances.slice(0, 3).map((b, i) => (
            <div
              key={`${b.asset}-${b.chain ?? b.accountType ?? 'cex'}-${i}`}
              className="flex justify-between items-center"
            >
              <span>{b.asset}</span>
              <span className="text-fg/80">••••</span>
            </div>
          ))
        ) : source.kind === 'evm' && source.balances.length === 0 ? (
          <span className="text-fg-muted/70 truncate">
            {source.address ? shortAddr(source.address) : '—'}
          </span>
        ) : source.balances.length === 0 ? (
          <span className="text-fg-muted/70">No balances</span>
        ) : (
          source.balances.slice(0, 3).map((b, i) => (
            <div
              key={`${b.asset}-${b.chain ?? b.accountType ?? 'cex'}-${i}`}
              className="flex justify-between items-center"
            >
              <span className="inline-flex items-center gap-1.5">
                {b.asset}
                {b.chain && (
                  <span className="text-[9px] uppercase tracking-wider text-fg-muted/70 border border-white/[0.08] rounded px-1 py-px">
                    {b.chain}
                  </span>
                )}
                {b.accountType && (
                  <span className="text-[9px] uppercase tracking-wider text-fg-muted/70 border border-white/[0.08] rounded px-1 py-px">
                    {b.accountType}
                  </span>
                )}
              </span>
              <span className="text-fg/80">
                {b.free.toLocaleString('en-US', { maximumFractionDigits: 4 })}
              </span>
            </div>
          ))
        )}
      </div>
    </GlassCard>
  )
}

/**
 * Memoized: identity of `source` is preserved across Dashboard refreshes
 * (only the matching record is replaced inside fetchAllBalances), so
 * unrelated tick re-renders skip re-rendering the entire grid.
 */
export const SourceCard = memo(SourceCardImpl)
