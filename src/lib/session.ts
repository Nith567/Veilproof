import type { AnonRpcWorker } from "@anon-rpc/browser-harness";
import type { Network } from "./config";

export type Session = {
  worker: AnonRpcWorker;
  network: Network;
  attempts: number;
  elapsedMs: number;
};

export type BootState =
  | { status: "idle" }
  | { status: "booting"; message: string; attempt?: number; attempts?: number }
  | { status: "ready"; message: string }
  | { status: "error"; message: string };
