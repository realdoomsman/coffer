/** Reusable candlestick chart — the Terminal's lightweight-charts v4
 *  pattern extracted: create chart + series ONCE, setData on mint/tf
 *  change, refresh every 30s. Ink palette, GeckoTerminal pool candles. */
import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { api } from "../lib/api";

export const CANDLE_TFS = ["1m", "5m", "15m", "1h"] as const;
export type CandleTf = (typeof CANDLE_TFS)[number];

export function CandleChart({
  mint,
  tf,
  height = 420,
}: {
  mint: string;
  tf: CandleTf;
  height?: number;
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartApi = useRef<IChartApi | null>(null);
  const seriesApi = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const hasData = useRef(false);
  const [pool, setPool] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [candleState, setCandleState] = useState<"loading" | "live" | "stale" | "none">("loading");

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
      height,
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
  }, [height]);

  useEffect(() => {
    let alive = true;
    // token/timeframe change: clear the old series so nothing bleeds across
    hasData.current = false;
    seriesApi.current?.setData([]);
    setCandleState("loading");
    const load = () =>
      api
        .ohlcv(mint, tf)
        .then((r) => {
          if (!alive || !seriesApi.current || !chartApi.current) return;
          setPool(r.pool);
          setSource(r.source ?? null);
          if (r.candles.length === 0) {
            // failed refresh keeps the drawn chart — stale beats blank
            setCandleState(hasData.current ? "stale" : "none");
            return;
          }
          // strictly-ascending unique timestamps or lightweight-charts throws
          const clean = [...r.candles]
            .sort((a, b) => a.t - b.t)
            .filter((c, i, arr) => i === arr.length - 1 || c.t !== arr[i + 1]!.t);
          seriesApi.current.setData(
            clean.map((c) => ({
              time: c.t as UTCTimestamp,
              open: c.o,
              high: c.h,
              low: c.l,
              close: c.c,
            })),
          );
          chartApi.current.timeScale().fitContent();
          hasData.current = true;
          setCandleState(r.stale ? "stale" : "live");
        })
        .catch(() => alive && setCandleState(hasData.current ? "stale" : "none"));
    load();
    const iv = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [mint, tf]);

  return (
    <>
      <div style={{ position: "relative" }}>
        <div ref={chartRef} style={{ width: "100%" }} />
        {candleState === "loading" && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
            <span className="mono dimtx">loading candles…</span>
          </div>
        )}
        {candleState === "none" && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
            <span className="mono dimtx">no pool candles yet — new tokens chart once they trade on a pool</span>
          </div>
        )}
        {candleState === "stale" && (
          <span
            className="pill stale"
            style={{ position: "absolute", top: 8, left: 8 }}
            title="Data source is rate-limited — showing the last good chart, retrying every 30s"
          >
            stale — retrying
          </span>
        )}
      </div>
      {(source || pool) && (
        <div className="mono dimtx" style={{ fontSize: 10.5, marginTop: 6 }}>
          candles: {source === "pumpfun" ? "pump.fun" : source === "geckoterminal" ? "GeckoTerminal" : "—"}
          {pool ? ` · pool ${pool.slice(0, 10)}…` : ""} · refreshes 30s
        </div>
      )}
    </>
  );
}
