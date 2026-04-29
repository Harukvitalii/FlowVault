import { isEvmFamily, networkFamily } from './networks'

export type NetworkClass =
  | 'evm'
  | 'tron'
  | 'solana'
  | 'bitcoin'
  | 'aptos'
  | 'cosmos'
  | 'ton'
  | 'ripple'
  | 'near'
  | 'polkadot'
  | 'other'
  | 'unknown'

export function networkClassOf(family: string): NetworkClass {
  if (!family) return 'unknown'
  if (isEvmFamily(family)) return 'evm'
  if (family === 'TRX') return 'tron'
  if (family === 'SOL') return 'solana'
  if (family === 'BTC' || family === 'BCH' || family === 'LTC') return 'bitcoin'
  if (family === 'APT') return 'aptos'
  if (family === 'ATOM' || family === 'OSMO' || family === 'SEI') return 'cosmos'
  if (family === 'TON') return 'ton'
  if (family === 'XRP') return 'ripple'
  if (family === 'NEAR') return 'near'
  if (family === 'DOT' || family === 'KSM') return 'polkadot'
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
    case 'aptos':
      // Aptos: 0x + 64 hex chars (32 bytes), sometimes shorter with leading zeros trimmed
      return /^0x[0-9a-fA-F]{1,64}$/.test(address) && address.length >= 10
    case 'cosmos':
      // Cosmos-based: bech32 addresses (cosmos1..., sei1..., osmo1...)
      return /^[a-z]{2,10}1[a-z0-9]{38,58}$/.test(address)
    case 'ton':
      // TON: base64url 48 chars, or raw 0: prefix
      return /^(EQ|UQ)[A-Za-z0-9_-]{46}$/.test(address) || /^0:[0-9a-fA-F]{64}$/.test(address)
    case 'ripple':
      // XRP: starts with r, base58, 25-35 chars
      return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(address)
    case 'near':
      // NEAR: account names (lowercase, digits, -, _) or implicit (64 hex)
      return /^[a-z0-9._-]{2,64}$/.test(address) || /^[0-9a-f]{64}$/.test(address)
    case 'polkadot':
      // Polkadot/Kusama: SS58 format, base58, starts with 1 (Polkadot) or others
      return /^[1-9A-HJ-NP-Za-km-z]{46,48}$/.test(address)
    case 'other':
    default:
      return true
  }
}

export function isValidForNetwork(network: string, address: string): boolean {
  return isValidAddress(networkFamily(network), address)
}

/**
 * Returns a human-readable description of the expected address format
 * for the given network family. Used in UI hints.
 */
export function addressFormatHint(family: string): string {
  const cls = networkClassOf(family)
  switch (cls) {
    case 'evm':
      return '0x + 40 hex chars (e.g. 0xAb5...1eF)'
    case 'tron':
      return 'starts with T, 34 chars (e.g. TJR3...xYz)'
    case 'solana':
      return 'base58, 32-44 chars (e.g. 7xKX...9pQ)'
    case 'bitcoin':
      return 'bc1... (bech32), 1... or 3... (legacy)'
    case 'aptos':
      return '0x + up to 64 hex chars (e.g. 0xd685...aef1f)'
    case 'cosmos':
      return 'bech32, prefix + 1 + alphanumeric (e.g. cosmos1...)'
    case 'ton':
      return 'EQ/UQ + 46 chars or 0: + 64 hex'
    case 'ripple':
      return 'starts with r, 25-35 chars (e.g. rN7d...)'
    case 'near':
      return 'account name (e.g. alice.near) or 64 hex'
    case 'polkadot':
      return 'SS58 format, 46-48 chars'
    default:
      return 'format not verified for this network'
  }
}
