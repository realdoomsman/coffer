/**
 * Privy auth tree — imported LAZILY by auth.tsx.
 *
 * Privy pulls WalletConnect's entire Ethereum provider stack (~300kB) even
 * though this platform is Solana-only and account-based. Keeping it in its
 * own chunk means users who haven't configured VITE_PRIVY_APP_ID never
 * download it, and users who have get it in parallel with the app shell.
 *
 * This file is also the ONLY place Privy's Solana hooks may be called
 * (they throw outside PrivyProvider), so it publishes the WalletBridge —
 * token accessors plus sign-and-send — into AuthContext. Every other
 * component asks for `useAuth().wallet` and never imports Privy at all.
 */
import { useCallback, useMemo, type ReactNode } from "react";
import { PrivyProvider, useIdentityToken, usePrivy, useSolanaWallets } from "@privy-io/react-auth";
import { useSendTransaction } from "@privy-io/react-auth/solana";
import { AuthContext, type AuthState, type WalletBridge } from "./authContext";

function PrivyBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { ready: walletsReady, wallets, createWallet } = useSolanaWallets();
  const { sendTransaction } = useSendTransaction();

  // The embedded Solana wallet, not the Ethereum one `user.wallet` points
  // at: the vault program only knows Solana keys.
  const solanaAddress = wallets[0]?.address ?? null;

  const send = useCallback<WalletBridge["sendTransaction"]>(
    async (tx, connection) => {
      const receipt = await sendTransaction({ transaction: tx, connection });
      return receipt.signature;
    },
    [sendTransaction],
  );

  const provision = useCallback(async () => {
    await createWallet();
  }, [createWallet]);

  const wallet = useMemo<WalletBridge>(
    () => ({
      ready: ready && walletsReady,
      address: solanaAddress,
      getAccessToken,
      identityToken,
      sendTransaction: send,
      createWallet: provision,
    }),
    [ready, walletsReady, solanaAddress, getAccessToken, identityToken, send, provision],
  );

  const value = useMemo<AuthState>(
    () => ({
      ready,
      demo: false,
      user:
        ready && authenticated && user
          ? {
              id: user.id,
              handle: user.email?.address ?? user.google?.email ?? user.id.slice(0, 10),
              wallet: solanaAddress ?? undefined,
            }
          : null,
      wallet,
      login,
      logout,
    }),
    [ready, authenticated, user, solanaAddress, wallet, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Privy's Solana wallet defaults to mainnet-beta. The vault program lives
 * on devnet, so without this the confirmation modal would quote the wrong
 * chain and Privy's "insufficient funds" top-up flow would look at a
 * mainnet balance for a devnet transaction.
 */
const CLUSTER = (import.meta.env.VITE_SOLANA_CLUSTER ?? "devnet") as
  | "devnet"
  | "testnet"
  | "mainnet-beta";

export default function PrivyAuth({
  appId,
  children,
}: {
  appId: string;
  children: ReactNode;
}) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "google"],
        appearance: { theme: "dark", accentColor: "#ffb000" },
        embeddedWallets: { solana: { createOnLogin: "users-without-wallets" } },
        solanaClusters: [{ name: CLUSTER }],
      }}
    >
      <PrivyBridge>{children}</PrivyBridge>
    </PrivyProvider>
  );
}
