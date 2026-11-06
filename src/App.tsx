import { useCallback, useEffect, useRef, useState } from "react";
import { AttackLab } from "./components/AttackLab";
import { CropsPanel } from "./components/CropsPanel";
import { Logo } from "./components/Logo";
import { NetworkBadge } from "./components/NetworkBadge";
import { ProvePanel } from "./components/ProvePanel";
import { VerifyPanel } from "./components/VerifyPanel";
import { WalletButton } from "./components/WalletButton";
import { bootWorker, getExitIp } from "./lib/anon";
import { NETWORKS, type NetworkId } from "./lib/config";
import { formatMs } from "./lib/format";
import { parseRoute, type Route } from "./lib/share";
import type { BootState, Session } from "./lib/session";
import { useWallet } from "./lib/wallet";
import "./App.css";

const YEAR = new Date().getFullYear();

const TABS: { id: Route["view"]; label: string; href: string }[] = [
  { id: "prove", label: "Prove", href: "#/prove" },
  { id: "verify", label: "Verify", href: "#/verify" },
  { id: "attack", label: "Attack Lab", href: "#/attack" },
  { id: "crops", label: "CROPS", href: "#/crops" },
];

export default function App() {
  const [networkId, setNetworkId] = useState<NetworkId>("nym");
  const [route, setRoute] = useState<Route>(() => parseRoute());
  const [address, setAddress] = useState("");
  const [boot, setBoot] = useState<BootState>({ status: "idle" });
  const [session, setSession] = useState<Session | null>(null);
  const [exitIp, setExitIp] = useState<string | undefined>();
  const [epoch, setEpoch] = useState(0);
  const sessionRef = useRef<Session | null>(null);
  const bootingRef = useRef<Promise<Session> | null>(null);
  const autoBootedRef = useRef(false);
  const exitIpPendingRef = useRef<Session | null>(null);
  const walletAddressRef = useRef<string | null>(null);
  const handleWalletAccount = useCallback((next: string | null) => {
    if (next) {
      walletAddressRef.current = next;
      setAddress(next);
      return;
    }
    const connected = walletAddressRef.current;
    walletAddressRef.current = null;
    setAddress((current) =>
      connected && current.toLowerCase() === connected.toLowerCase()
        ? ""
        : current,
    );
  }, []);
  const wallet = useWallet(handleWalletAccount);

  const ensureSession = useCallback(async (): Promise<Session> => {
    if (sessionRef.current) return sessionRef.current;
    if (bootingRef.current) return bootingRef.current;

    const requested = networkId;
    const promise = (async () => {
      setBoot({
        status: "booting",
        message: `Booting ${NETWORKS[requested].label}…`,
      });
      try {
        const result = await bootWorker(requested, (status) => {
          setBoot({
            status: "booting",
            message: status.message,
            attempt: status.attempt,
            attempts: status.attempts,
          });
        });
        const next: Session = {
          worker: result.worker,
          network: result.network,
          attempts: result.attempts,
          elapsedMs: result.elapsedMs,
        };
        sessionRef.current = next;
        setSession(next);
        setBoot({
          status: "ready",
          message: `${result.network.label} ready in ${formatMs(
            result.elapsedMs,
          )}${result.attempts > 1 ? ` · ${result.attempts} attempts` : ""}`,
        });
        return next;
      } catch (cause) {
        setBoot({ status: "error", message: (cause as Error).message });
        throw cause;
      } finally {
        bootingRef.current = null;
      }
    })();

    bootingRef.current = promise;
    return promise;
  }, [networkId]);

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [route]);

  useEffect(() => {
    autoBootedRef.current = false;
  }, [networkId]);

  useEffect(() => {
    if (route.view !== "prove") return;
    if (autoBootedRef.current) return;
    autoBootedRef.current = true;
    void ensureSession().catch(() => undefined);
  }, [route.view, ensureSession]);

  useEffect(() => {
    return () => {
      sessionRef.current?.worker.close();
      sessionRef.current = null;
    };
  }, []);

  const switchNetwork = useCallback(
    (id: NetworkId) => {
      if (id === networkId) return;
      const current = sessionRef.current;
      sessionRef.current = null;
      setSession(null);
      setExitIp(undefined);
      setBoot({ status: "idle" });
      setNetworkId(id);
      setEpoch((value) => value + 1);
      autoBootedRef.current = false;
      if (current) current.worker.close();
    },
    [networkId],
  );

  const retryBoot = useCallback(() => {
    const current = sessionRef.current;
    sessionRef.current = null;
    setSession(null);
    setExitIp(undefined);
    setBoot({ status: "idle" });
    if (current) current.worker.close();
    void ensureSession().catch(() => undefined);
  }, [ensureSession]);

  const revealExitIp = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || !current.network.private) return;
    if (exitIpPendingRef.current === current) return;
    exitIpPendingRef.current = current;
    try {
      const ip = await getExitIp(current.worker);
      if (ip && sessionRef.current === current) setExitIp(ip);
    } finally {
      if (exitIpPendingRef.current === current) {
        exitIpPendingRef.current = null;
      }
    }
  }, []);

  const panelKey = `${route.view}-${networkId}-${epoch}`;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="topbar-main">
            <a className="brand" href="#/prove" aria-label="Crosscheck home">
              <Logo />
              <span className="brand-text">
                <strong>crosscheck</strong>
              </span>
            </a>
            <nav className="tabs" aria-label="Sections">
              {TABS.map((tab) => (
                <a
                  key={tab.id}
                  href={tab.href}
                  className={`tab${route.view === tab.id ? " is-active" : ""}`}
                  aria-current={route.view === tab.id ? "page" : undefined}
                >
                  {tab.label}
                </a>
              ))}
            </nav>
          </div>
          <div className="topbar-actions">
            <NetworkBadge
              networkId={networkId}
              boot={boot}
              exitIp={exitIp}
              disabled={boot.status === "booting"}
              onChange={switchNetwork}
              onRetry={retryBoot}
            />
            <WalletButton wallet={wallet} />
          </div>
        </div>
      </header>

      <main className="main">
        {route.view === "prove" && (
          <section className="hero">
            <p className="eyebrow">Private proof of funds</p>
            <h1>
              Prove what you hold.
              <br />
              Reveal nothing else.
            </h1>
            <p className="hero-sub">
              Check an Ethereum balance without exposing your IP.
            </p>
          </section>
        )}

        <div key={panelKey} className="panel">
          {route.view === "prove" && (
            <ProvePanel
              address={address}
              onAddressChange={setAddress}
              wallet={wallet}
              boot={boot}
              exitIp={exitIp}
              onEnsureSession={ensureSession}
              onRetryBoot={retryBoot}
              onRevealExitIp={revealExitIp}
            />
          )}
          {route.view === "verify" && (
            <VerifyPanel
              claim={route.claim}
              accountProof={route.accountProof}
              linkError={route.error}
              boot={boot}
              exitIp={exitIp}
              onEnsureSession={ensureSession}
              onRevealExitIp={revealExitIp}
            />
          )}
          {route.view === "attack" && (
            <AttackLab
              address={address}
              boot={boot}
              exitIp={exitIp}
              onEnsureSession={ensureSession}
              onRevealExitIp={revealExitIp}
            />
          )}
          {route.view === "crops" && <CropsPanel />}
        </div>
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <span>crosscheck · MIT · {YEAR}</span>
          <span className="muted">No backend. No accounts. No tracking.</span>
          <a href="#/crops">CROPS</a>
          <a
            href="https://github.com/ethereum/anon-rpc"
            target="_blank"
            rel="noreferrer"
          >
            Anon-RPC
          </a>
          <span className="mono muted hidden-sm">
            {session ? `${session.network.label} · ${formatMs(session.elapsedMs)}` : "not connected"}
          </span>
        </div>
      </footer>
    </div>
  );
}
