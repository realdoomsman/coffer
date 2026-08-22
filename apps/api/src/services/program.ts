// ── Coffer on-chain client ─────────────────────────────────────────
// The Anchor program has NO IDL (it was deployed straight from the
// SBF build), so this module is the hand-rolled client: discriminators,
// PDA derivations, borsh codecs and instruction builders, all mirrored
// from programs/vault/programs/vault/src/{lib.rs,state.rs,instructions/*}.
//
// RULES this file lives by — every one of them cost a failed devnet tx
// somewhere to learn, so do not "tidy" them away:
//
//   1. Instruction discriminator = sha256("global:<snake_case_name>")[0..8].
//      Account   discriminator = sha256("account:<StructName>")[0..8].
//   2. Account METAS must appear in the exact order the `#[derive(Accounts)]`
//      struct declares its fields — Anchor resolves positionally, so a
//      swapped pair fails as a seeds/owner error that names the wrong
//      account. `Program<'info, System>` is a REAL slot (the caller passes
//      the system program), as is any `Program<'info, Vault>`.
//   3. Args are borsh-encoded in struct/parameter order, little-endian,
//      enums as a single u8 variant index, `[u8; 32]` as raw bytes with no
//      length prefix (a Vec<u8> would carry a u32 prefix — the name field
//      is a fixed array and must NOT).
//   4. Nothing here signs or sends. Builders return TransactionInstruction;
//      signer.ts owns keys and the wire.
//
// Fetch helpers verify BOTH the account owner and the 8-byte discriminator
// before decoding: decoding an arbitrary account as a Vault would silently
// produce plausible-looking numbers, which is exactly how fake TVL gets
// into a UI.

