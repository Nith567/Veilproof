import { isAddress, isHex, type Hex } from "viem";
import type { Claim } from "./proof";

export type Route =
  | { view: "prove" }
  | { view: "attack" }
  | { view: "crops" }
  | {
      view: "verify";
      claim?: Claim;
      accountProof?: Hex[];
      error?: string;
    };

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "===".slice((base64.length + 3) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

export function encodeProof(nodes: Hex[]): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(nodes)));
}

export function decodeProof(value: string): Hex[] | null {
  const bytes = fromBase64Url(value);
  if (!bytes) return null;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const valid = parsed.every(
      (node) =>
        typeof node === "string" &&
        isHex(node) &&
        node.length > 2 &&
        node.length % 2 === 0,
    );
    return valid ? (parsed as Hex[]) : null;
  } catch {
    return null;
  }
}

export function buildShareHash(claim: Claim, accountProof?: Hex[]): string {
  const params = new URLSearchParams({
    v: "1",
    chain: String(claim.chainId),
    address: claim.address,
    block: claim.blockHash,
    balance: claim.balanceWei,
  });
  if (accountProof && accountProof.length > 0) {
    params.set("proof", encodeProof(accountProof));
  }
  return `/verify?${params.toString()}`;
}

export function buildShareUrl(claim: Claim, accountProof?: Hex[]): string {
  return `${location.origin}${location.pathname}#${buildShareHash(
    claim,
    accountProof,
  )}`;
}

export function parseClaimFromSearch(search: string): {
  claim?: Claim;
  accountProof?: Hex[];
  error?: string;
} {
  const params = new URLSearchParams(search);
  const v = params.get("v");
  const chain = params.get("chain");
  const address = params.get("address");
  const block = params.get("block");
  const balance = params.get("balance");
  const proof = params.get("proof");

  if (v !== "1") return { error: "Unsupported share-link version." };
  if (chain !== "1") return { error: "Only Ethereum mainnet is supported." };
  if (!address || !isAddress(address)) {
    return { error: "The link does not contain a valid address." };
  }
  if (!block || !isHex(block) || block.length !== 66) {
    return { error: "The link does not contain a valid block hash." };
  }
  if (!balance || !/^\d+$/.test(balance)) {
    return { error: "The link does not contain a valid balance." };
  }

  let accountProof: Hex[] | undefined;
  if (proof) {
    const decoded = decodeProof(proof);
    if (!decoded) {
      return { error: "The link does not contain a valid account proof." };
    }
    accountProof = decoded;
  }

  return {
    claim: {
      v: 1,
      chainId: 1,
      address,
      blockHash: block,
      balanceWei: balance,
    },
    accountProof,
  };
}

export function parseRoute(): Route {
  const raw = location.hash.replace(/^#/, "");
  const [path, query] = raw.split("?");
  if (path === "/verify") {
    return { view: "verify", ...parseClaimFromSearch(query ?? "") };
  }
  if (path === "/attack") return { view: "attack" };
  if (path === "/crops") return { view: "crops" };
  return { view: "prove" };
}
