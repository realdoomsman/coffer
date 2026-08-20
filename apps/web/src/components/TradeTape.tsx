import { fmtSol, shortAddr, solscanTx, type Trade } from "@coffer/shared";

function ago(ts: number): string {
  const s = Math.max(1, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function TradeTape({ trades, showLag }: { trades: Trade[]; showLag?: boolean }) {
  if (trades.length === 0) return <div className="empty">No trades yet</div>;
  return (
    <div className="tablewrap">
      <table className="data">
        <thead>
          <tr>
            <th>Age</th>
            <th>Side</th>
            <th>Token</th>
            <th className="r">SOL</th>
            <th className="r">Price</th>
            {showLag && <th className="r">Copy lag</th>}
            <th className="r">Tx</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <tr key={t.id}>
              <td className="num dimtx">{ago(t.ts)}</td>
              <td>
                <span className={`num ${t.side === "buy" ? "pos" : "neg"}`}>
                  {t.side.toUpperCase()}
                </span>
              </td>
              <td className="mono">{t.symbol}</td>
              <td className="r num">{fmtSol(t.solAmount)}</td>
              <td className="r num dimtx">{t.priceSol.toExponential(2)}</td>
              {showLag && (
                <td className="r num">
                  {t.copyLagSlots !== undefined && t.copyLagSlots !== null ? (
                    <span className={t.copyLagSlots <= 1 ? "pos" : "mutedtx"}>+{t.copyLagSlots}</span>
                  ) : (
                    "—"
                  )}
                </td>
              )}
              <td className="r">
                {t.txSig.startsWith("demo-") ? (
                  <span className="pill neutral" title="Ledger fill — on-chain execution arrives with the devnet deploy">
                    ledger
                  </span>
                ) : (
                  <a className="mono dimtx" href={solscanTx(t.txSig)} target="_blank" rel="noreferrer">
                    {shortAddr(t.txSig, 4)}
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
