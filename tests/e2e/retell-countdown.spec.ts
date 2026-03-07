import { expect, test } from "@playwright/test";

import { installBrowserStubs, seedLocalStorage } from "./helpers";

const clip = {
  id: "clip-retell-countdown",
  videoId: "dQw4w9WgXcQ",
  title: "Retell Countdown Clip",
  startTime: 0,
  endTime: 40,
  createdAt: "2026-03-01T12:00:00.000Z",
};

test("retell countdown can be canceled without starting recording", async ({ page }) => {
  await installBrowserStubs(page);
  await seedLocalStorage(page, { clips: [clip], sessions: [] });

  await page.goto(`/clip/${clip.id}/retell`);
  await page.getByRole("button", { name: /Start Retelling/ }).click();

  await expect(page.getByRole("heading", { name: "Get ready to retell" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByRole("button", { name: /Start Retelling/ })).toBeVisible();
  await page.waitForTimeout(3500);
  await expect(page.getByRole("heading", { name: "Retelling..." })).toHaveCount(0);
});
