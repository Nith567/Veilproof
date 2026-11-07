import { chromium } from "playwright";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const BASE = process.env.BASE_URL ?? "http://localhost:4173/";
const account = privateKeyToAccount(generatePrivateKey());

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1280, height: 1000 },
  deviceScaleFactor: 1,
});

await page.exposeFunction("__crosscheckSign", async (hex) =>
  account.signMessage({ message: { raw: hex } }),
);
await page.addInitScript((address) => {
  window.ethereum = {
    request: async ({ method, params }) => {
      if (method === "eth_accounts" || method === "eth_requestAccounts") {
        return [address];
      }
      if (method === "personal_sign") {
        return window.__crosscheckSign(params[0]);
      }
      return null;
    },
    on() {},
    removeListener() {},
  };
}, account.address);

try {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByText(/Nym ready in/).waitFor({ timeout: 180_000 });
  console.log("address:", await page.locator("#address").inputValue());

  await page
    .getByRole("button", { name: "Prove balance", exact: true })
    .click();
  await page.getByText("Balance proven", { exact: true }).waitFor({
    timeout: 180_000,
  });

  await page.getByRole("button", { name: "Sign ownership" }).click();
  await page.locator(".owner-proof.owner-ok").waitFor({ timeout: 30_000 });
  const link = await page.locator("#share-link").inputValue();
  if (!/[?&]sig=0x[0-9a-fA-F]{130}/.test(link)) {
    throw new Error("Signed share link is missing a 65-byte signature.");
  }

  await page.getByRole("link", { name: "Open in verifier" }).click();
  await page.getByText("Balance verified", { exact: true }).waitFor({
    timeout: 180_000,
  });
  await page.locator(".owner-status.owner-ok").waitFor({ timeout: 30_000 });
  console.log("owner:", await page.locator(".owner-status").innerText());

  const bad = link.replace(
    /sig=0x[0-9a-fA-F]+/,
    `sig=0x${"00".repeat(65)}`,
  );
  await page.goto(bad, { waitUntil: "domcontentloaded" });
  await page.getByText("Claim rejected", { exact: true }).waitFor({
    timeout: 180_000,
  });
  await page.locator(".owner-status.owner-bad").waitFor({ timeout: 30_000 });
  console.log("invalid owner: rejected");
  console.log("OWNER E2E OK");
} finally {
  await browser.close();
}
