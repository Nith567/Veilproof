import { RLP } from "@ethereumjs/rlp";
import { Trie } from "@ethereumjs/trie";
import { bytesToHex, hexToBytes, type Hex } from "viem";
import { UNIT } from "./config";
import { formatEth, shortHex } from "./format";
import type { RpcWorker } from "./anon";
import { rpc } from "./anon";
import { verifyOwnership, type OwnershipResult } from "./ownership";

export type AccountProof = {
  address: Hex;
  balance: Hex;
  nonce: Hex;
  codeHash: Hex;
  storageHash: Hex;
  accountProof: Hex[];
};

export type BlockHeader = {
  number: Hex;
  hash: Hex;
  parentHash: Hex;
  stateRoot: Hex;
  timestamp: Hex;
};

export type VerifiedAccount = {
  balance: bigint;
  nonce: bigint;
  storageRoot: Hex;
  codeHash: Hex;
};

export type Claim = {
  v: 1;
  chainId: 1;
  address: Hex;
  blockHash: Hex;
  balanceWei: string;
  ownerSignature?: Hex;
};

export type Check = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
};

export type Elapsed = {
  block: number;
  proof: number;
  verify: number;
};

export type ProofAttempt = {
  ok: boolean;
  claim?: Claim;
  block?: BlockHeader;
  proof?: AccountProof;
  verified?: VerifiedAccount;
  rpcBalance?: bigint;
  checks: Check[];
  error?: string;
  elapsedMs: Elapsed;
};

export type VerificationReport = {
  ok: boolean;
  claim: Claim;
  block?: BlockHeader;
  proof?: AccountProof;
  verified?: VerifiedAccount;
  owner?: OwnershipResult;
  checks: Check[];
  error?: string;
  elapsedMs: Elapsed;
};

export type ProofStep = "block" | "proof" | "verify" | "compare";

function toBigInt(bytes: Uint8Array): bigint {
  const hex = bytesToHex(bytes);
  return hex === "0x" ? 0n : BigInt(hex);
}

export async function verifyAccountProof(
  proof: Pick<AccountProof, "address" | "accountProof">,
  stateRoot: Hex,
): Promise<VerifiedAccount> {
  const trie = new Trie({ useKeyHashing: true });
  let value: Uint8Array | null;
  try {
    value = await trie.verifyProof(
      hexToBytes(stateRoot),
      hexToBytes(proof.address),
      proof.accountProof.map((node) => hexToBytes(node)),
    );
  } catch (error) {
    throw new Error(`Merkle proof rejected: ${(error as Error).message}`);
  }
  if (!value) throw new Error("Merkle proof shows the account does not exist");
  const decoded = RLP.decode(value);
  if (!Array.isArray(decoded) || decoded.length !== 4) {
    throw new Error("Unexpected account RLP");
  }
  const [nonce, balance, storageRoot, codeHash] = decoded as Uint8Array[];
  return {
    nonce: toBigInt(nonce),
    balance: toBigInt(balance),
    storageRoot: bytesToHex(storageRoot),
    codeHash: bytesToHex(codeHash),
  };
}

