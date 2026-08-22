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
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        style={{ maxWidth: 380 }}
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
          {addr ? (
            <>
              <canvas
                ref={canvasRef}
                style={{ border: "1px solid var(--line-2)", imageRendering: "pixelated", maxWidth: "100%", height: "auto" }}
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
                Send SOL only, on Solana. Deposits land in your account wallet — from there you
                allocate into vaults.
              </div>
              <button className="btn primary" style={{ width: "100%" }} onClick={() => void copy()}>
                Copy address
              </button>
            </>
          ) : (
            <>
              <div className="empty" style={{ width: "100%" }}>
                No wallet on this account yet
              </div>
              <div className="dimtx" style={{ fontSize: 12, textAlign: "center" }}>
                {demo
                  ? "Demo mode has no real address — nothing here pretends otherwise. Set VITE_PRIVY_APP_ID in .env and sign in: Privy creates your embedded Solana wallet (exportable key) and this modal shows the real address + QR."
                  : "Sign-in did not return a wallet — retry or check your Privy configuration."}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
