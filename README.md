# Crosscheck

**Private proof of funds on Ethereum.**

Crosscheck proves that an address held a balance at a specific block, without requiring a wallet connection, trusting an attestor, or sending the user's IP address to the RPC. An injected wallet can optionally fill the address; it is never asked to sign or send anything. The proof is fetched through [Anon-RPC](https://github.com/ethereum/anon-rpc), verified against Ethereum's state root in the browser, and shared as a self-contained link.

The same app includes a verifier, a malicious-RPC mode (Mendax), and an Attack Lab that demonstrates the difference between believing an RPC's JSON and checking a Merkle proof.

```
Prove what you hold. Reveal nothing else.
```

**Live demo:** https://eu.orbitor.dev/ipfs/QmaLzHChpEZAsi3duwvXBZCZfpKvLSFP6mzKmSrJRxMxBJ  
**IPFS CID:** `QmaLzHChpEZAsi3duwvXBZCZfpKvLSFP6mzKmSrJRxMxBJ`

## Why this exists

Most "proof of funds" products are one of these:

- a screenshot,
- a signed message from a custodian,
- a wallet connection that reveals the whole portfolio,
- or a backend that learns who is asking.

Crosscheck is none of those. It is a static, read-only client. It uses an EIP-1186 account proof, pinned to a block hash with EIP-1898, and checks the trie path locally. The RPC serves the proof; it does not get to decide the answer.

Use cases: OTC counterparty checks, grant and airdrop eligibility, DAO membership, rentals, exchange withdrawal limits, and any situation where someone needs to show a balance without exposing their address history or network origin.

## How it works

1. **Boot an Anon-RPC worker.** Nym is the default; Tor and a labeled passthrough mode are available as alternate workers.
2. **Fetch the block.** The worker asks the RPC for the latest block.
3. **Fetch the account proof.** The worker calls `eth_getProof(address, [], { blockHash })` using EIP-1898, so the proof is pinned to a known block instead of racing `latest`.
4. **Verify locally.** The browser checks the EIP-1186 proof with `@ethereumjs/trie` against the block's `stateRoot`, decodes the account leaf, and reads the balance from the proven leaf.
5. **Compare.** The RPC's JSON `balance` field is compared with the proven leaf. A mismatch fails closed.
6. **Share.** The link carries the claim and the account proof in the URL fragment. The verifier re-fetches only the block header by hash, then checks the proof against that header's state root.

```
Prover browser                         Verifier browser
──────────────                         ────────────────
Anon-RPC worker (Nym)                  Anon-RPC worker (Nym)
  │ eth_getBlockByNumber                │ eth_getBlockByHash
  │ eth_getProof(..., { blockHash })   │
  ▼                                    ▼
EIP-1186 proof                         block header
  │                                      │
  └─ local trie check ◄──── stateRoot ───┘
        │
        └─ share link (hash fragment)
```

The share link is a URL fragment, so the static host never receives the claim, address, or proof.

## Why the proof is in the link

Public RPCs prune `eth_getProof` history aggressively. A proof that is fetched now may not be fetchable by a verifier minutes later. Embedding the account proof makes the claim portable and removes the prover's RPC from the verification path.

New links contain the proof and verify with **one** RPC query: `eth_getBlockByHash`. Legacy links without a proof fall back to re-fetching the proof by block hash, which only works while the RPC retains that proof window.

The proof is static and self-contained. As long as the verifier can fetch the block header, it can re-check the claim.

## The share link

```
#/verify?v=1&chain=1
  &address=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
  &block=0x...
  &balance=5780441042197210512
  &proof=<base64url(JSON array of trie nodes)>
```

- `balance` is decimal wei.
- `proof` is the EIP-1186 `accountProof` array, base64url-encoded.
- The fragment is client-side only.
- The verifier checks the block exists, the proof is valid for the address, the Merkle path matches the state root, and the claimed balance matches the proven leaf.

## Privacy receipt

Every result shows what left the browser:

