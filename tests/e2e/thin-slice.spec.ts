// File: tests/e2e/thin-slice.spec.ts
import { expect, test } from "@playwright/test";
test("deployed case renders redacted evidence and terminal replay state", async ({ page }) => {
  const code = process.env.E2E_CASE_CODE;
  if (!code) throw new Error("E2E_CASE_CODE_REQUIRED");
  await page.goto(`/?case=${encodeURIComponent(code)}`);
  await expect(page.getByRole("heading", { name: /One Last Turn/i })).toBeVisible();
  await expect(page.getByLabel("Case timeline")).toBeVisible();
  await expect(page.getByLabel("Integration proof")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/stable alias|mind id|message id|fingerprint|private choice/i);
  if (process.env.E2E_EXPECT_CLOSED === "true") {
    await expect(page.getByRole("button", { name: "Already used" })).toBeDisabled();
  }
});