export async function createProof(
  worker: RpcWorker,
  rpcUrl: string,
  address: Hex,
  onProgress?: (step: ProofStep) => void,
): Promise<ProofAttempt> {
  const checks: Check[] = [];
  const elapsedMs: Elapsed = { block: 0, proof: 0, verify: 0 };
  let block: BlockHeader | undefined;
  let proof: AccountProof | undefined;
  let verified: VerifiedAccount | undefined;

  try {
    onProgress?.("block");
    const blockStart = performance.now();
    block = await rpc<BlockHeader>(
      worker,
      "eth_getBlockByNumber",
      ["latest", false],
      { url: rpcUrl },
    );
    elapsedMs.block = Math.round(performance.now() - blockStart);
    checks.push({
      id: "block",
      label: "Block fetched",
      ok: true,
      detail: `#${BigInt(block.number).toLocaleString("en-US")} · ${shortHex(block.hash, 5)}`,
    });

    onProgress?.("proof");
    const proofStart = performance.now();
    proof = await rpc<AccountProof>(
      worker,
      "eth_getProof",
      [address, [], { blockHash: block.hash }],
      { url: rpcUrl },
    );
    elapsedMs.proof = Math.round(performance.now() - proofStart);
    checks.push({
      id: "proof",
      label: "Account proof fetched",
      ok: true,
      detail: `${proof.accountProof.length} trie nodes`,
    });

    onProgress?.("verify");
    const verifyStart = performance.now();
    verified = await verifyAccountProof(
      { ...proof, address },
      block.stateRoot,
    );
    elapsedMs.verify = Math.round(performance.now() - verifyStart);
    checks.push({
      id: "merkle",
      label: "Merkle proof verified",
      ok: true,
      detail: `stateRoot ${shortHex(block.stateRoot, 5)}`,
    });

    const rpcBalance = BigInt(proof.balance);
    const match = verified.balance === rpcBalance;
    checks.push({
      id: "match",
      label: match
        ? "RPC balance matches proof"
        : "RPC balance does NOT match proof",
      ok: match,
      detail: `${formatEth(verified.balance)} ETH proven · ${formatEth(rpcBalance)} ETH reported`,
    });

    onProgress?.("compare");
    const claim: Claim = {
      v: 1,
      chainId: 1,
      address,
      blockHash: block.hash,
      balanceWei: verified.balance.toString(),
    };

    return {
      ok: match,
      claim,
      block,
      proof,
      verified,
      rpcBalance,
      checks,
      elapsedMs,
    };
  } catch (error) {
    const message = (error as Error).message;
    checks.push({
      id: "error",
      label: "Verification failed",
      ok: false,
      detail: message,
    });
    return {
      ok: false,
      block,
      proof,
      verified,
      checks,
      error: message,
      elapsedMs,
    };
  }
}

export async function createNaiveClaim(
  worker: RpcWorker,
  rpcUrl: string,
  address: Hex,
): Promise<{ claim: Claim; block: BlockHeader; proof: AccountProof }> {
  const block = await rpc<BlockHeader>(
    worker,
    "eth_getBlockByNumber",
    ["latest", false],
    { url: rpcUrl },
  );
  const proof = await rpc<AccountProof>(
    worker,
    "eth_getProof",
    [address, [], { blockHash: block.hash }],
    { url: rpcUrl },
  );
  return {
    claim: {
      v: 1,
      chainId: 1,
      address,
      blockHash: block.hash,
      balanceWei: proof.balance,
    },
    block,
    proof,
  };
}

