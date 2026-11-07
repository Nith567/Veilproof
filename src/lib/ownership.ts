import { recoverMessageAddress, type Address } from "viem";
import type { Claim } from "./proof";

export type OwnershipResult = {
  present: boolean;
  verified: boolean;
  signer?: Address;
  error?: string;
};

export function ownershipMessage(claim: Claim): string {
  return [
    "Crosscheck ownership proof",
    "Schema: 1",
    "Domain: crosscheck",
    `Chain: ${claim.chainId}`,
    `Address: ${claim.address.toLowerCase()}`,
    `Block: ${claim.blockHash.toLowerCase()}`,
    `Balance: ${claim.balanceWei} wei`,
    "I control this address and this claim.",
  ].join("\n");
}

export async function verifyOwnership(
  claim: Claim,
): Promise<OwnershipResult> {
  if (!claim.ownerSignature) {
    return { present: false, verified: false };
  }

  try {
    const signer = await recoverMessageAddress({
      message: ownershipMessage(claim),
      signature: claim.ownerSignature,
    });
    return {
      present: true,
      verified: signer.toLowerCase() === claim.address.toLowerCase(),
      signer,
    };
  } catch (error) {
    return {
      present: true,
      verified: false,
      error: (error as Error).message,
    };
  }
}
