import { useRef, useState } from "react";
import { isAddress, type Hex } from "viem";
import { DEFAULT_RPC } from "../lib/config";
import { formatDate, formatEth, formatInt, formatMs, shortHex } from "../lib/format";
import { MendaxWorker } from "../lib/mendax";
import { createProof, type ProofAttempt, type ProofStep } from "../lib/proof";
import { buildShareHash, buildShareUrl } from "../lib/share";
import type { BootState, Session } from "../lib/session";
import type { WalletController } from "../lib/wallet";
import { CheckList } from "./CheckList";
import { CopyButton } from "./CopyButton";
import { Receipt } from "./Receipt";
import { Stepper } from "./Stepper";
import { WalletButton } from "./WalletButton";

const PROOF_STEPS = [
  { id: "block", label: "Block" },
  { id: "proof", label: "Proof" },
  { id: "verify", label: "Verify" },
  { id: "compare", label: "Claim" },
];

function isTransportError(message: string) {
  return /canceled|timed out|timeout|hyper error|failed to fetch|network|worker/i.test(
    message,
  );
}

type ProvePanelProps = {
  address: string;
  onAddressChange: (address: string) => void;
  wallet: WalletController;
  boot: BootState;
  exitIp?: string;
  onEnsureSession: () => Promise<Session>;
  onRetryBoot: () => void;
  onRevealExitIp: () => Promise<void>;
};

