import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { Hex } from "viem";
import { DEFAULT_RPC } from "../lib/config";
import { formatDate, formatEth, formatInt } from "../lib/format";
import {
  verifyClaim,
  verifyClaimFromLink,
  type Claim,
  type ProofStep,
  type VerificationReport,
} from "../lib/proof";
import {
  buildShareHash,
  buildShareUrl,
  parseClaimFromSearch,
} from "../lib/share";
import type { BootState, Session } from "../lib/session";
import { CheckList } from "./CheckList";
import { CopyButton } from "./CopyButton";
import { Receipt } from "./Receipt";
import { Stepper } from "./Stepper";

const VERIFY_STEPS = [
  { id: "block", label: "Block" },
  { id: "proof", label: "Proof" },
  { id: "verify", label: "Merkle" },
];

function parsePastedValue(value: string): {
  claim?: Claim;
  accountProof?: Hex[];
  error?: string;
} {
  const trimmed = value.trim();
  if (!trimmed) return { error: "Paste a Veilproof share link." };
  const hashPart = trimmed.includes("#")
    ? trimmed.slice(trimmed.indexOf("#") + 1)
    : trimmed;
  const query = hashPart.includes("?")
    ? hashPart.slice(hashPart.indexOf("?") + 1)
    : hashPart.startsWith("v=")
      ? hashPart
      : "";
  if (!query) {
    return { error: "That does not look like a Veilproof share link." };
  }
  return parseClaimFromSearch(query);
}

type VerifyPanelProps = {
  claim?: Claim;
  accountProof?: Hex[];
  linkError?: string;
  boot: BootState;
  exitIp?: string;
  onEnsureSession: () => Promise<Session>;
  onRevealExitIp: () => Promise<void>;
};

