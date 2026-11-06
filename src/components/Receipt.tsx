import { useState } from "react";
import type { Network } from "../lib/config";
import { formatDate, formatEth, formatMs, shortHex } from "../lib/format";
import type { Claim, Elapsed } from "../lib/proof";

type ReceiptProps = {
  network: Network;
  exitIp?: string;
  rpcUrl: string;
  claim: Claim;
  elapsed?: Elapsed;
  mode: "prove" | "verify";
  requests: number;
  onRevealExitIp?: () => Promise<void>;
};

export function Receipt({
  network,
  exitIp,
  rpcUrl,
  claim,
  elapsed,
  mode,
  requests,
  onRevealExitIp,
}: ReceiptProps) {
  const [checkedAt] = useState(() => Math.floor(Date.now() / 1000));
  const [checkingExitIp, setCheckingExitIp] = useState(false);
  const totalMs = elapsed
    ? elapsed.block + elapsed.proof + elapsed.verify
    : undefined;

  async function checkExitIp() {
    if (!onRevealExitIp || checkingExitIp) return;
    setCheckingExitIp(true);
    try {
      await onRevealExitIp();
    } finally {
      setCheckingExitIp(false);
    }
  }

  return (
    <aside className="receipt" aria-label="Privacy receipt">
      <div className="receipt-head">
        <span className="receipt-title">Privacy receipt</span>
        <span className={`pill ${network.private ? "pill-good" : "pill-bad"}`}>
          {network.label}
        </span>
      </div>
      <dl className="receipt-rows">
        <div>
          <dt>Network</dt>
          <dd>
            {network.label} <span className="muted">· {network.tagline}</span>
          </dd>
        </div>
        <div>
          <dt>{network.private ? "Exit IP" : "Your IP"}</dt>
          <dd className="mono">
            {network.private ? (exitIp ?? "hidden from RPC") : "visible to RPC"}
            {network.private && !exitIp && onRevealExitIp && (
              <button
                type="button"
                className="receipt-action"
                onClick={checkExitIp}
                disabled={checkingExitIp}
              >
                {checkingExitIp ? "checking…" : "reveal"}
              </button>
            )}
          </dd>
        </div>
        <div>
          <dt>RPC endpoint</dt>
          <dd className="mono">{new URL(rpcUrl).host}</dd>
        </div>
        <div>
          <dt>Queries through {network.private ? "mixnet" : "direct link"}</dt>
          <dd>
            {requests}{" "}
            <span className="muted">
              {totalMs !== undefined ? `· ${formatMs(totalMs)}` : ""}
            </span>
          </dd>
        </div>
        <div>
          <dt>Revealed to RPC</dt>
          <dd>
            address, block {mode === "prove" ? "number" : "hash"}, balance query
          </dd>
        </div>
        <div>
          <dt>Not revealed</dt>
          <dd>
            {network.private
              ? "your IP, local state"
              : "nothing — this mode is not private"}
          </dd>
        </div>
        <div>
          <dt>Claim</dt>
          <dd className="mono">
            {formatEth(BigInt(claim.balanceWei))} ETH at{" "}
            {shortHex(claim.blockHash, 5)}
          </dd>
        </div>
        <div>
          <dt>Checked</dt>
          <dd>{formatDate(checkedAt)}</dd>
        </div>
      </dl>
      <p className="receipt-note">
        One direct bootstrap read. No address sent.
      </p>
    </aside>
  );
}