export function ProvePanel({
  address,
  onAddressChange,
  wallet,
  boot,
  exitIp,
  onEnsureSession,
  onRetryBoot,
  onRevealExitIp,
}: ProvePanelProps) {
  const [mendax, setMendax] = useState(false);
  const [phase, setPhase] = useState<"idle" | "working" | "done" | "error">(
    "idle",
  );
  const [attempt, setAttempt] = useState<ProofAttempt | null>(null);
  const [activeStep, setActiveStep] = useState<ProofStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usedSession, setUsedSession] = useState<Session | null>(null);
  const [ownerSignature, setOwnerSignature] = useState<Hex | null>(null);
  const [ownerSigning, setOwnerSigning] = useState(false);
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const stepRef = useRef<ProofStep | null>(null);

  const valid = isAddress(address);
  const mendaxCaught =
    mendax &&
    attempt !== null &&
    !attempt.ok &&
    attempt.rpcBalance !== undefined &&
    attempt.verified !== undefined &&
    attempt.rpcBalance !== attempt.verified.balance;
  const claimForShare =
    attempt?.claim && attempt.ok
      ? { ...attempt.claim, ownerSignature: ownerSignature ?? undefined }
      : undefined;
  const shareUrl =
    claimForShare && attempt?.proof
      ? buildShareUrl(claimForShare, attempt.proof.accountProof)
      : "";
  const ownerMatches = Boolean(
    wallet.address &&
      attempt?.claim &&
      wallet.address.toLowerCase() === attempt.claim.address.toLowerCase(),
  );

  async function run(retry = 0) {
    if (!isAddress(address)) {
      setError("Enter a valid Ethereum address.");
      setPhase("error");
      return;
    }
    setPhase("working");
    setAttempt(null);
    setError(null);
    setUsedSession(null);
    setOwnerSignature(null);
    setOwnerError(null);
    setActiveStep("block");
    stepRef.current = "block";
    let session: Session | undefined;
    try {
      session = await onEnsureSession();
      setUsedSession(session);
      const worker = mendax
        ? new MendaxWorker(session.worker, "balance")
        : session.worker;
      const result = await createProof(worker, DEFAULT_RPC, address, (step) => {
        stepRef.current = step;
        setActiveStep(step);
      });
      setAttempt(result);
      setActiveStep(null);
      setPhase(result.ok ? "done" : "error");
      if (!result.ok) {
        setError(
          result.error ??
            "The RPC's reported balance did not match the Merkle proof.",
        );
      }
    } catch (cause) {
      const message = (cause as Error).message;
      if (
        !mendax &&
        retry < 2 &&
        session?.network.private &&
        isTransportError(message)
      ) {
        onRetryBoot();
        await run(1);
        return;
      }
      setActiveStep(null);
      setError(message);
      setPhase("error");
    }
  }

  async function signClaim() {
    if (!attempt?.claim) return;
    if (
      !wallet.address ||
      wallet.address.toLowerCase() !== attempt.claim.address.toLowerCase()
    ) {
      setOwnerError("Connect the wallet for this address to sign.");
      return;
    }
    setOwnerSigning(true);
    setOwnerError(null);
    try {
      const signature = await wallet.signOwnership(attempt.claim);
      setOwnerSignature(signature);
    } catch (cause) {
      setOwnerError((cause as Error).message);
    } finally {
      setOwnerSigning(false);
    }
  }

  return (
    <section className="panel-grid">
      <div className="card">
        <header className="card-head">
          <div>
            <p className="eyebrow">Prove</p>
            <h2>Prove your balance</h2>
            <p className="lede">
              Fetched through Anon-RPC. Checked in your browser.
            </p>
          </div>
          <span className={`pill ${mendax ? "pill-bad" : "pill-good"}`}>
            {mendax ? "Mendax" : "Live"}
          </span>
        </header>

        {boot.status === "error" && phase !== "working" && (
          <div className="alert alert-bad">
            <strong>Connection failed.</strong>
            <span>{boot.message}</span>
            <button type="button" className="btn btn-ghost" onClick={onRetryBoot}>
              Retry connection
            </button>
          </div>
        )}

        <div className="field">
          <label htmlFor="address">Wallet address</label>
          <div className="field-row">
            <input
              id="address"
              className="input mono"
              value={address}
              onChange={(event) => onAddressChange(event.target.value.trim())}
              spellCheck={false}
              autoComplete="off"
              placeholder="0x…"
              disabled={phase === "working"}
            />
            {wallet.address ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => onAddressChange(wallet.address ?? "")}
                disabled={
                  phase === "working" ||
                  address.toLowerCase() === wallet.address.toLowerCase()
                }
              >
                {address.toLowerCase() === wallet.address.toLowerCase()
                  ? "Connected"
                  : "Use wallet"}
              </button>
            ) : (
              <WalletButton
                wallet={wallet}
                compact
                disabled={phase === "working"}
              />
            )}
          </div>
          {address.length > 0 && !valid && (
            <p className="field-hint field-hint-bad">
              Enter a valid Ethereum address.
            </p>
          )}
          <p className="field-hint">Only the address is sent to the RPC.</p>
        </div>

        <label className="toggle">
          <input
            type="checkbox"
            checked={mendax}
            onChange={(event) => {
              setMendax(event.target.checked);
              setAttempt(null);
              setError(null);
              setPhase("idle");
            }}
            disabled={phase === "working"}
          />
          <span className="toggle-track" aria-hidden="true">
            <span className="toggle-thumb" />
          </span>
          <span className="toggle-label">
            Route through <strong>Mendax</strong>
            <em> · malicious RPC</em>
          </span>
        </label>

        <div className="actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void run()}
            disabled={!valid || phase === "working"}
          >
            {phase === "working"
              ? "Proving…"
              : attempt
                ? "Prove again"
                : "Prove balance"}
          </button>
          {phase === "working" && (
            <span className="muted" aria-live="polite">
              {boot.status === "booting"
                ? boot.message
                : "Fetching and verifying the proof…"}
            </span>
          )}
        </div>

        {phase === "working" && (
          <div className="progress">
            <Stepper steps={PROOF_STEPS} active={activeStep ?? "block"} />
          </div>
        )}

        {phase === "error" && error && (
          <div className={`alert ${mendaxCaught ? "alert-good" : "alert-bad"}`}>
            <strong>
              {mendaxCaught
                ? "Mendax lied. Veilproof caught it."
                : "No claim produced."}
            </strong>
            <span>{error}</span>
            {mendaxCaught &&
              attempt?.rpcBalance !== undefined &&
              attempt.verified && (
                <span className="mono alert-detail">
                  RPC claimed {formatEth(attempt.rpcBalance)} ETH · Merkle proof
                  proves {formatEth(attempt.verified.balance)} ETH
                </span>
              )}
            {!mendaxCaught && usedSession?.network.private && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  onRetryBoot();
                  void run(2);
                }}
              >
                Restart mixnet & retry
              </button>
            )}
          </div>
        )}

        {attempt && <CheckList checks={attempt.checks} />}

        {phase === "done" &&
          attempt?.ok &&
          attempt.claim &&
          attempt.block &&
          attempt.proof &&
          attempt.verified && (
          <>
            <div className="result result-good">
              <div className="result-kicker">
                <span className="dot dot-ready" /> Balance proven
              </div>
              <div className="balance">
                <span className="balance-value">
                  {formatEth(attempt.verified.balance)}
                </span>
                <span className="balance-unit">ETH</span>
              </div>
              <p className="result-meta">
                at block #{formatInt(BigInt(attempt.block.number))} ·{" "}
                {formatDate(attempt.block.timestamp)}
              </p>
              <dl className="kv kv-compact">
                <div>
                  <dt>Address</dt>
                  <dd className="mono">{shortHex(attempt.claim.address, 6)}</dd>
                </div>
                <div>
                  <dt>Block hash</dt>
                  <dd className="mono">{shortHex(attempt.block.hash, 6)}</dd>
                </div>
                <div>
                  <dt>State root</dt>
                  <dd className="mono">{shortHex(attempt.block.stateRoot, 6)}</dd>
                </div>
              </dl>
            </div>

            <div
              className={`owner-proof ${
                ownerSignature ? "owner-ok" : "owner-warn"
              }`}
            >
              <div>
                <strong>
                  {ownerSignature ? "Owner verified" : "Prove ownership"}
                </strong>
                <span>
                  {ownerSignature
                    ? "The share link includes your signature."
                    : ownerMatches
                      ? "Sign this claim with your connected wallet."
                      : "Address-only. Connect the wallet for this address to sign."}
                </span>
              </div>
              {!ownerSignature && ownerMatches && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void signClaim()}
                  disabled={ownerSigning}
                >
                  {ownerSigning ? "Signing…" : "Sign ownership"}
                </button>
              )}
            </div>
            {ownerError && (
              <p className="field-hint field-hint-bad">{ownerError}</p>
            )}

            <div className="share">
              <label htmlFor="share-link">Share this claim</label>
              <input
                id="share-link"
                className="input mono"
                value={shareUrl}
                readOnly
                onFocus={(event) => event.currentTarget.select()}
              />
              <div className="actions">
                <CopyButton value={shareUrl} label="Copy link" />
                <a
                  className="btn btn-primary"
                  href={`#${buildShareHash(
                    claimForShare ?? attempt.claim,
                    attempt.proof.accountProof,
                  )}`}
                >
                  Open in verifier
                </a>
              </div>
              <p className="field-hint">
                The proof travels in the link. The verifier checks it against a
                fresh block header.
              </p>
            </div>

            <details className="details">
              <summary>Proof details</summary>
              <dl className="kv">
                <div>
                  <dt>Nonce</dt>
                  <dd className="mono">{attempt.verified.nonce.toString()}</dd>
                </div>
                <div>
                  <dt>Code hash</dt>
                  <dd className="mono">
                    {shortHex(attempt.verified.codeHash, 8)}
                  </dd>
                </div>
                <div>
                  <dt>Storage root</dt>
                  <dd className="mono">
                    {shortHex(attempt.verified.storageRoot, 8)}
                  </dd>
                </div>
                <div>
                  <dt>Proof nodes</dt>
                  <dd>{attempt.proof?.accountProof.length ?? 0}</dd>
                </div>
                <div>
                  <dt>Block fetch</dt>
                  <dd>{formatMs(attempt.elapsedMs.block)}</dd>
                </div>
                <div>
                  <dt>Proof fetch</dt>
                  <dd>{formatMs(attempt.elapsedMs.proof)}</dd>
                </div>
                <div>
                  <dt>Local verify</dt>
                  <dd>{formatMs(attempt.elapsedMs.verify)}</dd>
                </div>
                <div>
                  <dt>RPC-reported balance</dt>
                  <dd className="mono">
                    {attempt.rpcBalance !== undefined
                      ? `${formatEth(attempt.rpcBalance)} ETH`
                      : "not reported"}
                  </dd>
                </div>
              </dl>
            </details>
          </>
        )}
      </div>

      <aside className="side">
        {usedSession && attempt?.claim && (
          <Receipt
            network={usedSession.network}
            exitIp={exitIp}
            onRevealExitIp={onRevealExitIp}
            rpcUrl={DEFAULT_RPC}
            claim={attempt.claim}
            elapsed={attempt.elapsedMs}
            mode="prove"
            requests={2}
          />
        )}

        <div className="card card-soft">
          <h3>What it proves</h3>
          <p>This address held this balance at this block.</p>
          <h3>What it does not</h3>
          <p>That you control the address, unless you sign the claim.</p>
        </div>
      </aside>
    </section>
  );
}