export function VerifyPanel({
  claim,
  accountProof,
  linkError,
  boot,
  exitIp,
  onEnsureSession,
  onRevealExitIp,
}: VerifyPanelProps) {
  const [report, setReport] = useState<VerificationReport | null>(null);
  const [phase, setPhase] = useState<"idle" | "working" | "done" | "error">(
    claim ? "working" : "idle",
  );
  const [activeStep, setActiveStep] = useState<ProofStep | null>(
    claim ? "block" : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [usedSession, setUsedSession] = useState<Session | null>(null);
  const [paste, setPaste] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const runKeyRef = useRef<string | null>(null);
  const lastClaimKeyRef = useRef("");

  const claimKey = claim
    ? `${claim.address}:${claim.blockHash}:${claim.balanceWei}:${claim.ownerSignature ?? ""}`
    : "";
  const linkProof = accountProof ?? report?.proof?.accountProof;

  const run = useCallback(
    async (target: Claim) => {
      setPhase("working");
      setReport(null);
      setError(null);
      setActiveStep("block");
      try {
        const session = await onEnsureSession();
        setUsedSession(session);
        const result = accountProof
          ? await verifyClaimFromLink(
              session.worker,
              DEFAULT_RPC,
              target,
              accountProof,
              (step) => setActiveStep(step),
            )
          : await verifyClaim(session.worker, DEFAULT_RPC, target, (step) =>
              setActiveStep(step),
            );
        setReport(result);
        setActiveStep(null);
        setPhase(result.ok ? "done" : "error");
        if (!result.ok) {
          setError(result.error ?? "The claim did not survive verification.");
        }
      } catch (cause) {
        setActiveStep(null);
        setError((cause as Error).message);
        setPhase("error");
      }
    },
    [accountProof, onEnsureSession],
  );

  useEffect(() => {
    if (lastClaimKeyRef.current === claimKey) return;
    lastClaimKeyRef.current = claimKey;
    runKeyRef.current = null;
    setReport(null);
    setError(null);
    setUsedSession(null);
    setPhase(claim ? "working" : "idle");
    setActiveStep(claim ? "block" : null);
  }, [claim, claimKey]);

  useEffect(() => {
    if (!claim || !claimKey) return;
    if (runKeyRef.current === claimKey) return;
    runKeyRef.current = claimKey;
    void run(claim);
  }, [claim, claimKey, run]);

  function onPasteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parsePastedValue(paste);
    if (parsed.error || !parsed.claim) {
      setPasteError(parsed.error ?? "Could not parse the link.");
      return;
    }
    setPasteError(null);
    location.hash = buildShareHash(parsed.claim, parsed.accountProof);
  }

  if (!claim) {
    return (
      <section className="panel-grid">
        <div className="card">
          <header className="card-head">
            <div>
              <p className="eyebrow">Verify</p>
              <h2>Verify a claim</h2>
              <p className="lede">
                Paste a Veilproof link. Your browser checks the proof.
              </p>
            </div>
            <span className="pill pill-good">Trustless</span>
          </header>

          {linkError && (
            <div className="alert alert-bad">
              <strong>Link rejected.</strong>
              <span>{linkError}</span>
            </div>
          )}

          <form className="field" onSubmit={onPasteSubmit}>
            <label htmlFor="paste-link">Share link or claim parameters</label>
            <textarea
              id="paste-link"
              className="input input-area mono"
              rows={3}
              value={paste}
              onChange={(event) => setPaste(event.target.value)}
              placeholder="https://…/#/verify?v=1&chain=1&address=0x…&block=0x…&balance=…"
              spellCheck={false}
            />
            {pasteError && (
              <p className="field-hint field-hint-bad">{pasteError}</p>
            )}
            <div className="actions">
              <button type="submit" className="btn btn-primary">
                Verify claim
              </button>
              <a className="btn btn-ghost" href="#/prove">
                Prove a balance first
              </a>
            </div>
          </form>

          <details className="details">
            <summary>How it works</summary>
            <ol className="bullets bullets-numbered">
              <li>Fetch the block header by hash.</li>
              <li>Check the proof against the state root.</li>
              <li>Compare the proven balance to the claim.</li>
            </ol>
          </details>
        </div>

        <aside className="side">
          <div className="card card-soft">
            <h3>No attestor</h3>
            <p>If the claim is wrong, the Merkle check fails.</p>
            <p className="muted">Signed claims also prove control of the address.</p>
          </div>
        </aside>
      </section>
    );
  }

  return (
    <section className="panel-grid">
      <div className="card">
        <header className="card-head">
          <div>
            <p className="eyebrow">Verify</p>
            <h2>Verification</h2>
            <p className="lede">Checked against a fresh block header.</p>
          </div>
          <span className="pill pill-good">Independent</span>
        </header>

        {phase === "working" && (
          <div className="progress">
            <Stepper steps={VERIFY_STEPS} active={activeStep ?? "block"} />
            <p className="muted" aria-live="polite">
              {boot.status === "booting"
                ? boot.message
                : "Fetching the block header through the mixnet…"}
            </p>
          </div>
        )}

        {report && (
          <div
            className={`result ${report.ok ? "result-good" : "result-bad"}`}
          >
            <div className="result-kicker">
              {report.ok ? "Balance verified" : "Claim rejected"}
            </div>
            {report.ok && report.verified ? (
              <div className="balance">
                <span className="balance-value">
                  {formatEth(report.verified.balance)}
                </span>
                <span className="balance-unit">ETH</span>
              </div>
            ) : (
              <p className="result-error">
                {error ?? report.error ?? "The claim did not verify."}
              </p>
            )}
            {!report.ok && report.verified && (
              <p className="result-meta">
                Claimed {formatEth(BigInt(claim.balanceWei))} ETH · proof proves{" "}
                {formatEth(report.verified.balance)} ETH
              </p>
            )}
            {report.ok && report.block && (
              <p className="result-meta">
                at block #{formatInt(BigInt(report.block.number))} ·{" "}
                {formatDate(report.block.timestamp)}
              </p>
            )}
          </div>
        )}

        {report && (
          <div
            className={`owner-status ${
              report.owner?.verified
                ? "owner-ok"
                : report.owner?.present
                  ? "owner-bad"
                  : "owner-warn"
            }`}
          >
            <span
              className={`dot ${
                report.owner?.verified
                  ? "dot-ready"
                  : report.owner?.present
                    ? "dot-error"
                    : "dot-public"
              }`}
            />
            <div>
              <strong>
                {report.owner?.verified
                  ? "Owner verified"
                  : report.owner?.present
                    ? "Owner signature invalid"
                    : "Address-only proof"}
              </strong>
              <span>
                {report.owner?.verified
                  ? "The signer matches the claim address."
                  : report.owner?.present
                    ? "The signature does not match the claim address."
                    : "Balance proven, but ownership was not signed."}
              </span>
            </div>
          </div>
        )}

        {phase === "error" && !report && error && (
          <div className="alert alert-bad">
            <strong>Verification failed.</strong>
            <span>{error}</span>
          </div>
        )}

        <div className="claim-box">
          <span className="label">Claim under test</span>
          <dl className="kv">
            <div>
              <dt>Address</dt>
              <dd className="mono wrap">{claim.address}</dd>
            </div>
            <div>
              <dt>Block hash</dt>
              <dd className="mono wrap">{claim.blockHash}</dd>
            </div>
            <div>
              <dt>Claimed balance</dt>
              <dd className="mono">
                {formatEth(BigInt(claim.balanceWei))} ETH
              </dd>
            </div>
          </dl>
        </div>

        {report && <CheckList checks={report.checks} />}

        {!accountProof && (
          <p className="field-hint">
            No proof in this link. The verifier will fetch one.
          </p>
        )}

        <div className="actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void run(claim)}
            disabled={phase === "working"}
          >
            {phase === "working" ? "Verifying…" : "Verify again"}
          </button>
          {linkProof && (
            <CopyButton
              value={buildShareUrl(claim, linkProof)}
              label="Copy link"
            />
          )}
          <a className="btn btn-ghost" href="#/prove">
            Prove your own balance
          </a>
        </div>
      </div>

      <aside className="side">
        {usedSession && (
          <Receipt
            network={usedSession.network}
            exitIp={exitIp}
            onRevealExitIp={onRevealExitIp}
            rpcUrl={DEFAULT_RPC}
            claim={claim}
            elapsed={report?.elapsedMs}
            mode="verify"
            requests={accountProof ? 1 : 2}
          />
        )}

        <div className="card card-soft">
          <h3>Trusts</h3>
          <p>The state root and a fresh block header, plus a valid owner signature when present.</p>
          <h3>Never trusts</h3>
          <p>The prover, the RPC balance, or a backend.</p>
          <p className="muted">The verifier learns the address.</p>
        </div>
      </aside>
    </section>
  );
}
