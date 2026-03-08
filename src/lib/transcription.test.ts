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
      durationSeconds: 12.5,
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
    expect(parsed.durationSeconds).toBe(15.4);
    expect(parsed.duration).toBe(15.4);
    expect(parsed.segments).toEqual([
      { start: 0, end: 0.9, text: "Hi", confidence: undefined },
    ]);
  });

  it("prefers durationSeconds and falls back to durationMs", () => {
    const fromSeconds = parseTranscriptionResponse({ text: "hello", durationSeconds: 9.2, duration: 4 });
    expect(fromSeconds.durationSeconds).toBe(9.2);
    expect(fromSeconds.duration).toBe(9.2);

    const fromMs = parseTranscriptionResponse({ text: "hello", durationMs: 3200 });
    expect(fromMs.durationSeconds).toBe(3.2);
    expect(fromMs.duration).toBe(3.2);
  });

  it("returns empty text on invalid data", () => {
    expect(parseTranscriptionResponse(null)).toEqual({ text: "" });
    expect(parseTranscriptionResponse("abc")).toEqual({ text: "" });
  });

  it("parses optional sttDiagnostics safely", () => {
    const parsed = parseTranscriptionResponse({
      text: "um i think this works",
      sttDiagnostics: {
        vadUsed: false,
        retryWithoutVad: true,
        chosenPass: "no_vad",
        timestampsMode: "segments",
        promptStrategy: "verbatim_disfluencies",
        audioDurationSeconds: 12.3,
        speechSecondsKept: 8.1,
        fallbackReasons: ["long_audio_zero_fillers"],
        passA: { transcriptWordCount: 4, fillerCount: 0, speechSecondsKept: 2.1 },
        passB: { transcriptWordCount: 6, fillerCount: 1, speechSecondsKept: 7.9 },
      },
    });

    expect(parsed.sttDiagnostics).toEqual({
      vadUsed: false,
      retryWithoutVad: true,
      chosenPass: "no_vad",
      timestampsMode: "segments",
      promptStrategy: "verbatim_disfluencies",
      audioDurationSeconds: 12.3,
      speechSecondsKept: 8.1,
      fallbackReasons: ["long_audio_zero_fillers"],
      passA: { transcriptWordCount: 4, fillerCount: 0, speechSecondsKept: 2.1 },
      passB: { transcriptWordCount: 6, fillerCount: 1, speechSecondsKept: 7.9 },
    });
  });
});
