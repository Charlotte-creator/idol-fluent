import { describe, expect, it } from "vitest";

import { countFillerWords, detectElongations } from "@/lib/speechMetrics";

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
  it("counts explicit filler words", () => {
    const result = countFillerWords("Um, you know, this is actually fine.");

    expect(result.count).toBe(3);
    expect(result.details).toMatchObject({
      um: 1,
      "you know": 1,
      actually: 1,
    });
  });

  it("does not over-count lexical uses of like, so, and right", () => {
    const result = countFillerWords("I like this song so much. Turn right at the next light.");

    expect(result.count).toBe(0);
    expect(result.details).toEqual({});
  });

  it("counts contextual like, so, and right as discourse markers", () => {
    const result = countFillerWords("So, we should start. It was, like, very hard. Right, let's go.");

    expect(result.count).toBe(3);
    expect(result.details).toMatchObject({
      so: 1,
      like: 1,
      right: 1,
    });
  });
});
