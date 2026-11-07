import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:4173/";
const OUT = process.env.OUT_DIR ?? "/tmp";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});

const errors = [];
const gatewayInjection =
  /Executing inline script violates the following Content Security Policy directive/;
page.on("console", (message) => {
  if (message.type() === "error" && !gatewayInjection.test(message.text())) {
    errors.push(message.text());
  }
});
page.on("pageerror", (error) => errors.push(error.message));

async function waitForSuccess(text, timeout = 180_000) {
  const alert = page.locator(".panel .alert-bad").first();
  await Promise.race([
    page.getByText(text, { exact: true }).waitFor({ timeout }),
    alert.waitFor({ timeout }).then(async () => {
      throw new Error(
        `UI error while waiting for "${text}": ${await alert.innerText()}`,
      );
    }),
  ]);
  await page.waitForTimeout(500);
}

try {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  console.log("title:", await page.title());
  console.log("boot:", await page.locator(".boot").innerText());
  await page.screenshot({ path: `${OUT}/crosscheck-01-home.png`, fullPage: true });

  await page.getByText(/Nym ready in/).waitFor({ timeout: 180_000 });
  console.log("boot ready:", await page.locator(".boot").innerText());

  await page
    .locator("#address")
    .fill("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
  await page.getByRole("button", { name: "Prove balance", exact: true }).click();
  await waitForSuccess("Balance proven");
  const balance = await page.locator(".balance-value").first().innerText();
  const shareLink = await page.locator("#share-link").inputValue();
  console.log("proved balance:", balance);
  console.log("share link:", shareLink);
  await page.screenshot({
    path: `${OUT}/crosscheck-02-proved.png`,
    fullPage: true,
  });

  await page.getByRole("link", { name: "Open in verifier" }).click();
  await waitForSuccess("Balance verified");
  console.log(
    "verified balance:",
    await page.locator(".balance-value").first().innerText(),
  );
  await page.screenshot({
    path: `${OUT}/crosscheck-03-verified.png`,
    fullPage: true,
  });

  await page.getByRole("link", { name: "Attack Lab" }).click();
  await waitForSuccess("3 attacks. 3 rejections.");
  console.log(
    "attack verdicts:",
    await page.locator(".verdict-row").allInnerTexts(),
  );
  await page.screenshot({
    path: `${OUT}/crosscheck-04-attack.png`,
    fullPage: true,
  });

  await page.getByRole("link", { name: "CROPS", exact: true }).first().click();
  await page.getByText("Properties, not promises").waitFor({ timeout: 10_000 });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: `${OUT}/crosscheck-05-crops.png`,
    fullPage: true,
  });

  await page.getByRole("link", { name: "Prove", exact: true }).click();
  await page.locator(".toggle").click();
  console.log("mendax on:", await page.locator(".toggle input").isChecked());
  await page.getByRole("button", { name: "Prove balance", exact: true }).click();
  await waitForSuccess("Mendax lied. Crosscheck caught it.");
  console.log(
    "mendax caught:",
    await page.locator(".alert-good .alert-detail").innerText(),
  );
  const shareVisible = await page.locator("#share-link").count();
  console.log("share link rendered after mendax:", shareVisible > 0);
  await page.screenshot({
    path: `${OUT}/crosscheck-06-mendax.png`,
    fullPage: true,
  });

  console.log("console errors:", errors);
  console.log("E2E OK");
} finally {
  await browser.close();
}
