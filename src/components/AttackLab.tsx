import { useCallback, useEffect, useRef, useState } from "react";
import { isAddress } from "viem";
import { DEFAULT_RPC } from "../lib/config";
import { formatEth, shortHex } from "../lib/format";
import {
  tamperBundle,
  type AttackKind,
  type TamperedBundle,
} from "../lib/mendax";
import {
  createProof,
  verifyClaimAgainstBundle,
  type AccountProof,
  type BlockHeader,
  type Claim,
  type Elapsed,
  type VerificationReport,
} from "../lib/proof";
import type { BootState, Session } from "../lib/session";
import { CheckList } from "./CheckList";
import { Receipt } from "./Receipt";

const ATTACK_ORDER: AttackKind[] = ["balance", "proof", "header"];

type AttackResult = {
  bundle: TamperedBundle;
  report: VerificationReport;
};

type Snapshot = {
  block: BlockHeader;
  proof: AccountProof;
  claim: Claim;
  elapsed: Elapsed;
};

type AttackLabProps = {
  address: string;
  boot: BootState;
  exitIp?: string;
  onEnsureSession: () => Promise<Session>;
  onRevealExitIp: () => Promise<void>;
};

export function AttackLab({
  address,
  boot,
  exitIp,
  onEnsureSession,
  onRevealExitIp,
}: AttackLabProps) {
  const valid = isAddress(address);
  const [phase, setPhase] = useState<"loading" | "done" | "error">("loading");
  const [results, setResults] = useState<AttackResult[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [usedSession, setUsedSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const load = useCallback(async () => {
    if (!isAddress(address)) return;
    setPhase("loading");
    setResults([]);
    setSnapshot(null);
    setError(null);
    setUsedSession(null);
    try {
      const session = await onEnsureSession();
      setUsedSession(session);
      const attempt = await createProof(session.worker, DEFAULT_RPC, address);
      if (
        !attempt.ok ||
        !attempt.block ||
        !attempt.proof ||
        !attempt.claim
      ) {
        throw new Error(
          attempt.error ?? "Could not capture a live proof snapshot.",
        );
      }
      const nextSnapshot: Snapshot = {
        block: attempt.block,
        proof: attempt.proof,
        claim: attempt.claim,
        elapsed: attempt.elapsedMs,
      };
      setSnapshot(nextSnapshot);

      const next: AttackResult[] = [];
      for (const kind of ATTACK_ORDER) {
        const bundle = tamperBundle(
          { block: nextSnapshot.block, proof: nextSnapshot.proof },
          kind,
        );
        const report = await verifyClaimAgainstBundle(
          bundle.claim,
          bundle.block,
          bundle.proof,
          nextSnapshot.block,
        );
        next.push({ bundle, report });
      }
      setResults(next);
      setPhase("done");
    } catch (cause) {
      setError((cause as Error).message);
      setPhase("error");
    }
  }, [address, onEnsureSession]);

  useEffect(() => {
    if (!valid || startedRef.current) return;
    startedRef.current = true;
    void load();
  }, [load, valid]);

  if (!valid) {
    return (
      <section className="panel-grid">
        <div className="card">
          <header className="card-head">
            <div>
              <p className="eyebrow">Attack Lab</p>
              <h2>Connect a wallet first</h2>
              <p className="lede">Enter or connect an address on Prove.</p>
            </div>
          </header>
          <div className="actions">
            <a className="btn btn-primary" href="#/prove">
              Prove a balance
            </a>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel-grid">
      <div className="card">
        <header className="card-head">
          <div>
            <p className="eyebrow">Attack Lab</p>
            <h2>Make an RPC lie</h2>
            <p className="lede">Three tampered bundles. One verifier.</p>
          </div>
          <span className="pill pill-bad">Adversarial</span>
        </header>

        {phase === "loading" && (
          <div className="progress">
            <div className="loading-row">
              <span className="spinner" aria-hidden="true" />
              <span>
                {boot.status === "booting"
                  ? boot.message
                  : "Capturing a live proof snapshot…"}
              </span>
            </div>
          </div>
        )}

        {phase === "error" && error && (
          <div className="alert alert-bad">
            <strong>Could not run the attack lab.</strong>
            <span>{error}</span>
            <button type="button" className="btn btn-ghost" onClick={() => void load()}>
              Try again
            </button>
          </div>
        )}

        {phase === "done" && (
          <>
            <div className="attack-summary">
              <span className="dot dot-ready" />
              <strong>3 attacks. 3 rejections.</strong>
              <span className="muted">
                The attacker controls the bundle, not the block.
              </span>
            </div>

            <div className="attack-grid">
              {results.map(({ bundle, report }, index) => (
                <article key={bundle.kind} className="attack-card">
                  <div className="attack-head">
                    <span className="attack-index">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <h3>{bundle.title}</h3>
                  </div>
                  <p>{bundle.description}</p>
                  <p className="attack-lie">
                    {bundle.kind === "header"
                      ? `The lie: block ${shortHex(bundle.claim.blockHash, 5)}`
                      : `The lie: ${formatEth(BigInt(bundle.claim.balanceWei))} ETH`}
                  </p>
                  <div className="verdicts">
                    <div className="verdict-row verdict-bad">
                      <span className="verdict-label">Naive client</span>
                      <span className="verdict-value">accepts</span>
                    </div>
                    <div
                      className={`verdict-row ${
                        report.ok ? "verdict-bad" : "verdict-good"
                      }`}
                    >
                      <span className="verdict-label">Crosscheck</span>
                      <span className="verdict-value">
                        {report.ok ? "ACCEPTED" : "rejected"}
                      </span>
                    </div>
                  </div>
                  <CheckList checks={report.checks} />
                </article>
              ))}
            </div>

            <div className="actions">
              <button type="button" className="btn btn-primary" onClick={() => void load()}>
                Run again
              </button>
              <a className="btn btn-ghost" href="#/crops">
                Threat model
              </a>
            </div>
          </>
        )}
      </div>

      <aside className="side">
        {usedSession && snapshot && (
          <Receipt
            network={usedSession.network}
            exitIp={exitIp}
            onRevealExitIp={onRevealExitIp}
            rpcUrl={DEFAULT_RPC}
            claim={snapshot.claim}
            elapsed={snapshot.elapsed}
            mode="verify"
            requests={2}
          />
        )}

        <div className="card card-soft">
          <h3>Why it fails</h3>
          <p>Every tampered bundle breaks the Merkle path or the header hash.</p>
        </div>
      </aside>
    </section>
  );
}
