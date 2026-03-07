import { describe, expect, it } from "vitest";

import {
  computeTranscriptMetrics,
  countFillerWords,
  detectElongations,
  detectRepetitions,
} from "@/lib/speechMetrics";

describe("detectElongations", () => {
  it("detects repeated words, hesitation sounds, and repeated characters", () => {
    const result = detectElongations("I I think hmm this is sooo good");

    expect(result.count).toBe(3);
    expect(result.details).toMatchObject({
      "i i": 1,
      hmm: 1,
      sooo: 1,
    });
  });
});

describe("countFillerWords", () => {
  it("counts strong and contextual fillers separately", () => {
    const result = countFillerWords("Um, you know, this is, actually, fine.");

    expect(result.count).toBe(3);
    expect(result.strongCount).toBe(2);
    expect(result.contextualCount).toBe(1);
    expect(result.details).toMatchObject({
      um: 1,
      "you know": 1,
      actually: 1,
    });
  });

  it("does not count lexical uses like 'I like pizza'", () => {
    const result = countFillerWords("I like pizza and we walked right home. I think so.");

    expect(result.count).toBe(0);
    expect(result.details).toEqual({});
  });

  it("counts contextual fillers at discourse boundaries", () => {
    const result = countFillerWords("Like, I think we should go. It was like really hard. Right, let's start.");

    expect(result.contextualCount).toBe(3);
    expect(result.details).toMatchObject({
      like: 2,
      right: 1,
    });
  });

  it("counts additional hesitation variants", () => {
    const result = countFillerWords("Umm, uhh, and mm-hmm.");
    expect(result.strongCount).toBe(3);
    expect(result.details).toMatchObject({
      umm: 1,
      uhh: 1,
      "mm-hmm": 1,
    });
  });
});

describe("detectRepetitions", () => {
  it("detects immediate repeated words", () => {
    const result = detectRepetitions("I I think this is the the right way.");
    expect(result.count).toBe(2);
    expect(result.details).toMatchObject({
      "i i": 1,
      "the the": 1,
    });
  });
});

describe("computeTranscriptMetrics pause metrics", () => {
  it("computes silent pause metrics from synthetic segment gaps", () => {
    const metrics = computeTranscriptMetrics(
      "hello there this is a test",
      10,
      [],
      {
        pauseThresholdSeconds: 0.6,
        segments: [
          { start: 0, end: 1, text: "hello there" },
          { start: 1.8, end: 2.5, text: "this" },
          { start: 4.0, end: 5.0, text: "is a" },
          { start: 5.3, end: 6.0, text: "test" },
        ],
      },
    );

    expect(metrics.pauseMethod).toBe("timestamps");
    expect(metrics.silentPauseCount).toBe(2); // 0.8 and 1.5
    expect(metrics.silentPauseTotalSeconds).toBe(2.3);
    expect(metrics.silentPauseAvgSeconds).toBe(1.15);
    expect(metrics.longestSilentPauseSeconds).toBe(1.5);
    expect(metrics.silentPauseRatePerMinute).toBe(12);
    expect(metrics.choppinessCount).toBe(1); // 0.3 gap
  });
});
