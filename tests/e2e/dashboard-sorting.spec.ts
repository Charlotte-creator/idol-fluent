import { expect, test } from "@playwright/test";

import { seedLocalStorage } from "./helpers";

const clip = {
  id: "clip-dashboard-1",
  videoId: "dQw4w9WgXcQ",
  title: "Dashboard QA Clip",
  startTime: 0,
  endTime: 35,
  createdAt: "2026-03-01T12:00:00.000Z",
};

test("dashboard shows sessions newest-first and chart axis in chronological order", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    clips: [clip],
    sessions: [
      {
        id: "session-old",
        clipId: clip.id,
        type: "retell",
        date: "2025-01-01T12:00:00.000Z",
        wordsPerMinute: 101,
        fillerWordCount: 2,
        fillerWordsPerMinute: 1,
        expressionsUsed: [],
        durationSeconds: 40,
        totalWords: 67,
        pauseRatio: 0.12,
        vocabularyRichness: 0.63,
        elongationCount: 1,
        transcript: "old session",
      },
      {
        id: "session-new",
        clipId: clip.id,
        type: "shadow",
        date: "2025-01-03T12:00:00.000Z",
        wordsPerMinute: 202,
        fillerWordCount: 1,
        fillerWordsPerMinute: 0.5,
        expressionsUsed: [],
        durationSeconds: 40,
        totalWords: 120,
        pauseRatio: 0.1,
        vocabularyRichness: 0.7,
        elongationCount: 0,
        transcript: "new session",
      },
      {
        id: "session-mid",
        clipId: clip.id,
        type: "retell",
        date: "2025-01-02T12:00:00.000Z",
        wordsPerMinute: 203,
        fillerWordCount: 3,
        fillerWordsPerMinute: 1.4,
        expressionsUsed: [],
        durationSeconds: 40,
        totalWords: 110,
        pauseRatio: 0.2,
        vocabularyRichness: 0.66,
        elongationCount: 2,
        transcript: "mid session",
      },
    ],
  });

  await page.goto("/dashboard");

  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("202");
  await expect(rows.nth(1)).toContainText("203");
  await expect(rows.nth(2)).toContainText("101");

  const labels = await page.evaluate(() => {
    const values = Array.from(
      document.querySelectorAll<SVGTextElement>(
        ".recharts-xAxis .recharts-cartesian-axis-tick-value",
      ),
    )
      .map((node) => node.textContent?.trim())
      .filter((value): value is string => Boolean(value));

    return values.filter((value, index) => values.indexOf(value) === index);
  });

  expect(labels).toEqual(["Jan 1", "Jan 2", "Jan 3"]);
});
