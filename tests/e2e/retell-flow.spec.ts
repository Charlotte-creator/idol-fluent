import { expect, test } from "@playwright/test";

import { installBrowserStubs, mockTranscribeApi, readSessions, seedLocalStorage } from "./helpers";

const clip = {
  id: "clip-retell-1",
  videoId: "dQw4w9WgXcQ",
  title: "Retell QA Clip",
  startTime: 0,
  endTime: 40,
  createdAt: "2026-03-01T12:00:00.000Z",
};

test("retell flow transcribes deterministically and saves session", async ({ page }) => {
  await installBrowserStubs(page);
  await seedLocalStorage(page, { clips: [clip], sessions: [] });
  await mockTranscribeApi(page, {
    text: "So, this is the retell transcript for deterministic testing.",
    duration: 4.4,
    delayMs: 700,
    segments: [
      { start: 0, end: 1.0, text: "So, this is the retell" },
      { start: 1.4, end: 4.0, text: "transcript for deterministic testing." },
    ],
  });

  await page.goto(`/clip/${clip.id}/retell`);
  await page.getByRole("button", { name: /Start Retelling/ }).click();
  await expect(page.getByRole("heading", { name: "Retelling..." })).toBeVisible();

  await page.waitForTimeout(2200);
  await page.getByRole("button", { name: "Stop Recording" }).click();

  await expect(page.getByRole("heading", { name: /Transcribing your audio/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your Results" })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText("retell transcript for deterministic testing")).toBeVisible();

  await page.getByRole("button", { name: /Save & View Dashboard/ }).click();
  await expect(page).toHaveURL("/dashboard");
  await expect(page.getByText("retell").first()).toBeVisible();

  const sessions = await readSessions(page);
  expect(sessions).toHaveLength(1);
  expect(sessions[0].type).toBe("retell");
  expect(sessions[0].transcript).toContain("retell transcript");
});
