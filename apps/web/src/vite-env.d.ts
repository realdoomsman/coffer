/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRIVY_APP_ID?: string;
  /**
   * Cluster the embedded wallet should treat as home ("devnet" unless set).
   * Privy defaults its Solana wallet UI to mainnet-beta; telling it devnet
   * keeps the confirmation modal, the balance it shows and its top-up
   * prompts on the same chain the vault program is actually deployed to.
   * The API is the authority (GET /api/onchain/config) — this only shapes
   * Privy's own UI, which is configured before that call can return.
   */
  readonly VITE_SOLANA_CLUSTER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
