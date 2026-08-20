import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fmtPct, fmtSol, type Vault } from "@coffer/shared";
import { api } from "../lib/api";
import { VaultCard } from "../components/VaultCard";
import { CountStat, Delta, Skeleton, Sparkline, TypePill } from "../components/bits";
import { usePageTitle, usePoll } from "../lib/hooks";

type TypeFilter = "all" | "managed" | "mirror";
type Sort = "pnl30d" | "tvl" | "age" | "drawdown";
type View = "table" | "cards";

const SORTS: { id: Sort; label: string }[] = [
  { id: "pnl30d", label: "30d return" },
  { id: "tvl", label: "TVL" },
  { id: "drawdown", label: "Lowest drawdown" },
  { id: "age", label: "Newest" },
];

export function Explore() {
  usePageTitle("Explore");
  const nav = useNavigate();
  const [type, setType] = useState<TypeFilter>("all");
  const [sort, setSort] = useState<Sort>("pnl30d");
  const [view, setView] = useState<View>("table");
  const [guideDismissed, setGuideDismissed] = useState(
    () => localStorage.getItem("coffer.guide.dismissed") === "1",
  );
  function dismissGuide() {
    localStorage.setItem("coffer.guide.dismissed", "1");
    setGuideDismissed(true);
  }
  // the main board is real vaults only — paper lives in its own sandbox
  const { data: vaults, error } = usePoll<Vault[]>(() => api.vaults({ mode: "real" }), 15_000, []);

  const shown = useMemo(() => {
    if (!vaults) return [];
    let v = vaults.filter((x) => (type === "all" ? true : x.type === type));
    switch (sort) {
      case "pnl30d":
        v = [...v].sort((a, b) => b.stats.pnlPct30d - a.stats.pnlPct30d);
        break;
      case "tvl":
        v = [...v].sort((a, b) => b.tvlSol - a.tvlSol);
        break;
      case "drawdown":
        v = [...v].sort((a, b) => a.stats.maxDrawdownPct - b.stats.maxDrawdownPct);
        break;
      case "age":
        v = [...v].sort((a, b) => b.createdAt - a.createdAt);
        break;
    }
    return v;
  }, [vaults, type, sort]);

  const totals = useMemo(() => {
    if (!vaults) return null;
    return {
      tvl: vaults.reduce((s, v) => s + v.tvlSol, 0),
      vaults: vaults.length,
      traders: new Set(vaults.map((v) => v.trader.id)).size,
      depositors: vaults.reduce((s, v) => s + v.stats.depositorCount, 0),
    };
  }, [vaults]);

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Explore vaults</h1>
          <div className="sub">
            Real-SOL vaults only — paper records live in the <Link to="/paper">sandbox</Link> and
            never mix in here. Refreshes 15s.
          </div>
        </div>
        <div className="viewtoggle">
          <button className={view === "table" ? "on" : ""} onClick={() => setView("table")}>Board</button>
          <button className={view === "cards" ? "on" : ""} onClick={() => setView("cards")}>Cards</button>
        </div>
      </div>

      {!guideDismissed && (
        <div className="panel" style={{ marginBottom: 18, borderTop: "3px solid var(--amber)" }}>
          <div className="mono" style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "var(--amber)", fontSize: 11, letterSpacing: "0.16em" }}>// START HERE</span>
            <button onClick={dismissGuide} style={{ background: "none", border: "none", color: "var(--dim)", cursor: "pointer" }} aria-label="Dismiss guide">
              ✕
            </button>
          </div>
          <div className="steps" style={{ padding: 14, gap: 10 }}>
            <div className="step" style={{ borderTop: "none", padding: 14 }}>
              <span className="n">01</span>
              <h3 style={{ fontSize: 13.5 }}>Practice in the sandbox</h3>
              <p>
                Press <span className="mono">B</span> — the <Link to="/paper">paper terminal</Link>{" "}
                trades pump.fun tokens at live prices with zero risk. Clearly labeled, never mixed
                with real records.
              </p>
            </div>
            <div className="step" style={{ borderTop: "none", padding: 14 }}>
              <span className="n">02</span>
              <h3 style={{ fontSize: 13.5 }}>Scout the trenches</h3>
              <p>
                <Link to="/pulse">Pulse</Link> streams new pump.fun launches live;{" "}
                <Link to="/tracking">wallet tracking</Link> scans any mainnet wallet's real trade
                history.
              </p>
            </div>
            <div className="step" style={{ borderTop: "none", padding: 14 }}>
              <span className="n">03</span>
              <h3 style={{ fontSize: 13.5 }}>Publish your real vault</h3>
              <p>
                <Link to="/create">Create it now</Link> (0 SOL) — thesis, terms, and page go live;
                funding and on-chain trading open at launch. Press <span className="mono">?</span>{" "}
                anytime for shortcuts.
              </p>
            </div>
          </div>
        </div>
      )}

      {totals && (
        <div className="statrow" style={{ marginBottom: 18 }}>
          <CountStat k="Total value locked" value={totals.tvl} fmt={(n) => `${fmtSol(n, 0)} ◎`} />
          <CountStat k="Vaults" value={totals.vaults} fmt={(n) => String(Math.round(n))} />
          <CountStat k="Traders" value={totals.traders} fmt={(n) => String(Math.round(n))} />
          <CountStat k="Depositors" value={totals.depositors} fmt={(n) => String(Math.round(n))} />
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div className="chipsrow">
          {(["all", "managed", "mirror"] as const).map((t) => (
            <button key={t} className={`chip ${type === t ? "on" : ""}`} onClick={() => setType(t)}>
              {t}
            </button>
          ))}
        </div>
        <div className="chipsrow">
          {SORTS.map((s) => (
            <button key={s.id} className={`chip ${sort === s.id ? "on" : ""}`} onClick={() => setSort(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {error && !vaults && (
        <div className="callout red">API unreachable: {error}. Start it with <code>npm run dev:api</code>.</div>
      )}
      {!vaults && !error && (
        <div className="vaultgrid">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} h={170} />
          ))}
        </div>
      )}

      {vaults && vaults.length === 0 && (
        <div className="empty">
          No real vaults yet. <Link to="/create">Create one</Link> (0 SOL needed) — funding and
          trading activate with the on-chain launch. Practicing meanwhile happens in the{" "}
          <Link to="/paper">paper sandbox</Link>, never here.
        </div>
      )}

      {vaults && vaults.length > 0 && view === "cards" && (
        <div className="vaultgrid">
          {shown.map((v) => (
            <VaultCard key={v.id} vault={v} />
          ))}
        </div>
      )}

      {vaults && vaults.length > 0 && view === "table" && (
        <div className="panel">
          <div className="tablewrap">
            <table className="data">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Vault</th>
                  <th>Trader</th>
                  <th></th>
                  <th className="r">30d</th>
                  <th className="r">All-time</th>
                  <th className="r">Max DD</th>
                  <th className="r">Win</th>
                  <th className="r">TVL</th>
                  <th className="r">Mgr stake</th>
                  <th className="r">Depositors</th>
                  <th>Curve</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((v, i) => (
                  <tr
                    key={v.id}
                    onClick={() => nav(`/vault/${v.id}`)}
                    style={{ cursor: "pointer" }}
                  >
                    <td className={`rank num ${i < 3 && sort === "pnl30d" ? "medal" : ""}`}>
                      {String(i + 1).padStart(2, "0")}
                    </td>
                    <td>
                      <Link to={`/vault/${v.id}`} style={{ color: "var(--text)", fontWeight: 600 }}>
                        {v.name}
                      </Link>
                    </td>
                    <td className="mono mutedtx" style={{ fontSize: 12 }}>
                      @{v.trader.handle}
                      {v.trader.xVerified ? " 𝕏" : ""}
                    </td>
                    <td><TypePill type={v.type} /></td>
                    <td className="r num"><Delta v={v.stats.pnlPct30d} /></td>
                    <td className="r num"><Delta v={v.stats.pnlPctAll} /></td>
                    <td className="r num neg">{fmtPct(-Math.abs(v.stats.maxDrawdownPct), 0)}</td>
                    <td className="r num dimtx">{v.stats.winRatePct.toFixed(0)}%</td>
                    <td className="r num">{fmtSol(v.tvlSol, 0)} ◎</td>
                    <td className="r num dimtx">{v.managerStakePct.toFixed(0)}%</td>
                    <td className="r num dimtx">{v.stats.depositorCount}</td>
                    <td><Sparkline points={v.equityCurve.slice(-40)} width={90} height={26} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
