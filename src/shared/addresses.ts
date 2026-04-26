import { isEvmFamily, networkFamily } from './networks'

export type NetworkClass =
  | 'evm'
  | 'tron'
  | 'solana'
  | 'bitcoin'
  | 'other'
  | 'unknown'

export function networkClassOf(family: string): NetworkClass {
  if (!family) return 'unknown'
  if (isEvmFamily(family)) return 'evm'
  if (family === 'TRX') return 'tron'
  if (family === 'SOL') return 'solana'
  if (family === 'BTC' || family === 'BCH' || family === 'LTC') return 'bitcoin'
  // Anything we know the label for is a real chain, just not one of the big
  // families above — tag as "other" so the UI knows it isn't unknown.
  return 'other'
}

/**
 * Quick format check — not a deep validator. Enough to catch obvious
 * network/address mismatches (sending to a TRC20 address on an EVM chain, etc).
 */
export function isValidAddress(family: string, address: string): boolean {
  if (!address) return false
  const cls = networkClassOf(family)
  switch (cls) {
    case 'evm':
      return /^0x[0-9a-fA-F]{40}$/.test(address)
    case 'tron':
      return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)
    case 'solana':
      return (
        /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address) && !/^T/.test(address)
      )
    case 'bitcoin':
      return /^(bc1[0-9a-zA-HJ-NP-Z]{23,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(
        address
      )
    case 'other':
      // Known chain we don't validate — allow but note format wasn't checked.
      return true
    default:
      // Truly unknown — still allow to avoid blocking, but callers can
      // distinguish 'other' (known chain) from 'unknown' via networkClassOf.
      return true
  }
}

export function isValidForNetwork(network: string, address: string): boolean {
  return isValidAddress(networkFamily(network), address)
}
