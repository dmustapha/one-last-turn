// File: playwright.config.ts
import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";

const config: PlaywrightTestConfig = {
  testDir: "./tests/e2e", fullyParallel: false, forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0, reporter: "line",
  use: { baseURL: process.env.APP_URL ?? "http://127.0.0.1:3000", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  ...(process.env.APP_URL ? {} : { webServer: {
    command: "npm run dev", reuseExistingServer: !process.env.CI,
    url: "http://127.0.0.1:3000/api/health", timeout: 120_000,
  } }),
};
export default defineConfig(config);
