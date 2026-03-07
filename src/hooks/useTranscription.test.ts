import { describe, expect, it } from "vitest";

import { getTranscriptionRequestErrorMessage, normalizeLanguageHint } from "@/hooks/useTranscription";

describe("normalizeLanguageHint", () => {
  it("normalizes locale tags to whisper base language codes", () => {
    expect(normalizeLanguageHint("en-US")).toBe("en");
    expect(normalizeLanguageHint("fr_CA")).toBe("fr");
    expect(normalizeLanguageHint("ZH-cn")).toBe("zh");
  });

  it("returns lowercase codes and handles empty input", () => {
    expect(normalizeLanguageHint("EN")).toBe("en");
    expect(normalizeLanguageHint("   ")).toBe("");
  });
});

describe("getTranscriptionRequestErrorMessage", () => {
  it("maps fetch/network errors to a clear server connectivity message", () => {
    expect(getTranscriptionRequestErrorMessage(new Error("fetch failed"))).toBe(
      "Cannot reach the transcription service. If running locally, start services with `npm run dev` or `docker compose up --build`, then try again.",
    );
  });

  it("maps abort errors to a timeout message", () => {
    const error = new Error("aborted");
    error.name = "AbortError";
    expect(getTranscriptionRequestErrorMessage(error)).toBe(
      "Transcription timed out. Please try a shorter clip.",
    );
  });

  it("maps empty transcript errors to a user-friendly no-speech message", () => {
    expect(
      getTranscriptionRequestErrorMessage(
        new Error("Transcription completed but returned empty text."),
      ),
    ).toBe("No speech detected. Please try again and speak clearly.");
  });
});
