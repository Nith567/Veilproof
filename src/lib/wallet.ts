import { useCallback, useEffect, useState } from "react";

type Eip1193Provider = {
  request: (args: {
    method: string;
    params?: unknown[] | Record<string, unknown>;
  }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (
    event: string,
    listener: (...args: unknown[]) => void,
  ) => void;
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export type WalletState = {
  address: string | null;
  status: "idle" | "connecting" | "connected" | "error";
  error: string | null;
  available: boolean;
};

export function useWallet(
  onAccount?: (address: string | null) => void,
) {
  const [state, setState] = useState<WalletState>(() => ({
    address: null,
    status: "idle",
    error: null,
    available: typeof window !== "undefined" && Boolean(window.ethereum),
  }));

  const setAccount = useCallback(
    (address: string | null) => {
      onAccount?.(address);
      setState((prev) =>
        address
          ? {
              ...prev,
              address,
              status: "connected",
              error: null,
              available: true,
            }
          : { ...prev, address: null, status: "idle" },
      );
    },
    [onAccount],
  );

  const connect = useCallback(async () => {
    const provider = window.ethereum;
    if (!provider) {
      setState((prev) => ({
        ...prev,
        status: "error",
        available: false,
        error: "No wallet detected. Enter an address manually.",
      }));
      return;
    }

    setState((prev) => ({
      ...prev,
      status: "connecting",
      error: null,
      available: true,
    }));

    try {
      const accounts = await provider.request({
        method: "eth_requestAccounts",
      });
      const address =
        Array.isArray(accounts) && typeof accounts[0] === "string"
          ? accounts[0]
          : null;
      if (!address) throw new Error("No account returned.");
      setAccount(address);
    } catch (cause) {
      const error = cause as { code?: number; message?: string };
      setState((prev) => ({
        ...prev,
        status: "error",
        error:
          error.code === 4001
            ? "Connection rejected."
            : error.message || "Could not connect.",
      }));
    }
  }, [setAccount]);

  const disconnect = useCallback(() => {
    onAccount?.(null);
    setState((prev) => ({
      ...prev,
      address: null,
      status: "idle",
      error: null,
    }));
  }, [onAccount]);

  useEffect(() => {
    const provider = window.ethereum;
    if (!provider) return;

    let active = true;
    const onAccountsChanged = (...args: unknown[]) => {
      if (!active) return;
      const accounts = args[0];
      setAccount(
        Array.isArray(accounts) && typeof accounts[0] === "string"
          ? accounts[0]
          : null,
      );
    };

    provider.on?.("accountsChanged", onAccountsChanged);
    void provider
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        if (!active) return;
        if (Array.isArray(accounts) && typeof accounts[0] === "string") {
          setAccount(accounts[0]);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
      provider.removeListener?.("accountsChanged", onAccountsChanged);
    };
  }, [setAccount]);

  return { ...state, connect, disconnect };
}

export type WalletController = ReturnType<typeof useWallet>;
