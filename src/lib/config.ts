import type { PlainValue } from "@anon-rpc/browser-harness";

export const CHAIN_ID = 1;
export const CHAIN_NAME = "Ethereum mainnet";
export const APP_VERSION = "0.1.0";
export const UNIT = 10n ** 18n;

export const DEFAULT_RPC = "https://eth.drpc.org";
export const BOOTSTRAP_RPC = DEFAULT_RPC;

export type NetworkId = "nym" | "tor" | "passthrough";

export type Network = {
  id: NetworkId;
  label: string;
  tagline: string;
  specifier: `0x${string}`;
  config?: PlainValue;
  private: boolean;
  note: string;
};

export const NETWORKS: Record<NetworkId, Network> = {
  nym: {
    id: "nym",
    label: "Nym",
    tagline: "mixnet worker",
    specifier: "0x3aCD9742C68F6d993066Ae25533e09b9e1f60eD0",
    config: undefined,
    private: true,
    note: "Sphinx packets through the Nym mixnet. The RPC sees a Nym IP packet router, not your IP.",
  },
  tor: {
    id: "tor",
    label: "Tor",
    tagline: "Tor worker",
    specifier: "0x700dA3193D35fA54Cd3fBf29B66f2a2A0385659e",
    config: {
      gateways: [
        "152.236.3.22:12298:uEiCH0VdbhryzJcMtCfB0vLA4sOvHdQ4hq5w7CopcwU59bQ",
      ],
    },
    private: true,
    note: "A full Tor client in WebAssembly. The demo gateway can be unreliable; use Nym if it is down.",
  },
  passthrough: {
    id: "passthrough",
    label: "Passthrough",
    tagline: "no anonymity",
    specifier: "0x4fd77be300f31c5fe6ab266d35d27750a3478d27",
    config: undefined,
    private: false,
    note: "A plain fetch through the sandbox. It demonstrates hash pinning, not privacy. Do not use this for the privacy claim.",
  },
};