import { createHash } from "node:crypto";
import {
  type AccountInfo,
  type Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { env } from "../env.js";

// ── program id / seeds (state.rs) ──────────────────────────────────

export const VAULT_PROGRAM_ID = new PublicKey(env.vaultProgramId);

export const VAULT_SEED = Buffer.from("vault");
export const VAULT_DEPOSITOR_SEED = Buffer.from("vault_depositor");
export const PLATFORM_CONFIG_SEED = Buffer.from("platform_config");
export const TREASURY_SEED = Buffer.from("treasury");

// ── economic constants (state.rs) — mirrored so the API can validate
// before spending a transaction fee on a guaranteed revert ───────────
export const MIN_SEED_LAMPORTS = 10_000_000n; // 0.01 SOL
export const MIN_DEPOSIT_LAMPORTS = 1_000n;
export const MIN_PERF_FEE_BPS_AT_INIT = 1_000;
export const MAX_PERF_FEE_BPS = 3_000;
export const MIN_NAV_STALENESS_SECONDS = 60;
export const MAX_NAV_STALENESS_SECONDS = 86_400;
export const MAX_REDEEM_WINDOW_SECONDS = 30 * 86_400;
export const MAX_UNLOCK_PERIOD_SECONDS = 7 * 86_400;
export const MIN_NAV_DELTA_BPS = 100;
export const MAX_NAV_DELTA_BPS = 5_000;
export const MAX_NAV_MARK_AGE_SLOTS = 750n;
export const MAX_NAV_LAMPORTS = 10_000_000_000_000_000n;
export const VIRTUAL_SHARES = 1_000n;
export const VIRTUAL_LAMPORTS = 1n;
export const LAMPORTS_PER_SOL = 1_000_000_000n;

// ── discriminators ─────────────────────────────────────────────────

const sha256 = (s: string): Buffer => createHash("sha256").update(s).digest();

/** Anchor instruction discriminator: sha256("global:<snake_case>")[0..8]. */
export function ixDiscriminator(snakeName: string): Buffer {
  return sha256(`global:${snakeName}`).subarray(0, 8);
}

/** Anchor account discriminator: sha256("account:<Struct>")[0..8]. */
export function accountDiscriminator(structName: string): Buffer {
  return sha256(`account:${structName}`).subarray(0, 8);
}

// ── borsh (the 1% of it this program uses) ─────────────────────────

class BorshWriter {
  private chunks: Buffer[] = [];
  u8(v: number): this {
    const b = Buffer.alloc(1);
    b.writeUInt8(v);
    this.chunks.push(b);
    return this;
  }
  bool(v: boolean): this {
    return this.u8(v ? 1 : 0);
  }
  u16(v: number): this {
    const b = Buffer.alloc(2);
    b.writeUInt16LE(v);
    this.chunks.push(b);
    return this;
  }
  u64(v: bigint): this {
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(v);
    this.chunks.push(b);
    return this;
  }
  i64(v: bigint): this {
    const b = Buffer.alloc(8);
    b.writeBigInt64LE(v);
    this.chunks.push(b);
    return this;
  }
  u128(v: bigint): this {
    const b = Buffer.alloc(16);
    b.writeBigUInt64LE(v & 0xffff_ffff_ffff_ffffn, 0);
    b.writeBigUInt64LE(v >> 64n, 8);
    this.chunks.push(b);
    return this;
  }
  pubkey(v: PublicKey): this {
    this.chunks.push(Buffer.from(v.toBytes()));
    return this;
  }
  /** Fixed-length byte array — NO length prefix (that is Vec<u8>). */
  fixedBytes(v: Buffer, len: number): this {
    if (v.length !== len) throw new Error(`expected ${len} bytes, got ${v.length}`);
    this.chunks.push(Buffer.from(v));
    return this;
  }
  toBuffer(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

class BorshReader {
  private o = 0;
  constructor(private readonly buf: Buffer) {}
  skip(n: number): this {
    this.o += n;
    return this;
  }
  u8(): number {
    const v = this.buf.readUInt8(this.o);
    this.o += 1;
    return v;
  }
  bool(): boolean {
    const raw = this.u8();
    if (raw > 1) throw new Error(`invalid bool byte 0x${raw.toString(16)}`);
    return raw === 1;
  }
  u16(): number {
    const v = this.buf.readUInt16LE(this.o);
    this.o += 2;
    return v;
  }
  u64(): bigint {
    const v = this.buf.readBigUInt64LE(this.o);
    this.o += 8;
    return v;
  }
  i64(): bigint {
    const v = this.buf.readBigInt64LE(this.o);
    this.o += 8;
    return v;
  }
  u128(): bigint {
    const lo = this.buf.readBigUInt64LE(this.o);
    const hi = this.buf.readBigUInt64LE(this.o + 8);
    this.o += 16;
    return (hi << 64n) | lo;
  }
  pubkey(): PublicKey {
    const v = new PublicKey(this.buf.subarray(this.o, this.o + 32));
    this.o += 32;
    return v;
  }
  bytes(n: number): Buffer {
    const v = Buffer.from(this.buf.subarray(this.o, this.o + n));
    this.o += n;
    return v;
  }
  get offset(): number {
    return this.o;
  }
}

// ── enums (borsh: u8 variant index, declaration order) ─────────────

export const VAULT_TYPE = { Managed: 0, Mirror: 1 } as const;
export type VaultTypeName = keyof typeof VAULT_TYPE;

const VAULT_STATUS_NAMES = ["Active", "Frozen", "Closed"] as const;
const FROZEN_BY_NAMES = ["None", "Trader", "Platform", "RiskBreaker"] as const;
const VAULT_TYPE_NAMES = ["Managed", "Mirror"] as const;

function enumName<T extends readonly string[]>(names: T, idx: number, what: string): T[number] {
  const n = names[idx];
  if (n === undefined) throw new Error(`invalid ${what} discriminant ${idx}`);
  return n;
}

// ── vault name ⇄ 32-byte seed ──────────────────────────────────────

/**
 * The vault PDA seed is a FIXED 32-byte name, so it is globally unique and
 * the account can be re-derived from nothing but the name. Callers pass a
 * short ASCII handle (we use the DB row id, a cuid); it is utf8-encoded and
 * zero-padded. Encoding is deterministic in both directions, so a stored
 * vault's PDA never has to be trusted from the database alone — it can
 * always be re-derived and compared.
 */
export function encodeVaultName(name: string): Buffer {
  const raw = Buffer.from(name, "utf8");
  if (raw.length === 0) throw new Error("vault name must not be empty");
  if (raw.length > 32) throw new Error(`vault name is ${raw.length} bytes, max 32`);
  const out = Buffer.alloc(32);
  raw.copy(out);
  return out;
}

/** Inverse of encodeVaultName: strip trailing NULs. */
export function decodeVaultName(raw: Buffer): string {
  let end = raw.length;
  while (end > 0 && raw[end - 1] === 0) end -= 1;
  return raw.subarray(0, end).toString("utf8");
}

// ── PDAs (every seed in state.rs) ──────────────────────────────────

export function platformConfigPda(programId: PublicKey = VAULT_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([PLATFORM_CONFIG_SEED], programId);
}

export function treasuryPda(programId: PublicKey = VAULT_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([TREASURY_SEED], programId);
}

export function vaultPda(
  name: string | Buffer,
  programId: PublicKey = VAULT_PROGRAM_ID,
): [PublicKey, number] {
  const nameBytes = Buffer.isBuffer(name) ? name : encodeVaultName(name);
  return PublicKey.findProgramAddressSync([VAULT_SEED, nameBytes], programId);
}

export function vaultDepositorPda(
  vault: PublicKey,
  authority: PublicKey,
  programId: PublicKey = VAULT_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_DEPOSITOR_SEED, vault.toBuffer(), authority.toBuffer()],
    programId,
  );
}

/** ProgramData PDA of the upgradeable loader (init_platform's admin gate). */
export const BPF_LOADER_UPGRADEABLE = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111",
);
export function programDataPda(programId: PublicKey = VAULT_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([programId.toBuffer()], BPF_LOADER_UPGRADEABLE);
}

