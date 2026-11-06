import { chromium } from "playwright";
import { mkdir, rename } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "http://localhost:4173/";
const OUT = process.env.OUT_DIR ?? "demo";

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: OUT, size: { width: 1440, height: 900 } },
});
const page = await context.newPage();

async function caption(text) {
  await page.evaluate((value) => {
    let el = document.getElementById("demo-caption");
    if (!el) {
      el = document.createElement("div");
      el.id = "demo-caption";
      Object.assign(el.style, {
        position: "fixed",
        left: "50%",
        bottom: "26px",
        transform: "translateX(-50%)",
        zIndex: "99999",
        padding: "12px 22px",
        borderRadius: "999px",
        background: "rgba(7, 8, 12, 0.93)",
        border: "1px solid rgba(61, 220, 151, 0.35)",
        color: "#e8eef9",
        font: "600 15px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace",
        letterSpacing: "0.01em",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.45)",
        pointerEvents: "none",
        maxWidth: "82vw",
        textAlign: "center",
      });
      document.body.appendChild(el);
    }
    el.textContent = value;
  }, text);
}

async function waitForSuccess(text, timeout = 300_000) {
  const alert = page.locator(".panel .alert-bad").first();
  await Promise.race([
    page.getByText(text, { exact: true }).waitFor({ timeout }),
    alert.waitFor({ timeout }).then(async () => {
      throw new Error(`UI error while waiting for "${text}": ${await alert.innerText()}`);
    }),
  ]);
}

try {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await caption("Crosscheck - private proof of funds");
  await page.waitForTimeout(2500);

  await caption("Nym: every RPC read leaves through a mixnet");
  await page.getByText(/Nym ready in/).waitFor({ timeout: 240_000 });
  await page.waitForTimeout(1800);

  await caption("One EIP-1186 proof, fetched through Anon-RPC");
  await page
    .locator("#address")
    .fill("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
  await page.getByRole("button", { name: "Prove balance", exact: true }).click();
  await waitForSuccess("Balance proven");
  await page.waitForTimeout(1200);

  await caption("The Merkle path is checked in the browser, not by the RPC");
  await page.locator(".receipt").scrollIntoViewIfNeeded();
  await page.waitForTimeout(2400);

  await caption("Reveal the exit IP only when you choose");
  try {
    await page.getByRole("button", { name: "reveal", exact: true }).click();
    await page
      .locator(".receipt")
      .getByText(/\b\d{1,3}(\.\d{1,3}){3}\b/)
      .waitFor({ timeout: 90_000 });
    await page.waitForTimeout(1500);
  } catch {
    await page.waitForTimeout(800);
  }

  await caption("The verifier re-fetches only the block header");
  await page.getByRole("link", { name: "Open in verifier" }).click();
  await waitForSuccess("Claim verified");
  await page.waitForTimeout(2200);

  await caption("Attack Lab: a lie, a forged proof, a forged header");
  await page.getByRole("link", { name: "Attack Lab" }).click();
  await waitForSuccess("3 attacks. 3 rejections.");
  await page.locator(".verdict-row").last().scrollIntoViewIfNeeded();
  await page.waitForTimeout(2600);

  await caption("CROPS: static, open, private, secure");
  await page.getByRole("link", { name: "CROPS", exact: true }).first().click();
  await page.getByText("Properties, not promises").waitFor({ timeout: 10_000 });
  await page.waitForTimeout(900);
  await page.getByText("Known limits").scrollIntoViewIfNeeded();
  await page.waitForTimeout(2400);

  await caption("Mendax: a malicious RPC inflates the balance");
  await page.getByRole("link", { name: "Prove", exact: true }).click();
  await page.locator(".toggle").click();
  await page.getByRole("button", { name: "Prove balance", exact: true }).click();
  await waitForSuccess("Mendax lied. Crosscheck caught it.");
  await page.waitForTimeout(2200);

  await caption("No keys. No backend. No tracking.");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await page.waitForTimeout(2400);
  await page.screenshot({ path: `${OUT}/crosscheck-demo-final.png`, fullPage: true });
} finally {
  const video = page.video();
  await context.close();
  await browser.close();
  if (video) {
    const raw = await video.path();
    const target = `${OUT}/crosscheck-demo.webm`;
    await rename(raw, target);
    console.log("video:", target);
  }
}
