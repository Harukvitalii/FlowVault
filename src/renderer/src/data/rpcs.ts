import type { RpcEntry } from '@shared/types'

/**
 * Free public endpoints that do NOT require an API key and tend to be
 * reliable. We include two per major chain so the runtime fallback
 * picks up when one fails.
 */
export const DEFAULT_RPCS: RpcEntry[] = [
  // Ethereum
  { id: 'eth-publicnode', chainId: 1, chain: 'Ethereum', url: 'https://ethereum-rpc.publicnode.com', custom: false },
  { id: 'eth-drpc', chainId: 1, chain: 'Ethereum', url: 'https://eth.drpc.org', custom: false },

  // Arbitrum One
  { id: 'arb-official', chainId: 42161, chain: 'Arbitrum', url: 'https://arb1.arbitrum.io/rpc', custom: false },
  { id: 'arb-publicnode', chainId: 42161, chain: 'Arbitrum', url: 'https://arbitrum-one-rpc.publicnode.com', custom: false },

  // Base
  { id: 'base-official', chainId: 8453, chain: 'Base', url: 'https://mainnet.base.org', custom: false },
  { id: 'base-publicnode', chainId: 8453, chain: 'Base', url: 'https://base-rpc.publicnode.com', custom: false },

  // BNB Smart Chain
  { id: 'bsc-publicnode', chainId: 56, chain: 'BNB Chain', url: 'https://bsc-rpc.publicnode.com', custom: false },
  { id: 'bsc-dataseed', chainId: 56, chain: 'BNB Chain', url: 'https://bsc-dataseed1.defibit.io', custom: false },

  // Polygon
  { id: 'polygon-publicnode', chainId: 137, chain: 'Polygon', url: 'https://polygon-bor-rpc.publicnode.com', custom: false },
  { id: 'polygon-official', chainId: 137, chain: 'Polygon', url: 'https://polygon-rpc.com', custom: false },

  // Optimism
  { id: 'op-official', chainId: 10, chain: 'Optimism', url: 'https://mainnet.optimism.io', custom: false },
  { id: 'op-publicnode', chainId: 10, chain: 'Optimism', url: 'https://optimism-rpc.publicnode.com', custom: false }
]
