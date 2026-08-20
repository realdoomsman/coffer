import { useEffect, useState } from "react";
import { NavLink, Outlet, Link, useNavigate } from "react-router-dom";
import { fmtUsd } from "@coffer/shared";
import { useAuth } from "./lib/auth";
import { api } from "./lib/api";
import { useFlash, usePoll } from "./lib/hooks";
import { useWatchlist } from "./lib/watchlist";
import { ActivityWire } from "./components/ActivityWire";
import { DepositModal } from "./components/DepositModal";
import { TokenSearchBox } from "./components/TokenSearchBox";

const HOTKEYS: Record<string, string> = {
  e: "/explore",
  p: "/portfolio",
  d: "/pulse",
  t: "/terminal",
  v: "/dashboard",
  n: "/create",
  w: "/tracking",
  l: "/leaderboards",
  m: "/settings/profile",
  b: "/paper",
};

function Nav({ to, hotkey, label, end }: { to: string; hotkey: string; label: string; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `navlink ${isActive ? "active" : ""}`}>
      <span className="key">{hotkey.toUpperCase()}</span>
      <span className="lbl">{label}</span>
    </NavLink>
  );
}

const HOTKEY_HELP: { key: string; label: string }[] = [
  { key: "E", label: "Explore vaults" },
  { key: "P", label: "Portfolio" },
  { key: "D", label: "Pulse — live token lifecycle" },
  { key: "T", label: "Terminal (real SOL)" },
  { key: "B", label: "Paper trading sandbox" },
  { key: "V", label: "My vault dashboard" },
  { key: "N", label: "Create a vault" },
  { key: "M", label: "Edit my profile" },
  { key: "W", label: "Wallet tracking" },
  { key: "L", label: "Leaderboards" },
  { key: "?", label: "This cheat sheet" },
];

