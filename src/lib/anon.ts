import { AnonRpcWorker } from "@anon-rpc/browser-harness";
import type { AnonFetch } from "@anon-rpc/browser-harness";
import {
  BOOTSTRAP_RPC,
  DEFAULT_RPC,
  NETWORKS,
  type Network,
  type NetworkId,
} from "./config";

type JsonRpcResponse = {
  result?: unknown;
  error?: { code: number; message: string };
};

export type RpcWorker = {
  fetch: AnonFetch;
};

export type RpcOptions = {
  url?: string;
  signal?: AbortSignal;
  isolationKey?: string;
  attempts?: number;
};

export type BootStatus = {
  attempt: number;
  attempts: number;
  message: string;
};

export type BootResult = {
  worker: AnonRpcWorker;
  network: Network;
  attempts: number;
  elapsedMs: number;
};

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function directRpc(
  method: string,
  params: unknown[] = [],
): Promise<unknown> {
  const res = await fetch(BOOTSTRAP_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`bootstrap RPC: HTTP ${res.status}`);
  const json = (await res.json()) as JsonRpcResponse;
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result;
}

export const bootstrapProvider = {
  request: ({ method, params }: { method: string; params?: unknown[] }) =>
    directRpc(method, params ?? []),
};

export function createWorker(network: NetworkId): AnonRpcWorker {
  const net = NETWORKS[network];
  return new AnonRpcWorker({
    address: net.specifier,
    config: net.config,
    preExisting: { rpcProvider: bootstrapProvider },
  });
}

export async function bootWorker(
  network: NetworkId,
  onStatus: (status: BootStatus) => void,
  attempts = 3,
): Promise<BootResult> {
  const net = NETWORKS[network];
  const readyTimeout =
    network === "tor" ? 90_000 : network === "nym" ? 45_000 : 15_000;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    onStatus({
      attempt,
      attempts,
      message:
        attempt === 1
          ? `Booting ${net.label}…`
          : `Retrying ${net.label} (${attempt}/${attempts})…`,
    });
    const worker = createWorker(network);
    const started = performance.now();
    try {
      await withTimeout(
        worker.ready,
        readyTimeout,
        `${net.label} did not become ready`,
      );
      return {
        worker,
        network: net,
        attempts: attempt,
        elapsedMs: Math.round(performance.now() - started),
      };
    } catch (error) {
      lastError = error as Error;
      worker.close();
      if (attempt < attempts) await sleep(900);
    }
  }

  throw new Error(
    `${net.label} failed after ${attempts} attempt${attempts === 1 ? "" : "s"}: ${lastError?.message ?? "unknown error"}`,
  );
}

export async function getExitIp(
  worker: RpcWorker,
): Promise<string | undefined> {
  try {
    const res = await worker.fetch("https://api.ipify.org?format=json", {
      signal: AbortSignal.timeout(20_000),
      anonOptions: { isolationKey: "exit-ip" },
    });
    const json = (await res.json()) as { ip?: string };
    return json.ip;
  } catch {
    return undefined;
  }
}

let nextId = 1;

async function rpcOnce<T>(
  worker: RpcWorker,
  method: string,
  params: unknown[],
  opts: RpcOptions,
): Promise<T> {
  const res = await worker.fetch(opts.url ?? DEFAULT_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: nextId++,
      method,
      params,
    }),
    signal: opts.signal ?? AbortSignal.timeout(60_000),
    anonOptions: opts.isolationKey
      ? { isolationKey: opts.isolationKey }
      : undefined,
  });
  const text = await res.text();
  let json: JsonRpcResponse;
  try {
    json = JSON.parse(text) as JsonRpcResponse;
  } catch {
    throw new Error(
      `${method}: non-JSON response (${res.status}): ${text.slice(0, 200)}`,
    );
  }
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result as T;
}

export async function rpc<T>(
  worker: RpcWorker,
  method: string,
  params: unknown[] = [],
  opts: RpcOptions = {},
): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 2);
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await rpcOnce<T>(worker, method, params, opts);
    } catch (error) {
      lastError = error as Error;
      if (opts.signal?.aborted) break;
      if (attempt < attempts) await sleep(600 * attempt);
    }
  }
  throw lastError ?? new Error(`${method} failed`);
}