// ── decoded account shapes ─────────────────────────────────────────

export interface PlatformConfigAccount {
  bump: number;
  treasuryBump: number;
  admin: PublicKey;
  killSwitch: boolean;
}

export interface WithdrawRequestState {
  shares: bigint;
  valueAtRequestLamports: bigint;
  requestedAt: bigint;
}

export interface VaultAccount {
  bump: number;
  name: string;
  nameBytes: Buffer;
  trader: PublicKey;
  operator: PublicKey;
  navKeeper: PublicKey;
  vaultType: (typeof VAULT_TYPE_NAMES)[number];
  status: (typeof VAULT_STATUS_NAMES)[number];
  frozenBy: (typeof FROZEN_BY_NAMES)[number];
  perfFeeBps: number;
  platformProfitBps: number;
  redeemWindowSeconds: bigint;
  navStalenessSeconds: bigint;
  totalShares: bigint;
  seedShares: bigint;
  managerShares: bigint;
  navLamports: bigint;
  navSlot: bigint;
  navPostedAt: bigint;
  lockedProfit: bigint;
  lockedProfitTs: bigint;
  unlockPeriodSeconds: bigint;
  maxNavDeltaBps: number;
  maxTradeNotionalLamports: bigint;
  maxPriceImpactBps: number;
  dailyLossLimitBps: number;
  dailyLossAccumulator: bigint;
  dayBucket: bigint;
  dayStartEquity: bigint;
  pendingWithdrawValueLamports: bigint;
  pendingWithdrawShares: bigint;
  platformFeesOwedLamports: bigint;
  enforceMintAllowlist: boolean;
  allowedMints: PublicKey[];
}

export interface VaultDepositorAccount {
  bump: number;
  vault: PublicKey;
  authority: PublicKey;
  shares: bigint;
  netDepositsLamports: bigint;
  cumulativeProfitShareLamports: bigint;
  lastWithdrawRequest: WithdrawRequestState;
}

// ── decoders ───────────────────────────────────────────────────────

function assertDiscriminator(data: Buffer, structName: string): void {
  const want = accountDiscriminator(structName);
  const got = data.subarray(0, 8);
  if (!got.equals(want)) {
    throw new Error(
      `account discriminator mismatch for ${structName}: got ${got.toString("hex")}, ` +
        `want ${want.toString("hex")} — this account is not a ${structName}`,
    );
  }
}

