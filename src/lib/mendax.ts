import type { AnonFetch, AnonOptions } from "@anon-rpc/browser-harness";
import type { Hex } from "viem";
import type { RpcWorker } from "./anon";
import type { AccountProof, BlockHeader, Claim } from "./proof";

export type MendaxMode = "balance" | "proof" | "header";

export const FAKE_BALANCE_HEX = "0xd3c21bcecceda1000000";
export const FAKE_BALANCE_WEI = 1_000_000n * 10n ** 18n;
export const FAKE_HASH = `0x${"11".repeat(32)}` as const;
export const FAKE_ROOT = `0x${"00".repeat(32)}` as const;

type JsonRpcResponse = {
  id?: number | string;
  result?: unknown;
  error?: unknown;
};

function flipLastNibble(hex: Hex): Hex {
  if (hex.length < 3) return hex;
  const last = hex.slice(-1).toLowerCase();
  const next = last === "0" ? "1" : "0";
  return `${hex.slice(0, -1)}${next}` as Hex;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export class MendaxWorker implements RpcWorker {
  #real: RpcWorker;
  #mode: MendaxMode;
  fetch: AnonFetch;

  constructor(real: RpcWorker, mode: MendaxMode) {
    this.#real = real;
    this.#mode = mode;
    this.fetch = this.#fetch.bind(this);
  }

  async #fetch(
    input: string | URL | Request,
    init?: RequestInit & { anonOptions?: AnonOptions },
  ): Promise<Response> {
    const response = await this.#real.fetch(input, init);
    const text = await response.text();
    let json: JsonRpcResponse;
    try {
      json = JSON.parse(text) as JsonRpcResponse;
    } catch {
      return new Response(text, {
        status: response.status,
        headers: response.headers,
      });
    }

    const result = json.result;
    if (isRecord(result)) {
      if (
        this.#mode === "balance" &&
        "balance" in result &&
        "accountProof" in result
      ) {
        result.balance = FAKE_BALANCE_HEX;
      }
      if (
        this.#mode === "proof" &&
        "balance" in result &&
        Array.isArray(result.accountProof) &&
        result.accountProof.length > 0
      ) {
        result.balance = FAKE_BALANCE_HEX;
        const nodes = [...(result.accountProof as Hex[])];
        nodes[0] = flipLastNibble(nodes[0]);
        result.accountProof = nodes;
      }
      if (
        this.#mode === "header" &&
        "stateRoot" in result &&
        "hash" in result
      ) {
        result.stateRoot = FAKE_ROOT;
        result.hash = FAKE_HASH;
      }
    }

    return new Response(JSON.stringify(json), {
      status: response.status,
      headers: response.headers,
    });
  }
}

export type AttackKind = "balance" | "proof" | "header";

export type TamperedBundle = {
  kind: AttackKind;
  title: string;
  description: string;
  naiveNote: string;
  claim: Claim;
  block: BlockHeader;
  proof: AccountProof;
};

export function tamperBundle(
  base: { block: BlockHeader; proof: AccountProof },
  kind: AttackKind,
): TamperedBundle {
  const realBalance = BigInt(base.proof.balance);
  const claim: Claim = {
    v: 1,
    chainId: 1,
    address: base.proof.address,
    blockHash: base.block.hash,
    balanceWei: realBalance.toString(),
  };

  if (kind === "balance") {
    return {
      kind,
      title: "Lie about the balance",
      description:
        "Mendax returns a valid Merkle proof but replaces the balance field with 1,000,000 ETH.",
      naiveNote: "A naive app trusts `result.balance` and shares the inflated claim.",
      claim: { ...claim, balanceWei: FAKE_BALANCE_WEI.toString() },
      block: base.block,
      proof: base.proof,
    };
  }

  if (kind === "proof") {
    const nodes = [...base.proof.accountProof];
    nodes[0] = flipLastNibble(nodes[0]);
    return {
      kind,
      title: "Forge the proof",
      description:
        "Mendax flips a byte in the first proof node and inflates the balance.",
      naiveNote: "A naive app never checks the trie, so it shares the lie.",
      claim: { ...claim, balanceWei: FAKE_BALANCE_WEI.toString() },
      block: base.block,
      proof: {
        ...base.proof,
        balance: FAKE_BALANCE_HEX,
        accountProof: nodes,
      },
    };
  }

  return {
    kind,
    title: "Forge the header",
    description:
      "Mendax invents a block hash and state root, then serves the real account proof against the fake root.",
    naiveNote: "A naive app pins the claim to a block that does not exist.",
    claim: { ...claim, blockHash: FAKE_HASH },
    block: { ...base.block, hash: FAKE_HASH, stateRoot: FAKE_ROOT },
    proof: base.proof,
  };
}
