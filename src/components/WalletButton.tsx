import { shortHex } from "../lib/format";
import type { WalletController } from "../lib/wallet";

type WalletButtonProps = {
  wallet: WalletController;
  compact?: boolean;
  disabled?: boolean;
};

export function WalletButton({
  wallet,
  compact = false,
  disabled = false,
}: WalletButtonProps) {
  if (wallet.address) {
    return (
      <span className="wallet-chip" title={wallet.address}>
        <span className="wallet-dot" aria-hidden="true" />
        <span className="wallet-address mono">
          {shortHex(wallet.address, 4)}
        </span>
        <button
          type="button"
          className="wallet-disconnect"
          onClick={wallet.disconnect}
          aria-label="Disconnect wallet"
          title="Disconnect"
        >
          ×
        </button>
      </span>
    );
  }

  return (
    <span className={`wallet-wrap${compact ? " is-compact" : ""}`}>
      <button
        type="button"
        className={`btn ${compact ? "btn-ghost" : "btn-primary"} wallet-connect`}
        onClick={() => void wallet.connect()}
        disabled={disabled || wallet.status === "connecting"}
      >
        {wallet.status === "connecting"
          ? "Connecting…"
          : compact
            ? "Connect"
            : "Connect wallet"}
      </button>
      {wallet.error && (
        <span className="wallet-error" role="status">
          {wallet.error}
        </span>
      )}
    </span>
  );
}
