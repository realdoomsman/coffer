// ── Coffer shared types ─────────────────────────────────────────────
// One source of truth for web + api + engines (the PaperApe pattern).
// All money amounts are SOL-denominated numbers at the API boundary;
// on-chain code uses lamports (bigint) — convert at the edge only.

export type VaultType = "managed" | "mirror";
export type VaultStatus = "active" | "frozen" | "closed";
export type TradeSide = "buy" | "sell";
export type WithdrawStatus = "pending" | "executable" | "paid" | "cancelled";

// Fee split at profit crystallization (basis points of profit).
// 70% depositor / 20% trader (creator-set 10–30%) / 10% platform → buyback+lock.
export const PERF_FEE_DEFAULT_BPS = 2000;
export const PERF_FEE_MIN_BPS = 1000;
export const PERF_FEE_MAX_BPS = 3000;
export const PLATFORM_PROFIT_BPS = 1000;
// Swap fee on vault trades (SOL leg, Jupiter Router platformFeeBps).
export const VAULT_SWAP_FEE_BPS = 20;
// Terminal (personal, non-vault) swap fee — market standard headline.
export const TERMINAL_SWAP_FEE_BPS = 100;

export const LAMPORTS_PER_SOL = 1_000_000_000;

export interface TraderStats {
  winRatePct: number;
  pnlSol: number;
  trades: number;
  profitFactor?: number;
  avgHoldMin?: number;
}

export interface TraderProfile {
  id: string;
  handle: string;
  displayName: string;
  xHandle?: string;
  avatarUrl?: string;
  xVerified: boolean;
  bio?: string;
  /** Recomputed from chain data by our pipeline — never self-reported. */
  onchainStats: TraderStats;
  /** Optional PaperApe import. ALWAYS rendered separately from live stats. */
  paperStats?: TraderStats;
}

export interface EquityPoint {
  /** unix seconds */
  t: number;
  /** vault equity in SOL (or share price ×1000 for normalized curves) */
  v: number;
}

export interface VaultStats {
  pnlPct7d: number;
  pnlPct30d: number;
  pnlPctAll: number;
  maxDrawdownPct: number;
  winRatePct: number;
  tradesCount: number;
  depositorCount: number;
  ageDays: number;
  /** mirror vaults only: median copy lag vs leader, in slots */
  medianCopyLagSlots?: number;
}

export interface Vault {
  id: string;
  name: string;
  type: VaultType;
  status: VaultStatus;
  trader: TraderProfile;
  /** mirror vaults: the leader wallet being copied */
  leaderWallet?: string;
  createdAt: number;
  tvlSol: number;
  sharePriceSol: number;
  totalShares: number;
  managerStakeSol: number;
  managerStakePct: number;
  perfFeeBps: number;
  redeemWindowHours: number;
  /** SOL held unallocated — instant withdrawals draw from this */
  solBufferSol: number;
  thesis?: string;
  stats: VaultStats;
  equityCurve: EquityPoint[];
}

export interface Position {
  id: string;
  vaultId: string;
  mint: string;
  symbol: string;
  name?: string;
  amountTokens: number;
  costSol: number;
  valueSol: number;
  pnlSol: number;
  pnlPct: number;
  /** stale marks are labeled, never hidden */
  markStale: boolean;
  updatedAt: number;
}

export interface Trade {
  id: string;
  vaultId: string;
  ts: number;
  side: TradeSide;
  mint: string;
  symbol: string;
  solAmount: number;
  tokenAmount: number;
  priceSol: number;
  txSig: string;
  source: VaultType;
  /** mirror trades: landed slot − leader slot (public metric) */
  copyLagSlots?: number;
}

export interface WithdrawRequest {
  id: string;
  vaultId: string;
  userId: string;
  shares: number;
  valueAtRequestSol: number;
  requestedAt: number;
  executableAt: number;
  status: WithdrawStatus;
}

export interface Holding {
  vaultId: string;
  vaultName: string;
  vaultType: VaultType;
  shares: number;
  valueSol: number;
  costSol: number;
  pnlSol: number;
  pnlPct: number;
}

export interface TrackedWallet {
  address: string;
  label?: string;
  stats: TraderStats;
  lastActiveAt: number;
  /** already leads a mirror vault on the platform */
  isVaultLeader: boolean;
  vaultId?: string;
  /** real chain scan state: ok = full scan, partial = rate-limited, unscanned = never scanned */
  scanStatus?: "ok" | "partial" | "unscanned";
  scannedAt?: number;
  /** most recent classified swaps from the scan */
  recentSwaps?: WalletSwap[];
}

export interface WalletSwap {
  ts: number;
  side: TradeSide;
  mint: string;
  symbol?: string;
  solAmount: number;
  txSig: string;
}

export type ActivityKind =
  | "trade"
  | "deposit"
  | "withdraw_request"
  | "withdraw_paid"
  | "order_fill"
  | "vault_created";

export interface ActivityEvent {
  id: string;
  ts: number;
  kind: ActivityKind;
  vaultId?: string;
  vaultName?: string;
  /** pre-rendered wire line, e.g. "WAGYU PRIME bought 5.0 SOL of BONK" */
  text: string;
  solAmount?: number;
  side?: TradeSide;
}

