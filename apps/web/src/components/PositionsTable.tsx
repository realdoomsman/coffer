import { Link } from "react-router-dom";
import { fmtSol, type Position } from "@coffer/shared";
import { Delta } from "./bits";

export function PositionsTable({ positions }: { positions: Position[] }) {
  if (positions.length === 0) return <div className="empty">No open positions — vault is in SOL</div>;
  return (
    <div className="tablewrap">
      <table className="data">
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
              <td>
                <Link to={`/token/${p.mint}`} className="mono">
                  {p.symbol}
                </Link>
              </td>
              <td className="r num dimtx">{p.amountTokens.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
              <td className="r num">{fmtSol(p.costSol)} ◎</td>
              <td className="r num">{fmtSol(p.valueSol)} ◎</td>
              <td className="r num">
                <span className={p.pnlSol >= 0 ? "pos" : "neg"}>
                  {p.pnlSol >= 0 ? "+" : ""}
                  {fmtSol(p.pnlSol)} ◎
                </span>{" "}
                <Delta v={p.pnlPct} />
              </td>
              <td className="r">{p.markStale ? <span className="pill stale">stale</span> : <span className="pill neutral">live</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