function HotkeyHelp({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(10,10,8,0.82)", display: "grid", placeItems: "center", zIndex: 95 }}
      onClick={onClose}
    >
      <div className="panel" style={{ width: 400, maxWidth: "92vw", boxShadow: "10px 10px 0 rgba(0,0,0,0.5)" }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Keyboard shortcuts">
        <div className="mono" style={{ padding: "12px 18px", borderBottom: "1px solid var(--line-2)", color: "var(--amber)", fontWeight: 700, letterSpacing: "0.1em" }}>
          // KEYBOARD
        </div>
        <div style={{ padding: 16 }}>
          {HOTKEY_HELP.map((h) => (
            <div key={h.key} className="kv" style={{ alignItems: "center" }}>
              <span className="k" style={{ textTransform: "none" }}>{h.label}</span>
              <span className="v">
                <span className="key" style={{ display: "inline-grid", placeItems: "center", width: 20, height: 20, border: "1px solid var(--line-bright)", fontSize: 11 }}>
                  {h.key}
                </span>
              </span>
            </div>
          ))}
          <p className="dimtx" style={{ fontSize: 11.5, marginBottom: 0 }}>
            Keys work anywhere outside a text field. Esc closes panels.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Photon-style watch pill: up to 3 starred tokens as a glanceable mini-ticker. */
function WatchPill() {
  const { items } = useWatchlist();
  const shown = items.slice(0, 3);
  const { data: infos } = usePoll(
    async () => {
      if (shown.length === 0) return [];
      return Promise.all(shown.map((i) => api.token(i.mint).catch(() => null)));
    },
    30_000,
    [shown.map((i) => i.mint).join(",")],
  );
  const nav = useNavigate();
  if (shown.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {shown.map((w, i) => {
        const info = infos?.[i] ?? null;
        const ch = info?.change24hPct;
        return (
          <button
            key={w.mint}
            className="poschip"
            onClick={() => nav(`/token/${w.mint}`)}
            title={`${w.symbol} — watched`}
          >
            <span style={{ color: "var(--amber)" }}>★</span>
            <span style={{ fontWeight: 700 }}>{w.symbol}</span>
            {ch !== undefined && (
              <span className={`num ${ch >= 0 ? "pos" : "neg"}`}>
                {ch >= 0 ? "+" : ""}
                {ch.toFixed(1)}%
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function SolPrice() {
  const { data: meta } = usePoll(() => api.meta(), 10_000, []);
  const flash = useFlash(meta?.solPriceUsd);
  if (!meta || meta.solPriceUsd <= 0) return null;
  return (
    <div className="statusdot" title="SOL price (live)">
      <span
        className={`num ${flash === "up" ? "flash-up pos" : flash === "down" ? "flash-down neg" : ""}`}
        style={{ color: flash ? undefined : "var(--amber)" }}
      >
        SOL {fmtUsd(meta.solPriceUsd)}
      </span>
    </div>
  );
}

export default function App() {
  const { user, demo, login, logout } = useAuth();
  const [apiUp, setApiUp] = useState<boolean | null>(null);
  const [depositOpen, setDepositOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen((h) => !h);
        return;
      }
      const to = HOTKEYS[e.key.toLowerCase()];
      if (to) {
        e.preventDefault();
        nav(to);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav]);

  useEffect(() => {
    let alive = true;
    const check = () =>
      api
        .health()
        .then(() => alive && setApiUp(true))
        .catch(() => alive && setApiUp(false));
    check();
    const iv = setInterval(check, 15000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link to="/" className="brand">
          <span className="mark">C</span>
          <span className="word">coffer</span>
        </Link>

        <div className="navsec">Invest</div>
        <Nav to="/explore" hotkey="e" label="Explore vaults" />
        <Nav to="/portfolio" hotkey="p" label="Portfolio" />

        <div className="navsec">Trade</div>
        <Nav to="/pulse" hotkey="d" label="Pulse" />
        <Nav to="/terminal" hotkey="t" label="Terminal" />
        <Nav to="/dashboard" hotkey="v" label="My vault" />
        <Nav to="/create" hotkey="n" label="Create vault" />
        <Nav to="/settings/profile" hotkey="m" label="My profile" />

        <div className="navsec">Intel</div>
        <Nav to="/tracking" hotkey="w" label="Wallet tracking" />
        <Nav to="/leaderboards" hotkey="l" label="Leaderboards" />

        <div className="navsec">Sandbox</div>
        <Nav to="/paper" hotkey="b" label="Paper trading" />

        <div className="spacer" />
        <div className="acctbox">
          <div className="avatar">{user ? user.handle.slice(0, 1).toUpperCase() : "·"}</div>
          <div className="who">
            <div className="h">{user ? `@${user.handle}` : "signed out"}</div>
            <div className="s">{demo ? "demo mode" : "privy"}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, margin: "8px 10px 0" }}>
          <button className="btn primary sm" style={{ flex: 1 }} onClick={() => setDepositOpen(true)}>
            Deposit
          </button>
          <button className="btn ghost sm" onClick={user ? logout : login}>
            {user ? "Out" : "In"}
          </button>
        </div>
      </aside>
      {depositOpen && <DepositModal onClose={() => setDepositOpen(false)} />}
      {helpOpen && <HotkeyHelp onClose={() => setHelpOpen(false)} />}

      <div className="main">
        <div className="topbar">
          <TokenSearchBox onPick={(r) => nav(`/token/${r.mint}`)} />
          <WatchPill />
          <div className="spacer" />
          <SolPrice />
          <div className="statusdot" title="API connection">
            <span className={`dot ${apiUp === false ? "down" : ""}`} />
            {apiUp === null ? "connecting" : apiUp ? "api live" : "api down"}
          </div>
          <div className="statusdot" title="Network">
            <span className="dot" />
            devnet
          </div>
          <button
            className="btn ghost sm"
            style={{ padding: "3px 9px" }}
            title="Keyboard shortcuts"
            onClick={() => setHelpOpen(true)}
          >
            ?
          </button>
        </div>
        <div className="content">
          <div className="content-inner">
            <Outlet />
          </div>
        </div>
        <ActivityWire />
      </div>
    </div>
  );
}
