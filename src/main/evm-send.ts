import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  formatEther,
  formatUnits,
  http,
  parseUnits,
  type Chain,
  type Hash
} from 'viem'
import {
  arbitrum,
  base,
  bsc,
  mainnet,
  optimism,
  polygon
} from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { getWalletPrivateKey } from './vault'
import { listRpcs } from './vault'
import { bestRpcsForChain } from './rpc'
import { findChainTokens, findToken } from './evm'
import {
  addPending as addPendingWithdrawal,
  update as updateWithdrawal
} from './withdrawals'
import { findCexDepositByTx } from './exchanges'
import type {
  EvmSendInput,
  EvmSubmitResult,
  PreflightCheck,
  PreflightResult,
  WithdrawRecord,
  WithdrawStatus
} from '../shared/types'

const CHAINS: Record<number, Chain> = {
  1: mainnet,
  42161: arbitrum,
  10: optimism,
  8453: base,
  56: bsc,
  137: polygon
}

function chainShort(chainId: number): string {
  return findChainTokens(chainId)?.short ?? `chain-${chainId}`
}

function firstRpcUrl(chainId: number): string | null {
  const sorted = bestRpcsForChain(listRpcs(), chainId)
  return sorted[0]?.url ?? null
}

function makePublicClient(chain: Chain, rpcUrl: string) {
  return createPublicClient({ chain, transport: http(rpcUrl) })
}

function makeWalletClient(chain: Chain, rpcUrl: string, pk: `0x${string}`) {
  const account = privateKeyToAccount(pk)
  return {
    account,
    wallet: createWalletClient({ account, chain, transport: http(rpcUrl) })
  }
}

function isValidEvmAddress(address: string): address is `0x${string}` {
  return /^0x[0-9a-fA-F]{40}$/.test(address)
}

type Plan =
  | {
      kind: 'native'
      chainId: number
      chain: Chain
      rpcUrl: string
      fromAddress: `0x${string}`
      toAddress: `0x${string}`
      value: bigint
      displayAmount: string
      nativeSymbol: string
    }
  | {
      kind: 'erc20'
      chainId: number
      chain: Chain
      rpcUrl: string
      fromAddress: `0x${string}`
      toAddress: `0x${string}`
      tokenAddress: `0x${string}`
      decimals: number
      coin: string
      value: bigint
      displayAmount: string
      nativeSymbol: string
    }

/**
 * Resolve everything we need about the transfer. Does NOT touch the network.
 * Throws on user-facing errors (bad chain / bad token / bad address).
 */
function buildPlan(
  input: EvmSendInput,
  pk: `0x${string}`
): Plan {
  const chain = CHAINS[input.chainId]
  if (!chain) throw new Error(`chain ${input.chainId} not supported`)
  const chainTokens = findChainTokens(input.chainId)
  if (!chainTokens) throw new Error(`chain ${input.chainId} has no token map`)
  if (!isValidEvmAddress(input.toAddress))
    throw new Error('destination address is not EVM-formatted')
  const rpcUrl = firstRpcUrl(input.chainId)
  if (!rpcUrl)
    throw new Error(`no RPC configured for ${chainShort(input.chainId)}`)

  const from = privateKeyToAccount(pk).address
  const tok = findToken(input.chainId, input.coin)
  if (!tok) throw new Error(`coin ${input.coin} not on ${chainTokens.short}`)

  // Use toFixed to avoid floating-point representation artifacts like
  // 0.30000000000000004 that would cause parseUnits to produce wrong values.
  const amountStr = typeof input.amount === 'string' ? input.amount : input.amount.toFixed(18)

  if (tok === 'native') {
    const value = parseUnits(amountStr, 18)
    return {
      kind: 'native',
      chainId: input.chainId,
      chain,
      rpcUrl,
      fromAddress: from,
      toAddress: input.toAddress,
      value,
      displayAmount: `${input.amount} ${chainTokens.nativeSymbol}`,
      nativeSymbol: chainTokens.nativeSymbol
    }
  }
  const value = parseUnits(amountStr, tok.decimals)
  return {
    kind: 'erc20',
    chainId: input.chainId,
    chain,
    rpcUrl,
    fromAddress: from,
    toAddress: input.toAddress,
    tokenAddress: tok.address,
    decimals: tok.decimals,
    coin: tok.symbol,
    value,
    displayAmount: `${input.amount} ${tok.symbol}`,
    nativeSymbol: chainTokens.nativeSymbol
  }
}

