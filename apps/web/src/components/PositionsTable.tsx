import { Link } from "react-router-dom";
import { fmtSol, type Position } from "@coffer/shared";
import { Delta } from "./bits";

/** Never floor a real holding to "0": sub-1 balances (WBTC, WETH) keep
 *  enough precision to stay truthful next to their SOL value. */
function fmtTokenAmount(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (v >= 1) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return v.toPrecision(3);
}

export function PositionsTable({ positions }: { positions: Position[] }) {
  if (positions.length === 0) return <div className="empty">No open positions — vault is in SOL</div>;
  return (
    <div className="tablewrap">
      <table className="data stack">
        <thead>
          <tr>
            <th>Token</th>
            <th className="r">Amount</th>
            <th className="r">Cost</th>
            <th className="r">Value</th>
            <th className="r">PnL</th>
            <th className="r">Mark</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p.id}>
              <td className="lead">
                <Link to={`/token/${p.mint}`} className="mono">
                  {p.symbol}
                </Link>
              </td>
              <td className="r num dimtx" data-label="Amount">{fmtTokenAmount(p.amountTokens)}</td>
              <td className="r num" data-label="Cost">{fmtSol(p.costSol)} ◎</td>
              <td className="r num" data-label="Value">{fmtSol(p.valueSol)} ◎</td>
              <td className="r num" data-label="PnL">
                <span className={p.pnlSol >= 0 ? "pos" : "neg"}>
                  {p.pnlSol >= 0 ? "+" : ""}
                  {fmtSol(p.pnlSol)} ◎
                </span>{" "}
                <Delta v={p.pnlPct} />
              </td>
              <td className="r" data-label="Mark">{p.markStale ? <span className="pill stale">stale</span> : <span className="pill neutral">live</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