export interface PoolTrade {
  ts: number;
  side: TradeSide;
  priceUsd: number;
  amountUsd: number;
  amountToken: number;
  txSig: string;
  wallet: string;
}

export interface PlatformMeta {
  solPriceUsd: number;
  tvlSol: number;
  vaults: number;
  apiTime: number;
}

// ── pulse (lifecycle discovery board) ──────────────────────────────

export interface PulseCard {
  mint: string;
  symbol: string;
  name: string;
  imageUrl?: string;
  /** seconds since pool/token creation */
  ageSec?: number;
  priceUsd?: number;
  mcapUsd?: number;
  liquidityUsd?: number;
  volume24hUsd?: number;
  change5mPct?: number;
  txns5m?: { buys: number; sells: number };
  /** bonding-curve progress 0-100 when known (pump.fun phase) */
  bondingPct?: number;
  pairAddress?: string;
  source: "pumpfun" | "geckoterminal";
}

export type PulseColumnId = "new" | "graduating" | "migrated";

export interface PulseBoard {
  columns: { id: PulseColumnId; title: string; cards: PulseCard[] }[];
  fetchedAt: number;
}

export interface TokenPoolStats {
  mint: string;
  pool: string | null;
  priceChangePct: { m5?: number; h1?: number; h6?: number; h24?: number };
  txns: {
    m5?: { buys: number; sells: number };
    h1?: { buys: number; sells: number };
    h24?: { buys: number; sells: number };
  };
  volumeUsd: { m5?: number; h1?: number; h24?: number };
  fetchedAt: number;
}

/** $0.0₅4451-style notation for microcap prices. */
export function fmtSubscriptPrice(v: number): string {
  if (v <= 0 || !Number.isFinite(v)) return "$0";
  if (v >= 0.001) return fmtUsd(v);
  const s = v.toFixed(20).replace(/0+$/, "");
  const m = /^0\.(0+)(\d+)/.exec(s);
  if (!m) return fmtUsd(v);
  const zeros = m[1]!.length;
  const digits = m[2]!.slice(0, 4);
  const SUB = "₀₁₂₃₄₅₆₇₈₉";
  const sub = String(zeros)
    .split("")
    .map((c) => SUB[Number(c)])
    .join("");
  return `$0.0${sub}${digits}`;
}

export interface TokenRisk {
  mintAuthorityRevoked?: boolean;
  lpBurnedPct?: number;
  top10HolderPct?: number;
  devHoldingPct?: number;
}

export interface TokenInfo {
  mint: string;
  symbol: string;
  name: string;
  priceUsd: number;
  priceSol: number;
  mcapUsd?: number;
  liquidityUsd?: number;
  change24hPct?: number;
  volume24hUsd?: number;
  imageUrl?: string;
  dex?: string;
  pairAddress?: string;
  risk?: TokenRisk;
  /** which oracle tier produced this mark */
  source: "jupiter" | "birdeye" | "dexscreener" | "stale" | "none";
  fetchedAt: number;
}

// ── terminal execution & orders ────────────────────────────────────

export interface Candle {
  /** unix seconds, bucket start */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

export type OrderKind = "take_profit" | "stop_loss" | "limit_buy_dip" | "limit_buy_breakout";
export type OrderStatus = "open" | "filled" | "cancelled" | "failed";

export interface Order {
  id: string;
  vaultId: string;
  mint: string;
  symbol: string;
  kind: OrderKind;
  /** trigger on last-trade USD price */
  triggerPriceUsd: number;
  /** buys: SOL to spend. sells (tp/sl): fraction of position 0-1 */
  amountSol?: number;
  sellFraction?: number;
  status: OrderStatus;
  createdAt: number;
  filledAt?: number;
  filledTradeId?: string;
  /** set when status = failed */
  failReason?: string;
}

export interface TradeResult {
  trade: Trade;
  position: Position | null;
  vault: Vault;
}

export interface TokenSearchResult {
  mint: string;
  symbol: string;
  name: string;
  priceUsd: number;
  mcapUsd?: number;
  liquidityUsd?: number;
  imageUrl?: string;
}

export interface TrendingToken extends TokenSearchResult {
  change24hPct?: number;
  volume24hUsd?: number;
}

// ── helpers ────────────────────────────────────────────────────────

export function lamportsToSol(lamports: number | bigint): number {
  return Number(lamports) / LAMPORTS_PER_SOL;
}

export function shortAddr(addr: string, chars = 4): string {
  if (addr.length <= chars * 2 + 1) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

export function fmtSol(v: number, digits = 2): string {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  if (Math.abs(v) < 0.01 && v !== 0) return v.toFixed(4);
  return v.toFixed(digits);
}

export function fmtPct(v: number, digits = 1): string {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}%`;
}

export function fmtUsd(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  return `$${v.toPrecision(3)}`;
}

export function solscanTx(sig: string): string {
  return `https://solscan.io/tx/${sig}`;
}

export function solscanAccount(addr: string): string {
  return `https://solscan.io/account/${addr}`;
}
