/**
 * Truncate a long string (address, txid, key) to head…tail form. Defaults
 * 6/4 — chosen so an EVM `0x` + 4-char hex prefix stays visible without
 * dominating the layout. Pass explicit lengths for tx hashes (10/8 reads
 * better) or short identifiers (whatever you need).
 */
export function shortAddr(s: string, head = 6, tail = 4): string {
  if (!s) return ''
  if (s.length <= head + tail + 1) return s
  return `${s.slice(0, head)}…${s.slice(-tail)}`
}