export async function verifyClaim(
  worker: RpcWorker,
  rpcUrl: string,
  claim: Claim,
  onProgress?: (step: ProofStep) => void,
): Promise<VerificationReport> {
  const checks: Check[] = [];
  const elapsedMs: Elapsed = { block: 0, proof: 0, verify: 0 };
  let block: BlockHeader | undefined;
  let proof: AccountProof | undefined;

  try {
    onProgress?.("block");
    const blockStart = performance.now();
    block = await rpc<BlockHeader>(
      worker,
      "eth_getBlockByHash",
      [claim.blockHash, false],
      { url: rpcUrl },
    );
    elapsedMs.block = Math.round(performance.now() - blockStart);
    if (!block) {
      checks.push({
        id: "block",
        label: "Block found by hash",
        ok: false,
        detail: "This RPC does not know the claimed block hash",
      });
      return {
        ok: false,
        claim,
        checks,
        elapsedMs,
        error: "Block not found",
      };
    }
    checks.push({
      id: "block",
      label: "Block found by hash",
      ok: true,
      detail: `#${BigInt(block.number).toLocaleString("en-US")} · ${shortHex(block.hash, 5)}`,
    });

    onProgress?.("proof");
    const proofStart = performance.now();
    proof = await rpc<AccountProof>(
      worker,
      "eth_getProof",
      [claim.address, [], { blockHash: claim.blockHash }],
      { url: rpcUrl },
    );
    elapsedMs.proof = Math.round(performance.now() - proofStart);
    checks.push({
      id: "proof",
      label: "Account proof fetched",
      ok: true,
      detail: `${proof.accountProof.length} trie nodes`,
    });

    onProgress?.("verify");
    const verifyStart = performance.now();
    const verified = await verifyAccountProof(
      { ...proof, address: claim.address },
      block.stateRoot,
    );
    elapsedMs.verify = Math.round(performance.now() - verifyStart);
    checks.push({
      id: "merkle",
      label: "Merkle proof verified",
      ok: true,
      detail: `stateRoot ${shortHex(block.stateRoot, 5)}`,
    });

    const claimed = BigInt(claim.balanceWei);
    const match = verified.balance === claimed;
    checks.push({
      id: "match",
      label: match
        ? "Claimed balance matches proof"
        : "Claimed balance does NOT match proof",
      ok: match,
      detail: `${formatEth(verified.balance)} ETH proven · ${formatEth(claimed)} ETH claimed`,
    });

    const owner = await verifyOwnership(claim);
    if (owner.present && !owner.verified) {
      checks.push({
        id: "owner",
        label: "Owner signature invalid",
        ok: false,
        detail: owner.error ?? "The signature does not match the claim address.",
      });
      return {
        ok: false,
        claim,
        block,
        proof,
        verified,
        owner,
        checks,
        error: "Owner signature invalid",
        elapsedMs,
      };
    }
    if (owner.verified) {
      checks.push({
        id: "owner",
        label: "Owner verified",
        ok: true,
        detail: `Signer ${shortHex(owner.signer ?? claim.address, 5)}`,
      });
    }

    return {
      ok: match,
      claim,
      block,
      proof,
      verified,
      owner,
      checks,
      elapsedMs,
    };
  } catch (error) {
    const message = (error as Error).message;
    checks.push({
      id: "error",
      label: "Verification failed",
      ok: false,
      detail: message,
    });
    return {
      ok: false,
      claim,
      block,
      proof,
      checks,
      error: message,
      elapsedMs,
    };
  }
}

export async function verifyClaimFromLink(
  worker: RpcWorker,
  rpcUrl: string,
  claim: Claim,
  accountProof: Hex[],
  onProgress?: (step: ProofStep) => void,
): Promise<VerificationReport> {
  const checks: Check[] = [];
  const elapsedMs: Elapsed = { block: 0, proof: 0, verify: 0 };
  let block: BlockHeader | undefined;

  try {
    onProgress?.("block");
    const blockStart = performance.now();
    block = await rpc<BlockHeader>(
      worker,
      "eth_getBlockByHash",
      [claim.blockHash, false],
      { url: rpcUrl },
    );
    elapsedMs.block = Math.round(performance.now() - blockStart);
    if (!block) {
      checks.push({
        id: "block",
        label: "Block found by hash",
        ok: false,
        detail: "This RPC does not know the claimed block hash",
      });
      return {
        ok: false,
        claim,
        checks,
        elapsedMs,
        error: "Block not found",
      };
    }
    const blockOk =
      block.hash.toLowerCase() === claim.blockHash.toLowerCase();
    checks.push({
      id: "block",
      label: blockOk ? "Block found by hash" : "Block hash mismatch",
      ok: blockOk,
      detail: blockOk
        ? `#${BigInt(block.number).toLocaleString("en-US")} · ${shortHex(block.hash, 5)}`
        : `${shortHex(claim.blockHash, 5)} claimed · ${shortHex(block.hash, 5)} returned`,
    });
    if (!blockOk) {
      return {
        ok: false,
        claim,
        block,
        checks,
        elapsedMs,
        error: "Block hash mismatch",
      };
    }

    onProgress?.("proof");
    checks.push({
      id: "proof",
      label: "Proof loaded from the link",
      ok: true,
      detail: `${accountProof.length} trie nodes`,
    });

    onProgress?.("verify");
    const verifyStart = performance.now();
    const verified = await verifyAccountProof(
      { address: claim.address, accountProof },
      block.stateRoot,
    );
    elapsedMs.verify = Math.round(performance.now() - verifyStart);
    checks.push({
      id: "merkle",
      label: "Merkle proof verified",
      ok: true,
      detail: `stateRoot ${shortHex(block.stateRoot, 5)}`,
    });

    const claimed = BigInt(claim.balanceWei);
    const match = verified.balance === claimed;
    checks.push({
      id: "match",
      label: match
        ? "Claimed balance matches proof"
        : "Claimed balance does NOT match proof",
      ok: match,
      detail: `${formatEth(verified.balance)} ETH proven · ${formatEth(claimed)} ETH claimed`,
    });

    const owner = await verifyOwnership(claim);
    if (owner.present && !owner.verified) {
      checks.push({
        id: "owner",
        label: "Owner signature invalid",
        ok: false,
        detail: owner.error ?? "The signature does not match the claim address.",
      });
      return {
        ok: false,
        claim,
        block,
        verified,
        owner,
        checks,
        error: "Owner signature invalid",
        elapsedMs,
      };
    }
    if (owner.verified) {
      checks.push({
        id: "owner",
        label: "Owner verified",
        ok: true,
        detail: `Signer ${shortHex(owner.signer ?? claim.address, 5)}`,
      });
    }

    return {
      ok: match,
      claim,
      block,
      verified,
      owner,
      checks,
      elapsedMs,
    };
  } catch (error) {
    const message = (error as Error).message;
    checks.push({
      id: "error",
      label: "Verification failed",
      ok: false,
      detail: message,
    });
    return {
      ok: false,
      claim,
      block,
      checks,
      error: message,
      elapsedMs,
    };
  }
}

