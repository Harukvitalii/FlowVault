export type ExchangeId =
  | 'binance'
  | 'gate'
  | 'okx'
  | 'bybit'
  | 'kucoin'
  | 'bitget'
  | 'htx'
  | 'mexc'
  | 'phemex'
export type SourceKind = 'cex' | 'evm'

export interface SourceRef {
  kind: SourceKind
  id: string
}

export interface Balance {
  asset: string
  free: number
  usd: number
  /** Set for on-chain balances (EVM). Undefined for CEX balances. */
  chainId?: number
  /** Short display label for the chain, e.g. "ARB", "BSC". */
  chain?: string
  /** CEX-only: which wallet this sits in (spot / funding / unified / etc). */
  accountType?: string
}

export interface WhitelistNetwork {
  /** Raw network code as the exchange returns it (e.g. "BSC", "ARBEVM"). */
  exchangeCode: string
  /** Canonical family key from shared/networks.ts (e.g. "BSC", "ARB"). */
  family: string
  /** Human label (e.g. "BNB Chain", "Arbitrum"). */
  familyLabel: string
}

export interface WhitelistDepositAddress {
  coin: string
  /** Raw network code on this exchange (e.g. "BEP20", "TRC20"). */
  exchangeCode: string
  /** Canonical family key (e.g. "BSC", "TRX"). */
  family: string
  /** Human label (e.g. "BNB Chain", "Tron"). */
  familyLabel: string
  address: string
  tag?: string
}

export interface CoinNetworkPair {
  /** Coin symbol, uppercase (e.g. "USDT"). */
  coin: string
  /** Canonical family key from shared/networks.ts (e.g. "TRX"). */
  family: string
}

export interface UserPrefs {
  /** User-curated (coin, family) pairs whose deposit addresses we pull from
   *  each exchange for the whitelist section. Replaces the hardcoded
   *  "popular" list. */
  whitelistSelection: CoinNetworkPair[]
  /** When false, deposit monitoring is disabled. Default true. */
  depositsEnabled?: boolean
  /** When true, skip the preflight dry-run before submitting withdrawals. */
  skipPreflight?: boolean
  /** Optional HTTP/HTTPS proxy applied as undici global dispatcher. */
  proxy?: {
    enabled: boolean
    url: string
    username?: string
    password?: string
  }
}

export type DepositStatus = 'pending' | 'processing' | 'ok'

export interface DepositRecord {
  /** Exchange deposit id or txHash-based key for dedup. */
  id: string
  exchangeAccountId: string
  exchangeLabel: string
  exchangeId?: ExchangeId
  coin: string
  network: string
  amount: number
  address: string
  txHash?: string
  status: DepositStatus
  /** Timestamp from exchange or when we first saw it. */
  depositedAt: number
  firstSeenAt: number
}

export interface NetworkInfo {
  network: string
  name: string
  /** Withdrawal fee in the coin's unit (not USD). */
  fee: number
  /** Minimum withdrawal amount in the coin's unit. */
  minWithdraw: number
  /** Minimum deposit amount in the coin's unit. */
  minDeposit: number
  withdrawEnabled: boolean
  depositEnabled: boolean
  estMinutes: number
}

export interface RpcEntry {
  id: string
  chainId: number
  chain: string
  url: string
  custom: boolean
}

export interface ChainDetectResult {
  ok: boolean
  chainId?: number
  name?: string
  latencyMs?: number
  error?: string
}

export interface ConnectionTestStep {
  name: 'public' | 'signed'
  status: 'ok' | 'fail' | 'skip'
  latencyMs?: number
  detail?: string
}

export interface ConnectionTestResult {
  steps: ConnectionTestStep[]
}

export interface DepositAddressEntry {
  address: string
  tag?: string
  /** Optional hint from the exchange: e.g. 'legacy', 'segwit', sub-account name. */
  label?: string
}

export interface WithdrawInput {
  accountId: string
  coin: string
  network: string
  amount: number
  /** User's exact decimal string. Preferred over `amount` for chain-side
   *  base-unit conversion (avoids float precision loss). */
  amountStr?: string
  address: string
  tag?: string
  /** Human label of the destination (exchange label or wallet name). */
  destLabel?: string
  /** Idempotency token from the renderer (UUID per Review modal-open).
   *  Main rejects duplicates within a short TTL so a double-click cannot
   *  double-charge. */
  submitId?: string
}

