import { Link } from "react-router-dom";
import { fmtSol, type Vault } from "@coffer/shared";
import { Delta, Sparkline, TypePill } from "./bits";

export function VaultCard({ vault }: { vault: Vault }) {
  const curve = vault.equityCurve.slice(-60);
  return (
    <Link to={`/vault/${vault.id}`} className="vcard">
      <div className="head">
        <div>
          <div className="name">{vault.name}</div>
          <div className="trader">
            <span className="mono">@{vault.trader.handle}</span>
            {vault.trader.xVerified && <span title="X account linked">𝕏</span>}
          </div>
        </div>
        <span style={{ display: "flex", gap: 5 }}>
          {vault.mode === "paper" && <span className="pill paper">paper</span>}
          <TypePill type={vault.type} />
        </span>
      </div>
      <div className="metric-row">
        <div>
          <div className="bignum">
            <Delta v={vault.stats.pnlPct30d} />
          </div>
          <div className="dimtx mono" style={{ fontSize: 11 }}>
            30d return
          </div>
        </div>
        <Sparkline points={curve} />
      </div>
      <div className="footrow">
        <span>{fmtSol(vault.tvlSol, 0)} SOL tvl</span>
        <span>{vault.stats.depositorCount} depositors</span>
        <span>mgr {vault.managerStakePct.toFixed(0)}%</span>
        {vault.type === "mirror" && vault.stats.medianCopyLagSlots !== undefined ? (
          <span title="Median copy lag vs leader wallet">lag {vault.stats.medianCopyLagSlots} slots</span>
        ) : (
          <span>{vault.stats.winRatePct.toFixed(0)}% wins</span>
        )}
      </div>
    </Link>
  );
}