export async function verifyClaimAgainstBundle(
  claim: Claim,
  block: BlockHeader,
  proof: AccountProof,
  trustedBlock?: BlockHeader,
): Promise<VerificationReport> {
  const checks: Check[] = [];
  const elapsedMs: Elapsed = { block: 0, proof: 0, verify: 0 };
  const chainBlock = trustedBlock ?? block;

  if (trustedBlock) {
    const exists =
      trustedBlock.hash.toLowerCase() === claim.blockHash.toLowerCase();
    checks.push({
      id: "block",
      label: exists ? "Block exists on chain" : "Block does not exist",
      ok: exists,
      detail: exists
        ? `#${BigInt(trustedBlock.number).toLocaleString("en-US")} · ${shortHex(trustedBlock.hash, 5)}`
        : `${shortHex(claim.blockHash, 5)} is not a block the network returned`,
    });
    if (!exists) {
      return {
        ok: false,
        claim,
        block: trustedBlock,
        proof,
        checks,
        error: "Claim pins a block that does not exist",
        elapsedMs,
      };
    }
  } else {
    const blockOk =
      block.hash.toLowerCase() === claim.blockHash.toLowerCase();
    checks.push({
      id: "block",
      label: "Block hash matches the claim",
      ok: blockOk,
      detail: blockOk
        ? shortHex(block.hash, 5)
        : `${shortHex(claim.blockHash, 5)} claimed · ${shortHex(block.hash, 5)} real`,
    });
    if (!blockOk) {
      return {
        ok: false,
        claim,
        block,
        proof,
        checks,
        error: "Block hash mismatch",
        elapsedMs,
      };
    }
  }

  try {
    const verified = await verifyAccountProof(
      { ...proof, address: claim.address },
      chainBlock.stateRoot,
    );
    checks.push({
      id: "merkle",
      label: "Merkle proof verified",
      ok: true,
      detail: `stateRoot ${shortHex(chainBlock.stateRoot, 5)}`,
    });
    const claimed = BigInt(claim.balanceWei);
    const match = verified.balance === claimed;
    checks.push({
      id: "match",
      label: match
        ? "Claimed balance matches proof"
        : "Claimed balance does NOT match proof",
      ok: match,
      detail: `${formatEth(verified.balance)} ETH proven · ${formatEth(claimed)} ETH claimed`,
    });
    return {
      ok: match,
      claim,
      block: chainBlock,
      proof,
      verified,
      checks,
      elapsedMs,
    };
  } catch (error) {
    const message = (error as Error).message;
    checks.push({
      id: "merkle",
      label: "Merkle proof rejected",
      ok: false,
      detail: message,
    });
    return {
      ok: false,
      claim,
      block: chainBlock,
      proof,
      checks,
      error: message,
      elapsedMs,
    };
  }
}

export function weiToEth(wei: bigint): string {
  return formatEth(wei);
}

export function isZero(wei: bigint): boolean {
  return wei === 0n;
}

export { UNIT };
