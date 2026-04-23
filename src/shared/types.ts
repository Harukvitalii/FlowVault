// Shared types used by main + renderer

export type EvmChain =
  | "ethereum"
  | "bsc"
  | "polygon"
  | "arbitrum"
  | "base"
  | "optimism"
  | "custom";

export type WalletKind = "evm" | "solana";

export interface WalletEntry {
  id: string;
  kind: WalletKind;
  label: string;
  address: string;
  // encrypted private key (base64 of ciphertext blob)
  encPrivateKey: string;
}

export type ExchangeId = "binance" | "bybit" | "mexc" | "gate" | "kucoin";

export interface ExchangeEntry {
  id: string;
  exchange: ExchangeId;
  label: string;
  encApiKey: string;
  encSecret: string;
  encPassword?: string; // KuCoin requires passphrase
}

export interface CustomRpc {
  id: string;
  chain: EvmChain;
  chainId: number;
  name: string;
  url: string;
}

export interface VaultFile {
  version: 1;
  // kdf params
  kdf: {
    algo: "scrypt";
    saltB64: string;
    N: number;
    r: number;
    p: number;
    keyLen: number;
  };
  // sentinel used to verify password: encrypt a known plaintext
  sentinel: string; // ciphertext blob (base64)
  wallets: WalletEntry[];
  exchanges: ExchangeEntry[];
  rpcs: CustomRpc[];
  history: TxHistoryItem[];
}

export interface TxHistoryItem {
  id: string;
  ts: number;
  kind: "wallet->cex" | "cex->cex";
  from: string;
  to: string;
  asset: string;
  network: string;
  amount: string;
  status: "submitted" | "success" | "failed";
  txidOrWithdrawId?: string;
  error?: string;
}

export interface VaultStatus {
  exists: boolean;
  unlocked: boolean;
}