export type WithdrawStatus =
  | 'submitting'
  | 'pending'
  | 'processing'
  | 'ok'
  | 'failed'

export type WithdrawKind = 'cex' | 'evm'

export interface WithdrawRecord {
  id: string
  /** 'cex' = ccxt withdraw; 'evm' = on-chain transfer from our wallet. */
  kind: WithdrawKind
  /** For CEX: ccxt account id. For EVM: source wallet id. */
  exchangeAccountId: string
  exchangeLabel: string
  /** Only populated for CEX records. */
  exchangeId?: ExchangeId
  /** EVM records only. */
  chainId?: number
  /** EVM→CEX records: CCXT account id of the destination so the poller
   *  can check whether the exchange credited the deposit. */
  destCexAccountId?: string
  /** Human label of the destination (exchange label or wallet name). */
  destLabel?: string
  coin: string
  network: string
  amount: number
  fee: number
  address: string
  tag?: string
  /** CEX: exchange's withdraw id. EVM: the on-chain tx hash. */
  exchangeTxId?: string
  chainTxHash?: string
  status: WithdrawStatus
  submittedAt: number
  updatedAt: number
  error?: string
  hint?: string
}

export interface WithdrawSubmitResult {
  ok: boolean
  recordId?: string
  error?: string
  hint?: string
}

export interface InternalTransferInput {
  accountId: string
  coin: string
  amount: number
  fromType: string
  toType: string
}

export interface InternalTransferResult {
  ok: boolean
  error?: string
  hint?: string
}

export interface PreflightCheck {
  label: string
  status: 'ok' | 'fail' | 'warn' | 'skip'
  detail?: string
}

export interface PreflightResult {
  ok: boolean
  checks: PreflightCheck[]
  /** Extra human-readable blocks shown below the check list (gas, etc). */
  info?: { label: string; value: string }[]
  error?: string
}

export interface EvmSendInput {
  walletId: string
  coin: string
  amount: number
  /** User's exact decimal string. Preferred over `amount` for parseUnits. */
  amountStr?: string
  chainId: number
  toAddress: string
  /** When sending to a known CEX account, pass its id so the poller can
   *  flip the record to 'ok' once the exchange credits the deposit. */
  destCexAccountId?: string
  /** Human label of the destination (exchange label or wallet name). */
  destLabel?: string
  /** Idempotency token (UUID per Review modal-open). */
  submitId?: string
}

export interface EvmSubmitResult {
  ok: boolean
  error?: string
  txHash?: string
  chainId?: number
  recordId?: string
}

export interface RpcPingResult {
  id: string
  latencyMs: number | null
  error?: string
}

export type VaultState = 'empty' | 'locked' | 'unlocked'

export interface ExchangeAccountMeta {
  accountId: string
  exchange: ExchangeId
  label: string
  apiKeyPreview: string
  hasPassphrase: boolean
  createdAt: number
}

export interface ExchangeAccountInput {
  accountId?: string
  exchange: ExchangeId
  label: string
  /** Optional on edit — blank means keep the existing key. Required on create. */
  apiKey?: string
  secret?: string
  passphrase?: string
}

export interface WalletMeta {
  id: string
  label: string
  address: string
  /** Network family for watch-only wallets (e.g. 'ETH', 'TRX', 'SOL'). Undefined = EVM with private key. */
  network?: string
  /** True if this wallet has a private key and can be used as a send source. */
  canSend: boolean
  createdAt: number
}

export interface WalletInput {
  label?: string
  /** Provide privateKey for full EVM wallets (address derived from key). */
  privateKey?: string
  /** Provide address + network for watch-only wallets (destination only). */
  address?: string
  network?: string
}

