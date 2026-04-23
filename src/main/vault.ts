import { app } from "electron";
import { promises as fs } from "fs";
import { join } from "path";
import {
  randomBytes,
  scrypt as scryptCb,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from "crypto";
import { promisify } from "util";
import type {
  VaultFile,
  WalletEntry,
  ExchangeEntry,
  CustomRpc,
  TxHistoryItem,
} from "../shared/types.js";

const scrypt = promisify(scryptCb) as (
  pwd: string | Buffer,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem?: number },
) => Promise<Buffer>;

// Defaults: cost ~ hundreds of ms on modern CPU
const SCRYPT = { N: 1 << 15, r: 8, p: 1, keyLen: 32 }; // 32768
const SENTINEL_PT = "withdraw-app:ok";

let cachedKey: Buffer | null = null;
let cachedVault: VaultFile | null = null;

function vaultPath(): string {
  return join(app.getPath("userData"), "vault.json");
}

/** Encrypts plaintext with AES-256-GCM. Returns base64(salt-less blob: iv|tag|ct). */
function encrypt(key: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

function decrypt(key: Buffer, blobB64: string): string {
  const blob = Buffer.from(blobB64, "base64");
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const ct = blob.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
    "utf8",
  );
}

async function deriveKey(password: string, saltB64: string): Promise<Buffer> {
  const salt = Buffer.from(saltB64, "base64");
  return scrypt(password, salt, SCRYPT.keyLen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: 128 * SCRYPT.N * SCRYPT.r * 2,
  });
}

async function readVault(): Promise<VaultFile | null> {
  try {
    const raw = await fs.readFile(vaultPath(), "utf8");
    return JSON.parse(raw) as VaultFile;
  } catch (e: any) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}

async function writeVault(v: VaultFile): Promise<void> {
  const tmp = vaultPath() + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(v, null, 2), { mode: 0o600 });
  await fs.rename(tmp, vaultPath());
}

function requireUnlocked(): { key: Buffer; vault: VaultFile } {
  if (!cachedKey || !cachedVault) throw new Error("Vault is locked");
  return { key: cachedKey, vault: cachedVault };
}

export const vault = {
  async exists(): Promise<boolean> {
    return (await readVault()) !== null;
  },

  isUnlocked(): boolean {
    return cachedKey !== null && cachedVault !== null;
  },

  async create(password: string): Promise<void> {
    if (await vault.exists()) throw new Error("Vault already exists");
    if (password.length < 8)
      throw new Error("Password must be at least 8 chars");
    const saltB64 = randomBytes(16).toString("base64");
    const key = await deriveKey(password, saltB64);
    const v: VaultFile = {
      version: 1,
      kdf: { algo: "scrypt", saltB64, ...SCRYPT },
      sentinel: encrypt(key, SENTINEL_PT),
      wallets: [],
      exchanges: [],
      rpcs: [],
      history: [],
    };
    await writeVault(v);
    cachedKey = key;
    cachedVault = v;
  },

  async unlock(password: string): Promise<void> {
    const v = await readVault();
    if (!v) throw new Error("Vault not found");
    const key = await deriveKey(password, v.kdf.saltB64);
    // verify by decrypting sentinel
    try {
      const pt = decrypt(key, v.sentinel);
      const ok = timingSafeEqual(Buffer.from(pt), Buffer.from(SENTINEL_PT));
      if (!ok) throw new Error("bad");
    } catch {
      throw new Error("Invalid password");
    }
    cachedKey = key;
    cachedVault = v;
  },

  lock(): void {
    if (cachedKey) cachedKey.fill(0);
    cachedKey = null;
    cachedVault = null;
  },

  // ---- encryption helpers used by other main-process modules ----
  encryptSecret(plaintext: string): string {
    const { key } = requireUnlocked();
    return encrypt(key, plaintext);
  },
  decryptSecret(blobB64: string): string {
    const { key } = requireUnlocked();
    return decrypt(key, blobB64);
  },

  // ---- CRUD ----
  listWallets(): WalletEntry[] {
    return requireUnlocked().vault.wallets;
  },
  async addWallet(
    w: Omit<WalletEntry, "id" | "encPrivateKey"> & { privateKey: string },
  ) {
    const { key, vault: v } = requireUnlocked();
    const entry: WalletEntry = {
      id: randomBytes(8).toString("hex"),
      kind: w.kind,
      label: w.label,
      address: w.address,
      encPrivateKey: encrypt(key, w.privateKey),
    };
    v.wallets.push(entry);
    await writeVault(v);
    return entry;
  },
  async removeWallet(id: string) {
    const { vault: v } = requireUnlocked();
    v.wallets = v.wallets.filter((x) => x.id !== id);
    await writeVault(v);
  },

  listExchanges(): ExchangeEntry[] {
    return requireUnlocked().vault.exchanges;
  },
  async addExchange(e: {
    exchange: ExchangeEntry["exchange"];
    label: string;
    apiKey: string;
    secret: string;
    password?: string;
  }) {
    const { key, vault: v } = requireUnlocked();
    const entry: ExchangeEntry = {
      id: randomBytes(8).toString("hex"),
      exchange: e.exchange,
      label: e.label,
      encApiKey: encrypt(key, e.apiKey),
      encSecret: encrypt(key, e.secret),
      encPassword: e.password ? encrypt(key, e.password) : undefined,
    };
    v.exchanges.push(entry);
    await writeVault(v);
    return entry;
  },
  async removeExchange(id: string) {
    const { vault: v } = requireUnlocked();
    v.exchanges = v.exchanges.filter((x) => x.id !== id);
    await writeVault(v);
  },

  listRpcs(): CustomRpc[] {
    return requireUnlocked().vault.rpcs;
  },
  async addRpc(r: Omit<CustomRpc, "id">) {
    const { vault: v } = requireUnlocked();
    const entry: CustomRpc = { id: randomBytes(8).toString("hex"), ...r };
    v.rpcs.push(entry);
    await writeVault(v);
    return entry;
  },
  async removeRpc(id: string) {
    const { vault: v } = requireUnlocked();
    v.rpcs = v.rpcs.filter((x) => x.id !== id);
    await writeVault(v);
  },

  listHistory(): TxHistoryItem[] {
    return requireUnlocked().vault.history;
  },
  async appendHistory(item: TxHistoryItem) {
    const { vault: v } = requireUnlocked();
    v.history.unshift(item);
    // keep last 500
    v.history = v.history.slice(0, 500);
    await writeVault(v);
  },

  // ---- accessors used internally ----
  getWalletPrivateKey(id: string): string {
    const { vault: v } = requireUnlocked();
    const w = v.wallets.find((x) => x.id === id);
    if (!w) throw new Error("Wallet not found");
    return vault.decryptSecret(w.encPrivateKey);
  },
  getExchangeCreds(id: string) {
    const { vault: v } = requireUnlocked();
    const e = v.exchanges.find((x) => x.id === id);
    if (!e) throw new Error("Exchange not found");
    return {
      exchange: e.exchange,
      apiKey: vault.decryptSecret(e.encApiKey),
      secret: vault.decryptSecret(e.encSecret),
      password: e.encPassword ? vault.decryptSecret(e.encPassword) : undefined,
    };
  },
};
