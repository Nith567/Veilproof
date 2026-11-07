const CROPS = [
  {
    letter: "C",
    title: "Censorship-resistant",
    body: "No backend. No admin keys. Static files on IPFS or any host.",
    points: ["Static assets only", "Swap RPC or network"],
  },
  {
    letter: "O",
    title: "Open",
    body: "The verifier is a small trie check in the app.",
    points: ["MIT licensed", "Reproducible build"],
  },
  {
    letter: "P",
    title: "Private",
    body: "RPC reads leave through Nym or Tor.",
    points: ["No accounts or analytics", "Wallet optional"],
  },
  {
    letter: "S",
    title: "Secure",
    body: "Balance proofs are checked against Ethereum's state root. Signed claims also verify the owner.",
    points: ["EIP-1186 + EIP-1898", "Optional owner signature"],
  },
];

const THREAT_MODEL = [
  {
    observer: "Anon-RPC worker",
    learns: "Request contents, destination RPC",
    hides: "Your IP behind Nym or Tor, page state",
  },
  {
    observer: "RPC provider",
    learns: "Address, block, balance query",
    hides: "Your IP behind Nym, who you are",
  },
  {
    observer: "Nym mixnet",
    learns: "Encrypted packet metadata",
    hides: "RPC request contents",
  },
  {
    observer: "Share-link recipient",
    learns: "Address, block, balance, signature if signed",
    hides: "Your IP, your identity",
  },
  {
    observer: "Static host / gateway",
    learns: "Asset request metadata",
    hides: "Address and proof contents",
  },
  {
    observer: "This app's backend",
    learns: "Nothing — there is no backend",
    hides: "Everything",
  },
];

export function CropsPanel() {
  return (
    <section className="crops">
      <header className="card-head">
        <div>
          <p className="eyebrow">CROPS</p>
          <h2>Properties, not promises</h2>
          <p className="lede">Static, open, private, secure.</p>
        </div>
        <span className="pill pill-good">No backend</span>
      </header>

      <div className="crops-grid">
        {CROPS.map((item) => (
          <article key={item.letter} className="crops-card">
            <span className="crops-letter">{item.letter}</span>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
            <ul className="bullets">
              {item.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <div className="crops-columns">
        <details className="card-soft crops-detail">
          <summary>Threat model</summary>
          <div className="table-wrap">
            <table className="threat-table">
              <thead>
                <tr>
                  <th>Observer</th>
                  <th>Learns</th>
                  <th>Does not learn</th>
                </tr>
              </thead>
              <tbody>
                {THREAT_MODEL.map((row) => (
                  <tr key={row.observer}>
                    <td>{row.observer}</td>
                    <td>{row.learns}</td>
                    <td>{row.hides}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <details className="card-soft crops-detail">
          <summary>Known limits</summary>
          <ul className="bullets">
            <li>
              The address is public to the verifier and the RPC. Privacy here is
              about network origin.
            </li>
            <li>
              The verifier trusts its RPC for the canonical block header. It
              checks the proof against that header&apos;s state root, not a light
              client.
            </li>
            <li>
              The Anon-RPC worker is hash-pinned, but it sees every request and
              can censor or lie. The Merkle check catches a lie; it cannot detect
              censorship.
            </li>
            <li>
              The specifier contract is a trust anchor. The bundle hash is public
              and auditable.
            </li>
            <li>
              The bootstrap specifier read is direct. It carries no address, but
              reveals that this client is loading.
            </li>
            <li>
              Unsigned claims are address-only. Signed claims use an EIP-191
              signature from an EOA; ERC-1271 smart wallets are not supported yet.
            </li>
            <li>Native ETH only. ERC-20 storage proofs are not implemented.</li>
            <li>Nym boot can be slow or flaky. The client retries.</li>
          </ul>
        </details>
      </div>

      <div className="crops-columns">
        <details className="card-soft crops-detail">
          <summary>Verify it yourself</summary>
          <ol className="bullets bullets-numbered">
            <li>Open DevTools → Network. There are no backend calls.</li>
            <li>Change the RPC in src/lib/config.ts and verify again.</li>
            <li>Run the Attack Lab and watch all three lies fail.</li>
            <li>Read src/lib/proof.ts. The trie check is the verifier.</li>
          </ol>
        </details>

        <details className="card-soft crops-detail">
          <summary>Built on</summary>
          <ul className="bullets">
            <li>React 19 + Vite 8, static build</li>
            <li>viem for Ethereum encoding</li>
            <li>@ethereumjs/trie for EIP-1186 proofs</li>
            <li>Anon-RPC browser harness 0.4</li>
            <li>Nym by default, Tor optional</li>
          </ul>
          <div className="actions">
            <a className="btn btn-primary" href="#/attack">
              Attack Lab
            </a>
            <a className="btn btn-ghost" href="#/prove">
              Prove a balance
            </a>
          </div>
        </details>
      </div>
    </section>
  );
}
