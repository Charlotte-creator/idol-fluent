import { expect, test } from "@playwright/test";

import { installBrowserStubs, readClips } from "./helpers";

test("creates a clip and navigates to shadow flow", async ({ page }) => {
  await installBrowserStubs(page);

  await page.goto("/clip/new");
  await page.getByLabel("YouTube URL").fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  await page.getByLabel("Clip Title (optional)").fill("QA Clip");
  await page.getByLabel("Start Time (seconds)").fill("0");
  await page.getByLabel("End Time (seconds)").fill("35");

  await page.getByRole("button", { name: "Save & Start Shadowing" }).click();

  await expect(page).toHaveURL(/\/clip\/.+\/shadow/);
  await expect(page.getByRole("heading", { name: /Shadow: QA Clip/ })).toBeVisible();

  const clips = await readClips(page);
  expect(clips).toHaveLength(1);
  expect(clips[0]).toMatchObject({
    title: "QA Clip",
    videoId: "dQw4w9WgXcQ",
    startTime: 0,
    endTime: 35,
  });
});
