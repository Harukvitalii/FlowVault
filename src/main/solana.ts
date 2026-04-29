/**
 * Solana client — balance queries and SOL/SPL token transfers.
 * Uses @solana/web3.js for RPC calls and transaction building.
 */

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction
} from '@solana/web3.js'
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction
} from '@solana/spl-token'
import bs58 from 'bs58'
import type { Balance } from '../shared/types'

const DEFAULT_RPC = 'https://api.mainnet-beta.solana.com'
const TIMEOUT_MS = 15_000

/** Known SPL tokens we track balances for. */
const SPL_TOKENS: { symbol: string; mint: string; decimals: number }[] = [
  {
    symbol: 'USDC',
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    decimals: 6
  },
  {
    symbol: 'USDT',
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    decimals: 6
  }
]

const STABLES = new Set(['USDC', 'USDT'])

function getConnection(rpcUrl?: string): Connection {
  return new Connection(rpcUrl ?? DEFAULT_RPC, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: TIMEOUT_MS
  })
}

// ---- Key handling ----

/**
 * Validate and parse a Solana private key.
 * Accepts base58-encoded secret key (64 bytes = 88 chars base58).
 */
export function parseSecretKey(raw: string): Keypair {
  const trimmed = raw.trim()
  // Try base58 first
  try {
    const decoded = bs58.decode(trimmed)
    if (decoded.length === 64) return Keypair.fromSecretKey(decoded)
  } catch { /* not base58 */ }
  // Try JSON array
  try {
    const arr = JSON.parse(trimmed)
    if (Array.isArray(arr) && arr.length === 64) {
      return Keypair.fromSecretKey(Uint8Array.from(arr))
    }
  } catch { /* not JSON */ }
  throw new Error('Invalid Solana private key — expected base58 (88 chars) or JSON array (64 bytes)')
}

export function deriveAddress(secretKey: string): string {
  return parseSecretKey(secretKey).publicKey.toBase58()
}

// ---- Balances ----

export async function getSolanaBalances(
  address: string,
  rpcUrl?: string
): Promise<{ ok: boolean; balances?: Balance[]; error?: string }> {
  try {
    const pubkey = new PublicKey(address)
    const conn = getConnection(rpcUrl)
    const balances: Balance[] = []

    // SOL balance
    const lamports = await conn.getBalance(pubkey)
    const sol = lamports / LAMPORTS_PER_SOL
    if (sol > 0) {
      balances.push({
        asset: 'SOL',
        free: sol,
        usd: 0,
        chain: 'SOL'
      })
    }

    // SPL token balances
    for (const token of SPL_TOKENS) {
      try {
        const mint = new PublicKey(token.mint)
        const ata = await getAssociatedTokenAddress(mint, pubkey)
        const account = await getAccount(conn, ata)
        const amount = Number(account.amount) / Math.pow(10, token.decimals)
        if (amount > 0) {
          balances.push({
            asset: token.symbol,
            free: amount,
            usd: STABLES.has(token.symbol) ? amount : 0,
            chain: 'SOL'
          })
        }
      } catch {
        // Token account doesn't exist — balance is 0
      }
    }

    return { ok: true, balances }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'failed' }
  }
}

// ---- Transfers ----

export type SolTransferInput = {
  secretKey: string
  toAddress: string
  coin: string
  amount: number
  rpcUrl?: string
}

export type SolTransferResult = {
  ok: boolean
  txHash?: string
  error?: string
}

export async function sendSolanaTransfer(
  input: SolTransferInput
): Promise<SolTransferResult> {
  try {
    const keypair = parseSecretKey(input.secretKey)
    const conn = getConnection(input.rpcUrl)
    const toPubkey = new PublicKey(input.toAddress)
    const tx = new Transaction()

    if (input.coin === 'SOL') {
      // Native SOL transfer
      tx.add(
        SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey,
          lamports: Math.round(input.amount * LAMPORTS_PER_SOL)
        })
      )
    } else {
      // SPL token transfer
      const token = SPL_TOKENS.find(
        (t) => t.symbol === input.coin.toUpperCase()
      )
      if (!token) return { ok: false, error: `unsupported token: ${input.coin}` }

      const mint = new PublicKey(token.mint)
      const fromAta = await getAssociatedTokenAddress(mint, keypair.publicKey)
      const toAta = await getAssociatedTokenAddress(mint, toPubkey)

      // Create destination ATA if it doesn't exist
      try {
        await getAccount(conn, toAta)
      } catch {
        tx.add(
          createAssociatedTokenAccountInstruction(
            keypair.publicKey, // payer
            toAta,
            toPubkey,
            mint
          )
        )
      }

      const rawAmount = BigInt(
        Math.round(input.amount * Math.pow(10, token.decimals))
      )
      tx.add(
        createTransferInstruction(fromAta, toAta, keypair.publicKey, rawAmount)
      )
    }

    const txHash = await sendAndConfirmTransaction(conn, tx, [keypair], {
      commitment: 'confirmed'
    })

    console.log(
      `[solana] sent ${input.amount} ${input.coin} → ${input.toAddress} · tx ${txHash}`
    )
    return { ok: true, txHash }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed'
    console.error(`[solana] send FAIL · ${message}`)
    return { ok: false, error: message }
  }
}
