import { describe, expect, it } from "vitest";

import { parseTranscriptionResponse } from "@/lib/transcription";

describe("parseTranscriptionResponse", () => {
  it("parses standard payload fields", () => {
    const parsed = parseTranscriptionResponse({
      text: "Hello world",
      language: "en",
      duration: 12.5,
      confidence: 0.93,
    });

    expect(parsed).toEqual({
      text: "Hello world",
      language: "en",
      duration: 12.5,
      confidence: 0.93,
      segments: undefined,
    });
  });

  it("normalizes malformed payloads safely", () => {
    const parsed = parseTranscriptionResponse({
      text: "  test  ",
      duration: "15.4",
      segments: [
        { start: "0", end: 0.9, text: "Hi" },
        { start: 1.2, end: 1.0, text: "bad" },
      ],
    });

    expect(parsed.text).toBe("test");
    expect(parsed.duration).toBe(15.4);
    expect(parsed.segments).toEqual([
      { start: 0, end: 0.9, text: "Hi", confidence: undefined },
    ]);
  });

  it("returns empty text on invalid data", () => {
    expect(parseTranscriptionResponse(null)).toEqual({ text: "" });
    expect(parseTranscriptionResponse("abc")).toEqual({ text: "" });
  });
});