export interface Api {
  vault: {
    state: () => Promise<VaultState>
    create: (masterKey: string) => Promise<{ ok: boolean }>
    unlock: (masterKey: string) => Promise<{ ok: boolean; error?: string }>
    lock: () => Promise<void>
    changeMasterKey: (
      oldKey: string,
      newKey: string
    ) => Promise<{ ok: boolean; error?: string }>
    wipe: () => Promise<{ ok: boolean }>
  }
  exchanges: {
    list: () => Promise<ExchangeAccountMeta[]>
    upsert: (
      input: ExchangeAccountInput
    ) => Promise<{ ok: boolean; error?: string; accountId?: string }>
    remove: (accountId: string) => Promise<{ ok: boolean }>
    getBalances: (
      accountId: string
    ) => Promise<{ ok: boolean; balances?: Balance[]; error?: string }>
    getNetworks: (
      accountId: string,
      coin: string
    ) => Promise<{ ok: boolean; networks?: NetworkInfo[]; error?: string }>
    getWithdrawNetworks: (
      accountId: string
    ) => Promise<{
      ok: boolean
      networks?: WhitelistNetwork[]
      error?: string
    }>
    getDepositAddressesForPairs: (
      accountId: string,
      pairs: CoinNetworkPair[]
    ) => Promise<{
      ok: boolean
      addresses?: WhitelistDepositAddress[]
      error?: string
    }>
    getDepositAddresses: (
      accountId: string,
      coin: string,
      network: string
    ) => Promise<{
      ok: boolean
      addresses?: DepositAddressEntry[]
      error?: string
    }>
    test: (accountId: string) => Promise<ConnectionTestResult>
    warmup: () => Promise<{ started: number }>
    withdraw: (input: WithdrawInput) => Promise<WithdrawSubmitResult>
    transfer: (
      input: InternalTransferInput
    ) => Promise<InternalTransferResult>
    preflight: (input: WithdrawInput) => Promise<PreflightResult>
  }
  evm: {
    preflight: (input: EvmSendInput) => Promise<PreflightResult>
    submit: (input: EvmSendInput) => Promise<EvmSubmitResult>
  }
  withdrawals: {
    list: () => Promise<WithdrawRecord[]>
    clear: () => Promise<{ ok: boolean }>
    remove: (id: string) => Promise<{ ok: boolean }>
    onUpdate: (
      cb: (records: WithdrawRecord[]) => void
    ) => () => void
  }
  deposits: {
    list: () => Promise<DepositRecord[]>
    onUpdate: (
      cb: (records: DepositRecord[]) => void
    ) => () => void
  }
  wallets: {
    list: () => Promise<WalletMeta[]>
    add: (
      input: WalletInput
    ) => Promise<{ ok: boolean; wallet?: WalletMeta; error?: string }>
    remove: (id: string) => Promise<{ ok: boolean }>
    getBalances: (
      address: string
    ) => Promise<{ ok: boolean; balances?: Balance[]; error?: string }>
    getSolBalances: (
      address: string
    ) => Promise<{ ok: boolean; balances?: Balance[]; error?: string }>
  }
  solana: {
    send: (input: {
      walletId: string
      toAddress: string
      coin: string
      amount: number
      amountStr?: string
      destLabel?: string
      submitId?: string
    }) => Promise<{ ok: boolean; txHash?: string; recordId?: string; error?: string }>
  }
  rpc: {
    list: () => Promise<RpcEntry[]>
    save: (rpcs: RpcEntry[]) => Promise<{ ok: boolean }>
    detect: (url: string) => Promise<ChainDetectResult>
    ping: (url: string) => Promise<RpcPingResult>
    pingMany: (
      entries: { id: string; url: string }[]
    ) => Promise<RpcPingResult[]>
    /** Snapshot of latest latencies known to main (populated by the
     *  background pinger). Use to seed UI on mount. */
    latest: () => Promise<Record<string, { latencyMs: number | null; ts: number }>>
    /** Trigger an immediate ping round; results are pushed via onLatencies. */
    refresh: () => Promise<void>
    /** Subscribe to latency updates pushed by the main process. Returns an
     *  unsubscribe function. */
    onLatencies: (
      cb: (snapshot: Record<string, { latencyMs: number | null; ts: number }>) => void
    ) => () => void
  }
  prefs: {
    get: () => Promise<UserPrefs>
    save: (prefs: UserPrefs) => Promise<{ ok: boolean }>
  }
  proxy: {
    test: (input: {
      url: string
      username?: string
      password?: string
    }) => Promise<{
      ok: boolean
      ip?: string
      latencyMs?: number
      error?: string
    }>
    checkIp: () => Promise<{
      ok: boolean
      ip?: string
      proxied: boolean
      error?: string
    }>
  }
}
