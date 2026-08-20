import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  fmtSol,
  fmtSubscriptPrice,
  fmtUsd,
  shortAddr,
  solscanTx,
  type Order,
  type OrderKind,
  type Position,
  type TokenInfo,
  type TokenPoolStats,
  type Trade,
  type Vault,
} from "@coffer/shared";
import { api, type DcaOrder } from "../lib/api";
import { useFlash, usePageTitle, usePoll } from "../lib/hooks";
import { usePresets } from "../lib/presets";
import { useWatchlist } from "../lib/watchlist";
import { useToast } from "../lib/toast";
import { Skeleton } from "../components/bits";
import { RatioBar, TimeframeStrip } from "../components/market";

const TFS = ["1m", "5m", "15m", "1h"] as const;
type Tf = (typeof TFS)[number];

const DEFAULT_MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"; // BONK

const ORDER_KINDS: { id: OrderKind; label: string; side: "sell" | "buy" }[] = [
  { id: "take_profit", label: "Take profit", side: "sell" },
  { id: "stop_loss", label: "Stop loss", side: "sell" },
  { id: "limit_buy_dip", label: "Buy the dip", side: "buy" },
  { id: "limit_buy_breakout", label: "Buy breakout", side: "buy" },
];

export function Terminal() {
  usePageTitle("Terminal");
  const toast = useToast();

  const [mint, setMint] = useState(DEFAULT_MINT);
  const [tf, setTf] = useState<Tf>("5m");
  const [denom, setDenom] = useState<"usd" | "mcap">("usd");
  const [supplyUi, setSupplyUi] = useState<number | null>(null);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("1");
  const [busy, setBusy] = useState(false);
  const [slippage, setSlippage] = useState("2");
  const [prio, setPrio] = useState("0.001");
  const [mev, setMev] = useState<"off" | "reduced" | "secure">("reduced");
  const { presets, active, setActive } = usePresets();
  const { toggle: toggleWatch, isWatched } = useWatchlist();

  function applyPreset(i: number) {
    setActive(i);
    const p = presets[i]!;
    setSide("buy");
    setAmount(String(p.buySol));
    setSlippage(String(p.slippagePct));
    setPrio(String(p.prioSol));
    setMev(p.mev);
  }

  // vault being traded
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [vaultId, setVaultId] = useState<string | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [vaultTrades, setVaultTrades] = useState<Trade[]>([]);

  // order form
  const [orderKind, setOrderKind] = useState<OrderKind>("take_profit");
  const [trigger, setTrigger] = useState("");
  const [orderAmt, setOrderAmt] = useState("1");

  // DCA form
  const [dcaAmt, setDcaAmt] = useState("0.5");
  const [dcaEveryMin, setDcaEveryMin] = useState("5");
  const [dcaLegs, setDcaLegs] = useState("6");
  const { data: dcas, setData: setDcas } = usePoll<DcaOrder[]>(
    () => (vaultId ? api.dcaList(vaultId) : Promise.resolve([])),
    15_000,
    [vaultId],
  );

  const { data: info } = usePoll<TokenInfo>(() => api.token(mint), 10_000, [mint]);
  const { data: poolStats } = usePoll<TokenPoolStats>(() => api.tokenStats(mint), 30_000, [mint]);
  const priceFlash = useFlash(info?.priceUsd);

  const { data: trending } = usePoll(() => api.trending(), 120_000, []);
  const { data: poolTape } = usePoll(() => api.poolTrades(mint), 15_000, [mint]);
  const { data: orders, setData: setOrders } = usePoll<Order[]>(
    () => (vaultId ? api.orders(vaultId) : Promise.resolve([])),
    10_000,
    [vaultId],
  );

  // chart
  const chartRef = useRef<HTMLDivElement>(null);
  const chartApi = useRef<IChartApi | null>(null);
  const seriesApi = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const rawCandles = useRef<{ t: number; o: number; h: number; l: number; c: number }[]>([]);
  const [pool, setPool] = useState<string | null>(null);
  const [candleState, setCandleState] = useState<"loading" | "live" | "none">("loading");

  // supply powers the Price/MCap denomination toggle — memecoin traders think in mcap
  useEffect(() => {
    let alive = true;
    setSupplyUi(null);
    fetch(`/api/security/${mint}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { supplyUi?: number | null } | null) => {
        if (alive) setSupplyUi(s?.supplyUi ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [mint]);

  useEffect(() => {
    api.vaults().then((vs) => {
      setVaults(vs);
      if (vs.length > 0 && !vaultId) setVaultId(vs[0]!.id);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!vaultId) return;
    let alive = true;
    const load = () =>
      api.vault(vaultId).then((d) => {
        if (!alive) return;
        setPositions(d.positions);
        setVaultTrades(d.trades);
        setVaults((vs) => vs.map((v) => (v.id === d.vault.id ? d.vault : v)));
      }).catch(() => {});
    load();
    const iv = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [vaultId]);

  useEffect(() => {
    if (!chartRef.current) return;
    const chart = createChart(chartRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#9a968a",
        fontFamily: "IBM Plex Mono, Consolas, monospace",
        fontSize: 11,
      },
      grid: { vertLines: { color: "#1c1c18" }, horzLines: { color: "#1c1c18" } },
      rightPriceScale: { borderColor: "#38382f" },
      timeScale: { borderColor: "#38382f", timeVisible: true, secondsVisible: false },
      crosshair: { vertLine: { color: "#545447" }, horzLine: { color: "#545447" } },
      height: 420,
      autoSize: true,
    });
    seriesApi.current = chart.addCandlestickSeries({
      upColor: "#2fd980",
      downColor: "#ff4f58",
      borderUpColor: "#2fd980",
      borderDownColor: "#ff4f58",
      wickUpColor: "#2fd980",
      wickDownColor: "#ff4f58",
      priceFormat: { type: "price", precision: 9, minMove: 0.000000001 },
    });
    chartApi.current = chart;
    return () => {
      seriesApi.current = null;
      chartApi.current = null;
      chart.remove();
    };
  }, []);

  const [candleVer, setCandleVer] = useState(0);

  useEffect(() => {
    let alive = true;
    setCandleState("loading");
    const load = () =>
      api
        .ohlcv(mint, tf)
        .then((r) => {
          if (!alive) return;
          setPool(r.pool);
          rawCandles.current = r.candles;
          setCandleVer((v) => v + 1);
          setCandleState(r.candles.length === 0 ? "none" : "live");
        })
        .catch(() => alive && setCandleState("none"));
    load();
    const iv = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [mint, tf]);

  // render pipeline: raw candles × denomination scale + vault trade markers
  useEffect(() => {
    const series = seriesApi.current;
    const chart = chartApi.current;
    if (!series || !chart) return;
    const mcapMode = denom === "mcap" && supplyUi !== null && supplyUi > 0;
    const scale = mcapMode ? supplyUi : 1;
    series.applyOptions({
      priceFormat: mcapMode
        ? { type: "volume" }
        : { type: "price", precision: 9, minMove: 0.000000001 },
    });
    series.setData(
      rawCandles.current.map((c) => ({
        time: c.t as UTCTimestamp,
        open: c.o * scale,
        high: c.h * scale,
        low: c.l * scale,
        close: c.c * scale,
      })),
    );
    // your vault's fills painted on the candles — B below, S above
    const first = rawCandles.current[0]?.t ?? 0;
    series.setMarkers(
      vaultTrades
        .filter((t) => t.mint === mint && t.ts >= first)
        .sort((a, b) => a.ts - b.ts)
        .map((t) => ({
          time: t.ts as UTCTimestamp,
          position: t.side === "buy" ? ("belowBar" as const) : ("aboveBar" as const),
          color: t.side === "buy" ? "#2fd980" : "#ff4f58",
          shape: t.side === "buy" ? ("arrowUp" as const) : ("arrowDown" as const),
          text: t.side === "buy" ? "B" : "S",
        })),
    );
    chart.timeScale().fitContent();
  }, [candleVer, denom, supplyUi, vaultTrades, mint]);

  // detect order fills → toast
  const prevOrders = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    if (!orders) return;
    for (const o of orders) {
      const prev = prevOrders.current.get(o.id);
      if (prev === "open" && o.status === "filled") {
        toast("good", `${o.kind.replace(/_/g, " ")} filled: ${o.symbol}`);
      }
      if (prev === "open" && o.status === "failed") {
        toast("bad", `${o.kind.replace(/_/g, " ")} failed: ${o.failReason ?? o.symbol}`);
      }
      prevOrders.current.set(o.id, o.status);
    }
  }, [orders, toast]);

  const vault = vaults.find((v) => v.id === vaultId) ?? null;
  const heldPosition = positions.find((p) => p.mint === mint) ?? null;
  const amountNum = parseFloat(amount) || 0;

  async function executeTrade() {
    if (!vaultId || !info) return;
    setBusy(true);
    try {
      const r =
        side === "buy"
          ? await api.trade(vaultId, { side: "buy", mint, solAmount: amountNum })
          : await api.trade(vaultId, { side: "sell", mint, sellFraction: amountNum / 100 });
      toast(
        "good",
        side === "buy"
          ? `Bought ${info.symbol}: ${fmtSol(r.trade.solAmount)} ◎ @ ${fmtUsd(info.priceUsd)}`
          : `Sold ${(amountNum).toFixed(0)}% of ${info.symbol}: +${fmtSol(r.trade.solAmount)} ◎`,
      );
      setVaults((vs) => vs.map((v) => (v.id === r.vault.id ? r.vault : v)));
      setPositions((ps) => {
        const rest = ps.filter((p) => p.mint !== mint);
        return r.position ? [...rest, r.position] : rest;
      });
    } catch (e) {
      toast("bad", e instanceof Error ? e.message : "trade failed");
    } finally {
      setBusy(false);
    }
  }

  async function placeOrder() {
    if (!vaultId || !info) return;
    const t = parseFloat(trigger) || 0;
    if (t <= 0) return;
    const kindMeta = ORDER_KINDS.find((k) => k.id === orderKind)!;
    setBusy(true);
    try {
      const o = await api.placeOrder({
        vaultId,
        mint,
        kind: orderKind,
        triggerPriceUsd: t,
        ...(kindMeta.side === "buy"
          ? { amountSol: parseFloat(orderAmt) || 1 }
          : { sellFraction: (parseFloat(orderAmt) || 100) / 100 }),
      });
      setOrders((os) => [o, ...(os ?? [])]);
      toast("info", `${kindMeta.label} armed at ${fmtUsd(t)}`);
      setTrigger("");
    } catch (e) {
      toast("bad", e instanceof Error ? e.message : "order failed");
    } finally {
      setBusy(false);
    }
  }

  const openOrders = useMemo(() => (orders ?? []).filter((o) => o.status === "open"), [orders]);
  const kindMeta = ORDER_KINDS.find((k) => k.id === orderKind)!;

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Terminal</h1>
          <div className="sub">
            Live chart from on-chain pools · trades execute against your vault's ledger at live prices ·
            on-chain execution arrives with the P1 program deploy.
          </div>
        </div>
      </div>

      {positions.length > 0 && (
        <div className="posbar">
          {positions.map((p) => (
            <button key={p.id} className={`poschip ${p.mint === mint ? "on" : ""}`} onClick={() => setMint(p.mint)}>
              <span style={{ fontWeight: 700 }}>{p.symbol}</span>
              <span className="num">{fmtSol(p.valueSol)}◎</span>
              <span className={`num ${p.pnlPct >= 0 ? "pos" : "neg"}`}>
                {p.pnlPct >= 0 ? "+" : ""}
                {p.pnlPct.toFixed(1)}%
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="termgrid">
        {/* ── left: chart + positions + orders ── */}
        <div style={{ minWidth: 0 }}>
          <div className="panel panel-pad" style={{ marginBottom: 14 }}>
            <div className="tokhead" style={{ marginBottom: 10 }}>
              {info ? (
                <>
                  <button
                    onClick={() => toggleWatch(mint, info.symbol)}
                    title={isWatched(mint) ? "Unwatch" : "Watch — pins to the topbar"}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 16,
                      color: isWatched(mint) ? "var(--amber)" : "var(--dim)",
                    }}
                  >
                    ★
                  </button>
                  <span className="mono" style={{ fontSize: 18, fontWeight: 700 }}>{info.symbol}</span>
                  <span
                    className={`price ${priceFlash === "up" ? "flash-up" : priceFlash === "down" ? "flash-down" : ""}`}
                  >
                    {fmtSubscriptPrice(info.priceUsd)}
                  </span>
                  {info.change24hPct !== undefined && (
                    <span className={`num ${(info.change24hPct ?? 0) >= 0 ? "pos" : "neg"}`}>
                      {(info.change24hPct ?? 0) >= 0 ? "+" : ""}
                      {(info.change24hPct ?? 0).toFixed(1)}%
                    </span>
                  )}
                  <span className="mono dimtx" style={{ fontSize: 11 }}>
                    {info.mcapUsd ? `mcap ${fmtUsd(info.mcapUsd)}` : ""}
                    {info.liquidityUsd ? ` · liq ${fmtUsd(info.liquidityUsd)}` : ""}
                    {` · src ${info.source}`}
                  </span>
                </>
              ) : (
                <Skeleton h={26} w={280} />
              )}
              <span style={{ flex: 1 }} />
              <div className="viewtoggle" title={supplyUi ? "Chart denomination" : "MCap needs supply — loading"}>
                <button className={denom === "usd" ? "on" : ""} onClick={() => setDenom("usd")}>
                  Price
                </button>
                <button
                  className={denom === "mcap" ? "on" : ""}
                  disabled={!supplyUi}
                  onClick={() => setDenom("mcap")}
                >
                  MCap
                </button>
              </div>
              <div className="chipsrow">
                {TFS.map((t) => (
                  <button key={t} className={`chip ${tf === t ? "on" : ""}`} onClick={() => setTf(t)}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "stretch", marginBottom: 10, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 280px" }}>
                <TimeframeStrip stats={poolStats ?? null} />
              </div>
              {poolStats?.txns.h24 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="dimtx mono" style={{ fontSize: 9.5, letterSpacing: "0.14em" }}>TXNS 24H</span>
                  <RatioBar a={poolStats.txns.h24.buys} b={poolStats.txns.h24.sells} width={120} />
                </div>
              )}
            </div>
            <div style={{ position: "relative" }}>
              <div ref={chartRef} style={{ width: "100%" }} />
              {candleState === "loading" && (
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                  <span className="mono dimtx">loading candles…</span>
                </div>
              )}
              {candleState === "none" && (
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                  <span className="mono dimtx">no pool candles for this token</span>
                </div>
              )}
            </div>
            {pool && (
              <div className="mono dimtx" style={{ fontSize: 10.5, marginTop: 6 }}>
                candles: GeckoTerminal · pool {pool.slice(0, 10)}… · refreshes 30s
              </div>
            )}
          </div>

          <div className="sectiontitle" style={{ marginTop: 0 }}>
            {vault ? `${vault.name} — open positions` : "Open positions"}
          </div>
          <div className="panel" style={{ marginBottom: 14 }}>
            {positions.length === 0 ? (
              <div className="empty">No open positions — vault is all SOL</div>
            ) : (
              <div className="tablewrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Token</th>
                      <th className="r">Value</th>
                      <th className="r">PnL</th>
                      <th className="r">Quick sell</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <button
                            className="chip"
                            style={{ border: "none", padding: "2px 6px" }}
                            onClick={() => setMint(p.mint)}
                          >
                            {p.symbol}
                          </button>
                          {p.markStale && <span className="pill stale" style={{ marginLeft: 6 }}>stale</span>}
                        </td>
                        <td className="r num">{fmtSol(p.valueSol)} ◎</td>
                        <td className="r num">
                          <span className={p.pnlSol >= 0 ? "pos" : "neg"}>
                            {p.pnlSol >= 0 ? "+" : ""}
                            {fmtSol(p.pnlSol)} ◎
                          </span>
                        </td>
                        <td className="r">
                          <button
                            className="btn ghost sm"
                            title="Sell exactly your initial cost — keep the rest as a free ride"
                            disabled={busy || !vaultId || p.valueSol <= p.costSol}
                            onClick={() => {
                              void (async () => {
                                if (!vaultId) return;
                                const frac = Math.min(0.999, p.costSol / p.valueSol);
                                setBusy(true);
                                try {
                                  const r = await api.trade(vaultId, { side: "sell", mint: p.mint, sellFraction: frac });
                                  toast("good", `${p.symbol}: initials out (+${fmtSol(r.trade.solAmount)} ◎) — free bag riding`);
                                  setVaults((vs) => vs.map((v) => (v.id === r.vault.id ? r.vault : v)));
                                  setPositions((ps) => {
                                    const rest = ps.filter((x) => x.mint !== p.mint);
                                    return r.position ? [...rest, r.position] : rest;
                                  });
                                } catch (e) {
                                  toast("bad", e instanceof Error ? e.message : "sell failed");
                                } finally {
                                  setBusy(false);
                                }
                              })();
                            }}
                          >
                            init
                          </button>
                          {[25, 50, 100].map((pct) => (
                            <button
                              key={pct}
                              className="btn ghost sm"
                              style={{ marginLeft: 4 }}
                              disabled={busy || !vaultId}
                              onClick={() => {
                                setMint(p.mint);
                                void (async () => {
                                  if (!vaultId) return;
                                  setBusy(true);
                                  try {
                                    const r = await api.trade(vaultId, {
                                      side: "sell",
                                      mint: p.mint,
                                      sellFraction: pct / 100,
                                    });
                                    toast("good", `Sold ${pct}% of ${p.symbol}: +${fmtSol(r.trade.solAmount)} ◎`);
                                    setVaults((vs) => vs.map((v) => (v.id === r.vault.id ? r.vault : v)));
                                    setPositions((ps) => {
                                      const rest = ps.filter((x) => x.mint !== p.mint);
                                      return r.position ? [...rest, r.position] : rest;
                                    });
                                  } catch (e) {
                                    toast("bad", e instanceof Error ? e.message : "sell failed");
                                  } finally {
                                    setBusy(false);
                                  }
                                })();
                              }}
                            >
                              {pct}%
                            </button>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="sectiontitle">Pool tape — live on-chain trades</div>
          <div className="panel" style={{ marginBottom: 14 }}>
            {!poolTape || poolTape.length === 0 ? (
              <div className="empty">No recent pool trades surfaced</div>
            ) : (
              <div className="tablewrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Age</th>
                      <th>Side</th>
                      <th className="r">USD</th>
                      <th className="r">Price</th>
                      <th className="r">Wallet</th>
                      <th className="r">Tx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {poolTape.slice(0, 10).map((t) => {
                      const age = Math.max(1, Math.floor(Date.now() / 1000 - t.ts));
                      const ageStr = age < 60 ? `${age}s` : age < 3600 ? `${Math.floor(age / 60)}m` : `${Math.floor(age / 3600)}h`;
                      return (
                        <tr key={t.txSig}>
                          <td className="num dimtx">{ageStr}</td>
                          <td>
                            <span className={`num ${t.side === "buy" ? "pos" : "neg"}`}>
                              {t.side.toUpperCase()}
                            </span>
                          </td>
                          <td className="r num">{fmtUsd(t.amountUsd)}</td>
                          <td className="r num dimtx">{fmtUsd(t.priceUsd)}</td>
                          <td className="r num dimtx">{shortAddr(t.wallet, 4)}</td>
                          <td className="r">
                            <a className="num dimtx" href={solscanTx(t.txSig)} target="_blank" rel="noreferrer">
                              {shortAddr(t.txSig, 4)}
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="sectiontitle">Orders</div>
          <div className="panel">
            {(orders ?? []).length === 0 ? (
              <div className="empty">No orders yet — arm a TP/SL or limit buy on the right</div>
            ) : (
              <div className="tablewrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Kind</th>
                      <th>Token</th>
                      <th className="r">Trigger</th>
                      <th className="r">Size</th>
                      <th className="r">Status</th>
                      <th className="r"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(orders ?? []).slice(0, 12).map((o) => (
                      <tr key={o.id}>
                        <td className="mono" style={{ fontSize: 12 }}>{o.kind.replace(/_/g, " ")}</td>
                        <td className="mono">{o.symbol}</td>
                        <td className="r num">{fmtUsd(o.triggerPriceUsd)}</td>
                        <td className="r num">
                          {o.amountSol !== undefined && o.amountSol !== null
                            ? `${fmtSol(o.amountSol)} ◎`
                            : o.sellFraction !== undefined && o.sellFraction !== null
                              ? `${Math.round(o.sellFraction * 100)}%`
                              : "—"}
                        </td>
                        <td className="r"><span className={`pill ${o.status}`}>{o.status}</span></td>
                        <td className="r">
                          {o.status === "open" && (
                            <button
                              className="btn ghost sm"
                              onClick={() => {
                                void api.cancelOrder(o.id).then((upd) => {
                                  setOrders((os) => (os ?? []).map((x) => (x.id === upd.id ? upd : x)));
                                });
                              }}
                            >
                              cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── right: vault, trade, orders, trending ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="panel panel-pad">
            <div className="field" style={{ marginBottom: 8 }}>
              <label>Trading vault</label>
              <select value={vaultId ?? ""} onChange={(e) => setVaultId(e.target.value)}>
                {vaults.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} · {fmtSol(v.solBufferSol)} ◎ free
                  </option>
                ))}
              </select>
            </div>
            {vault && (
              <div className="kv">
                <span className="k">SOL buffer</span>
                <span className="v">{fmtSol(vault.solBufferSol)} ◎ of {fmtSol(vault.tvlSol, 0)} ◎</span>
              </div>
            )}
          </div>

          <div className="panel panel-pad">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span className="dimtx mono" style={{ fontSize: 9.5, letterSpacing: "0.16em" }}>PRESETS</span>
              <div className="viewtoggle">
                {presets.map((p, i) => (
                  <button key={p.label} className={active === i ? "on" : ""} onClick={() => applyPreset(i)} title={`${p.buySol}◎ · slip ${p.slippagePct}% · prio ${p.prioSol} · ${p.mev}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="tradetabs">
              <button className={`buy ${side === "buy" ? "on" : ""}`} onClick={() => { setSide("buy"); setAmount("1"); }}>
                Buy
              </button>
              <button className={`sell ${side === "sell" ? "on" : ""}`} onClick={() => { setSide("sell"); setAmount("50"); }}>
                Sell
              </button>
            </div>

            <div className="field">
              <label>{side === "buy" ? "Spend (SOL)" : "Sell (% of position)"}</label>
              <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="presetrow" style={{ marginBottom: 12 }}>
              {(side === "buy" ? ["0.5", "1", "2", "5"] : ["25", "50", "75", "100"]).map((v) => (
                <button key={v} className={`chip ${amount === v ? "on" : ""}`} onClick={() => setAmount(v)}>
                  {v}{side === "buy" ? "◎" : "%"}
                </button>
              ))}
            </div>

            {side === "sell" && !heldPosition && (
              <div className="callout" style={{ marginBottom: 10 }}>
                No {info?.symbol ?? "token"} position in this vault yet.
              </div>
            )}

            <button
              className={`btn ${side}`}
              style={{ width: "100%" }}
              disabled={
                busy ||
                !vaultId ||
                !info ||
                info.source === "none" ||
                amountNum <= 0 ||
                (side === "sell" && !heldPosition) ||
                (side === "buy" && vault !== null && amountNum > vault.solBufferSol)
              }
              onClick={() => void executeTrade()}
            >
              {busy ? "…" : side === "buy" ? `Buy ${info?.symbol ?? ""}` : `Sell ${info?.symbol ?? ""}`}
            </button>
            {side === "buy" && vault && amountNum > vault.solBufferSol && (
              <div className="dimtx" style={{ fontSize: 11.5, marginTop: 6 }}>
                Exceeds the vault's free SOL ({fmtSol(vault.solBufferSol)} ◎).
              </div>
            )}
            <div className="gasline" aria-label="Execution settings">
              <span title="Priority fee">⛽ {prio}</span>
              <span title="Slippage">〜 {slippage}%</span>
              <span title="MEV protection">🛡 {mev}</span>
              <span
                title="Change via presets — applied on-chain in P1"
                onClick={() => applyPreset(active)}
                style={{ cursor: "pointer", color: "var(--amber)" }}
              >
                edit
              </span>
            </div>
          </div>

          <div className="panel panel-pad">
            <div className="sectiontitle" style={{ marginTop: 0 }}>Arm an order</div>
            <div className="field">
              <label>Type</label>
              <select value={orderKind} onChange={(e) => setOrderKind(e.target.value as OrderKind)}>
                {ORDER_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>{k.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Trigger price (USD) — now {info ? fmtUsd(info.priceUsd) : "…"}</label>
              <input
                type="number"
                min="0"
                step="any"
                placeholder={info ? String(info.priceUsd) : "0"}
                value={trigger}
                onChange={(e) => setTrigger(e.target.value)}
              />
            </div>
            <div className="field">
              <label>{kindMeta.side === "buy" ? "Spend (SOL)" : "Sell (% of position)"}</label>
              <input type="number" min="0" value={orderAmt} onChange={(e) => setOrderAmt(e.target.value)} />
            </div>
            <button
              className="btn"
              style={{ width: "100%" }}
              disabled={
                busy || !vaultId || !info || (parseFloat(trigger) || 0) <= 0 ||
                (kindMeta.side === "sell" && !heldPosition)
              }
              onClick={() => void placeOrder()}
            >
              Arm {kindMeta.label.toLowerCase()} · {openOrders.length} open
            </button>
            <p className="dimtx" style={{ fontSize: 11.5, marginBottom: 0 }}>
              The engine checks triggers against live prices every 15s and fires through the same
              trade path.
            </p>
          </div>

          <div className="panel panel-pad">
            <div className="sectiontitle" style={{ marginTop: 0 }}>DCA — spread the entry</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <div className="field" style={{ marginBottom: 8 }}>
                <label>◎ / leg</label>
                <input type="number" min="0" step="0.1" value={dcaAmt} onChange={(e) => setDcaAmt(e.target.value)} />
              </div>
              <div className="field" style={{ marginBottom: 8 }}>
                <label>Every (min)</label>
                <input type="number" min="1" step="1" value={dcaEveryMin} onChange={(e) => setDcaEveryMin(e.target.value)} />
              </div>
              <div className="field" style={{ marginBottom: 8 }}>
                <label>Legs</label>
                <input type="number" min="1" max="96" step="1" value={dcaLegs} onChange={(e) => setDcaLegs(e.target.value)} />
              </div>
            </div>
            <button
              className="btn"
              style={{ width: "100%" }}
              disabled={
                busy || !vaultId || !info || info.source === "none" ||
                (parseFloat(dcaAmt) || 0) <= 0 || (parseInt(dcaLegs) || 0) < 1
              }
              onClick={() => {
                void (async () => {
                  if (!vaultId) return;
                  setBusy(true);
                  try {
                    const dca = await api.dcaCreate({
                      vaultId,
                      mint,
                      amountSolPerLeg: parseFloat(dcaAmt) || 0.5,
                      intervalSec: Math.max(60, (parseInt(dcaEveryMin) || 5) * 60),
                      legsTotal: Math.min(96, Math.max(1, parseInt(dcaLegs) || 6)),
                    });
                    setDcas((ds) => [dca, ...(ds ?? [])]);
                    toast("good", `DCA armed: ${dca.legsTotal}×${fmtSol(dca.amountSolPerLeg)} ◎ ${info?.symbol ?? ""} — leg 1 filled now`);
                  } catch (e) {
                    toast("bad", e instanceof Error ? e.message : "DCA failed");
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              Start DCA · leg 1 fires now
            </button>
            {(dcas ?? []).filter((d) => d.status === "active").length + (dcas ?? []).filter((d) => d.status !== "active").slice(0, 2).length > 0 && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                {(dcas ?? []).slice(0, 5).map((d) => {
                  const nextIn = Math.max(0, d.nextLegAt - Math.floor(Date.now() / 1000));
                  return (
                    <div key={d.id} className="kv" style={{ alignItems: "center" }}>
                      <span className="k" style={{ textTransform: "none" }}>
                        {d.symbol} {d.legsDone}/{d.legsTotal} · {fmtSol(d.amountSolPerLeg)}◎
                        {d.status === "active" ? ` · next ${Math.floor(nextIn / 60)}m${nextIn % 60}s` : ""}
                      </span>
                      <span className="v" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span className={`pill ${d.status === "active" ? "open" : d.status === "done" ? "filled" : d.status}`}>
                          {d.status}
                        </span>
                        {d.status === "active" && (
                          <button
                            className="btn ghost sm"
                            onClick={() => {
                              void api.dcaCancel(d.id).then((upd) => {
                                setDcas((ds) => (ds ?? []).map((x) => (x.id === upd.id ? upd : x)));
                              });
                            }}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="panel panel-pad">
            <div className="sectiontitle" style={{ marginTop: 0 }}>Trending on Solana</div>
            {!trending ? (
              <>
                <Skeleton h={30} style={{ marginBottom: 8 }} />
                <Skeleton h={30} style={{ marginBottom: 8 }} />
                <Skeleton h={30} />
              </>
            ) : (
              trending.slice(0, 8).map((t) => (
                <button key={t.mint} className="trendrow" onClick={() => setMint(t.mint)}>
                  {t.imageUrl ? <img src={t.imageUrl} alt="" /> : <span style={{ width: 22 }} />}
                  <span className="mono" style={{ fontWeight: 600 }}>{t.symbol}</span>
                  <span style={{ flex: 1 }} />
                  <span className="num mutedtx">{fmtUsd(t.priceUsd)}</span>
                  {t.change24hPct !== undefined && (
                    <span className={`num ${t.change24hPct >= 0 ? "pos" : "neg"}`} style={{ width: 58, textAlign: "right" }}>
                      {t.change24hPct >= 0 ? "+" : ""}
                      {t.change24hPct.toFixed(1)}%
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
