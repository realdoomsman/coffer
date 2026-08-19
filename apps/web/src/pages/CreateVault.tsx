import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PERF_FEE_DEFAULT_BPS, PERF_FEE_MAX_BPS, PERF_FEE_MIN_BPS } from "@coffer/shared";
import { api } from "../lib/api";
import { usePageTitle } from "../lib/hooks";

export function CreateVault() {
  usePageTitle("Create vault");
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [type, setType] = useState<"managed" | "mirror">(params.get("leader") ? "mirror" : "managed");
  const [name, setName] = useState("");
  const [perfFee, setPerfFee] = useState(PERF_FEE_DEFAULT_BPS / 100);
  const [thesis, setThesis] = useState("");
  const [leader, setLeader] = useState(params.get("leader") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const v = await api.createVault({
        name: name.trim(),
        type,
        perfFeeBps: Math.round(perfFee * 100),
        thesis: thesis.trim() || undefined,
        leaderWallet: type === "mirror" ? leader.trim() : undefined,
      });
      nav(`/vault/${v.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Create a vault</h1>
          <div className="sub">Zero SOL required — investors fund it, you trade it, the program keeps custody.</div>
        </div>
      </div>

      <div className="grid2">
        <form onSubmit={(e) => void submit(e)} className="panel panel-pad">
          <div className="field">
            <label>Vault type</label>
            <div className="chipsrow">
              <button type="button" className={`chip ${type === "managed" ? "on" : ""}`} onClick={() => setType("managed")}>
                managed — I trade in the terminal
              </button>
              <button type="button" className={`chip ${type === "mirror" ? "on" : ""}`} onClick={() => setType("mirror")}>
                mirror — copy a wallet
              </button>
            </div>
          </div>

          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Runner Season" maxLength={40} required />
          </div>

          {type === "mirror" && (
            <div className="field">
              <label>Leader wallet</label>
              <input value={leader} onChange={(e) => setLeader(e.target.value)} placeholder="wallet to copy-trade" spellCheck={false} required />
              <div className="hint">The engine mirrors this wallet's trades. Copy lag is published on the vault page.</div>
            </div>
          )}

          <div className="field">
            <label>Performance fee — {perfFee.toFixed(0)}% of profit</label>
            <input
              type="range"
              min={PERF_FEE_MIN_BPS / 100}
              max={PERF_FEE_MAX_BPS / 100}
              step={1}
              value={perfFee}
              onChange={(e) => setPerfFee(Number(e.target.value))}
            />
            <div className="hint">Charged per-depositor above their high-water mark, only when profit is realized. Changeable later — downward only.</div>
          </div>

          <div className="field">
            <label>Thesis</label>
            <textarea rows={3} value={thesis} onChange={(e) => setThesis(e.target.value)} placeholder="What's the strategy? Depositors read this." />
          </div>

          {error && <div className="callout red" style={{ marginBottom: 12 }}>{error}</div>}
          <button className="btn primary" disabled={busy || !name.trim()}>
            {busy ? "…" : "Create vault"}
          </button>
        </form>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="panel panel-pad">
            <div className="sectiontitle" style={{ marginTop: 0 }}>What you get</div>
            <ul style={{ margin: 0, paddingLeft: 18, color: "var(--muted)", fontSize: 13.5 }}>
              <li>A program-owned vault — depositors' SOL, your trading.</li>
              <li>{"70/20/10 split: depositors keep 70% of profit, you earn 20%, platform takes 10% (which buys & locks the token)."}</li>
              <li>Public track record page computed from chain data.</li>
              <li>Optional: link X, import paper-trading stats.</li>
            </ul>
          </div>
          <div className="callout">
            What you can't do: withdraw depositor funds, raise fees, or block withdrawals. That's the
            product — say it loudly on your vault page.
          </div>
        </div>
      </div>
    </>
  );
}
