/**
 * Mask the middle of a string so we can log addresses/keys/txids without
 * spilling the full value to disk. Keeps enough on each side to be useful
 * for support ("did you mean 0xAb12…ef34?") without enabling correlation.
 */
export function mask(s: string | undefined, head = 6, tail = 4): string {
  if (!s) return ''
  if (s.length <= head + tail + 1) return s
  return `${s.slice(0, head)}…${s.slice(-tail)}`
}
