import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, Link, useNavigate } from "react-router-dom";
import type { TokenSearchResult } from "@coffer/shared";
import { fmtUsd } from "@coffer/shared";
import { useAuth } from "./lib/auth";
import { api } from "./lib/api";
import { useFlash, usePoll } from "./lib/hooks";
import { useWatchlist } from "./lib/watchlist";
import { ActivityWire } from "./components/ActivityWire";
import { DepositModal } from "./components/DepositModal";

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
};

function Nav({ to, hotkey, label, end }: { to: string; hotkey: string; label: string; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `navlink ${isActive ? "active" : ""}`}>
      <span className="key">{hotkey.toUpperCase()}</span>
      <span className="lbl">{label}</span>
    </NavLink>
  );
}

function TokenSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<TokenSearchResult[] | null>(null);
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const boxRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) {
      setResults(null);
      return;
    }
    const id = ++seq.current;
    const timer = setTimeout(() => {
      api
        .searchTokens(t)
        .then((r) => {
          if (seq.current === id) {
            setResults(r);
            setOpen(true);
          }
        })
        .catch(() => seq.current === id && setResults([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(r: TokenSearchResult) {
    setOpen(false);
    setQ("");
    nav(`/token/${r.mint}`);
  }

  return (
    <div className="searchwrap" ref={boxRef}>
      <form
        className="search"
        onSubmit={(e) => {
          e.preventDefault();
          const v = q.trim();
          if (v.length >= 32 && v.length <= 44) nav(`/token/${v}`);
          else if (results && results[0]) pick(results[0]);
        }}
      >
        <span>⌕</span>
        <input
          placeholder="search tokens or paste a mint…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results && setOpen(true)}
          spellCheck={false}
        />
      </form>
      {open && results && (
        <div className="searchdrop">
          {results.length === 0 && (
            <div className="row" style={{ cursor: "default", color: "var(--dim)" }}>
              no tokens found
            </div>
          )}
          {results.slice(0, 8).map((r) => (
            <button key={r.mint} type="button" className="row" onClick={() => pick(r)}>
              {r.imageUrl ? <img src={r.imageUrl} alt="" /> : <span style={{ width: 20 }} />}
              <span className="mono" style={{ fontWeight: 600 }}>{r.symbol}</span>
              <span className="dimtx" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.name}
              </span>
              <span className="num mutedtx">{fmtUsd(r.priceUsd)}</span>
            </button>
          ))}
        </div>
      )}
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
  const nav = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
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

      <div className="main">
        <div className="topbar">
          <TokenSearch />
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