export function decodePlatformConfig(data: Buffer): PlatformConfigAccount {
  assertDiscriminator(data, "PlatformConfig");
  const r = new BorshReader(data);
  r.skip(8);
  return {
    bump: r.u8(),
    treasuryBump: r.u8(),
    admin: r.pubkey(),
    killSwitch: r.bool(),
  };
}

export function decodeVault(data: Buffer): VaultAccount {
  assertDiscriminator(data, "Vault");
  const r = new BorshReader(data);
  r.skip(8);
  const bump = r.u8();
  const nameBytes = r.bytes(32);
  const trader = r.pubkey();
  const operator = r.pubkey();
  const navKeeper = r.pubkey();
  const vaultType = enumName(VAULT_TYPE_NAMES, r.u8(), "VaultType");
  const status = enumName(VAULT_STATUS_NAMES, r.u8(), "VaultStatus");
  const frozenBy = enumName(FROZEN_BY_NAMES, r.u8(), "FrozenBy");
  const perfFeeBps = r.u16();
  const platformProfitBps = r.u16();
  const redeemWindowSeconds = r.i64();
  const navStalenessSeconds = r.i64();
  const totalShares = r.u128();
  const seedShares = r.u128();
  const managerShares = r.u128();
  const navLamports = r.u64();
  const navSlot = r.u64();
  const navPostedAt = r.i64();
  const lockedProfit = r.u64();
  const lockedProfitTs = r.i64();
  const unlockPeriodSeconds = r.i64();
  const maxNavDeltaBps = r.u16();
  const maxTradeNotionalLamports = r.u64();
  const maxPriceImpactBps = r.u16();
  const dailyLossLimitBps = r.u16();
  const dailyLossAccumulator = r.u64();
  const dayBucket = r.i64();
  const dayStartEquity = r.u64();
  const pendingWithdrawValueLamports = r.u64();
  const pendingWithdrawShares = r.u128();
  const platformFeesOwedLamports = r.u64();
  const enforceMintAllowlist = r.bool();
  const allowedMints: PublicKey[] = [];
  for (let i = 0; i < 8; i += 1) allowedMints.push(r.pubkey());
  // trailing [u8; 64] padding is intentionally not surfaced
  return {
    bump,
    name: decodeVaultName(nameBytes),
    nameBytes,
    trader,
    operator,
    navKeeper,
    vaultType,
    status,
    frozenBy,
    perfFeeBps,
    platformProfitBps,
    redeemWindowSeconds,
    navStalenessSeconds,
    totalShares,
    seedShares,
    managerShares,
    navLamports,
    navSlot,
    navPostedAt,
    lockedProfit,
    lockedProfitTs,
    unlockPeriodSeconds,
    maxNavDeltaBps,
    maxTradeNotionalLamports,
    maxPriceImpactBps,
    dailyLossLimitBps,
    dailyLossAccumulator,
    dayBucket,
    dayStartEquity,
    pendingWithdrawValueLamports,
    pendingWithdrawShares,
    platformFeesOwedLamports,
    enforceMintAllowlist,
    allowedMints,
  };
}

export function decodeVaultDepositor(data: Buffer): VaultDepositorAccount {
  assertDiscriminator(data, "VaultDepositor");
  const r = new BorshReader(data);
  r.skip(8);
  return {
    bump: r.u8(),
    vault: r.pubkey(),
    authority: r.pubkey(),
    shares: r.u128(),
    netDepositsLamports: r.u64(),
    cumulativeProfitShareLamports: r.u64(),
    lastWithdrawRequest: {
      shares: r.u128(),
      valueAtRequestLamports: r.u64(),
      requestedAt: r.i64(),
    },
  };
}

// ── fetch + decode ─────────────────────────────────────────────────

