import { NETWORKS, type NetworkId } from "../lib/config";
import type { BootState } from "../lib/session";

const ORDER: NetworkId[] = ["nym", "tor", "passthrough"];

type NetworkBadgeProps = {
  networkId: NetworkId;
  boot: BootState;
  exitIp?: string;
  disabled: boolean;
  onChange: (id: NetworkId) => void;
  onRetry: () => void;
};

export function NetworkBadge({
  networkId,
  boot,
  exitIp,
  disabled,
  onChange,
  onRetry,
}: NetworkBadgeProps) {
  return (
    <div className="network">
      <div
        className="network-options"
        role="group"
        aria-label="Anon-RPC worker"
      >
        {ORDER.map((id) => {
          const net = NETWORKS[id];
          const active = id === networkId;
          return (
            <button
              key={id}
              type="button"
              className={`network-option${active ? " is-active" : ""}${
                net.private ? "" : " is-public"
              }`}
              onClick={() => onChange(id)}
              disabled={disabled}
              aria-pressed={active}
              title={`${net.label} — Anon-RPC worker`}
            >
              <span
                className={`dot ${net.private ? "dot-private" : "dot-public"}`}
              />
              <span className="network-label">{net.label}</span>
            </button>
          );
        })}
      </div>
      <div className={`boot boot-${boot.status}`} aria-live="polite">
        {boot.status === "idle" && (
          <span className="muted">Not connected</span>
        )}
        {boot.status === "booting" && (
          <>
            <span className="spinner" aria-hidden="true" />
            <span>
              {boot.message}
              {boot.attempt && boot.attempts
                ? ` (${boot.attempt}/${boot.attempts})`
                : ""}
            </span>
          </>
        )}
        {boot.status === "ready" && (
          <>
            <span className="dot dot-ready" />
            <span>{boot.message}</span>
            {exitIp && <span className="mono muted">exit {exitIp}</span>}
          </>
        )}
        {boot.status === "error" && (
          <>
            <span className="dot dot-error" />
            <span className="boot-error">{boot.message}</span>
            <button type="button" className="link-button" onClick={onRetry}>
              Retry
            </button>
          </>
        )}
      </div>
    </div>
  );
}