| Field | What it means |
| --- | --- |
| Network | Nym, Tor, or passthrough |
| Exit IP | Optional reveal of the mixnet exit address |
| RPC endpoint | The host that received the query |
| Queries through mixnet | Number and duration of RPC calls |
| Revealed to RPC | Address, block, balance query |
| Not revealed | Your IP, local state |
| Claim | Balance and block hash |
| Checked | When the receipt was produced |

The only direct read is the public worker-specifier lookup. It carries no address. Everything else goes through the selected privacy network.

## CROPS

Crosscheck is designed as a static client so CROPS are structural properties, not policy statements.

### Censorship-resistant

- No backend, API routes, database, admin keys, or server state.
- The bundle can be hosted on IPFS, ENS, or any dumb file server.
- The RPC and privacy network are user-swappable.
- Hash-based routing needs no SPA fallback.

### Open

- MIT licensed.
- The verifier is a small trie check in `src/lib/proof.ts`, not a trusted service.
- Dependencies are pinned in `package-lock.json`.
- The Anon-RPC worker is resolved from a public specifier with a published code hash.
- No proprietary attestor, hidden oracle, or closed verifier.

### Private

- Reads go through Anon-RPC; Nym is the default.
- No accounts, cookies, analytics, telemetry, third-party fonts, CDNs, or embeds.
- No wallet connection is required.
- Passthrough is explicitly labeled "not private".
- The bootstrap specifier read is direct and disclosed; it contains no address.

### Secure

- EIP-1186 Merkle proofs are checked against the block state root.
- EIP-1898 pins the proof to a block hash.
- The app fails closed when a check fails.
- Read-only: no keys, signatures, or transactions.
- A production CSP pins scripts to the app bundle and the Anon-RPC harness bootstrap hash, blocks gateway-injected scripts, frames, and objects, and leaves RPC egress open because endpoints are user-configurable. The bundle itself contains no third-party trackers.
- The Attack Lab shows a balance lie, a forged proof, and a forged header all being rejected.

## Threat model

| Observer | Learns | Does not learn |
| --- | --- | --- |
| Proof RPC provider | Address, block, balance query | Your IP behind Nym, your identity |
| Nym mixnet | Encrypted packet metadata | RPC request contents |
| Bootstrap RPC | Your IP, that a specifier was read | Address, balance, claim |
| Share-link recipient | Address, block, claimed balance, proof | Your IP, your identity |
| Static host / gateway | Asset request metadata | Address and proof contents (they are in the fragment) |
| This app's backend | Nothing - there is no backend | Everything |

## Known limits

- **The verifier trusts its RPC for the canonical block header.** It checks the proof against the header's state root, but it does not run a light client, verify PoS signatures, or recompute the header hash. A malicious verifier RPC could serve a fabricated header. Using multiple independent RPCs or a light client would strengthen this.
- **The address is public to the verifier and the RPC.** Privacy here is about network origin, not address confidentiality.
- **Native ETH only.** ERC-20 balances need storage proofs and token decimals.
- **No ownership proof.** This proves an address held a balance, not that the user controls the address. A signature-based ownership attestation is a planned extension.
- **Nym boot can be slow or flaky.** The client reboots the mixnet up to twice on a transport error and exposes a "Restart mixnet & retry" action instead of silently falling back.
- **The Anon-RPC worker is a trust anchor too.** It is hash-pinned by the specifier, but it sees every request and can censor or lie. The Merkle check catches a lying response; it cannot detect censorship. Sandboxing limits its reach, not trust.
- **The specifier contract is a trust anchor.** A malicious update could point to a different worker; the bundle hash is public and auditable.
- **The CSP pins the Anon-RPC harness bootstrap hash.** Bumping `@anon-rpc/browser-harness` requires updating the hash in `vite.config.ts`, or the worker will not boot.
- **The bootstrap read is direct.** It reveals that this client is loading, but not which address it will check.
- **Share links are large** because they carry the proof. Some chat clients may truncate long URLs. A short-link service would require a backend and is deliberately out of scope.
- **Public RPCs can censor or prune.** Swap endpoints in `src/lib/config.ts`; the claim remains verifiable as long as the header is available.
- **Traffic analysis is out of scope.** Nym hides the link between you and the RPC, not every timing signal.
- **This is a hackathon prototype.** It has not been audited for production use.

## Attack Lab and Mendax