function requireProgramOwned(info: AccountInfo<Buffer>, address: PublicKey): void {
  if (!info.owner.equals(VAULT_PROGRAM_ID)) {
    throw new Error(
      `${address.toBase58()} is owned by ${info.owner.toBase58()}, not the vault program ` +
        `${VAULT_PROGRAM_ID.toBase58()}`,
    );
  }
}

export interface FetchedVault {
  address: PublicKey;
  lamports: number;
  data: VaultAccount;
}

export async function fetchVaultAccount(
  connection: Connection,
  address: PublicKey,
): Promise<FetchedVault | null> {
  const info = await connection.getAccountInfo(address, "confirmed");
  if (!info) return null;
  requireProgramOwned(info, address);
  return { address, lamports: info.lamports, data: decodeVault(info.data) };
}

export interface FetchedVaultDepositor {
  address: PublicKey;
  lamports: number;
  data: VaultDepositorAccount;
}

export async function fetchVaultDepositorAccount(
  connection: Connection,
  address: PublicKey,
): Promise<FetchedVaultDepositor | null> {
  const info = await connection.getAccountInfo(address, "confirmed");
  if (!info) return null;
  requireProgramOwned(info, address);
  return { address, lamports: info.lamports, data: decodeVaultDepositor(info.data) };
}

export async function fetchPlatformConfigAccount(
  connection: Connection,
  address: PublicKey = platformConfigPda()[0],
): Promise<PlatformConfigAccount | null> {
  const info = await connection.getAccountInfo(address, "confirmed");
  if (!info) return null;
  requireProgramOwned(info, address);
  return decodePlatformConfig(info.data);
}

// ── share math (math.rs) — used to PREDICT what a deposit should mint
// so callers can assert the chain agreed, never to report a balance ──

/** floor(amount * (S + VIRTUAL_SHARES) / (E + VIRTUAL_LAMPORTS)) */
export function sharesForDeposit(
  amountLamports: bigint,
  totalShares: bigint,
  equityLamports: bigint,
): bigint {
  return (amountLamports * (totalShares + VIRTUAL_SHARES)) / (equityLamports + VIRTUAL_LAMPORTS);
}

/** ceil(locked * (period - elapsed) / period) — the Meteora drip. */
export function lockedProfitRemaining(
  lockedProfit: bigint,
  lastTs: bigint,
  unlockPeriod: bigint,
  now: bigint,
): bigint {
  if (unlockPeriod <= 0n || lockedProfit === 0n) return 0n;
  const elapsed = now - lastTs > 0n ? now - lastTs : 0n;
  if (elapsed >= unlockPeriod) return 0n;
  const remaining = unlockPeriod - elapsed;
  const num = lockedProfit * remaining;
  return (num + unlockPeriod - 1n) / unlockPeriod;
}

/** Posted NAV minus still-locked profit — the equity ALL pricing uses. */
export function effectiveEquity(v: VaultAccount, nowSec: bigint): bigint {
  const locked = lockedProfitRemaining(
    v.lockedProfit,
    v.lockedProfitTs,
    v.unlockPeriodSeconds,
    nowSec,
  );
  return v.navLamports > locked ? v.navLamports - locked : 0n;
}

// ── instruction builders ───────────────────────────────────────────
// Each one documents the account order it mirrors. Order is load-bearing.

export interface InitVaultParams {
  /** ≤ 32 utf8 bytes; becomes the PDA seed. */
  name: string;
  vaultType: VaultTypeName;
  /** [1000, 3000] at init; only ever decreasable afterwards. */
  perfFeeBps: number;
  redeemWindowSeconds: bigint;
  /** [60, 86400] */
  navStalenessSeconds: bigint;
  /** [0, 7 days] */
  unlockPeriodSeconds: bigint;
  /** [100, 5000] */
  maxNavDeltaBps: number;
  maxTradeNotionalLamports: bigint;
  maxPriceImpactBps: number;
  /** [0, 10000]; 0 disables the daily-loss breaker. */
  dailyLossLimitBps: number;
  navKeeper: PublicKey;
  /** ≥ MIN_SEED_LAMPORTS; burned (owned by nobody) forever. */
  seedLamports: bigint;
}

