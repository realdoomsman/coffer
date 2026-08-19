import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  fmtSubscriptPrice,
  fmtUsd,
  type PulseBoard,
  type PulseCard,
  type Vault,
} from "@coffer/shared";
import { api } from "../lib/api";
import { usePageTitle, usePoll } from "../lib/hooks";
import { usePresets } from "../lib/presets";
import { useToast } from "../lib/toast";
import { Skeleton } from "../components/bits";
import { BondRing, RatioBar } from "../components/market";

function age(sec?: number): string {
  if (sec === undefined) return "—";
  if (sec < 60) return `${Math.floor(sec)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

function Card({
  card,
  onQuickBuy,
  buySol,
  busy,
}: {
  card: PulseCard;
  onQuickBuy: (c: PulseCard) => void;
  buySol: number;
  busy: boolean;
}) {
  const nav = useNavigate();
  return (
    <div className="pcard" onClick={() => nav(`/token/${card.mint}`)}>
      <BondRing pct={card.bondingPct} src={card.imageUrl} />
      <div className="pmain">
        <div className="prow1">
          <span className="mono" style={{ fontWeight: 700 }}>{card.symbol}</span>
          <span className="dimtx pname">{card.name}</span>
          <span className="num dimtx">{age(card.ageSec)}</span>
        </div>
        <div className="prow2">
          <span className="num">
            <span className="dimtx">MC </span>
            {card.mcapUsd ? fmtUsd(card.mcapUsd) : "—"}
          </span>
          <span className="num">
            <span className="dimtx">V </span>
            {card.volume24hUsd ? fmtUsd(card.volume24hUsd) : "—"}
          </span>
          {card.priceUsd !== undefined && (
            <span className="num dimtx">{fmtSubscriptPrice(card.priceUsd)}</span>
          )}
          {card.change5mPct !== undefined && (
            <span className={`num ${card.change5mPct >= 0 ? "pos" : "neg"}`}>
              {card.change5mPct >= 0 ? "+" : ""}
              {card.change5mPct.toFixed(1)}%
            </span>
          )}
        </div>
      </div>
      {card.txns5m && <RatioBar a={card.txns5m.buys} b={card.txns5m.sells} width={84} />}
      <button
        className="zap"
        disabled={busy}
        title={`Quick buy ${buySol} SOL`}
        onClick={(e) => {
          e.stopPropagation();
          onQuickBuy(card);
        }}
      >
        ⚡{buySol}
      </button>
    </div>
  );
}

export function Pulse() {
  usePageTitle("Pulse");
  const toast = useToast();
  const { presets, active, activePreset, setActive, vaultId, setVaultId } = usePresets();
  const [busyMint, setBusyMint] = useState<string | null>(null);
  const hoverCol = useRef<string | null>(null);
  const lastBoard = useRef<PulseBoard | null>(null);

  const { data: board } = usePoll<PulseBoard>(
    async () => {
      // hover pauses the stream — serve the frozen board instead of refetching
      if (hoverCol.current && lastBoard.current) return lastBoard.current;
      const b = await api.pulse();
      lastBoard.current = b;
      return b;
    },
    10_000,
    [],
  );
  const { data: vaults } = usePoll<Vault[]>(() => api.vaults(), 60_000, []);
  const quickVault =
    (vaultId && vaults?.find((v) => v.id === vaultId)) || vaults?.[0] || null;

  async function quickBuy(card: PulseCard) {
    if (!quickVault) {
      toast("bad", "No vault available to trade from");
      return;
    }
    setBusyMint(card.mint);
    try {
      const r = await api.trade(quickVault.id, {
        side: "buy",
        mint: card.mint,
        solAmount: activePreset.buySol,
      });
      toast("good", `⚡ ${card.symbol}: ${activePreset.buySol} ◎ from ${quickVault.name}`);
      void r;
    } catch (e) {
      toast("bad", `${card.symbol}: ${e instanceof Error ? e.message : "quick buy failed"}`);
    } finally {
      setBusyMint(null);
    }
  }

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Pulse</h1>
          <div className="sub">
            Live token lifecycle — hover a column to pause it. ⚡ buys the active preset from{" "}
            {quickVault ? <strong>{quickVault.name}</strong> : "…"} instantly.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            value={quickVault?.id ?? ""}
            onChange={(e) => setVaultId(e.target.value)}
            style={{ background: "var(--ink)", border: "1px solid var(--line-2)", padding: "5px 9px", fontFamily: "var(--mono)", fontSize: 12 }}
            aria-label="Quick-buy vault"
          >
            {(vaults ?? []).map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
          <div className="viewtoggle">
            {presets.map((p, i) => (
              <button key={p.label} className={active === i ? "on" : ""} onClick={() => setActive(i)} title={`${p.buySol} ◎ · slip ${p.slippagePct}% · prio ${p.prioSol}`}>
                {p.label}·{p.buySol}◎
              </button>
            ))}
          </div>
        </div>
      </div>

      {!board ? (
        <div className="pulsegrid">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <Skeleton h={30} style={{ marginBottom: 10 }} />
              {[0, 1, 2, 3, 4].map((j) => (
                <Skeleton key={j} h={64} style={{ marginBottom: 8 }} />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="pulsegrid">
          {board.columns.map((col) => (
            <div
              key={col.id}
              className="pulsecol"
              onMouseEnter={() => (hoverCol.current = col.id)}
              onMouseLeave={() => (hoverCol.current = null)}
            >
              <div className="pulsehead">
                <span>{col.title}</span>
                <span className="num dimtx">{col.cards.length}</span>
              </div>
              <div className="pulsebody">
                {col.cards.length === 0 ? (
                  <div className="empty" style={{ padding: 24 }}>feed quiet</div>
                ) : (
                  col.cards.map((c) => (
                    <Card
                      key={`${col.id}-${c.mint}`}
                      card={c}
                      onQuickBuy={(x) => void quickBuy(x)}
                      buySol={activePreset.buySol}
                      busy={busyMint === c.mint}
                    />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="dimtx" style={{ fontSize: 11.5, marginTop: 14 }}>
        Sources: pump.fun + GeckoTerminal, refreshed every 10s. Quick buys execute against your
        vault's ledger at the live oracle mark — tokens with no reliable price are refused, and
        brand-new bonding-curve tokens often have none yet.{" "}
        <Link to="/terminal">Open the terminal</Link> for the full ticket.
      </p>
    </>
  );
}
