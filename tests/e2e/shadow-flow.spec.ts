import { expect, test } from "@playwright/test";

import { installBrowserStubs, mockTranscribeApi, readSessions, seedLocalStorage } from "./helpers";

const clip = {
  id: "clip-shadow-1",
  videoId: "dQw4w9WgXcQ",
  title: "Shadow QA Clip",
  startTime: 0,
  endTime: 40,
  createdAt: "2026-03-01T12:00:00.000Z",
};

test("shadow flow records, transcribes, saves session, and appears on dashboard", async ({
  page,
}) => {
  await installBrowserStubs(page);
  await seedLocalStorage(page, { clips: [clip], sessions: [] });
  await mockTranscribeApi(page, {
    text: "This is a deterministic shadow transcript for testing.",
    duration: 4.2,
    delayMs: 600,
    segments: [
      { start: 0, end: 1.1, text: "This is a deterministic" },
      { start: 1.5, end: 3.8, text: "shadow transcript for testing." },
    ],
  });

  await page.goto(`/clip/${clip.id}/shadow`);
  await page.getByLabel("I'm in a quiet environment").check();
  await page.getByLabel("I have headphones on").check();
  await page.getByRole("button", { name: "I'm Ready" }).click();

  await expect(page.getByRole("heading", { name: /Watch: Shadow QA Clip/ })).toBeVisible();
  await page.getByRole("button", { name: "Start Shadowing" }).click();

  await expect(page.getByRole("heading", { name: /Shadow: Shadow QA Clip/ })).toBeVisible({
    timeout: 10_000,
  });
  await page.waitForTimeout(4500);
  await page.getByRole("button", { name: /^Stop$/ }).click();

  await expect(page.getByText("Transcribing latest recording...")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Your Recordings \(1\)/ })).toBeVisible({
    timeout: 10_000,
  });
  await expect
    .poll(async () => (await readSessions(page)).length, { timeout: 10_000 })
    .toBe(1);

  await page.getByRole("link", { name: "Dashboard" }).click();
  await expect(page).toHaveURL("/dashboard");
  await expect(page.getByText("shadow").first()).toBeVisible();

  const sessions = await readSessions(page);
  expect(sessions).toHaveLength(1);
  expect(sessions[0].type).toBe("shadow");
  expect(sessions[0].transcript).toContain("deterministic shadow transcript");
});