/** Client-side mirror of init_vault's `require!`s — fail before paying a fee. */
export function validateInitVaultParams(p: InitVaultParams): void {
  const bad = (m: string): never => {
    throw new Error(`init_vault: ${m}`);
  };
  encodeVaultName(p.name); // throws on >32 bytes / empty
  if (p.perfFeeBps < MIN_PERF_FEE_BPS_AT_INIT || p.perfFeeBps > MAX_PERF_FEE_BPS)
    bad(`perfFeeBps must be within [${MIN_PERF_FEE_BPS_AT_INIT}, ${MAX_PERF_FEE_BPS}]`);
  if (p.redeemWindowSeconds < 0n || p.redeemWindowSeconds > BigInt(MAX_REDEEM_WINDOW_SECONDS))
    bad(`redeemWindowSeconds must be within [0, ${MAX_REDEEM_WINDOW_SECONDS}]`);
  if (
    p.navStalenessSeconds < BigInt(MIN_NAV_STALENESS_SECONDS) ||
    p.navStalenessSeconds > BigInt(MAX_NAV_STALENESS_SECONDS)
  )
    bad(
      `navStalenessSeconds must be within [${MIN_NAV_STALENESS_SECONDS}, ${MAX_NAV_STALENESS_SECONDS}]`,
    );
  if (p.unlockPeriodSeconds < 0n || p.unlockPeriodSeconds > BigInt(MAX_UNLOCK_PERIOD_SECONDS))
    bad(`unlockPeriodSeconds must be within [0, ${MAX_UNLOCK_PERIOD_SECONDS}]`);
  if (p.maxNavDeltaBps < MIN_NAV_DELTA_BPS || p.maxNavDeltaBps > MAX_NAV_DELTA_BPS)
    bad(`maxNavDeltaBps must be within [${MIN_NAV_DELTA_BPS}, ${MAX_NAV_DELTA_BPS}]`);
  if (p.dailyLossLimitBps < 0 || p.dailyLossLimitBps > 10_000)
    bad("dailyLossLimitBps must be within [0, 10000]");
  if (p.navKeeper.equals(PublicKey.default)) bad("navKeeper must not be the default pubkey");
  if (p.seedLamports < MIN_SEED_LAMPORTS)
    bad(`seedLamports must be >= ${MIN_SEED_LAMPORTS} (0.01 SOL)`);
}

function encodeInitVaultParams(p: InitVaultParams): Buffer {
  // Field order = InitVaultParams declaration order (init_vault.rs).
  return new BorshWriter()
    .fixedBytes(encodeVaultName(p.name), 32)
    .u8(VAULT_TYPE[p.vaultType])
    .u16(p.perfFeeBps)
    .i64(p.redeemWindowSeconds)
    .i64(p.navStalenessSeconds)
    .i64(p.unlockPeriodSeconds)
    .u16(p.maxNavDeltaBps)
    .u64(p.maxTradeNotionalLamports)
    .u16(p.maxPriceImpactBps)
    .u16(p.dailyLossLimitBps)
    .pubkey(p.navKeeper)
    .u64(p.seedLamports)
    .toBuffer();
}

/**
 * init_vault — creator becomes the trader and burns the seed deposit.
 * Accounts (InitVault, in order):
 *   0 creator        signer, mut   pays rent + the burned seed
 *   1 vault          mut           init, PDA ["vault", name]
 *   2 platform_config              PDA ["platform_config"] (must exist)
 *   3 system_program
 */
export function buildInitVaultIx(params: {
  creator: PublicKey;
  vault: InitVaultParams;
  programId?: PublicKey;
}): { ix: TransactionInstruction; vault: PublicKey; bump: number } {
  const programId = params.programId ?? VAULT_PROGRAM_ID;
  validateInitVaultParams(params.vault);
  const [vault, bump] = vaultPda(params.vault.name, programId);
  const [platformConfig] = platformConfigPda(programId);
  const data = Buffer.concat([
    ixDiscriminator("init_vault"),
    encodeInitVaultParams(params.vault),
  ]);
  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: params.creator, isSigner: true, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: platformConfig, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
  return { ix, vault, bump };
}

