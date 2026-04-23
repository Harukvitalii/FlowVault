import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getMint,
  getAccount,
} from "@solana/spl-token";
import bs58 from "bs58";

const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";

export function connection(rpcUrl?: string): Connection {
  return new Connection(rpcUrl || DEFAULT_RPC, "confirmed");
}

function keypairFromSecret(secret: string): Keypair {
  // accepts base58 (Phantom export) or JSON uint8 array
  const trimmed = secret.trim();
  if (trimmed.startsWith("[")) {
    const arr = JSON.parse(trimmed) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  }
  return Keypair.fromSecretKey(bs58.decode(trimmed));
}

export function addressFromSecret(secret: string): string {
  return keypairFromSecret(secret).publicKey.toBase58();
}

export async function getSolBalance(
  rpcUrl: string | undefined,
  address: string,
): Promise<string> {
  const c = connection(rpcUrl);
  const lamports = await c.getBalance(new PublicKey(address));
  return (lamports / LAMPORTS_PER_SOL).toString();
}

export async function getSplBalance(
  rpcUrl: string | undefined,
  mint: string,
  owner: string,
): Promise<{ amount: string; decimals: number }> {
  const c = connection(rpcUrl);
  const mintPk = new PublicKey(mint);
  const ownerPk = new PublicKey(owner);
  const ata = await getAssociatedTokenAddress(mintPk, ownerPk);
  const mintInfo = await getMint(c, mintPk);
  try {
    const acc = await getAccount(c, ata);
    const raw = acc.amount;
    const div = 10n ** BigInt(mintInfo.decimals);
    const whole = raw / div;
    const frac = raw % div;
    const fracStr = frac
      .toString()
      .padStart(mintInfo.decimals, "0")
      .replace(/0+$/, "");
    return {
      amount: fracStr ? `${whole}.${fracStr}` : whole.toString(),
      decimals: mintInfo.decimals,
    };
  } catch {
    return { amount: "0", decimals: mintInfo.decimals };
  }
}

export async function sendSol(
  rpcUrl: string | undefined,
  secret: string,
  to: string,
  amount: string,
): Promise<string> {
  const c = connection(rpcUrl);
  const kp = keypairFromSecret(secret);
  const lamports = Math.round(Number(amount) * LAMPORTS_PER_SOL);
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: kp.publicKey,
      toPubkey: new PublicKey(to),
      lamports,
    }),
  );
  return sendAndConfirmTransaction(c, tx, [kp]);
}

export async function sendSpl(
  rpcUrl: string | undefined,
  secret: string,
  mint: string,
  to: string,
  amount: string,
): Promise<string> {
  const c = connection(rpcUrl);
  const kp = keypairFromSecret(secret);
  const mintPk = new PublicKey(mint);
  const toPk = new PublicKey(to);
  const mintInfo = await getMint(c, mintPk);
  const rawAmount = BigInt(
    Math.round(Number(amount) * 10 ** mintInfo.decimals),
  );

  const fromAta = await getAssociatedTokenAddress(mintPk, kp.publicKey);
  const toAta = await getAssociatedTokenAddress(mintPk, toPk);
  const tx = new Transaction();

  // create destination ATA if missing
  const toAtaInfo = await c.getAccountInfo(toAta);
  if (!toAtaInfo) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        kp.publicKey,
        toAta,
        toPk,
        mintPk,
      ),
    );
  }
  tx.add(
    createTransferCheckedInstruction(
      fromAta,
      mintPk,
      toAta,
      kp.publicKey,
      rawAmount,
      mintInfo.decimals,
    ),
  );
  return sendAndConfirmTransaction(c, tx, [kp]);
}