function check(
  label: string,
  ok: boolean,
  detail?: string,
  warn = false
): PreflightCheck {
  return {
    label,
    status: ok ? 'ok' : warn ? 'warn' : 'fail',
    detail
  }
}

/**
 * Dry-run: everything short of signing+broadcasting. Confirms the transfer
 * would succeed, how much gas it'd cost, and whether the wallet has enough
 * native balance to cover it.
 */
export async function preflightEvmSend(
  input: EvmSendInput
): Promise<PreflightResult> {
  const checks: PreflightCheck[] = []
  const info: { label: string; value: string }[] = []

  const pk = getWalletPrivateKey(input.walletId)
  checks.push(check('Wallet unlocked', !!pk))
  if (!pk) return { ok: false, checks }

  let plan: Plan
  try {
    plan = buildPlan(input, pk)
  } catch (err) {
    checks.push(
      check('Plan', false, err instanceof Error ? err.message : 'failed')
    )
    return { ok: false, checks }
  }
  checks.push(
    check(
      'Destination address',
      true,
      `${plan.toAddress.slice(0, 6)}…${plan.toAddress.slice(-4)}`
    )
  )
  checks.push(
    check('RPC endpoint', true, `${plan.chain.name} · ${plan.rpcUrl}`)
  )

  const publicClient = makePublicClient(plan.chain, plan.rpcUrl)

  try {
    let gasEstimate: bigint
    if (plan.kind === 'native') {
      gasEstimate = await publicClient.estimateGas({
        account: plan.fromAddress,
        to: plan.toAddress,
        value: plan.value
      })
    } else {
      gasEstimate = await publicClient.estimateContractGas({
        address: plan.tokenAddress,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [plan.toAddress, plan.value],
        account: plan.fromAddress
      })
    }

    // Gas price — use EIP-1559 when available. Fall back to legacy.
    let gasPrice: bigint
    try {
      const fees = await publicClient.estimateFeesPerGas()
      gasPrice = fees.maxFeePerGas ?? (await publicClient.getGasPrice())
    } catch {
      gasPrice = await publicClient.getGasPrice()
    }

    const totalFeeWei = gasEstimate * gasPrice
    const totalFeeNative = formatEther(totalFeeWei)
    const nativeBalanceWei = await publicClient.getBalance({
      address: plan.fromAddress
    })
    const nativeBalance = formatEther(nativeBalanceWei)

    checks.push(
      check(
        'Gas estimated',
        true,
        `${gasEstimate.toString()} gas · ${Number(totalFeeNative).toFixed(6)} ${plan.nativeSymbol}`
      )
    )

    // Balance checks.
    if (plan.kind === 'native') {
      const required = plan.value + totalFeeWei
      const enough = nativeBalanceWei >= required
      checks.push(
        check(
          `Wallet has ${plan.nativeSymbol} for amount + gas`,
          enough,
          enough
            ? `${Number(nativeBalance).toFixed(6)} ${plan.nativeSymbol} available`
            : `need ${Number(formatEther(required)).toFixed(6)}, have ${Number(nativeBalance).toFixed(6)}`
        )
      )
    } else {
      // Token balance.
      const tokenBalance = (await publicClient.readContract({
        address: plan.tokenAddress,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [plan.fromAddress]
      })) as bigint
      checks.push(
        check(
          `${plan.coin} balance covers amount`,
          tokenBalance >= plan.value,
          `${formatUnits(tokenBalance, plan.decimals)} ${plan.coin} available`
        )
      )
      checks.push(
        check(
          `${plan.nativeSymbol} balance covers gas`,
          nativeBalanceWei >= totalFeeWei,
          nativeBalanceWei >= totalFeeWei
            ? `${Number(nativeBalance).toFixed(6)} ${plan.nativeSymbol} available`
            : `need ${Number(totalFeeNative).toFixed(6)}, have ${Number(nativeBalance).toFixed(6)}`
        )
      )
    }

    // Optional: contract call simulation for ERC20.
    if (plan.kind === 'erc20') {
      try {
        await publicClient.simulateContract({
          address: plan.tokenAddress,
          abi: erc20Abi,
          functionName: 'transfer',
          args: [plan.toAddress, plan.value],
          account: plan.fromAddress
        })
        checks.push(check('Contract call simulates successfully', true))
      } catch (err) {
        checks.push(
          check(
            'Contract call simulates successfully',
            false,
            err instanceof Error ? err.message.split('\n')[0] : 'failed'
          )
        )
      }
    }

    info.push(
      { label: 'Network', value: plan.chain.name },
      {
        label: 'Gas estimate',
        value: `${gasEstimate.toString()} gas`
      },
      {
        label: 'Network fee',
        value: `${Number(totalFeeNative).toFixed(6)} ${plan.nativeSymbol}`
      },
      {
        label: 'Sending',
        value: plan.displayAmount
      }
    )
  } catch (err) {
    checks.push(
      check(
        'Gas estimation',
        false,
        err instanceof Error ? err.message.split('\n')[0] : 'failed'
      )
    )
  }

  const ok = checks.every((c) => c.status === 'ok' || c.status === 'warn')
  return { ok, checks, info }
}