/**
 * init_depositor — creates the per-(vault, user) record. No args.
 * Accounts (InitDepositor, in order):
 *   0 authority      signer, mut   pays the record's rent
 *   1 vault                        NOT mut (read-only in this ix)
 *   2 depositor      mut           init, PDA ["vault_depositor", vault, authority]
 *   3 system_program
 */
export function buildInitDepositorIx(params: {
  authority: PublicKey;
  vault: PublicKey;
  programId?: PublicKey;
}): { ix: TransactionInstruction; depositor: PublicKey; bump: number } {
  const programId = params.programId ?? VAULT_PROGRAM_ID;
  const [depositor, bump] = vaultDepositorPda(params.vault, params.authority, programId);
  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: params.authority, isSigner: true, isWritable: true },
      { pubkey: params.vault, isSigner: false, isWritable: false },
      { pubkey: depositor, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: ixDiscriminator("init_depositor"),
  });
  return { ix, depositor, bump };
}

/**
 * deposit — SOL in, shares out (priced BEFORE the lamports land).
 * Accounts (Deposit, in order):
 *   0 authority      signer, mut
 *   1 vault          mut
 *   2 depositor      mut
 *   3 system_program
 * Args: amount_lamports u64
 */
export function buildDepositIx(params: {
  authority: PublicKey;
  vault: PublicKey;
  amountLamports: bigint;
  programId?: PublicKey;
}): { ix: TransactionInstruction; depositor: PublicKey } {
  const programId = params.programId ?? VAULT_PROGRAM_ID;
  if (params.amountLamports < MIN_DEPOSIT_LAMPORTS) {
    throw new Error(`deposit: amountLamports must be >= ${MIN_DEPOSIT_LAMPORTS}`);
  }
  const [depositor] = vaultDepositorPda(params.vault, params.authority, programId);
  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: params.authority, isSigner: true, isWritable: true },
      { pubkey: params.vault, isSigner: false, isWritable: true },
      { pubkey: depositor, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      ixDiscriminator("deposit"),
      new BorshWriter().u64(params.amountLamports).toBuffer(),
    ]),
  });
  return { ix, depositor };
}

/**
 * post_nav — the keeper's mark.
 * Accounts (PostNav, in order — vault FIRST so the keeper's `address =
 * vault.nav_keeper` constraint can look "up" the struct):
 *   0 vault          mut
 *   1 keeper         signer        (declared without `mut`; being the fee
 *                                   payer anyway is fine — Anchor only
 *                                   enforces mut when it is declared)
 * Args: nav_lamports u64, mark_slot u64
 *
 * mark_slot must satisfy: > vault.nav_slot, <= clock.slot, and
 * clock.slot - mark_slot <= 750. Read the slot at CONFIRMED commitment:
 * a processed-commitment slot can be ahead of the slot the transaction
 * actually executes at, which reverts as NavSlotNotMonotonic.
 */
export function buildPostNavIx(params: {
  vault: PublicKey;
  keeper: PublicKey;
  navLamports: bigint;
  markSlot: bigint;
  programId?: PublicKey;
}): TransactionInstruction {
  const programId = params.programId ?? VAULT_PROGRAM_ID;
  if (params.navLamports > MAX_NAV_LAMPORTS) {
    throw new Error(`post_nav: navLamports exceeds MAX_NAV_LAMPORTS (${MAX_NAV_LAMPORTS})`);
  }
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: params.vault, isSigner: false, isWritable: true },
      { pubkey: params.keeper, isSigner: true, isWritable: false },
    ],
    data: Buffer.concat([
      ixDiscriminator("post_nav"),
      new BorshWriter().u64(params.navLamports).u64(params.markSlot).toBuffer(),
    ]),
  });
}

// ── presentation helpers ───────────────────────────────────────────

export const lamportsToSol = (l: bigint): number => Number(l) / 1e9;
export const solToLamports = (sol: number): bigint =>
  BigInt(Math.round(sol * Number(LAMPORTS_PER_SOL)));

