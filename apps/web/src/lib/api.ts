import type {
  ActivityEvent,
  Candle,
  Holding,
  Order,
  OrderKind,
  PlatformMeta,
  PoolTrade,
  Position,
  PulseBoard,
  TokenPoolStats,
  TokenInfo,
  TokenSearchResult,
  TrackedWallet,
  Trade,
  TradeResult,
  TrendingToken,
  Vault,
  WithdrawRequest,
} from "@coffer/shared";

const BASE = "/api";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const j = (await res.json()) as { error?: string };
      detail = j.error ?? "";
    } catch {
      /* not json */
    }
    throw new Error(detail || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export interface VaultDetail {
  vault: Vault;
  positions: Position[];
  trades: Trade[];
  pendingWithdrawals: WithdrawRequest[];
}

export interface PortfolioView {
  holdings: Holding[];
  pendingWithdrawals: WithdrawRequest[];
  totalValueSol: number;
  totalPnlSol: number;
}

export const api = {
  vaults: async (params?: { type?: string; sort?: string }) => {
    const q = new URLSearchParams();
    if (params?.type && params.type !== "all") q.set("type", params.type);
    if (params?.sort) q.set("sort", params.sort);
    const qs = q.toString();
    const r = await get<{ vaults: Vault[] }>(`/vaults${qs ? `?${qs}` : ""}`);
    return r.vaults;
  },
  vault: (id: string) => get<VaultDetail>(`/vaults/${id}`),
  createVault: async (body: {
    name: string;
    type: string;
    perfFeeBps: number;
    thesis?: string;
    leaderWallet?: string;
  }) => {
    const r = await post<{ vault: Vault }>(`/vaults`, body);
    return r.vault;
  },
  deposit: async (vaultId: string, sol: number) => {
    const r = await post<{ deposit: { id: string; shares: number; costSol: number }; vault: Vault }>(
      `/vaults/${vaultId}/deposit`,
      { sol },
    );
    return { shares: r.deposit.shares, vault: r.vault };
  },
  withdraw: async (vaultId: string, shares: number) => {
    const r = await post<{ mode: "instant" | "windowed"; request: WithdrawRequest }>(
      `/vaults/${vaultId}/withdraw`,
      { shares },
    );
    return { instant: r.mode === "instant", request: r.request };
  },
  token: (mint: string) => get<TokenInfo>(`/tokens/${mint}`),
  portfolio: async (): Promise<PortfolioView> => {
    const r = await get<{ holdings: Holding[]; withdrawRequests: WithdrawRequest[] }>(`/portfolio`);
    return {
      holdings: r.holdings,
      pendingWithdrawals: r.withdrawRequests.filter((w) => w.status === "pending" || w.status === "executable"),
      totalValueSol: r.holdings.reduce((s, h) => s + h.valueSol, 0),
      totalPnlSol: r.holdings.reduce((s, h) => s + h.pnlSol, 0),
    };
  },
  trackedWallets: async () => {
    const r = await get<{ wallets: TrackedWallet[] }>(`/wallets/tracked`);
    return r.wallets;
  },
  trackWallet: async (address: string, label?: string) => {
    const r = await post<{ wallet: TrackedWallet }>(`/wallets/tracked`, { address, label });
    return r.wallet;
  },
  health: () => get<{ ok: boolean }>(`/health`),

  // ── live trading tech ──
  trade: (
    vaultId: string,
    body:
      | { side: "buy"; mint: string; solAmount: number }
      | { side: "sell"; mint: string; sellFraction: number },
  ) => post<TradeResult>(`/vaults/${vaultId}/trade`, body),
  ohlcv: async (mint: string, tf: "1m" | "5m" | "15m" | "1h") => {
    const r = await get<{ candles: Candle[]; pool: string | null }>(`/ohlcv/${mint}?tf=${tf}`);
    return r;
  },
  searchTokens: async (q: string) => {
    const r = await get<{ results: TokenSearchResult[] }>(
      `/tokens/search?q=${encodeURIComponent(q)}`,
    );
    return r.results;
  },
  trending: async () => {
    const r = await get<{ tokens: TrendingToken[] }>(`/tokens/trending`);
    return r.tokens;
  },
  orders: async (vaultId?: string, status?: string) => {
    const q = new URLSearchParams();
    if (vaultId) q.set("vaultId", vaultId);
    if (status) q.set("status", status);
    const r = await get<{ orders: Order[] }>(`/orders${q.toString() ? `?${q}` : ""}`);
    return r.orders;
  },
  placeOrder: async (body: {
    vaultId: string;
    mint: string;
    kind: OrderKind;
    triggerPriceUsd: number;
    amountSol?: number;
    sellFraction?: number;
  }) => {
    const r = await post<{ order: Order }>(`/orders`, body);
    return r.order;
  },
  cancelOrder: async (id: string) => {
    const r = await post<{ order: Order }>(`/orders/${id}/cancel`, {});
    return r.order;
  },

  // ── live platform layer ──
  meta: () => get<PlatformMeta>(`/meta`),
  activity: async (limit = 30) => {
    const r = await get<{ events: ActivityEvent[] }>(`/activity?limit=${limit}`);
    return r.events;
  },
  poolTrades: async (mint: string) => {
    const r = await get<{ trades: PoolTrade[] }>(`/pooltrades/${mint}`);
    return r.trades;
  },
  executeWithdrawal: (id: string) =>
    post<{ request: WithdrawRequest; paidSol: number; vault: Vault }>(
      `/withdrawals/${id}/execute`,
      {},
    ),
  scanWallet: async (address: string, force = false) => {
    const r = await post<{ wallet: TrackedWallet }>(
      `/wallets/tracked/${address}/scan${force ? "?force=1" : ""}`,
      {},
    );
    return r.wallet;
  },
  pulse: () => get<PulseBoard>(`/pulse`),
  tokenStats: (mint: string) => get<TokenPoolStats>(`/tokenstats/${mint}`),

  // ── DCA orders (wire type local until shared package ships it) ──
  dcaList: async (vaultId: string) => {
    const r = await get<{ orders: DcaOrder[] }>(`/dca?vaultId=${vaultId}`);
    return r.orders;
  },
  dcaCreate: async (body: {
    vaultId: string;
    mint: string;
    amountSolPerLeg: number;
    intervalSec: number;
    legsTotal: number;
  }) => {
    const r = await post<{ dca: DcaOrder }>(`/dca`, body);
    return r.dca;
  },
  dcaCancel: async (id: string) => {
    const r = await post<{ dca: DcaOrder }>(`/dca/${id}/cancel`, {});
    return r.dca;
  },
};

export interface DcaOrder {
  id: string;
  vaultId: string;
  mint: string;
  symbol: string;
  amountSolPerLeg: number;
  intervalSec: number;
  legsTotal: number;
  legsDone: number;
  nextLegAt: number;
  status: "active" | "done" | "cancelled" | "failed";
  createdAt: number;
  failReason?: string;
}