The Attack Lab fetches one real mainnet snapshot through Anon-RPC, then runs three attacks in the browser:

1. **Lie about the balance.** The RPC returns a valid proof but replaces the JSON balance with `1,000,000 ETH`. A naive client shares the inflated claim. Crosscheck decodes the account leaf and rejects the mismatch.
2. **Forge the proof.** One nibble in the first proof node is flipped. The hash-linked path no longer reaches the state root. Crosscheck rejects the proof.
3. **Forge the header.** The RPC invents a block hash and state root, then serves the real proof against the fake root. The verifier's fresh `eth_getBlockByHash` returns nothing, so the claim is unpinned.

The base block and proof are real. The tampering is simulated in the browser. No funds, keys, or transactions are involved.

Mendax is the same idea in the live path: a worker wrapper that tampers with the balance JSON while leaving the proof intact. Toggle **Route through Mendax** on the Prove tab. Crosscheck catches the lie and refuses to render a share link.

## Anon-RPC usage

All proof and verification RPC calls go through the Anon-RPC browser harness. The worker is selected by a public specifier and booted with an optional bootstrap provider so the specifier can be resolved before the mixnet is ready.

Default specifiers in `src/lib/config.ts`:

| Network | Specifier |
| --- | --- |
| Nym | `0x3aCD9742C68F6d993066Ae25533e09b9e1f60eD0` |
| Tor | `0x700dA3193D35fA54Cd3fBf29B66f2a2A0385659e` |
| Passthrough | `0x4fd77be300f31c5fe6ab266d35d27750a3478d27` |

The default and bootstrap RPC is `https://eth.drpc.org`. It is a destination for the Anon-RPC worker, not a separate privacy network.

Tor support is included, but the demo gateway in the source may not be reachable from every network. Nym is the default for that reason.

The app shows the exit IP only when you ask for it. That request is isolated from the proof requests.

To list Crosscheck as an Anon-RPC adopter, add this entry to the `walletsAndApps` array in `adopters.json5` in the Anon-RPC repo:

```json5
{
  id: "crosscheck",
  label: "Crosscheck",
  kind: "app",
  url: "https://eu.orbitor.dev/ipfs/QmaLzHChpEZAsi3duwvXBZCZfpKvLSFP6mzKmSrJRxMxBJ",
  note: "Private proof of funds. Fetches EIP-1186 account proofs through Anon-RPC (Nym by default, Tor selectable), verifies the Merkle path in the browser, and puts the proof in a share link so anyone can re-check it without an attestor or backend.",
  workers: ["nym", "tor-js"],
}
```

## Run it

Requirements: Node 22+ and npm. The end-to-end test uses Google Chrome.

```bash
npm ci
npm run dev        # http://localhost:5173
```

Production build and preview:

```bash
npm run build
npm run preview    # http://localhost:4173

npm run build:single   # dist-single/index.html, the IPFS build
```

The address field accepts a paste or an injected wallet. Connecting a wallet only fills the address; no signature or transaction is requested.

Checks:

```bash
npm run lint
npm run build
```

End-to-end test (with the preview server running on port 4173):

```bash
npm run e2e
```

The E2E flow: boot Nym, fill a test address, prove its balance, open the verifier, run the Attack Lab, inspect CROPS, enable Mendax, and confirm that no share link is produced.

A captioned screen recording is checked in at `demo/crosscheck-demo.mp4` (67 seconds, silent). Regenerate it against the IPFS deployment or the local preview:

```bash
BASE_URL=https://eu.orbitor.dev/ipfs/QmaLzHChpEZAsi3duwvXBZCZfpKvLSFP6mzKmSrJRxMxBJ npm run demo
```

## Deploy

The live build is a single self-contained HTML file, `dist-single/index.html`, pinned at `QmaLzHChpEZAsi3duwvXBZCZfpKvLSFP6mzKmSrJRxMxBJ` and served from the Orbitor gateway above. `npm run build:single` reproduces it; `ipfs add -Q dist-single/index.html` returns the same CID.

```bash
npm run build:single
ipfs add -Q dist-single/index.html
# or upload dist-single/index.html to any IPFS pinning service
```