/** Cluster-aware explorer links (devnet needs the ?cluster= suffix). */
export function explorerTx(signature: string): string {
  const q = env.solanaCluster === "mainnet-beta" ? "" : `?cluster=${env.solanaCluster}`;
  return `https://explorer.solana.com/tx/${signature}${q}`;
}
export function explorerAddress(address: string): string {
  const q = env.solanaCluster === "mainnet-beta" ? "" : `?cluster=${env.solanaCluster}`;
  return `https://explorer.solana.com/address/${address}${q}`;
}

/**
 * JSON-safe view of a decoded Vault. BigInt does not survive
 * JSON.stringify (it throws), so every 64/128-bit field is emitted as a
 * decimal STRING and the SOL-denominated conveniences as numbers.
 */
export function vaultAccountToJson(v: VaultAccount, lamports?: number): Record<string, unknown> {
  return {
    name: v.name,
    bump: v.bump,
    trader: v.trader.toBase58(),
    operator: v.operator.equals(PublicKey.default) ? null : v.operator.toBase58(),
    navKeeper: v.navKeeper.toBase58(),
    vaultType: v.vaultType,
    status: v.status,
    frozenBy: v.frozenBy,
    perfFeeBps: v.perfFeeBps,
    platformProfitBps: v.platformProfitBps,
    redeemWindowSeconds: Number(v.redeemWindowSeconds),
    navStalenessSeconds: Number(v.navStalenessSeconds),
    totalShares: v.totalShares.toString(),
    seedShares: v.seedShares.toString(),
    managerShares: v.managerShares.toString(),
    navLamports: v.navLamports.toString(),
    navSol: lamportsToSol(v.navLamports),
    navSlot: v.navSlot.toString(),
    navPostedAt: Number(v.navPostedAt),
    lockedProfit: v.lockedProfit.toString(),
    lockedProfitTs: Number(v.lockedProfitTs),
    unlockPeriodSeconds: Number(v.unlockPeriodSeconds),
    maxNavDeltaBps: v.maxNavDeltaBps,
    maxTradeNotionalLamports: v.maxTradeNotionalLamports.toString(),
    maxPriceImpactBps: v.maxPriceImpactBps,
    dailyLossLimitBps: v.dailyLossLimitBps,
    dailyLossAccumulator: v.dailyLossAccumulator.toString(),
    dayBucket: Number(v.dayBucket),
    dayStartEquity: v.dayStartEquity.toString(),
    pendingWithdrawValueLamports: v.pendingWithdrawValueLamports.toString(),
    pendingWithdrawShares: v.pendingWithdrawShares.toString(),
    platformFeesOwedLamports: v.platformFeesOwedLamports.toString(),
    enforceMintAllowlist: v.enforceMintAllowlist,
    allowedMints: v.allowedMints
      .filter((m) => !m.equals(PublicKey.default))
      .map((m) => m.toBase58()),
    ...(lamports === undefined
      ? {}
      : { accountLamports: String(lamports), accountSol: lamports / 1e9 }),
  };
}

/** JSON-safe view of a decoded VaultDepositor (same BigInt rule). */
export function vaultDepositorToJson(
  d: VaultDepositorAccount,
  lamports?: number,
): Record<string, unknown> {
  return {
    vault: d.vault.toBase58(),
    authority: d.authority.toBase58(),
    shares: d.shares.toString(),
    netDepositsLamports: d.netDepositsLamports.toString(),
    netDepositsSol: lamportsToSol(d.netDepositsLamports),
    cumulativeProfitShareLamports: d.cumulativeProfitShareLamports.toString(),
    pendingWithdraw:
      d.lastWithdrawRequest.shares === 0n
        ? null
        : {
            shares: d.lastWithdrawRequest.shares.toString(),
            valueAtRequestLamports: d.lastWithdrawRequest.valueAtRequestLamports.toString(),
            requestedAt: Number(d.lastWithdrawRequest.requestedAt),
          },
    ...(lamports === undefined ? {} : { accountLamports: String(lamports) }),
  };
}
