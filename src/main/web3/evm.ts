import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  erc20Abi,
  isAddress,
  type Hex,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, bsc, polygon, arbitrum, base, optimism } from "viem/chains";
import type { EvmChain, CustomRpc } from "../../shared/types.js";

export const DEFAULT_RPCS: Record<Exclude<EvmChain, "custom">, string> = {
  ethereum: "https://cloudflare-eth.com",
  bsc: "https://binance.llamarpc.com",
  polygon: "https://polygon-rpc.com",
  arbitrum: "https://arb1.arbitrum.io/rpc",
  base: "https://mainnet.base.org",
  optimism: "https://mainnet.optimism.io",
};

const BUILTIN: Record<Exclude<EvmChain, "custom">, Chain> = {
  ethereum: mainnet,
  bsc,
  polygon,
  arbitrum,
  base,
  optimism,
};

const TOKENS: Record<string, { symbol: string; address: string }[]> = {
  ethereum: [
    { symbol: "USDT", address: "0xdac17f958d2ee523a2206206994597c13d831ec7" },
    { symbol: "USDC", address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" },
  ],
  bsc: [
    { symbol: "USDT", address: "0x55d398326f99059fF775485246999027B3197955" },
    { symbol: "USDC", address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d" },
  ],
  polygon: [
    { symbol: "USDT", address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F" },
    { symbol: "USDC", address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" },
  ],
  arbitrum: [
    { symbol: "USDT", address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9" },
    { symbol: "USDC", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
  ],
  optimism: [
    { symbol: "USDT", address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58" },
    { symbol: "USDC", address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85" },
  ],
  base: [
    { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
  ],
};

export interface ResolvedChain {
  chainKey: string;
  chain: Chain;
  rpcUrl?: string;
}

export function resolveChain(
  chainKey: EvmChain,
  rpcs: CustomRpc[],
  rpcId?: string,
): ResolvedChain {
  if (chainKey === "custom") {
    const r = rpcs.find((x) => x.id === rpcId);
    if (!r) throw new Error("Custom RPC not found");
    const custom: Chain = {
      id: r.chainId,
      name: r.name,
      nativeCurrency: { name: "Native", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [r.url] } },
    };
    return { chainKey, chain: custom, rpcUrl: r.url };
  }
  const chain = BUILTIN[chainKey];
  // allow user override via rpcs list too
  const override = rpcs.find((x) => x.chain === chainKey);
  return { chainKey, chain, rpcUrl: override?.url || DEFAULT_RPCS[chainKey] };
}

function publicClient(rc: ResolvedChain) {
  return createPublicClient({
    chain: rc.chain,
    transport: http(rc.rpcUrl),
  });
}

export async function getWalletBalances(rc: ResolvedChain, address: string) {
  if (!isAddress(address)) throw new Error("Invalid EVM address");
  const pc = publicClient(rc);
  const balances: {
    symbol: string;
    address?: string;
    amount: string;
    decimals: number;
  }[] = [];

  // Native
  const natInfo = rc.chain.nativeCurrency;
  try {
    const natBal = await pc.getBalance({ address: address as Hex });
    balances.push({
      symbol: natInfo.symbol,
      amount: formatUnits(natBal, natInfo.decimals),
      decimals: natInfo.decimals,
    });
  } catch {}

  // Stablecoins
  const tokens = TOKENS[rc.chainKey] || [];
  if (tokens.length > 0) {
    const calls = tokens.flatMap((t) => [
      {
        address: t.address as Hex,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address as Hex],
      },
      { address: t.address as Hex, abi: erc20Abi, functionName: "decimals" },
    ]);
    try {
      const results = await pc.multicall({ contracts: calls as any });
      for (let i = 0; i < tokens.length; i++) {
        const balRes = results[i * 2];
        const decRes = results[i * 2 + 1];
        if (balRes.status === "success" && decRes.status === "success") {
          const dec = decRes.result as number;
          const bal = balRes.result as bigint;
          balances.push({
            symbol: tokens[i].symbol,
            address: tokens[i].address,
            amount: formatUnits(bal, dec),
            decimals: dec,
          });
        }
      }
    } catch (e) {
      console.error("Multicall failed", e);
    }
  }

  return balances.sort((a, b) => Number(b.amount) - Number(a.amount));
}

export async function pingRpc(url: string): Promise<number | null> {
  try {
    const start = Date.now();
    const res = await fetch(url, {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_blockNumber",
        params: [],
        id: 1,
      }),
    });
    if (!res.ok) return null;
    return Date.now() - start;
  } catch {
    return null;
  }
}

export async function getNativeBalance(
  rc: ResolvedChain,
  address: string,
): Promise<string> {
  if (!isAddress(address)) throw new Error("Invalid EVM address");
  const pc = publicClient(rc);
  const v = await pc.getBalance({ address });
  return formatUnits(v, rc.chain.nativeCurrency.decimals);
}

export async function getErc20Balance(
  rc: ResolvedChain,
  token: string,
  address: string,
): Promise<{ amount: string; decimals: number; symbol: string }> {
  const pc = publicClient(rc);
  const [bal, decimals, symbol] = await Promise.all([
    pc.readContract({
      address: token as Hex,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address as Hex],
    }),
    pc.readContract({
      address: token as Hex,
      abi: erc20Abi,
      functionName: "decimals",
    }),
    pc.readContract({
      address: token as Hex,
      abi: erc20Abi,
      functionName: "symbol",
    }),
  ]);
  return {
    amount: formatUnits(bal as bigint, decimals as number),
    decimals: decimals as number,
    symbol: symbol as string,
  };
}

export async function sendNative(
  rc: ResolvedChain,
  privateKey: string,
  to: string,
  amount: string,
): Promise<string> {
  if (!isAddress(to)) throw new Error("Invalid destination address");
  const pk = (
    privateKey.startsWith("0x") ? privateKey : "0x" + privateKey
  ) as Hex;
  const account = privateKeyToAccount(pk);
  const wc = createWalletClient({
    account,
    chain: rc.chain,
    transport: http(rc.rpcUrl),
  });
  const value = parseUnits(amount, rc.chain.nativeCurrency.decimals);
  return wc.sendTransaction({ to: to as Hex, value });
}

export async function sendErc20(
  rc: ResolvedChain,
  privateKey: string,
  token: string,
  to: string,
  amount: string,
): Promise<string> {
  if (!isAddress(to)) throw new Error("Invalid destination address");
  const pk = (
    privateKey.startsWith("0x") ? privateKey : "0x" + privateKey
  ) as Hex;
  const account = privateKeyToAccount(pk);
  const pc = publicClient(rc);
  const decimals = (await pc.readContract({
    address: token as Hex,
    abi: erc20Abi,
    functionName: "decimals",
  })) as number;
  const wc = createWalletClient({
    account,
    chain: rc.chain,
    transport: http(rc.rpcUrl),
  });
  const value = parseUnits(amount, decimals);
  return wc.writeContract({
    address: token as Hex,
    abi: erc20Abi,
    functionName: "transfer",
    args: [to as Hex, value],
  });
}

export function addressFromPrivateKey(privateKey: string): string {
  const pk = (
    privateKey.startsWith("0x") ? privateKey : "0x" + privateKey
  ) as Hex;
  return privateKeyToAccount(pk).address;
}
