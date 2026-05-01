/**
 * Parse a decimal string into a base-unit bigint without going through
 * a JavaScript float. Used at the chain boundary so user input like
 * "1.234567890" is converted exactly into lamports / wei without losing
 * precision in IEEE-754 round trips.
 *
 * Truncates extra fractional digits (round-down). Throws on malformed input.
 */
export function parseDecimalToBaseUnits(amount: string, decimals: number): bigint {
  if (typeof amount !== 'string') throw new Error('amount must be a string')
  const trimmed = amount.trim()
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(trimmed)) {
    throw new Error(`invalid decimal: ${trimmed}`)
  }
  const [intPartRaw, fracPartRaw = ''] = trimmed.split('.')
  const intPart = intPartRaw === '' ? '0' : intPartRaw
  // Truncate (round down) any digits beyond `decimals` precision.
  const frac = fracPartRaw.slice(0, decimals).padEnd(decimals, '0')
  const base = BigInt(10) ** BigInt(decimals)
  return BigInt(intPart) * base + BigInt(frac || '0')
}
