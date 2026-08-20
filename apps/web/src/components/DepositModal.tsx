/**
 * Deposit modal — the Incinarator pattern: address + QR + copy, with the
 * safety banner up front. Real deposits arrive with Privy + the program
 * deploy; until then this shows the account's wallet address honestly.
 */
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { shortAddr } from "@coffer/shared";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";

export function DepositModal({ onClose }: { onClose: () => void }) {
  const { user, demo } = useAuth();
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const addr = user?.wallet ?? "";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!canvasRef.current || !addr) return;
    void QRCode.toCanvas(canvasRef.current, addr, {
      width: 208,
      margin: 1,
      color: { dark: "#0a0a08", light: "#e9e6da" },
    });
  }, [addr]);

  async function copy() {
    await navigator.clipboard.writeText(addr);
    setCopied(true);
    toast("good", "Address copied");
    setTimeout(() => setCopied(false), 1500);
  }

  if (!user) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10, 10, 8, 0.82)",
        display: "grid",
        placeItems: "center",
        zIndex: 90,
      }}
      onClick={onClose}
    >
      <div
        className="panel"
        style={{ width: 380, maxWidth: "92vw", boxShadow: "10px 10px 0 rgba(0,0,0,0.5)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Deposit SOL"
      >
        <div
          className="mono"
          style={{
            padding: "12px 18px",
            borderBottom: "1px solid var(--line-2)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ color: "var(--amber)", fontWeight: 700, letterSpacing: "0.1em" }}>
            // DEPOSIT SOL
          </span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 15 }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
          {demo && (
            <div className="callout" style={{ width: "100%" }}>
              Demo account — this address is a placeholder. Set{" "}
              <span className="mono">VITE_PRIVY_APP_ID</span> and sign in to get your real embedded
              wallet with an exportable key.
            </div>
          )}
          <canvas
            ref={canvasRef}
            style={{ border: "1px solid var(--line-2)", imageRendering: "pixelated" }}
            aria-label="Deposit address QR code"
          />
          <button
            className="addr"
            style={{ cursor: "pointer", fontSize: 12, padding: "6px 12px" }}
            onClick={() => void copy()}
            title={addr}
          >
            {shortAddr(addr, 8)} {copied ? "✓" : "⧉"}
          </button>
          <div className="dimtx" style={{ fontSize: 11.5, textAlign: "center" }}>
            Send SOL only, on Solana {demo ? "devnet" : "mainnet"}. Deposits land in your account
            wallet — from there you allocate into vaults.
          </div>
          <button className="btn primary" style={{ width: "100%" }} onClick={() => void copy()}>
            Copy address
          </button>
        </div>
      </div>
    </div>
  );
}
