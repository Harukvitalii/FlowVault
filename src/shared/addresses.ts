import bs58 from 'bs58'
import { sha256 } from '@noble/hashes/sha2.js'
import { isEvmFamily, networkFamily } from './networks'

/**
 * Decode a base58 string and verify its 4-byte trailing SHA-256d checksum.
 * Used by Bitcoin (legacy/P2SH) and Tron — both share the base58check
 * encoding format. Returns the unchecked payload bytes on success, null on
 * any decode/length/checksum failure.
 */
function decodeBase58Check(s: string): Uint8Array | null {
  let raw: Uint8Array
  try {
    raw = bs58.decode(s)
  } catch {
    return null
  }
  if (raw.length < 5) return null
  const payload = raw.subarray(0, raw.length - 4)
  const checksum = raw.subarray(raw.length - 4)
  const expected = sha256(sha256(payload)).subarray(0, 4)
  for (let i = 0; i < 4; i++) {
    if (checksum[i] !== expected[i]) return null
  }
  return payload
}

function decodeBase58(s: string): Uint8Array | null {
  try {
    return bs58.decode(s)
  } catch {
    return null
  }
}

/**
 * Strip Unicode invisibles that survive `.trim()` — zero-width spaces/joiners,
 * BOM, bidi controls, narrow no-break spaces. These get pasted in from
 * messengers / docs and would otherwise corrupt addresses silently (some
 * regex validators accept them, then the chain rejects on send — or worse,
 * a permissive validator passes and funds go to a malformed address).
 */
const INVISIBLE_RE = new RegExp(
  // U+00A0 NBSP, U+1680 OGHAM SP, U+2000-U+200F (en/em + ZWSP/ZWJ/ZWNJ/LRM/RLM),
  // U+2028/U+2029 line/para sep, U+202A-U+202E bidi overrides,
  // U+205F medium math sp, U+2060-U+206F word-joiner/invisible ops, U+FEFF BOM
  '[\\u00A0\\u1680\\u2000-\\u200F\\u2028\\u2029\\u202A-\\u202E\\u205F\\u2060-\\u206F\\uFEFF]',
  'g'
)

export function sanitizeAddressInput(s: string): string {
  return s.replace(INVISIBLE_RE, '').trim()
}

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
    case 'tron': {
      // Tron addresses are base58check-encoded with version byte 0x41 ('T'
      // prefix). Decode + verify checksum + check the 21-byte payload.
      if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) return false
      const payload = decodeBase58Check(address)
      return !!payload && payload.length === 21 && payload[0] === 0x41
    }
    case 'solana': {
      // Solana pubkeys are 32-byte base58. No checksum format — decode and
      // assert exact length. Reject anything starting with 'T' to avoid
      // accepting Tron-shaped strings of the same length.
      if (/^T/.test(address)) return false
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return false
      const decoded = decodeBase58(address)
      return !!decoded && decoded.length === 32
    }
    case 'bitcoin': {
      // Bech32 (segwit) — trust regex shape; full bech32 verification needs a
      // separate codec we don't ship. Legacy/P2SH (1.../3...) → base58check.
      if (/^bc1[0-9a-zA-HJ-NP-Z]{23,87}$/.test(address)) return true
      if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) {
        const payload = decodeBase58Check(address)
        // P2PKH = version 0x00; P2SH = version 0x05; payload always 21 bytes.
        return (
          !!payload &&
          payload.length === 21 &&
          (payload[0] === 0x00 || payload[0] === 0x05)
        )
      }
      return false
    }
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
    case 'unknown':
    default:
      return false
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