export async function submitEvmSend(
  input: EvmSendInput
): Promise<EvmSubmitResult> {
  const pk = getWalletPrivateKey(input.walletId)
  if (!pk) return { ok: false, error: 'wallet not in vault (locked?)' }
  let plan: Plan
  try {
    plan = buildPlan(input, pk)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'failed' }
  }

  // Open a withdrawal record so the Activity panel reflects it.
  const record = await addPendingWithdrawal({
    kind: 'evm',
    exchangeAccountId: input.walletId,
    exchangeLabel: 'EVM wallet',
    chainId: input.chainId,
    destCexAccountId: input.destCexAccountId,
    coin: plan.kind === 'native' ? plan.nativeSymbol : plan.coin,
    network: chainShort(input.chainId),
    amount: input.amount,
    fee: 0,
    address: plan.toAddress,
    destLabel: input.destLabel
  })

  try {
    const { wallet } = makeWalletClient(plan.chain, plan.rpcUrl, pk)
    let hash: Hash
    if (plan.kind === 'native') {
      hash = await wallet.sendTransaction({
        to: plan.toAddress,
        value: plan.value
      })
    } else {
      hash = await wallet.writeContract({
        address: plan.tokenAddress,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [plan.toAddress, plan.value]
      })
    }
    await updateWithdrawal(record.id, {
      status: 'pending',
      exchangeTxId: hash,
      chainTxHash: hash
    })
    console.log(
      `[evm-send] ${plan.chainId} ${plan.displayAmount} → ${plan.toAddress} · tx ${hash}`
    )
    return { ok: true, txHash: hash, chainId: plan.chainId, recordId: record.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed'
    await updateWithdrawal(record.id, {
      status: 'failed',
      error: message
    })
    console.error(`[evm-send] submit FAIL · ${message}`)
    return { ok: false, error: message }
  }
}

/**
 * Poller dispatch target for EVM records. Checks on-chain receipt; if the
 * destination is a known CEX account, additionally checks whether the
 * exchange has already credited the deposit so the record can flip to 'ok'.
 */
export async function checkEvmStatus(rec: WithdrawRecord): Promise<{
  status: WithdrawStatus
  chainTxHash?: string
  error?: string
} | null> {
  if (!rec.chainId || !rec.exchangeTxId) return null
  const chain = CHAINS[rec.chainId]
  if (!chain) return null
  const rpcUrl = firstRpcUrl(rec.chainId)
  if (!rpcUrl) return null
  const hash = rec.exchangeTxId as `0x${string}`
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) })
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash })
    if (receipt.status === 'reverted') {
      return {
        status: 'failed',
        chainTxHash: hash,
        error: 'transaction reverted on-chain'
      }
    }
    // Success on-chain. If destination is a known CEX account, see if the
    // deposit has landed there — lets us distinguish "waiting for exchange
    // to credit" from "fully done".
    if (rec.destCexAccountId) {
      const credited = await findCexDepositByTx(
        rec.destCexAccountId,
        rec.coin,
        hash
      )
      if (credited === 'ok') return { status: 'ok', chainTxHash: hash }
      if (credited === 'processing')
        return { status: 'processing', chainTxHash: hash }
      // null → CEX hasn't picked it up yet; stay in 'processing'.
      return { status: 'processing', chainTxHash: hash }
    }
    // No downstream CEX tracking — on-chain success is "done" for our
    // purposes (EVM→EVM or a legacy record without dest tracking).
    return { status: 'ok', chainTxHash: hash }
  } catch {
    // Receipt not mined yet.
    return { status: 'pending' }
  }
}