The normal `npm run build` still produces the multi-file `dist` bundle for regular static hosting. `ipfs add -r dist` reproduces that multi-file root, not the live single-file CID.

For ENS, set the content hash to `ipfs://QmaLzHChpEZAsi3duwvXBZCZfpKvLSFP6mzKmSrJRxMxBJ` (the encoded record is `0xe30101701220b2625f26df2f01d4f2aa276dbe63755e8d1ea9c4ea29006f1af0eeceaaec4361`). There is no server to configure.

Public gateways differ. Some inject scripts or add a restrictive CSP. Crosscheck's own CSP blocks injected inline scripts; a gateway that adds `connect-src` restrictions will also block the RPC calls the app needs. The Orbitor gateway is used for the live demo because it permits the RPC egress.

A Vercel fallback is configured in `vercel.json`:

```bash
vercel login
vercel --prod
```

## Demo script (3 minutes)

1. Open the app and show the network badge. Nym boots; the status line shows retries if needed.
2. Fill an address and prove it. Walk through the four checks: block, proof, Merkle verification, balance match.
3. Open the privacy receipt. Optionally reveal the exit IP.
4. Copy the share link and open it in a new tab. Show that the verifier re-fetches only the header and still reaches "Claim verified".
5. Open the Attack Lab. Show 3 attacks and 3 rejections. Point out that a naive client accepts all three.
6. Open CROPS. Connect each letter to a structural property in the code.
7. Return to Prove, enable Mendax, and prove again. Show the caught lie and the absence of a share link.
8. Close with the known limits: verifier header trust, address visibility, native ETH only, no ownership proof.

## Project layout

```
src/
  App.tsx                 hash routing, session lifecycle, network switch
  App.css                 design system
  lib/
    anon.ts               worker boot, retries, RPC helper, exit IP
    config.ts             chain, RPC, networks, specifiers
    format.ts             ETH, hex, time formatting
    mendax.ts             malicious RPC wrapper and snapshot tampering
    proof.ts              EIP-1186 verifier and proof creation
    session.ts            session and boot types
    share.ts              base64url proof encoding, link build/parse
    wallet.ts             optional injected-wallet connect
  components/
    ProvePanel.tsx        address, Mendax toggle, proof result, share link
    VerifyPanel.tsx       link parsing, header re-fetch, local proof check
    AttackLab.tsx         three adversarial attacks
    CropsPanel.tsx        CROPS, threat model, limits, verify-it-yourself
    Receipt.tsx           privacy receipt
    NetworkBadge.tsx      Anon-RPC worker switcher and boot status
    WalletButton.tsx      connect/disconnect and address chip
    Logo.tsx, CopyButton.tsx, CheckList.tsx, Stepper.tsx
scripts/
  e2e.mjs                 Playwright happy-path and attack-path test
  demo.mjs                captioned screen-recording script
  build-single.mjs        inlines the app into one HTML file for IPFS
demo/
  crosscheck-demo.mp4     67-second silent walkthrough
```

The verifier is `src/lib/proof.ts`. The UI is not trusted to decide whether a claim is valid.

## Verification snippet

The core check is intentionally small:

```ts
const trie = new Trie({ useKeyHashing: true });
const value = await trie.verifyProof(
  hexToBytes(stateRoot),
  hexToBytes(address),
  accountProof.map(hexToBytes),
);
const account = RLP.decode(value);
const provenBalance = bytesToHex(account[1]);
```

If `verifyProof` throws, or the decoded balance does not match the claim, the result is rejected.

## Built with

- React 19 and Vite 8, static build
- [Anon-RPC](https://github.com/ethereum/anon-rpc) browser harness 0.4
- Nym mixnet by default, Tor as an option
- `viem` for Ethereum encoding and address checks
- `@ethereumjs/trie` and `@ethereumjs/rlp` for EIP-1186 verification

## Prior art

Crosscheck is informed by Accredifi Wallet Proof Links, EAS proof-of-funds attestations, zk-flexor, and eth-proofs. The combination used here - private RPC transport, no attestor, no backend, and a self-contained share link - is the part we could not find in one place.

## License

MIT. See [LICENSE](LICENSE).
