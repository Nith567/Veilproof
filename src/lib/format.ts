import { UNIT } from "./config";

export function formatInt(value: bigint | number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatEth(wei: bigint, maxFractionDigits = 6): string {
  const whole = wei / UNIT;
  const fraction = (wei % UNIT)
    .toString()
    .padStart(18, "0")
    .slice(0, maxFractionDigits)
    .replace(/0+$/, "");
  return fraction ? `${formatInt(whole)}.${fraction}` : formatInt(whole);
}

export function shortHex(hex: string, chars = 4): string {
  if (hex.length <= 2 + chars * 2) return hex;
  return `${hex.slice(0, 2 + chars)}…${hex.slice(-chars)}`;
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function formatDate(timestamp: string | number): string {
  const ms =
    typeof timestamp === "string" && timestamp.startsWith("0x")
      ? Number(BigInt(timestamp)) * 1000
      : Number(timestamp) * 1000;
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}
